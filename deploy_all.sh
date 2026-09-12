cd ~/Proje/delnixa-portal-push

# ============ 1) backend/main.py ============
cat > backend/main.py << 'PYEOF'
from routers.central import router as central_router
from routers.bots import router as bots_router
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, Float, String, ForeignKey, DateTime, text
from sqlalchemy.orm import sessionmaker, declarative_base
import hashlib, jwt, datetime, os, requests
from epias_ws import router as epias_router

app = FastAPI(title="Delnixa Central API")
app.include_router(epias_router, prefix="/api/epias/ws")
app.include_router(central_router, prefix="/api/central")
app.include_router(bots_router, prefix="/api/bots")

JWT_SECRET = os.getenv("JWT_SECRET", "delnixa_super_secret_key")
JWT_ALGO = "HS256"

DB_URL = os.getenv("DATABASE_URL", "postgresql://delnixa:delnixa@db:5432/delnixadb")
engine = create_engine(DB_URL)
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    username = Column(String, unique=True)
    password_hash = Column(String)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class CentralAccount(Base):
    __tablename__ = "central_accounts"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    company_name = Column(String)
    company_id = Column(String)
    epias_username = Column(String)
    epias_password_encrypted = Column(String)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class Bot(Base):
    __tablename__ = "bots"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    contract_name = Column(String, nullable=False)
    region = Column(String, default="TR1")
    side = Column(String, nullable=False)
    min_price = Column(Float, nullable=False)
    max_price = Column(Float, nullable=False)
    target_quantity = Column(Float, nullable=False)
    filled_quantity = Column(Float, default=0)
    status = Column(String, default="ACTIVE")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow)

Base.metadata.create_all(engine)

class LoginIn(BaseModel):
    username: str
    password: str

def make_token(username: str):
    payload = {
        "sub": username,
        "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=2)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)

def verify_password(raw, hashed):
    return hashlib.sha256(raw.encode()).hexdigest() == hashed

@app.post("/central/login")
def login(body: LoginIn):
    db = SessionLocal()
    try:
        u = db.query(User).filter_by(username=body.username).first()
        if not u or not verify_password(body.password, u.password_hash):
            raise HTTPException(401, "Hatalı kullanıcı veya şifre")
        return {"access_token": make_token(u.username)}
    finally:
        db.close()

@app.on_event("startup")
async def startup_event():
    from bot_engine import start_bot_engine
    start_bot_engine()
PYEOF

# ============ 2) backend/epias_ws.py ============
cat > backend/epias_ws.py << 'PYEOF'
from fastapi import APIRouter, HTTPException
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
import os, requests, datetime
import jwt

router = APIRouter()

JWT_SECRET = os.getenv("JWT_SECRET", "delnixa_super_secret_key")
JWT_ALGO   = "HS256"

DB_URL = os.getenv("DATABASE_URL", "postgresql://delnixa:delnixa@db:5432/delnixadb")
engine = create_engine(DB_URL)
SessionLocal = sessionmaker(bind=engine)

CAS_BASE     = "https://cas.epias.com.tr/cas"
BASE_URL     = "https://gunici.epias.com.tr"
SERVICE_URL  = f"{BASE_URL}/gunici-service"
TRADING_URL  = f"{BASE_URL}/gunici-trading-service"
USERINFO_URL = f"{SERVICE_URL}/rest/v1/user/info"
OFFER_SAVE_URL = f"{TRADING_URL}/rest/v1/offer/hourly/save"

def verify_portal_token(token: str):
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])["sub"]
    except:
        raise HTTPException(401, "Geçersiz portal token")

def get_epias_credentials(username: str):
    db = SessionLocal()
    try:
        row = db.execute(text("""
            SELECT c.epias_username, c.epias_password_encrypted
            FROM users u
            JOIN central_accounts c ON c.user_id = u.id
            WHERE u.username = :u
        """), {"u": username}).fetchone()
        if not row:
            raise HTTPException(404, "EPİAŞ hesabı bulunamadı")
        return row.epias_username, row.epias_password_encrypted
    finally:
        db.close()

def get_tgt(user, pw):
    r = requests.post(
        f"{CAS_BASE}/v1/tickets",
        data={"username": user, "password": pw},
        verify=False
    )
    if r.status_code not in (200, 201):
        raise HTTPException(502, "TGT hatası: " + r.text)
    loc = r.headers.get("Location")
    return loc.split("/")[-1] if loc else r.text.strip()

def get_epias_jwt_and_ws(tgt):
    r = requests.get(
        USERINFO_URL,
        headers={"TGT": tgt, "Accept": "application/json"},
        verify=False
    )
    if r.status_code != 200:
        raise HTTPException(502, "USERINFO hatası: " + r.text)

    try:
        content = r.json()["body"]["content"]
        access_token = content["accessToken"]
        ws_path = content["webSocketDto"]["url"]
    except Exception as e:
        raise HTTPException(502, "USERINFO parse hatası: " + str(e))

    ws_url = f"wss://gunici.epias.com.tr/gunici-service{ws_path}"
    return access_token, ws_path, ws_url

def place_offer(access_token, contract_name, side, price, quantity, region="TR1"):
    return requests.post(
        OFFER_SAVE_URL,
        headers={
            "intraday-jwt": access_token,
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        json={
            "contractName": contract_name,
            "offerType": side,
            "optionType": "NORMAL",
            "price": price,
            "quantity": quantity,
            "region": region,
            "description": "delnixa-bot",
            "expireTime": None,
            "priceLeveledOfferDetails": None,
            "isActive": True,
            "isConfirmed": False,
            "timeLeveledOfferDetails": None,
        },
        verify=False,
        timeout=10,
    )

@router.get("/connect")
def ws_connect(portal_token: str):
    portal_user = verify_portal_token(portal_token)
    epias_user, epias_pw = get_epias_credentials(portal_user)
    tgt = get_tgt(epias_user, epias_pw)
    access_token, ws_path, ws_url = get_epias_jwt_and_ws(tgt)
    return {
        "status": "OK",
        "portal_username": portal_user,
        "epias_username": epias_user,
        "tgt": tgt,
        "accessToken": access_token,
        "ws_path": ws_path,
        "ws_url": ws_url
    }

@router.get("/autoupdate")
def ws_autoupdate(portal_token: str):
    portal_user = verify_portal_token(portal_token)
    epias_user, epias_pw = get_epias_credentials(portal_user)
    tgt = get_tgt(epias_user, epias_pw)
    access_token, ws_path, ws_url = get_epias_jwt_and_ws(tgt)
    return {
        "status": "OK",
        "accessToken": access_token,
        "ws_url": ws_url,
        "expires_in": 600
    }
PYEOF

# ============ 3) backend/routers/bots.py ============
mkdir -p backend/routers
cat > backend/routers/bots.py << 'PYEOF'
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
import os, jwt

router = APIRouter()

JWT_SECRET = os.getenv("JWT_SECRET", "delnixa_super_secret_key")
JWT_ALGO = "HS256"

DB_URL = os.getenv("DATABASE_URL", "postgresql://delnixa:delnixa@db:5432/delnixadb")
engine = create_engine(DB_URL)
SessionLocal = sessionmaker(bind=engine)

def get_username(portal_token: str):
    try:
        payload = jwt.decode(portal_token, JWT_SECRET, algorithms=[JWT_ALGO])
        return payload["sub"]
    except Exception:
        raise HTTPException(401, "Geçersiz token")

class BotIn(BaseModel):
    contract_name: str
    region: str = "TR1"
    side: str
    min_price: float
    max_price: float
    target_quantity: float

class BotStatusIn(BaseModel):
    status: str

def _user_id(db, username):
    row = db.execute(text("SELECT id FROM users WHERE username=:u"), {"u": username}).fetchone()
    if not row:
        raise HTTPException(404, "Kullanıcı bulunamadı")
    return row.id

@router.post("")
def upsert_bot(body: BotIn, username: str = Depends(get_username)):
    if body.side not in ("BUY", "SELL"):
        raise HTTPException(400, "side BUY veya SELL olmalı")
    if body.min_price > body.max_price:
        raise HTTPException(400, "min_price max_price'tan büyük olamaz")
    db = SessionLocal()
    try:
        uid = _user_id(db, username)
        existing = db.execute(text(
            "SELECT id FROM bots WHERE user_id=:uid AND contract_name=:c"
        ), {"uid": uid, "c": body.contract_name}).fetchone()
        if existing:
            db.execute(text("""
                UPDATE bots SET region=:region, side=:side, min_price=:minp, max_price=:maxp,
                target_quantity=:tq, filled_quantity=0, status='ACTIVE', updated_at=now()
                WHERE id=:id
            """), {"region": body.region, "side": body.side, "minp": body.min_price,
                    "maxp": body.max_price, "tq": body.target_quantity, "id": existing.id})
            bot_id = existing.id
        else:
            row = db.execute(text("""
                INSERT INTO bots (user_id, contract_name, region, side, min_price, max_price, target_quantity, filled_quantity, status, created_at, updated_at)
                VALUES (:uid, :c, :region, :side, :minp, :maxp, :tq, 0, 'ACTIVE', now(), now())
                RETURNING id
            """), {"uid": uid, "c": body.contract_name, "region": body.region, "side": body.side,
                    "minp": body.min_price, "maxp": body.max_price, "tq": body.target_quantity}).fetchone()
            bot_id = row.id
        db.commit()
        return {"status": "OK", "bot_id": bot_id}
    finally:
        db.close()

@router.get("")
def list_bots(username: str = Depends(get_username)):
    db = SessionLocal()
    try:
        uid = _user_id(db, username)
        rows = db.execute(text("SELECT * FROM bots WHERE user_id=:uid"), {"uid": uid}).fetchall()
        return {"bots": [dict(r._mapping) for r in rows]}
    finally:
        db.close()

@router.patch("/{bot_id}")
def update_bot_status(bot_id: int, body: BotStatusIn, username: str = Depends(get_username)):
    if body.status not in ("ACTIVE", "PAUSED"):
        raise HTTPException(400, "status ACTIVE veya PAUSED olmalı")
    db = SessionLocal()
    try:
        uid = _user_id(db, username)
        result = db.execute(text(
            "UPDATE bots SET status=:s, updated_at=now() WHERE id=:id AND user_id=:uid"
        ), {"s": body.status, "id": bot_id, "uid": uid})
        db.commit()
        if result.rowcount == 0:
            raise HTTPException(404, "Bot bulunamadı")
        return {"status": "OK"}
    finally:
        db.close()

@router.delete("/{bot_id}")
def delete_bot(bot_id: int, username: str = Depends(get_username)):
    db = SessionLocal()
    try:
        uid = _user_id(db, username)
        result = db.execute(text("DELETE FROM bots WHERE id=:id AND user_id=:uid"), {"id": bot_id, "uid": uid})
        db.commit()
        if result.rowcount == 0:
            raise HTTPException(404, "Bot bulunamadı")
        return {"status": "OK"}
    finally:
        db.close()
PYEOF

# ============ 4) backend/bot_engine.py ============
cat > backend/bot_engine.py << 'PYEOF'
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
PYEOF

# ============ 5) requirements.txt ============
grep -qxF "websockets" backend/requirements.txt || echo "websockets" >> backend/requirements.txt

# ============ 6) frontend/app/central/(panel)/gunici/BotCell.jsx ============
cat > "frontend/app/central/(panel)/gunici/BotCell.jsx" << 'JSEOF'
export default function BotCell({ status, onClick }) {
  const icon =
    status === "ACTIVE" ? "🟢" :
    status === "PAUSED" ? "⏸️" :
    status === "DONE"   ? "✅" : "🔔";

  return (
    <button onClick={onClick} className="flex items-center justify-center text-lg w-full">
      {icon}
    </button>
  );
}
JSEOF

# ============ 7) frontend/app/central/(panel)/gunici/BotPanel.jsx ============
cat > "frontend/app/central/(panel)/gunici/BotPanel.jsx" << 'JSEOF'
"use client";
import { useState, useEffect } from "react";

export default function BotPanel({ open, kontrat, onClose, existingBot, onSaved }) {
  const [side, setSide] = useState("BUY");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [targetQty, setTargetQty] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmRestart, setConfirmRestart] = useState(false);

  const isDone = existingBot?.status === "DONE";

  useEffect(() => {
    if (existingBot) {
      setSide(existingBot.side);
      setMinPrice(existingBot.min_price);
      setMaxPrice(existingBot.max_price);
      setTargetQty(existingBot.target_quantity);
    } else {
      setSide("BUY"); setMinPrice(""); setMaxPrice(""); setTargetQty("");
    }
    setError("");
    setConfirmRestart(false);
  }, [existingBot, kontrat, open]);

  if (!open) return null;

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";

  async function save() {
    if (isDone && !confirmRestart) {
      setError("Bu bot hedefine ulaşıp DURDU. Tekrar başlatmak için önce onay kutusunu işaretle.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const token = localStorage.getItem("portal_token");
      const res = await fetch(`${apiUrl}/api/bots?portal_token=${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contract_name: kontrat,
          side,
          min_price: parseFloat(minPrice),
          max_price: parseFloat(maxPrice),
          target_quantity: parseFloat(targetQty),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Kayıt hatası");
      onSaved && onSaved();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function pauseOrResume(newStatus) {
    if (!existingBot) return;
    const token = localStorage.getItem("portal_token");
    await fetch(`${apiUrl}/api/bots/${existingBot.id}?portal_token=${token}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    onSaved && onSaved();
  }

  async function remove() {
    if (!existingBot) return;
    const token = localStorage.getItem("portal_token");
    await fetch(`${apiUrl}/api/bots/${existingBot.id}?portal_token=${token}`, {
      method: "DELETE",
    });
    onSaved && onSaved();
    onClose();
  }

  return (
    <div className="fixed right-0 top-0 w-[380px] h-full bg-white shadow-xl border-l border-blue-900 z-50 overflow-y-auto">
      <div className="p-4 border-b border-blue-900 text-blue-900 font-semibold flex justify-between items-center">
        <span>BOT AYARLARI — {kontrat}</span>
        <button onClick={onClose} className="text-xl">✖</button>
      </div>

      <div className="p-4 text-sm space-y-4">
        {existingBot && (
          <div className={`text-xs p-2 rounded ${isDone ? "bg-green-50 text-green-800" : "bg-gray-50 text-gray-500"}`}>
            Durum: <span className="font-semibold">{existingBot.status}</span>
            {" — "}Gerçekleşen: {existingBot.filled_quantity}/{existingBot.target_quantity} MW
            {isDone && <div className="mt-1">✅ Bot hedefine ulaştı ve kalıcı olarak durdu.</div>}
          </div>
        )}

        <div>
          <label className="block font-medium mb-1">Yön</label>
          <select value={side} onChange={(e) => setSide(e.target.value)} disabled={isDone} className="w-full border rounded p-2 disabled:bg-gray-100">
            <option value="BUY">AL</option>
            <option value="SELL">SAT</option>
          </select>
        </div>

        <div>
          <label className="block font-medium mb-1">Min Fiyat</label>
          <input type="number" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} disabled={isDone} className="w-full border rounded p-2 disabled:bg-gray-100" />
        </div>

        <div>
          <label className="block font-medium mb-1">Maks Fiyat</label>
          <input type="number" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} disabled={isDone} className="w-full border rounded p-2 disabled:bg-gray-100" />
        </div>

        <div>
          <label className="block font-medium mb-1">Hedef Net Pozisyon (MWh)</label>
          <input type="number" value={targetQty} onChange={(e) => setTargetQty(e.target.value)} disabled={isDone} className="w-full border rounded p-2 disabled:bg-gray-100" />
        </div>

        {isDone && (
          <label className="flex items-start gap-2 text-xs text-yellow-800 bg-yellow-50 p-2 rounded">
            <input type="checkbox" checked={confirmRestart} onChange={(e) => setConfirmRestart(e.target.checked)} className="mt-0.5" />
            Bu tamamlanmış botu bilerek sıfırlayıp yeniden başlatmak istiyorum (hedef ve gerçekleşen sıfırlanacak).
          </label>
        )}

        {error && <div className="text-red-600 text-xs">{error}</div>}

        {(!isDone || confirmRestart) && (
          <button onClick={save} disabled={saving} className="w-full bg-blue-900 text-white py-2 rounded font-semibold disabled:bg-gray-400">
            {saving ? "Kaydediliyor..." : isDone ? "Sıfırla ve Yeniden Başlat" : "Kaydet ve Başlat"}
          </button>
        )}

        {existingBot && existingBot.status === "ACTIVE" && (
          <button onClick={() => pauseOrResume("PAUSED")} className="w-full border border-yellow-600 text-yellow-700 py-2 rounded">
            Duraklat
          </button>
        )}
        {existingBot && existingBot.status === "PAUSED" && (
          <button onClick={() => pauseOrResume("ACTIVE")} className="w-full border border-green-600 text-green-700 py-2 rounded">
            Devam Ettir
          </button>
        )}
        {existingBot && (
          <button onClick={remove} className="w-full border border-red-600 text-red-700 py-2 rounded">
            Botu Sil
          </button>
        )}
      </div>
    </div>
  );
}
JSEOF

# ============ 8) frontend/app/central/(panel)/gunici/page.jsx ============
cat > "frontend/app/central/(panel)/gunici/page.jsx" << 'JSEOF'
"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import BotCell from "./BotCell";
import BotPanel from "./BotPanel";

export default function GuniciTahta() {
  const [rows, setRows] = useState({});
  const [status, setStatus] = useState("BAĞLANIYOR...");
  const [bots, setBots] = useState([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedContract, setSelectedContract] = useState(null);
  const wsRef = useRef(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
  const CONNECT_URL = apiUrl + "/api/epias/ws/connect";

  function formatRemaining(deliveryStart) {
    if (!deliveryStart) return "-";
    const now = new Date();
    const end = new Date(deliveryStart);
    const diff = end - now;
    if (diff <= 0) return "0 dk";
    const mins = Math.floor(diff / 60000);
    return mins + " dk";
  }

  const refreshBots = useCallback(async () => {
    const token = localStorage.getItem("portal_token");
    if (!token) return;
    try {
      const res = await fetch(`${apiUrl}/api/bots?portal_token=${token}`);
      const data = await res.json();
      setBots(data.bots || []);
    } catch (e) {
      console.error("Bot listesi alınamadı:", e);
    }
  }, [apiUrl]);

  useEffect(() => {
    refreshBots();
    const interval = setInterval(refreshBots, 10000);
    return () => clearInterval(interval);
  }, [refreshBots]);

  useEffect(() => {
    let cancelled = false;

    async function connect() {
      try {
        const token = localStorage.getItem("portal_token");
        if (!token) {
          setStatus("HATA: TOKEN YOK");
          return;
        }

        const res = await fetch(`${CONNECT_URL}?portal_token=${token}`);
        const data = await res.json();
        if (!data.ws_url) {
          setStatus("HATA: WS URL GELMEDİ");
          return;
        }

        const ws = new WebSocket(data.ws_url);
        wsRef.current = ws;

        ws.onopen = () => setStatus("BAĞLI");
        ws.onclose = () => {
          if (!cancelled) {
            setStatus("BAĞLANTI KAPANDI — 3sn sonra tekrar deneniyor");
            setTimeout(connect, 3000);
          }
        };
        ws.onerror = () => setStatus("WS HATASI");

        ws.onmessage = (msg) => {
          try {
            const payload = JSON.parse(msg.data);
            if (payload.eventType !== "HourlyContractBoard") return;

            const c = payload.body || {};
            const info = c.boardInformation || {};

            setRows((prev) => ({
              ...prev,
              [c.name]: {
                contract: c.name,
                bidQty: c.bestBuyQuantity ?? 0,
                bidPrice: c.bestBuyPrice ?? 0,
                diff: c.priceGap ?? 0,
                askPrice: c.bestSellPrice ?? 0,
                askQty: c.bestSellQuantity ?? 0,
                ptf: info.mcp ?? 0,
                aof: info.averagePrice ?? 0,
                remaining: formatRemaining(c.deliveryDateStart),
                matchBuy: 0,
                matchSell: 0,
                matchNet: 0,
                myBuyPrice: 0,
                mySellPrice: 0,
                te0: 0,
                tgs: 0,
              },
            }));
          } catch (e) {
            console.error("WS parse error:", e);
          }
        };
      } catch (e) {
        setStatus("HATA (EXCEPTION)");
      }
    }
    connect();

    return () => {
      cancelled = true;
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  const rowList = Object.values(rows).sort((a, b) =>
    a.contract.localeCompare(b.contract)
  );

  function botForContract(contractName) {
    return bots.find((b) => b.contract_name === contractName);
  }

  function openBotPanel(contractName) {
    setSelectedContract(contractName);
    setPanelOpen(true);
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-[#0A1A2F]">Gün İçi Piyasası Tahtası</h1>
        <div className="text-xs">
          WS:{" "}
          <span
            className={
              status === "BAĞLI"
                ? "text-green-600"
                : status.startsWith("HATA")
                ? "text-red-600"
                : "text-yellow-600"
            }
          >
            {status}
          </span>
        </div>
      </div>

      <div className="w-full overflow-x-auto border border-gray-200 rounded-lg shadow-sm bg-white">
        <table className="min-w-full border-collapse text-xs">
          <thead className="bg-[#F4F6F9] text-[#0A1A2F] font-semibold">
            <tr>
              <th className="px-3 py-2 border">Kontrat</th>
              <th className="px-3 py-2 border">Alış Miktar</th>
              <th className="px-3 py-2 border">Alış Fiyat</th>
              <th className="px-3 py-2 border">Fark</th>
              <th className="px-3 py-2 border">Satış Fiyat</th>
              <th className="px-3 py-2 border">Satış Miktar</th>
              <th className="px-3 py-2 border">PTF</th>
              <th className="px-3 py-2 border">AOF</th>
              <th className="px-3 py-2 border">Kalan</th>
              <th className="px-3 py-2 border">Eşl. Alış</th>
              <th className="px-3 py-2 border">Eşl. Satış</th>
              <th className="px-3 py-2 border">Net</th>
              <th className="px-3 py-2 border">Alış F.</th>
              <th className="px-3 py-2 border">Satış F.</th>
              <th className="px-3 py-2 border">TE₀</th>
              <th className="px-3 py-2 border">TGS</th>
              <th className="px-3 py-2 border">BOT</th>
            </tr>
          </thead>

          <tbody>
            {rowList.map((r) => {
              const bot = botForContract(r.contract);
              return (
                <tr key={r.contract} className="hover:bg-blue-50 transition-colors border-b">
                  <td className="px-3 py-2 border">{r.contract}</td>
                  <td className="px-3 py-2 border text-right">{r.bidQty}</td>
                  <td className="px-3 py-2 border text-right text-blue-700 font-semibold">
                    {r.bidPrice}
                  </td>
                  <td className="px-3 py-2 border text-right">{r.diff}</td>
                  <td className="px-3 py-2 border text-right text-red-600 font-semibold">
                    {r.askPrice}
                  </td>
                  <td className="px-3 py-2 border text-right">{r.askQty}</td>
                  <td className="px-3 py-2 border text-right">{r.ptf}</td>
                  <td className="px-3 py-2 border text-right">{r.aof}</td>
                  <td className="px-3 py-2 border text-center">{r.remaining}</td>
                  <td className="px-3 py-2 border text-right">{r.matchBuy}</td>
                  <td className="px-3 py-2 border text-right">{r.matchSell}</td>
                  <td className="px-3 py-2 border text-right">{r.matchNet}</td>
                  <td className="px-3 py-2 border text-right">{r.myBuyPrice}</td>
                  <td className="px-3 py-2 border text-right">{r.mySellPrice}</td>
                  <td className="px-3 py-2 border text-right">{r.te0}</td>
                  <td className="px-3 py-2 border text-right">{r.tgs}</td>
                  <td className="px-3 py-2 border text-center">
                    <BotCell status={bot?.status} onClick={() => openBotPanel(r.contract)} />
                  </td>
                </tr>
              );
            })}

            {rowList.length === 0 && (
              <tr>
                <td colSpan={17} className="px-3 py-6 text-center text-gray-500">
                  Henüz veri yok — WS bağlanıyor...
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <BotPanel
        open={panelOpen}
        kontrat={selectedContract}
        existingBot={botForContract(selectedContract)}
        onClose={() => setPanelOpen(false)}
        onSaved={refreshBots}
      />
    </div>
  );
}
JSEOF

# ============ 9) setup.sh garantiye al ============
cat > setup.sh << 'SETUPEOF'
#!/bin/bash
set -e
echo "== Delnixa Portal kurulum =="

if [ ! -f certs/fullchain.pem ]; then
  mkdir -p certs
  openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout certs/privkey.pem -out certs/fullchain.pem \
    -subj "/CN=localhost"
  echo "Self-signed sertifika oluşturuldu."
fi

if [ ! -f frontend/.env.local ]; then
  echo "NEXT_PUBLIC_API_URL=" > frontend/.env.local
  echo "frontend/.env.local oluşturuldu."
fi

if [ ! -f .env ]; then
  cp .env.example .env
  echo ".env oluşturuldu."
fi

echo "Kurulum tamam. Şimdi çalıştır: docker compose up -d --build"
SETUPEOF
chmod +x setup.sh

# ============ 10) .env / .env.local örnekleri garantiye al ============
[ -f .env.example ] || cat > .env.example << 'EOF'
JWT_SECRET=change_this_to_a_random_secret
POSTGRES_USER=delnixa
POSTGRES_PASSWORD=delnixa
POSTGRES_DB=delnixadb
EOF
[ -f frontend/.env.local.example ] || echo "NEXT_PUBLIC_API_URL=" > frontend/.env.local.example

./setup.sh

# ============ 11) Sıfırdan build + başlat ============
docker compose down 2>/dev/null
docker compose build --no-cache
docker compose up -d

echo "== Servisler ayağa kalkıyor, 10sn bekleniyor =="
sleep 10
docker compose ps

# ============ 12) celil kullanıcısı + EPİAŞ hesabı garantiye al (idempotent) ============
docker exec -i delnixa-portal-db-1 psql -U delnixa -d delnixadb << 'SQLEOF'
INSERT INTO users (username, password_hash, created_at)
SELECT 'celil', 'fee63269a552c28510da4b0b1fd5d8f226e0250a7975ce639719faf2b24710cf', now()
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username='celil');

INSERT INTO central_accounts (user_id, company_name, company_id, epias_username, epias_password_encrypted, created_at)
SELECT u.id, 'Konya', '1', 'CSEKER42', 'Kuzey848**', now()
FROM users u
WHERE u.username='celil'
AND NOT EXISTS (SELECT 1 FROM central_accounts c WHERE c.user_id=u.id);
SQLEOF

echo "== Kontrol =="
docker exec -it delnixa-portal-db-1 psql -U delnixa -d delnixadb -c \
"SELECT u.username, c.company_name, c.epias_username FROM users u JOIN central_accounts c ON u.id=c.user_id WHERE u.username='celil';"

echo ""
echo "== Backend loglarında hata var mı =="
docker logs delnixa-portal-api-1 --tail 30

# ============ 13) Git commit ============
git add .
git commit -m "Bot sistemi son hali: gerçek eşleşme takibi, TGS/TEO koruma, DONE kilidi, lot çevrimi"

echo ""
echo "== TAMAMLANDI =="
echo "Tarayıcıdan https://localhost/central adresine git, celil / seker ile giriş yap."
echo "Push için yeni token oluşturup şunu çalıştır:"
echo "  git remote set-url origin https://celil-seker:YENİ_TOKEN@github.com/celil-seker/delnixa-portal-push.git"
echo "  git push origin main"
echo "  git remote set-url origin https://github.com/celil-seker/delnixa-portal-push.git"
