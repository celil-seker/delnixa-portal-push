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
