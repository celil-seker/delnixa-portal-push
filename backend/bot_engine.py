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
bot_offer_fills = {}
state = {}

def db_active_user_ids():
    db = SessionLocal()
    try:
        return [r.user_id for r in db.execute(text("SELECT DISTINCT user_id FROM bots WHERE status='ACTIVE'")).fetchall()]
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
            FROM users u JOIN central_accounts c ON c.user_id=u.id WHERE u.id=:uid
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

def compute_target_price(bot, board):
    side = bot["side"]
    best_buy = board.get("bestBuyPrice")
    best_sell = board.get("bestSellPrice")
    best_buy_qty = board.get("bestBuyQuantity", 0) or 0
    best_sell_qty = board.get("bestSellQuantity", 0) or 0
    rabbit = bot.get("rabbit_limit") or 0
    diff = bot.get("second_offer_price_diff") or 0.01
    if side == "BUY":
        if best_buy is None:
            return bot["max_price"]
        target = best_buy if (rabbit and best_buy_qty >= rabbit) else round(best_buy + diff, 2)
        return min(target, bot["max_price"])
    else:
        if best_sell is None:
            return bot["min_price"]
        target = best_sell if (rabbit and best_sell_qty >= rabbit) else round(best_sell - diff, 2)
        return max(target, bot["min_price"])

async def rate_limited_place_offer(user_id, bot, price, quantity_mw, access_token):
    contract_name = bot["contract_name"]
    key = (user_id, contract_name)
    st = contract_state.setdefault(key, {"last_price": None, "last_sent": 0, "count_today": 0, "paused": False, "min_gap": MIN_INTERVAL})
    if st["paused"]:
        return
    now = time.time()
    if st["last_price"] == price and (now - st["last_sent"]) < st["min_gap"]:
        return
    gap = now - st["last_sent"]
    if gap < st["min_gap"]:
        await asyncio.sleep(st["min_gap"] - gap)
    quantity_lots = round(quantity_mw * LOT_PER_MW)
    if quantity_lots <= 0:
        return
    try:
        resp = place_offer(access_token, contract_name, bot["side"], price, quantity_lots, bot["region"])
    except Exception as e:
        print(f"[bot] emir gönderim hatası: {e}")
        return
    st["last_sent"] = time.time()
    st["last_price"] = price
    if resp.status_code == 429:
        retry_ms = int(resp.headers.get("X-Rate-Limit-Retry-After-Miliseconds", 4000))
        st["min_gap"] = max(st["min_gap"], retry_ms / 1000)
        print(f"[bot] {contract_name} rate limit, {retry_ms}ms yavaşlatılıyor")
        return
    if resp.status_code != 200:
        body = resp.text
        if "OFFER052" in body:
            st["paused"] = True
            print(f"[bot] {contract_name} TEO limitine takıldı, bot duraklatıldı")
        else:
            print(f"[bot] {contract_name} emir reddedildi: {body[:300]}")
        return
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
    offer_key = offer_id if offer_id else f"{contract_name}:{price}:{time.time()}"
    bot_offer_fills.setdefault(bot["id"], {})[offer_key] = 0
    print(f"[bot] {contract_name} teklif gönderildi: {quantity_lots} lot @ {price} (key={offer_key})")

def total_filled_mw(bot_id):
    return sum(bot_offer_fills.get(bot_id, {}).values()) / LOT_PER_MW

def handle_offer_history_message(payload, epias_username):
    body = payload.get("body", {})
    contract_name = body.get("contractName")
    username = body.get("username")
    offer_id = body.get("id")
    if not contract_name or username != epias_username:
        return
    matching_bot_id, matched_key = None, None
    for bot_id, fills in bot_offer_fills.items():
        for key in fills:
            if key == offer_id:
                matching_bot_id, matched_key = bot_id, key
                break
        if matching_bot_id:
            break
    if matching_bot_id is None:
        return
    quantity = body.get("quantity", 0) or 0
    remaining = body.get("remainingQuantity", 0) or 0
    filled_lots = quantity - remaining
    bot_offer_fills[matching_bot_id][matched_key] = filled_lots
    total_mw = total_filled_mw(matching_bot_id)
    db = SessionLocal()
    try:
        row = db.execute(text("SELECT target_quantity FROM bots WHERE id=:id"), {"id": matching_bot_id}).fetchone()
        target = row.target_quantity if row else None
    finally:
        db.close()
    if target is None:
        return
    if total_mw >= target:
        db_update_filled(matching_bot_id, target, status="DONE")
        print(f"[bot] {contract_name} hedefe ulaşıldı ({total_mw:.2f}/{target} MW), bot DONE")
        bot_offer_fills.pop(matching_bot_id, None)
    else:
        db_update_filled(matching_bot_id, total_mw)
        print(f"[bot] {contract_name} eşleşme: toplam {total_mw:.2f}/{target} MW")

async def process_board_for_bot(user_id, bot, board, access_token):
    remaining_mw = bot["target_quantity"] - bot["filled_quantity"]
    if remaining_mw <= 0:
        db_update_filled(bot["id"], bot["filled_quantity"], status="DONE")
        return
    price = compute_target_price(bot, board)
    if price is None or not (bot["min_price"] <= price <= bot["max_price"]):
        return
    shooter = bot.get("shooter_max_volume") or 0
    if shooter > 0:
        opposite_price = board.get("bestSellPrice") if bot["side"] == "BUY" else board.get("bestBuyPrice")
        if opposite_price is not None:
            in_range = (bot["side"] == "BUY" and opposite_price <= bot["max_price"]) or \
                       (bot["side"] == "SELL" and opposite_price >= bot["min_price"])
            if in_range:
                shooter_mw = min(shooter / LOT_PER_MW, remaining_mw)
                await rate_limited_place_offer(user_id, bot, opposite_price, shooter_mw, access_token)
                return
    slice_mw = min(bot.get("slice", 5) / LOT_PER_MW, remaining_mw)
    await rate_limited_place_offer(user_id, bot, price, slice_mw, access_token)

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
                            handle_offer_history_message(payload, epias_user)
                            continue
                        if event_type != "HourlyContractBoard":
                            continue
                        board = payload.get("body", {})
                        contract_name = board.get("name")
                        if not contract_name:
                            continue
                        active_bots = db_get_active_bots(user_id)
                        matching = [b for b in active_bots if b["contract_name"] == contract_name]
                        for bot in matching:
                            await process_board_for_bot(user_id, bot, board, access_token)
                    except Exception as e:
                        print(f"[bot] mesaj işleme hatası: {e}")
        except Exception as e:
            print(f"[bot] user {user_id} WS hatası: {e}, 5sn sonra tekrar denenecek")
            await asyncio.sleep(5)

async def supervisor_loop():
    while True:
        try:
            for uid in db_active_user_ids():
                if uid not in state or state[uid]["task"].done():
                    state[uid] = {"task": asyncio.create_task(run_user_ws(uid))}
        except Exception as e:
            print(f"[bot] supervisor hatası: {e}")
        await asyncio.sleep(10)

def start_bot_engine():
    asyncio.create_task(supervisor_loop())
