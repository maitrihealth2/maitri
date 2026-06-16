import asyncio
import os
import sys
from ai_engine.voice_client import transcribe_audio

async def test_stt():
    print("--- Starting STT Test (Saarika v2.5) ---")
    try:
        # Create a dummy silent WAV for testing
        dummy_wav = b'RIFF$\x00\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00\x80>\x00\x00\x00}\x00\x00\x02\x00\x10\x00data\x00\x00\x00\x00'
        # Actually we need something that SARVAM will accept as non-empty.
        # I'll use the test_voice_output.wav if it exists from the previous test.
        input_file = "test_voice_output.wav"
        if not os.path.exists(input_file):
             print(f"Error: {input_file} not found. Please run test_tts.py first.")
             return
             
        with open(input_file, "rb") as f:
            audio_bytes = f.read()

        transcript = await transcribe_audio(audio_bytes, language="en-IN")
        print(f"Success! Transcript: '{transcript}'")
    except Exception as e:
        print(f"FAILED: {e}")

if __name__ == "__main__":
    sys.path.append(os.getcwd())
    asyncio.run(test_stt())
