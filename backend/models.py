from sqlalchemy import Column, Integer, String, ForeignKey, DateTime
from sqlalchemy.orm import declarative_base
from datetime import datetime

Base = declarative_base()

# --- Ana Kullanıcı Tablosu ---
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

# --- Merkezi Hesap Tablosu ---
class CentralAccount(Base):
    __tablename__ = "central_accounts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    company_name = Column(String)
    company_id = Column(String)
    epias_username = Column(String)

# --- Alt Kullanıcı Tablosu ---
class SubUser(Base):
    __tablename__ = "sub_users"

    id = Column(Integer, primary_key=True, index=True)
    central_username = Column(String, ForeignKey("users.username"))
    username = Column(String, unique=True)
    password_hash = Column(String)

