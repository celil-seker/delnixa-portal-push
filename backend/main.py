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
