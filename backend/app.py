from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import traceback
from fastapi.responses import JSONResponse
from fastapi import Request

from db.models import init_db
from api.auth import router as auth_router
from api.consultation import router as consultation_router
from api.voice import router as voice_router
from api.streaming import router as streaming_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 Starting MindBridge backend (Phase 3 — Voice)...")
    init_db()
    print("✅ Database ready")
    yield
    print("👋 Shutting down")


app = FastAPI(
    title="MindBridge API",
    description="AI Mental Health Support — Voice + Text — Powered by Sarvam AI",
    version="3.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(consultation_router)
app.include_router(voice_router)
app.include_router(streaming_router)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    print(f"❌ INTERNAL SERVER ERROR: {str(exc)}")
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Internal Server Error",
            "message": str(exc),
            "path": request.url.path,
        },
    )


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "MindBridge",
        "version": "3.0.0",
        "features": ["text-chat", "voice-stt", "voice-tts", "rag", "emotion-detection"],
        "ai": "sarvam-m + saarika + bulbul",
    }


@app.get("/")
def root():
    return {"message": "MindBridge API v3 running", "docs": "/docs"}