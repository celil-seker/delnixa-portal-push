import asyncio, json, time, os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
import websockets

from epias_ws import get_tgt, get_epias_jwt_and_ws, place_offer

DB_URL = os.getenv("DATABASE_URL", "postgresql://delnixa:delnixa@db:5432/delnixadb")
engine = create_engine(DB_URL)
SessionLocal = sessionmaker(bind=engine)

MIN_INTERVAL = 0.12
TGS_WARN_RATIO = 0.8
DEFAULT_TGS_LIMIT = 200
LOT_PER_MW = 10

contract_state = {}
open_offers = {}
state = {}

def db_active_user_ids():
    db = SessionLocal()
    try:
        rows = db.execute(text("SELECT DISTINCT user_id FROM bots WHERE status='ACTIVE'")).fetchall()
        return [r.user_id for r in rows]
    finally:
        db.close()

def db_get_active_bots(user_id):
    db = SessionLocal()
    try:
        rows = db.execute(text("SELECT * FROM bots WHERE user_id=:uid AND status='ACTIVE'"), {"uid": user_id}).fetchall()
        return [dict(r._mapping) for r in rows]
    finally:
        db.close()

def db_get_username(user_id):
    db = SessionLocal()
    try:
        row = db.execute(text("SELECT username FROM users WHERE id=:id"), {"id": user_id}).fetchone()
        return row.username if row else None
    finally:
        db.close()

def db_get_epias_creds(user_id):
    db = SessionLocal()
    try:
        row = db.execute(text("""
            SELECT c.epias_username, c.epias_password_encrypted
            FROM users u JOIN central_accounts c ON c.user_id=u.id
            WHERE u.id=:uid
        """), {"uid": user_id}).fetchone()
        return (row.epias_username, row.epias_password_encrypted) if row else (None, None)
    finally:
        db.close()

def db_update_filled(bot_id, new_filled_mw, status=None):
    db = SessionLocal()
    try:
        if status:
            db.execute(text("UPDATE bots SET filled_quantity=:f, status=:s, updated_at=now() WHERE id=:id"),
                       {"f": new_filled_mw, "s": status, "id": bot_id})
        else:
            db.execute(text("UPDATE bots SET filled_quantity=:f, updated_at=now() WHERE id=:id"),
                       {"f": new_filled_mw, "id": bot_id})
        db.commit()
    finally:
        db.close()

async def rate_limited_place_offer(user_id, bot, price, remaining_mw, access_token):
    contract_name = bot["contract_name"]
    key = (user_id, contract_name)
    st = contract_state.setdefault(key, {"last_price": None, "last_sent": 0, "count_today": 0, "paused": False, "min_gap": MIN_INTERVAL})

    if st["paused"]:
        return
    if st["last_price"] == price and bot["id"] in open_offers:
        return

    now = time.time()
    gap = now - st["last_sent"]
    if gap < st["min_gap"]:
        await asyncio.sleep(st["min_gap"] - gap)

    quantity_lots = round(remaining_mw * LOT_PER_MW)
    if quantity_lots <= 0:
        return

    try:
        resp = place_offer(access_token, contract_name, bot["side"], price, quantity_lots, bot["region"])
    except Exception as e:
        print(f"[bot] emir gönderim hatası: {e}")
        return

    st["last_sent"] = time.time()

    if resp.status_code == 429:
        retry_ms = int(resp.headers.get("X-Rate-Limit-Retry-After-Miliseconds", 4000))
        st["min_gap"] = max(st["min_gap"], retry_ms / 1000)
        print(f"[bot] {contract_name} rate limit (OFFER067), {retry_ms}ms yavaşlatılıyor")
        return

    if resp.status_code != 200:
        body = resp.text
        if "OFFER052" in body:
            st["paused"] = True
            print(f"[bot] {contract_name} TEO limitine takıldı, bot bu kontrat için duraklatıldı")
        else:
            print(f"[bot] {contract_name} emir reddedildi: {body}")
        return

    st["last_price"] = price
    st["count_today"] += 1

    if st["count_today"] >= DEFAULT_TGS_LIMIT * TGS_WARN_RATIO:
        st["min_gap"] = 5.0
    if st["count_today"] >= DEFAULT_TGS_LIMIT:
        st["paused"] = True
        print(f"[bot] {contract_name} TGS limitine ulaşıldı, bot durduruldu")

    try:
        data = resp.json()
        offer_id = data.get("body", {}).get("id") or data.get("body", {}).get("content", {}).get("id")
    except Exception:
        offer_id = None

    if offer_id:
        open_offers[bot["id"]] = {"offer_id": offer_id, "sent_lots": quantity_lots}
        print(f"[bot] {contract_name} teklif gönderildi: id={offer_id}, {quantity_lots} lot @ {price}")

def handle_offer_history_message(payload):
    body = payload.get("body", {})
    offer_id = body.get("id")
    if not offer_id:
        return

    matching_bot_id = None
    for bot_id, info in list(open_offers.items()):
        if info["offer_id"] == offer_id:
            matching_bot_id = bot_id
            break
    if matching_bot_id is None:
        return

    quantity = body.get("quantity", 0) or 0
    remaining = body.get("remainingQuantity", 0) or 0
    status_detail = (body.get("statusDetail") or {}).get("value") or (body.get("statusDetail") or {}).get("key")

    filled_lots = quantity - remaining
    filled_mw = filled_lots / LOT_PER_MW

    db = SessionLocal()
    try:
        row = db.execute(text("SELECT target_quantity FROM bots WHERE id=:id"), {"id": matching_bot_id}).fetchone()
        if not row:
            return
        target = row.target_quantity
    finally:
        db.close()

    is_done = status_detail in ("TE",) or remaining <= 0
    is_cancelled = status_detail in ("ZA", "İP", "IP", "KA")

    if is_done:
        db_update_filled(matching_bot_id, min(filled_mw, target), status="DONE")
        print(f"[bot] teklif {offer_id} tamamı eşleşti ({filled_mw} MW), bot DONE (otomatik durdu)")
        open_offers.pop(matching_bot_id, None)
    elif is_cancelled:
        db_update_filled(matching_bot_id, filled_mw)
        print(f"[bot] teklif {offer_id} iptal/zaman aşımı, {filled_mw} MW eşleşmiş olarak kaldı")
        open_offers.pop(matching_bot_id, None)
    else:
        db_update_filled(matching_bot_id, filled_mw)

async def run_user_ws(user_id):
    username = db_get_username(user_id)
    if not username:
        return
    while True:
        bots = db_get_active_bots(user_id)
        if not bots:
            await asyncio.sleep(10)
            if not db_get_active_bots(user_id):
                return
            continue
        try:
            epias_user, epias_pw = db_get_epias_creds(user_id)
            if not epias_user:
                await asyncio.sleep(30)
                continue

            tgt = get_tgt(epias_user, epias_pw)
            access_token, ws_path, ws_url = get_epias_jwt_and_ws(tgt)

            async with websockets.connect(ws_url) as ws:
                await ws.send(json.dumps({"cmd": "subscribe", "channels": ["HourlyContractBoard", "OfferHistoryChannel"]}))
                print(f"[bot] user {user_id} ({username}) WS'e bağlandı")

                async for msg in ws:
                    try:
                        payload = json.loads(msg)
                        event_type = payload.get("eventType")

                        if event_type == "OfferHistoryChannel":
                            handle_offer_history_message(payload)
                            continue

                        if event_type != "HourlyContractBoard":
                            continue

                        c = payload.get("body", {})
                        contract_name = c.get("name")
                        if not contract_name:
                            continue

                        active_bots = db_get_active_bots(user_id)
                        matching = [b for b in active_bots if b["contract_name"] == contract_name]
                        if not matching:
                            continue

                        best_sell = c.get("bestSellPrice")
                        best_buy = c.get("bestBuyPrice")

                        for bot in matching:
                            if bot["id"] in open_offers:
                                continue

                            price = best_sell if bot["side"] == "BUY" else best_buy
                            if price is None:
                                continue
                            if not (bot["min_price"] <= price <= bot["max_price"]):
                                continue

                            remaining_mw = bot["target_quantity"] - bot["filled_quantity"]
                            if remaining_mw <= 0:
                                db_update_filled(bot["id"], bot["filled_quantity"], status="DONE")
                                continue

                            await rate_limited_place_offer(user_id, bot, price, remaining_mw, access_token)
                    except Exception as e:
                        print(f"[bot] mesaj işleme hatası: {e}")
        except Exception as e:
            print(f"[bot] user {user_id} WS hatası: {e}, 5sn sonra tekrar denenecek")
            await asyncio.sleep(5)

async def supervisor_loop():
    while True:
        try:
            active_user_ids = db_active_user_ids()
            for uid in active_user_ids:
                if uid not in state or state[uid]["task"].done():
                    state[uid] = {"task": asyncio.create_task(run_user_ws(uid))}
        except Exception as e:
            print(f"[bot] supervisor hatası: {e}")
        await asyncio.sleep(10)

def start_bot_engine():
    asyncio.create_task(supervisor_loop())
