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
            FROM users u JOIN central_accounts c ON c.user_id = u.id
            WHERE u.username = :u
        """), {"u": username}).fetchone()
        if not row:
            raise HTTPException(404, "EPİAŞ hesabı bulunamadı")
        return row.epias_username, row.epias_password_encrypted
    finally:
        db.close()

def get_tgt(user, pw):
    r = requests.post(f"{CAS_BASE}/v1/tickets", data={"username": user, "password": pw}, verify=False)
    if r.status_code not in (200, 201):
        raise HTTPException(502, "TGT hatası: " + r.text)
    loc = r.headers.get("Location")
    return loc.split("/")[-1] if loc else r.text.strip()

def get_epias_jwt_and_ws(tgt):
    r = requests.get(USERINFO_URL, headers={"TGT": tgt, "Accept": "application/json"}, verify=False)
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
        headers={"intraday-jwt": access_token, "Content-Type": "application/json", "Accept": "application/json"},
        json={
            "contractName": contract_name, "offerType": side, "optionType": "NORMAL",
            "price": price, "quantity": quantity, "region": region,
            "description": "delnixa-bot", "expireTime": None, "priceLeveledOfferDetails": None,
            "isActive": True, "isConfirmed": False, "timeLeveledOfferDetails": None,
        },
        verify=False, timeout=10,
    )

@router.get("/connect")
def ws_connect(portal_token: str):
    portal_user = verify_portal_token(portal_token)
    epias_user, epias_pw = get_epias_credentials(portal_user)
    tgt = get_tgt(epias_user, epias_pw)
    access_token, ws_path, ws_url = get_epias_jwt_and_ws(tgt)
    return {"status": "OK", "portal_username": portal_user, "epias_username": epias_user,
            "tgt": tgt, "accessToken": access_token, "ws_path": ws_path, "ws_url": ws_url}

@router.get("/autoupdate")
def ws_autoupdate(portal_token: str):
    portal_user = verify_portal_token(portal_token)
    epias_user, epias_pw = get_epias_credentials(portal_user)
    tgt = get_tgt(epias_user, epias_pw)
    access_token, ws_path, ws_url = get_epias_jwt_and_ws(tgt)
    return {"status": "OK", "accessToken": access_token, "ws_url": ws_url, "expires_in": 600}
