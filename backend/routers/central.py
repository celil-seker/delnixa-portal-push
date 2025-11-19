from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, String, DateTime
from sqlalchemy.orm import sessionmaker, declarative_base
import os, hashlib, jwt, datetime

router = APIRouter()

JWT_SECRET = "delnixa_super_secret_key"
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

@router.post("/login")
def central_login(body: LoginIn):
    db = SessionLocal()
    try:
        u = db.query(User).filter_by(username=body.username).first()
        if not u or not verify_password(body.password, u.password_hash):
            raise HTTPException(401, "Hatalı kullanıcı veya şifre")
        return {"access_token": make_token(u.username)}
    finally:
        db.close()
