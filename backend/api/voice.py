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

from db.models import get_db, Session as DBSession, Message, RiskLog, User
from ai_engine.voice_client import transcribe_audio, synthesize_speech, get_language_prompt, get_supported_languages
from ai_engine.sarvam_client import chat_with_maitri
from ai_engine.emotion_detector import detect_emotion, detect_emotion_heuristic
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
    if len(audio_bytes) < 500:
        return {"transcript": "", "language": language}
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
        print("[VOICE] Empty transcript — treating as silence to prompt user")
        transcript = "[Silence]"

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

    # ── Emotion + LLM ────────────────────────────────────────────────────────
    print(f"[VOICE] Computing emotion heuristically and calling LLM...")
    
    # Bypass RAG completely for voice to save 1-2 seconds of latency
    rag_context = ""

    # Append voice brevity instructions to lang_prompt
    lang_prompt = get_language_prompt(language)
    lang_prompt += " Keep your response conversational and natural, as this is a real-time voice call. Provide clear reasoning if needed."

    past = db.query(Message).filter(
        Message.session_id == session.id
    ).order_by(Message.created_at).all()
    history = [{"role": m.role, "content": m.content} for m in past[-20:]]
    history.append({"role": "user", "content": transcript})
    
    # Bypass Context Analysis for voice turns to save latency
    analyst_insight = ""

    # Start deep-learning emotion detection concurrently in the background
    emotion_task = asyncio.create_task(detect_emotion(transcript))

    # Call heuristic emotion locally (0ms latency) to immediately inform LLM
    heuristic_emotion = detect_emotion_heuristic(transcript)

    # Call LLM thread with custom max_tokens for speed, passing heuristic emotion
    llm_task = asyncio.to_thread(
        chat_with_maitri,
        messages=history,
        language=language,
        rag_context=rag_context,
        analyst_insight=analyst_insight,
        language_prompt=lang_prompt,
        max_tokens=500,
        reasoning_effort=None,
        user_emotion=heuristic_emotion.label,
    )

    try:
        ai_response = await llm_task
        
        # Await the deep-learning emotion result (enforcing a strict 1.0s timeout to prevent lag)
        try:
            emotion = await asyncio.wait_for(emotion_task, timeout=1.0)
            print(f"[VOICE] DL Emotion: {emotion.label} ({emotion.score:.2f})")
        except Exception as te:
            print(f"[VOICE] DL Emotion timeout/error ({type(te).__name__}), falling back to heuristic: {heuristic_emotion.label}")
            emotion = heuristic_emotion

        print(f"[VOICE] LLM response: '{ai_response[:80]}...'")
    except Exception as e:
        import traceback as tb
        error_trace = tb.format_exc()
        print(f"[VOICE] LLM call failed:\n{error_trace}")
        raise HTTPException(status_code=500, detail={"message": f"LLM pipeline failed: {str(e)}", "traceback": error_trace})

    # ── Save to DB ────────────────────────────────────────────────────────────
    try:
        db.add(Message(session_id=session.id, role="user", content=transcript,
                       language=language, emotion=emotion.label, emotion_score=emotion.score))
        db.add(Message(session_id=session.id, role="assistant",
                       content=ai_response, language=language))
        db.commit()
    except Exception as e:
        import traceback as tb
        tb.print_exc()
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
        import traceback as tb
        tb.print_exc()
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
    if len(audio_bytes) < 500:
        print("[VOICE] Audio too short or empty, treating as silence")
        return await handle_voice_turn("[Silence]", session_id, language, current_user, db)

    # ── STT ───────────────────────────────────────────────────────────────────
    try:
        transcript = await transcribe_audio(audio_bytes, language)
    except Exception as e:
        import traceback as tb
        error_trace = tb.format_exc()
        raise HTTPException(status_code=500, detail={"message": f"STT failed: {str(e)}", "traceback": error_trace})

    return await handle_voice_turn(transcript, session_id, language, current_user, db)
