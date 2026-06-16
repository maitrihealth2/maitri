"""
Sarvam Voice Client — Phase 3 Multi-language
STT: Saarika v2.5 — converts browser audio via ffmpeg → 16kHz WAV → Sarvam
TTS: Bulbul v1    — native voices per language
"""

import os
import httpx
import base64
import subprocess
import tempfile
from dotenv import load_dotenv

load_dotenv()

SARVAM_API_KEY = os.getenv("SARVAM_API_KEY")
BASE_URL = "https://api.sarvam.ai"

SUPPORTED_LANGUAGES = {
    "en-IN": {
        "name": "English", "native": "English",
        "stt_code": "en-IN",
        "tts_speaker_female": "ritu",
        "tts_speaker_male": "shubh",
    },
    "hi-IN": {
        "name": "Hindi", "native": "हिंदी",
        "stt_code": "hi-IN",
        "tts_speaker_female": "simran",
        "tts_speaker_male": "shubh",
    },
    "ta-IN": {
        "name": "Tamil", "native": "தமிழ்",
        "stt_code": "ta-IN",
        "tts_speaker_female": "kavitha",
        "tts_speaker_male": "mani",
    },
    "te-IN": {
        "name": "Telugu", "native": "తెలుగు",
        "stt_code": "te-IN",
        "tts_speaker_female": "suhani",
        "tts_speaker_male": "vijay",
    },
}

LANGUAGE_PROMPTS = {
    "en-IN": "Respond in warm, natural Indian English. Conversational, not formal. Do NOT use any other language.",
    "hi-IN": "Respond ONLY in natural Hindi (you can use common English terms like 'stress', 'family', 'problem'). Warm and conversational. Use a friendly tone like 'Yaar'.",
    "ta-IN": "Respond ONLY in natural conversational Tamil (Tanglish is acceptable for common terms). Be warm like a close friend. Do NOT use formal Tamil or straight English.",
    "te-IN": "Respond ONLY in natural conversational Telugu (Tenglish is acceptable for common terms). Warm and real. Do NOT use formal Telugu or straight English.",
}


def convert_to_wav(audio_bytes: bytes) -> bytes:
    """Convert browser audio to 16kHz mono WAV using ffmpeg."""
    import uuid
    # Use project-local tmp/ to avoid space issues in Windows User paths
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    tmp_dir = os.path.join(base_dir, "tmp")
    if not os.path.exists(tmp_dir):
        os.makedirs(tmp_dir, exist_ok=True)
    
    uid = uuid.uuid4().hex
    input_path = os.path.join(tmp_dir, f"mb_in_{uid}.webm")
    output_path = os.path.join(tmp_dir, f"mb_out_{uid}.wav")
    
    try:
        with open(input_path, "wb") as f:
            f.write(audio_bytes)
            f.flush()
            os.fsync(f.fileno())
        
        print(f"[ffmpeg] input={input_path} size={os.path.getsize(input_path)}")
        
        # Explicit shell=False (default) with list is usually best, 
        # but ffmpeg on Windows can be picky about absolute paths.
        result = subprocess.run(
            ["ffmpeg", "-y", "-i", input_path, "-ar", "16000", "-ac", "1", "-f", "wav", output_path],
            capture_output=True, text=True,
        )
        
        if result.returncode != 0:
            print(f"[ffmpeg stderr]: {result.stderr}")
            raise RuntimeError(f"ffmpeg conversion failed: {result.stderr[-200:]}")
            
        with open(output_path, "rb") as f:
            wav_bytes = f.read()
            
        print(f"[STT] ffmpeg converted {len(audio_bytes)} -> {len(wav_bytes)} bytes WAV")
        return wav_bytes
        
    finally:
        # Cleanup
        for p in [input_path, output_path]:
            try:
                if os.path.exists(p): os.unlink(p)
            except Exception as e:
                print(f"[STT] Cleanup error for {p}: {e}")

async def transcribe_audio(audio_bytes: bytes, language: str = "en-IN") -> str:
    """
    Convert browser audio to text via Sarvam Saarika v2.5.
    Converts to proper WAV first using ffmpeg.
    """
    lang_config = SUPPORTED_LANGUAGES.get(language, SUPPORTED_LANGUAGES["en-IN"])
    stt_code = lang_config["stt_code"]

    # Convert to clean WAV
    wav_bytes = convert_to_wav(audio_bytes)

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            f"{BASE_URL}/speech-to-text",
            headers={"api-subscription-key": SARVAM_API_KEY},
            files={"file": ("recording.wav", wav_bytes, "audio/wav")},
            data={
                "language_code": stt_code,
                "model": "saarika:v2.5",
                "with_timestamps": "false",
            },
        )

    print(f"[STT] Response {response.status_code}: {response.text[:200]}")

    if response.status_code != 200:
        raise Exception(f"STT failed: {response.status_code} — {response.text}")

    transcript = response.json().get("transcript", "").strip()
    print(f"[STT] Transcript: '{transcript}'")
    return transcript


async def synthesize_speech(
    text: str,
    language: str = "en-IN",
    gender: str = "female",
    emotion: str = "Neutral",
) -> bytes:
    """
    Convert text to speech using Sarvam Bulbul with dynamic emotional parameters.
    """
    text = text[:500]
    lang_config = SUPPORTED_LANGUAGES.get(language, SUPPORTED_LANGUAGES["en-IN"])
    speaker = lang_config["tts_speaker_female"] if gender == "female" else lang_config["tts_speaker_male"]

    # Emotional Mapping (Sarvam Bulbul-v2 specific)
    # Pitch +/- 0.75, Pace 0.3-3, Loudness 0.3-3
    EMOTION_PARAMS = {
        "Sadness": {"pitch": -0.22, "pace": 0.82, "loudness": 0.9},
        "Anxiety": {"pitch": 0.15,  "pace": 1.25, "loudness": 1.1},
        "Anger":   {"pitch": -0.10, "pace": 1.15, "loudness": 1.6},
        "Positive": {"pitch": 0.35, "pace": 1.08, "loudness": 1.4},
        "Neutral": {"pitch": 0.05,  "pace": 1.0,  "loudness": 1.4},
    }
    params = EMOTION_PARAMS.get(emotion, EMOTION_PARAMS["Neutral"])
    # Bulbul v3 supports 'pace' (0.5-2.0) but NOT 'pitch' or 'loudness'
    # These parameters are legacy from v2.
    final_pace = max(0.5, min(2.0, params["pace"]))

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            f"{BASE_URL}/text-to-speech",
            headers={
                "api-subscription-key": SARVAM_API_KEY,
                "Content-Type": "application/json",
            },
            json={
                "inputs": [text],
                "target_language_code": language,
                "speaker": speaker,
                "pace": final_pace,
                "speech_sample_rate": 22050,
                "enable_preprocessing": True,
                "model": "bulbul:v3",
            },
        )

    if response.status_code != 200:
        raise Exception(f"TTS failed: {response.status_code} — {response.text}")

    resp_json = response.json()
    # Bulbul v3 REST API uses 'audios' list, WebSocket uses 'audio' string
    audios = resp_json.get("audios", [])
    audio_b64 = audios[0] if audios else resp_json.get("audio")
    
    if not audio_b64:
        raise Exception(f"TTS returned no audio data. Response: {response.text}")

    audio_bytes = base64.b64decode(audio_b64)
    print(f"[TTS] Generated {len(audio_bytes)} bytes for language={language} using Bulbul v3")
    return audio_bytes


def get_language_prompt(language: str) -> str:
    return LANGUAGE_PROMPTS.get(language, LANGUAGE_PROMPTS["en-IN"])


def get_supported_languages() -> dict:
    return {
        code: {"name": v["name"], "native": v["native"]}
        for code, v in SUPPORTED_LANGUAGES.items()
    }
