"""
Voice API — Phase 3 Multi-language
Full pipeline: audio → STT → crisis → emotion → RAG → LLM → TTS → audio
"""

import base64
import traceback
import asyncio
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import Response
from sqlalchemy.orm import Session
from pydantic import BaseModel

from db.models import get_db, Session as DBSession, Message, RiskLog, User, get_past_history_context
from ai_engine.voice_client import transcribe_audio, synthesize_speech, get_language_prompt, get_supported_languages
from ai_engine.sarvam_client import chat_with_maitri
from ai_engine.emotion_detector import detect_emotion
from ai_engine.analyst import analyze_context
from services.crisis_handler import check_for_crisis
from api.auth import get_current_user

try:
    from rag.retriever import retrieve_context, is_knowledge_base_ready
    RAG_AVAILABLE = is_knowledge_base_ready()
except Exception:
    RAG_AVAILABLE = False
    def retrieve_context(q, n=3): return ""

router = APIRouter(prefix="/api/voice", tags=["voice"])


@router.get("/languages")
def list_languages():
    return get_supported_languages()


class SpeakRequest(BaseModel):
    text: str
    language: str = "en-IN"


@router.post("/speak")
async def speak(
    req: SpeakRequest,
    current_user: User = Depends(get_current_user),
):
    try:
        audio_bytes = await synthesize_speech(req.text, req.language)
        return Response(content=audio_bytes, media_type="audio/wav")
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/transcribe")
async def transcribe(
    audio: UploadFile = File(...),
    language: str = Form(default="en-IN"),
    current_user: User = Depends(get_current_user),
):
    audio_bytes = await audio.read()
    print(f"[TRANSCRIBE] size={len(audio_bytes)} lang={language}")
    if len(audio_bytes) < 100:
        raise HTTPException(status_code=400, detail="Audio too short")
    try:
        transcript = await transcribe_audio(audio_bytes, language)
        return {"transcript": transcript, "language": language}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


async def handle_voice_turn(
    transcript: str,
    session_id: str,
    language: str,
    current_user: User,
    db: Session,
):
    """
    Process a single voice turn: Crisis check -> Emotion -> RAG -> LLM -> TTS.
    Returns the full response dictionary.
    """
    # ── Validate session ──────────────────────────────────────────────────────
    session = db.query(DBSession).filter(
        DBSession.session_token == session_id,
        DBSession.user_id == current_user.id,
    ).first()
    if not session:
        print(f"[VOICE] ERROR: Session not found")
        raise HTTPException(status_code=404, detail="Session not found")
    print(f"[VOICE] Session DB id={session.id} OK")

    if not transcript or not transcript.strip():
        print("[VOICE] Empty transcript — returning empty")
        return {
            "transcript": "", "response": "", "audio_b64": "",
            "is_crisis": False, "helplines": [],
            "emotion": "Neutral", "emotion_emoji": "😐",
            "emotion_score": 0.0, "rag_used": False,
        }

    # ── Crisis check ──────────────────────────────────────────────────────────
    print(f"[VOICE] Crisis check...")
    crisis = check_for_crisis(transcript)
    if crisis.is_crisis:
        print(f"[VOICE] CRISIS detected: {crisis.trigger_phrase}")
        db.add(RiskLog(
            session_id=session.id, user_id=current_user.id,
            trigger_phrase=crisis.trigger_phrase or transcript[:200],
            system_response=crisis.response, helpline_shown=True,
        ))
        session.is_crisis_flagged = True
        db.add(Message(session_id=session.id, role="user", content=transcript,
                       is_crisis_flagged=True, language=language, emotion="Crisis"))
        db.add(Message(session_id=session.id, role="assistant",
                       content=crisis.response, is_crisis_flagged=True, language=language))
        db.commit()
        try:
            crisis_audio = await synthesize_speech(crisis.response, language)
            audio_b64 = base64.b64encode(crisis_audio).decode()
        except Exception as e:
            print(f"[VOICE] Crisis TTS failed: {e}")
            audio_b64 = ""
        return {
            "transcript": transcript, "response": crisis.response,
            "audio_b64": audio_b64, "is_crisis": True,
            "helplines": crisis.helplines, "emotion": "Crisis",
            "emotion_emoji": "🚨", "emotion_score": 1.0, "rag_used": False,
        }

    # ── Emotion + LLM concurrently ──────────────────────────────────────────
    print(f"[VOICE] Calling LLM and Emotion Detector concurrently...")
    
    rag_context = ""
    if RAG_AVAILABLE:
        try:
            rag_context = retrieve_context(transcript)
        except Exception as e:
            print(f"[VOICE] RAG failed (continuing): {e}")

    lang_prompt = get_language_prompt(language)

    past = db.query(Message).filter(
        Message.session_id == session.id
    ).order_by(Message.created_at).all()
    history = [{"role": m.role, "content": m.content} for m in past[-20:]]
    history.append({"role": "user", "content": transcript})
    
    # Bypass Context Analysis for voice turns to save latency
    analyst_insight = ""

    # Fetch previous session context for cross-session recall
    past_history = get_past_history_context(db, current_user.id, session.id)

    # Start tasks concurrently
    emotion_task = asyncio.create_task(detect_emotion(transcript))
    llm_task = asyncio.to_thread(
        chat_with_maitri,
        messages=history,
        language=language,
        rag_context=rag_context,
        analyst_insight=analyst_insight,
        language_prompt=lang_prompt,
        past_history_context=past_history,
    )

    try:
        emotion, ai_response = await asyncio.gather(emotion_task, llm_task)
        print(f"[VOICE] Emotion: {emotion.label} ({emotion.score})")
        print(f"[VOICE] LLM response: '{ai_response[:80]}...'")
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"[VOICE] Parallel processing failed:\n{error_trace}")
        raise HTTPException(status_code=500, detail={"message": f"Parallel pipeline failed: {str(e)}", "traceback": error_trace})

    # ── Save to DB ────────────────────────────────────────────────────────────
    try:
        db.add(Message(session_id=session.id, role="user", content=transcript,
                       language=language, emotion=emotion.label, emotion_score=emotion.score))
        db.add(Message(session_id=session.id, role="assistant",
                       content=ai_response, language=language))
        db.commit()
    except Exception as e:
        traceback.print_exc()
        print(f"[VOICE] DB save failed (continuing): {e}")

    # ── TTS ───────────────────────────────────────────────────────────────────
    print(f"[VOICE] Calling TTS...")
    audio_b64 = ""
    try:
        # Reuse user's emotion to determine voice tone instead of calling HF API again
        response_audio = await synthesize_speech(
            ai_response, 
            language, 
            emotion=emotion.label
        )
        audio_b64 = base64.b64encode(response_audio).decode()
        print(f"[VOICE] TTS OK, audio size={len(response_audio)} bytes")
    except Exception as e:
        traceback.print_exc()
        print(f"[VOICE] TTS failed: {e}")

    return {
        "transcript": transcript,
        "response": ai_response,
        "audio_b64": audio_b64,
        "is_crisis": False,
        "helplines": [],
        "emotion": emotion.label,
        "emotion_emoji": emotion.emoji,
        "emotion_score": emotion.score,
        "rag_used": bool(rag_context),
    }


@router.post("/conversation")
async def voice_conversation(
    audio: UploadFile = File(...),
    session_id: str = Form(...),
    language: str = Form(default="en-IN"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    print(f"\n{'='*60}")
    print(f"[VOICE] POST Request session={session_id} lang={language}")

    # ── Read audio ────────────────────────────────────────────────────────────
    audio_bytes = await audio.read()
    if len(audio_bytes) < 100:
        raise HTTPException(status_code=400, detail="Audio too short or empty")

    # ── STT ───────────────────────────────────────────────────────────────────
    try:
        transcript = await transcribe_audio(audio_bytes, language)
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        raise HTTPException(status_code=500, detail={"message": f"STT failed: {str(e)}", "traceback": error_trace})

    return await handle_voice_turn(transcript, session_id, language, current_user, db)
