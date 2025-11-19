from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import os
DB_URL = os.getenv("DATABASE_URL", "postgresql://delnixa:delnixa@db:5432/delnixadb")
engine = create_engine(DB_URL)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
