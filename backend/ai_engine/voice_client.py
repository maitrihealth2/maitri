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
    "en-IN": "Respond in warm, natural Indian English. Conversational, not formal. Do NOT use any other language. NEVER use bullet points, special characters, or lists. Speak in short, naturally flowing continuous sentences.",
    "hi-IN": "Respond ONLY in natural Hindi (you can use common English terms). Warm and conversational. Use a friendly tone. NEVER use bullet points, special characters, or lists. Speak in short, naturally flowing continuous sentences.",
    "ta-IN": "Respond ONLY in natural conversational Tamil (Tanglish is acceptable). Be warm like a close friend. Do NOT use formal Tamil. NEVER use bullet points, special characters, or lists. Speak in short, naturally flowing continuous sentences.",
    "te-IN": "Respond ONLY in natural conversational Telugu (Tenglish is acceptable). Warm and real. Do NOT use formal Telugu. NEVER use bullet points, special characters, or lists. Speak in short, naturally flowing continuous sentences.",
}


def convert_to_wav(audio_bytes: bytes) -> bytes:
    """Convert browser audio to 16kHz mono WAV using ffmpeg."""
    import uuid
    import imageio_ffmpeg
    
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
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
            [ffmpeg_exe, "-y", "-i", input_path, "-ar", "16000", "-ac", "1", "-f", "wav", output_path],
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
    lang_config = SUPPORTED_LANGUAGES.get(language, SUPPORTED_LANGUAGES["en-IN"])
    speaker = lang_config["tts_speaker_female"] if gender == "female" else lang_config["tts_speaker_male"]

    # Emotional Mapping for Sarvam Bulbul-v3
    # Pace: 0.5–2.0, Temperature: 0.01–1.0, Pitch: 0.5-2.0
    EMOTION_PARAMS = {
        "Sadness":  {"pace": 1.05, "pitch": 0.95, "temperature": 0.75},
        "Anxiety":  {"pace": 1.15, "pitch": 1.00, "temperature": 0.65},
        "Anger":    {"pace": 1.25, "pitch": 1.05, "temperature": 0.80},
        "Positive": {"pace": 1.20, "pitch": 1.05, "temperature": 0.85},
        "Neutral":  {"pace": 1.18, "pitch": 1.00, "temperature": 0.80},
        "Crisis":   {"pace": 1.10, "pitch": 0.95, "temperature": 0.70},
    }
    params = EMOTION_PARAMS.get(emotion, EMOTION_PARAMS["Neutral"])
    final_pace = max(0.5, min(2.0, params["pace"]))
    final_pitch = max(0.5, min(2.0, params["pitch"]))
    final_temp = max(0.01, min(1.0, params["temperature"]))

    # Clean text to prevent robotic pauses (e.g. from markdown or excessive punctuation)
    import re
    text = re.sub(r'[\n\r]+', ' ', text)  # Remove newlines
    text = re.sub(r'\.{2,}', '.', text)   # Replace ... with a single period
    text = re.sub(r'[*_#~`]', '', text)   # Remove markdown artifacts
    text = text.replace('  ', ' ').strip()

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
                "temperature": final_temp,
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
