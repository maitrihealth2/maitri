import uuid
import asyncio
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from db.models import get_db, Session as DBSession, Message, RiskLog, User
from ai_engine.sarvam_client import chat_with_maitri
from ai_engine.emotion_detector import detect_emotion, detect_emotion_heuristic
from ai_engine.voice_client import get_language_prompt
from services.crisis_handler import check_for_crisis
from api.auth import get_current_user

try:
    from rag.retriever import retrieve_context, is_knowledge_base_ready
    RAG_AVAILABLE = is_knowledge_base_ready()
    if RAG_AVAILABLE:
        print("[RAG] Knowledge base loaded")
    else:
        print("[RAG] Not ready — run: python -m knowledge.loader")
except Exception as e:
    print(f"[RAG] Not available: {e}")
    RAG_AVAILABLE = False
    def retrieve_context(query, n_results=3): return ""

router = APIRouter(prefix="/api/consultation", tags=["consultation"])


class StartSessionResponse(BaseModel):
    session_id: str
    message: str


class ChatRequest(BaseModel):
    session_id: str
    message: str
    language: str = "en-IN"


class ChatResponse(BaseModel):
    response: str
    is_crisis: bool
    helplines: list[str]
    session_id: str
    emotion: str
    emotion_emoji: str
    emotion_score: float
    rag_used: bool


@router.post("/start", response_model=StartSessionResponse)
def start_session(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    token = str(uuid.uuid4())
    session = DBSession(user_id=current_user.id, session_token=token, channel="web")
    db.add(session); db.commit(); db.refresh(session)
    return StartSessionResponse(session_id=token, message="Session started.")


@router.post("/message", response_model=ChatResponse)
async def send_message(
    req: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    session = db.query(DBSession).filter(
        DBSession.session_token == req.session_id,
        DBSession.user_id == current_user.id,
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # ── Crisis first ──────────────────────────────────────────────────────────
    crisis = check_for_crisis(req.message)
    if crisis.is_crisis:
        db.add(RiskLog(session_id=session.id, user_id=current_user.id,
                       trigger_phrase=crisis.trigger_phrase or req.message[:200],
                       system_response=crisis.response, helpline_shown=True))
        session.is_crisis_flagged = True
        db.add(Message(session_id=session.id, role="user", content=req.message,
                       is_crisis_flagged=True, language=req.language, emotion="Crisis"))
        db.add(Message(session_id=session.id, role="assistant",
                       content=crisis.response, is_crisis_flagged=True, language=req.language))
        db.commit()
        return ChatResponse(response=crisis.response, is_crisis=True,
                            helplines=crisis.helplines, session_id=req.session_id,
                            emotion="Crisis", emotion_emoji="🚨",
                            emotion_score=1.0, rag_used=False)

    # ── Emotion + LLM concurrently ──────────────────────────────────────────
    rag_context = retrieve_context(req.message) if RAG_AVAILABLE else ""
    lang_prompt = get_language_prompt(req.language)

    past = db.query(Message).filter(
        Message.session_id == session.id
    ).order_by(Message.created_at).all()
    # Fetch last 20 messages for deep context
    history = [{"role": m.role, "content": m.content} for m in past[-20:]]
    history.append({"role": "user", "content": req.message})

    # Start tasks concurrently
    emotion_task = asyncio.create_task(detect_emotion(req.message))
    
    # Run local heuristic immediately (0ms latency) to inform the LLM prompt
    heuristic_emotion = detect_emotion_heuristic(req.message)

    llm_task = asyncio.to_thread(
        chat_with_maitri,
        messages=history,
        language=req.language,
        rag_context=rag_context,
        language_prompt=lang_prompt,
        user_emotion=heuristic_emotion.label,
    )

    ai_response = await llm_task
    try:
        emotion = await asyncio.wait_for(emotion_task, timeout=1.0)
    except Exception:
        emotion = heuristic_emotion

    # ── Save ──────────────────────────────────────────────────────────────────
    db.add(Message(session_id=session.id, role="user", content=req.message,
                   language=req.language, emotion=emotion.label, emotion_score=emotion.score))
    db.add(Message(session_id=session.id, role="assistant",
                   content=ai_response, language=req.language))
    db.commit()

    return ChatResponse(
        response=ai_response, is_crisis=False, helplines=[],
        session_id=req.session_id, emotion=emotion.label,
        emotion_emoji=emotion.emoji, emotion_score=emotion.score,
        rag_used=bool(rag_context),
    )


@router.get("/history")
def get_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    sessions = db.query(DBSession).filter(
        DBSession.user_id == current_user.id
    ).order_by(DBSession.started_at.desc()).all()
    return [{"session_id": s.session_token, "started_at": s.started_at,
             "ended_at": s.ended_at, "is_crisis_flagged": s.is_crisis_flagged,
             "channel": s.channel} for s in sessions]


@router.get("/{session_id}")
def get_transcript(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    session = db.query(DBSession).filter(
        DBSession.session_token == session_id,
        DBSession.user_id == current_user.id,
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    messages = db.query(Message).filter(
        Message.session_id == session.id
    ).order_by(Message.created_at).all()
    return {
        "session_id": session_id,
        "started_at": session.started_at,
        "is_crisis_flagged": session.is_crisis_flagged,
        "messages": [{
            "role": m.role, "content": m.content,
            "created_at": m.created_at, "language": m.language,
            "emotion": m.emotion, "emotion_score": m.emotion_score,
        } for m in messages],
    }
