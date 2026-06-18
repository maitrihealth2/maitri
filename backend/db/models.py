from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime, Float, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./mindbridge.db")

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(200), nullable=False)
    preferred_language = Column(String(10), default="en-IN")
    created_at = Column(DateTime, default=datetime.utcnow)
    is_active = Column(Boolean, default=True)


class Session(Base):
    __tablename__ = "sessions"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False)
    session_token = Column(String(100), unique=True, index=True)
    started_at = Column(DateTime, default=datetime.utcnow)
    ended_at = Column(DateTime, nullable=True)
    channel = Column(String(20), default="web")
    is_crisis_flagged = Column(Boolean, default=False)


class Message(Base):
    __tablename__ = "messages"
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, nullable=False)
    role = Column(String(20), nullable=False)
    content = Column(Text, nullable=False)
    emotion = Column(String(30), nullable=True)
    emotion_score = Column(Float, nullable=True)
    is_crisis_flagged = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    language = Column(String(10), default="en-IN")


class RiskLog(Base):
    __tablename__ = "risk_logs"
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, nullable=False)
    user_id = Column(Integer, nullable=False)
    trigger_phrase = Column(Text, nullable=False)
    system_response = Column(Text, nullable=False)
    helpline_shown = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    Base.metadata.create_all(bind=engine)
    print("Database tables created.")


def get_past_history_context(db, user_id: int, current_session_id: int) -> str:
    """Fetch recent messages from previous sessions of the user to provide cross-session context."""
    try:
        # Find all previous sessions of this user (ordered from newest to oldest)
        prev_sessions = db.query(Session).filter(
            Session.user_id == user_id,
            Session.id != current_session_id
        ).order_by(Session.started_at.desc()).limit(3).all()
        
        if not prev_sessions:
            return ""
            
        prev_session_ids = [s.id for s in prev_sessions]
        # Fetch last 10 messages from these previous sessions
        past_messages = db.query(Message).filter(
            Message.session_id.in_(prev_session_ids)
        ).order_by(Message.created_at.desc()).limit(10).all()
        
        if not past_messages:
            return ""
            
        # Sort chronologically
        past_messages = sorted(past_messages, key=lambda m: m.created_at)
        
        lines = []
        for msg in past_messages:
            role_name = "User" if msg.role == "user" else "Maitri"
            lines.append(f"- {role_name}: {msg.content}")
            
        return "\n".join(lines)
    except Exception as e:
        print(f"Error fetching past history context: {e}")
        return ""