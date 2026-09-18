import asyncio, json, time, os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
import websockets

from epias_ws import get_tgt, get_epias_jwt_and_ws, place_offer, update_offer

DB_URL = os.getenv("DATABASE_URL", "postgresql://delnixa:delnixa@db:5432/delnixadb")
engine = create_engine(DB_URL)
SessionLocal = sessionmaker(bind=engine)

MIN_INTERVAL = 0.12
TGS_WARN_RATIO = 0.8
DEFAULT_TGS_LIMIT = 200
LOT_PER_MW = 10

contract_state = {}   # (user_id, contract) -> rate limit durumu
open_offers = {}       # bot_id -> {"offer_id","version","price","lots"}  -- O BOTUN AÇIK TEKLİFİ (varsa)
state = {}
latest_board = {}      # (user_id, contract_name) -> son görülen board verisi (periyodik kontrol için)
periodic_tasks = {}    # user_id -> asyncio.Task

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

PRICE_TICK = 0.1  # EPİAŞ Minimum Teklif Fiyat Adımı (OFFER066 hatasını önlemek için)

def round_to_tick(price, tick=PRICE_TICK):
    if price is None:
        return None
    return round(round(price / tick) * tick, 2)

def compute_target_price(bot, board):
    side = bot["side"]
    best_buy = board.get("bestBuyPrice")
    best_sell = board.get("bestSellPrice")
    best_buy_qty = board.get("bestBuyQuantity", 0) or 0
    best_sell_qty = board.get("bestSellQuantity", 0) or 0
    rabbit = bot.get("rabbit_limit") or 0
    diff = bot.get("second_offer_price_diff") or PRICE_TICK

    if side == "BUY":
        if best_buy is None:
            return round_to_tick(bot["max_price"])
        if rabbit and best_buy_qty >= rabbit:
            target = best_buy
        else:
            target = best_buy + diff
        target = round_to_tick(target)
        return min(target, round_to_tick(bot["max_price"]))
    else:
        if best_sell is None:
            return round_to_tick(bot["min_price"])
        if rabbit and best_sell_qty >= rabbit:
            target = best_sell
        else:
            target = best_sell - diff
        target = round_to_tick(target)
        return max(target, round_to_tick(bot["min_price"]))

def _extract_offer_response(resp):
    try:
        data = resp.json()
        offer = data.get("body", {}).get("content", {}).get("offerResponse", {})
        return offer.get("id"), offer.get("version"), offer.get("remainingQuantity")
    except Exception:
        return None, None, None

async def _throttle(key):
    st = contract_state.setdefault(key, {"last_sent": 0, "count_today": 0, "paused": False, "min_gap": MIN_INTERVAL})
    now = time.time()
    gap = now - st["last_sent"]
    if gap < st["min_gap"]:
        await asyncio.sleep(st["min_gap"] - gap)
    st["last_sent"] = time.time()
    return st

def _register_tgs_hit(st, contract_name):
    st["count_today"] += 1
    if st["count_today"] >= DEFAULT_TGS_LIMIT * TGS_WARN_RATIO:
        st["min_gap"] = 5.0
    if st["count_today"] >= DEFAULT_TGS_LIMIT:
        st["paused"] = True
        print(f"[bot] {contract_name} TGS limitine ulaşıldı, bot durduruldu")

async def ensure_offer_at_price(user_id, bot, price, quantity_mw, access_token):
    """Bu bota ait AÇIK teklif yoksa yeni oluşturur (save); varsa ve fiyat farklıysa GÜNCELLER (update).
    Aynı fiyatta zaten açık teklif varsa hiçbir şey yapmaz — bu, OFFER053'ü (birden fazla teklif) önler."""
    contract_name = bot["contract_name"]
    key = (user_id, contract_name)
    st = contract_state.setdefault(key, {"last_sent": 0, "count_today": 0, "paused": False, "min_gap": MIN_INTERVAL})
    if st["paused"]:
        return

    quantity_lots = round(quantity_mw * LOT_PER_MW)
    if quantity_lots <= 0:
        return

    existing = open_offers.get(bot["id"])

    if existing and existing["price"] == price:
        return  # zaten bu fiyatta açık teklifimiz var, dokunma

    await _throttle(key)

    if existing:
        # ---- UPDATE (var olan teklifi güncelle) ----
        try:
            resp = update_offer(access_token, existing["offer_id"], existing["version"],
                                 contract_name, bot["side"], price, quantity_lots, bot["region"])
        except Exception as e:
            print(f"[bot] {contract_name} update hatası: {e}")
            return

        if resp.status_code == 429:
            retry_ms = int(resp.headers.get("X-Rate-Limit-Retry-After-Miliseconds", 4000))
            st["min_gap"] = max(st["min_gap"], retry_ms / 1000)
            return

        if resp.status_code != 200:
            body = resp.text
            if "OFFER048" in body:
                # versiyon uyuşmazlığı (muhtemelen kısmi eşleşme oldu) — kaydımız bozuk, temizle, sıradaki tick'te save ile yeniden dener
                print(f"[bot] {contract_name} teklif versiyonu değişmiş, tracking sıfırlanıyor")
                open_offers.pop(bot["id"], None)
            elif "OFFER052" in body:
                st["paused"] = True
                print(f"[bot] {contract_name} TEO limitine takıldı, bot duraklatıldı")
            elif "OFFER051" in body:
                # "güncellenebilir teklifiniz yok" -> teklif zaten kapanmış/eşleşmiş, tracking'i temizle
                open_offers.pop(bot["id"], None)
            else:
                print(f"[bot] {contract_name} update reddedildi: {body[:300]}")
            return

        _register_tgs_hit(st, contract_name)
        offer_id, version, remaining = _extract_offer_response(resp)
        open_offers[bot["id"]] = {"offer_id": existing["offer_id"], "version": version or existing["version"],
                                   "price": price, "lots": quantity_lots}
        print(f"[bot] {contract_name} teklif GÜNCELLENDİ: {quantity_lots} lot @ {price}")

    else:
        # ---- SAVE (ilk teklif) ----
        try:
            resp = place_offer(access_token, contract_name, bot["side"], price, quantity_lots, bot["region"])
        except Exception as e:
            print(f"[bot] {contract_name} save hatası: {e}")
            return

        if resp.status_code == 429:
            retry_ms = int(resp.headers.get("X-Rate-Limit-Retry-After-Miliseconds", 4000))
            st["min_gap"] = max(st["min_gap"], retry_ms / 1000)
            return

        if resp.status_code != 200:
            body = resp.text
            if "OFFER052" in body:
                st["paused"] = True
                print(f"[bot] {contract_name} TEO limitine takıldı, bot duraklatıldı")
            elif "OFFER053" in body:
                # zaten açık bir teklif varmış (örn. manuel girilmiş) — bizim tracking'imizde yoktu, dokunmadan bekle
                print(f"[bot] {contract_name} kontratta zaten başka bir açık teklif var, atlanıyor")
            else:
                print(f"[bot] {contract_name} save reddedildi: {body[:300]}")
            return

        _register_tgs_hit(st, contract_name)
        offer_id, version, remaining = _extract_offer_response(resp)
        if offer_id:
            open_offers[bot["id"]] = {"offer_id": offer_id, "version": version, "price": price, "lots": quantity_lots}
        print(f"[bot] {contract_name} YENİ teklif gönderildi: {quantity_lots} lot @ {price} (id={offer_id})")

def total_filled_mw_from_offer(bot_id, lots_sent):
    info = open_offers.get(bot_id)
    if not info:
        return None
    return None  # filled miktarı OfferHistoryChannel'dan geliyor, burada hesaplamıyoruz

def handle_offer_history_message(payload, epias_username):
    body = payload.get("body", {})
    contract_name = body.get("contractName")
    username = body.get("username")
    offer_id = body.get("id")
    version = body.get("version")
    if not contract_name or username != epias_username or offer_id is None:
        return

    matching_bot_id = None
    for bot_id, info in list(open_offers.items()):
        if info["offer_id"] == offer_id:
            matching_bot_id = bot_id
            break
    if matching_bot_id is None:
        return

    # Versiyonu güncel tut (EPİAŞ sistem tarafında da artırabilir, bir sonraki update'te bunu kullanmalıyız)
    if version is not None:
        open_offers[matching_bot_id]["version"] = version

    quantity = body.get("quantity", 0) or 0
    remaining = body.get("remainingQuantity", 0) or 0
    status_detail = (body.get("statusDetail") or {}).get("value") or (body.get("statusDetail") or {}).get("key") or body.get("statusDetail")
    filled_lots = quantity - remaining
    filled_mw = filled_lots / LOT_PER_MW

    db = SessionLocal()
    try:
        row = db.execute(text("SELECT target_quantity, filled_quantity FROM bots WHERE id=:id"), {"id": matching_bot_id}).fetchone()
        target = row.target_quantity if row else None
        current_filled = row.filled_quantity if row else 0
    finally:
        db.close()

    if target is None:
        return

    is_done = status_detail == "TE" or remaining <= 0
    is_cancelled = status_detail in ("ZA", "İP", "IP", "KA")

    new_total_filled = max(current_filled, filled_mw)  # asla geriye gitme

    if is_done:
        db_update_filled(matching_bot_id, min(new_total_filled, target), status="DONE" if new_total_filled >= target else None)
        print(f"[bot] {contract_name} teklif TAM eşleşti ({new_total_filled:.2f} MW)")
        open_offers.pop(matching_bot_id, None)
        if new_total_filled >= target:
            print(f"[bot] {contract_name} hedefe ulaşıldı, bot DONE — kalıcı olarak durdu")
    elif is_cancelled:
        db_update_filled(matching_bot_id, new_total_filled)
        print(f"[bot] {contract_name} teklif iptal/zaman aşımı, {new_total_filled:.2f} MW eşleşmiş kaldı")
        open_offers.pop(matching_bot_id, None)
    else:
        if new_total_filled >= target:
            db_update_filled(matching_bot_id, target, status="DONE")
            print(f"[bot] {contract_name} hedefe ulaşıldı ({new_total_filled:.2f}/{target} MW), bot DONE")
            open_offers.pop(matching_bot_id, None)
        else:
            db_update_filled(matching_bot_id, new_total_filled)
            print(f"[bot] {contract_name} kısmi eşleşme: {new_total_filled:.2f}/{target} MW")

async def process_board_for_bot(user_id, bot, board, access_token):
    remaining_mw = bot["target_quantity"] - bot["filled_quantity"]
    if remaining_mw <= 0:
        db_update_filled(bot["id"], bot["filled_quantity"], status="DONE")
        open_offers.pop(bot["id"], None)
        return

    price = compute_target_price(bot, board)
    bb = board.get("bestBuyPrice")
    bs = board.get("bestSellPrice")
    print(f"[bot-debug] {bot['contract_name']} id={bot['id']} side={bot['side']} "
          f"hesaplanan_fiyat={price} bestBuy={bb} bestSell={bs} "
          f"aralik=[{bot['min_price']},{bot['max_price']}] kalan={remaining_mw}")

    if price is None or not (bot["min_price"] <= price <= bot["max_price"]):
        print(f"[bot-debug] {bot['contract_name']} fiyat aralik disinda, teklif gonderilmiyor")
        return

    slice_mw = min(bot.get("slice", 5) / LOT_PER_MW, remaining_mw)
    await ensure_offer_at_price(user_id, bot, price, slice_mw, access_token)


async def periodic_recheck(user_id, get_access_token):
    """Yeni bir WS mesajı gelmese bile, en son bilinen tahta verisine göre
    tüm aktif botları düzenli aralıklarla tekrar değerlendirir. Böylece bot
    kurulduğu anda fiyat zaten aralık içindeyse, yeni bir tahta hareketi
    beklemeden ilk teklifini gönderebilir."""
    while True:
        await asyncio.sleep(2)
        try:
            active_bots = db_get_active_bots(user_id)
            print(f"[bot-debug] periodic_recheck tick user={user_id} aktif_bot_sayisi={len(active_bots)} cache_kontrat_sayisi={len(latest_board)}")
            if not active_bots:
                continue
            access_token = get_access_token()
            if not access_token:
                continue
            for bot in active_bots:
                board = latest_board.get((user_id, bot["contract_name"]))
                if board:
                    await process_board_for_bot(user_id, bot, board, access_token)
        except Exception as e:
            print(f"[bot] periodic_recheck hatası: {e}")

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
            current_token_holder = {"token": access_token}
            old_task = periodic_tasks.get(user_id)
            if old_task and not old_task.done():
                old_task.cancel()
            periodic_tasks[user_id] = asyncio.create_task(
                periodic_recheck(user_id, lambda: current_token_holder["token"])
            )

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
                        latest_board[(user_id, contract_name)] = board
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
