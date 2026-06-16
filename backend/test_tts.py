import asyncio
import os
import sys
from ai_engine.voice_client import synthesize_speech

async def test():
    print("--- Starting TTS Test (Bulbul v3) ---")
    try:
        text = "Hello, this is a test of the Bulbul v3 voice system."
        # Testing English first
        audio = await synthesize_speech(text, language="en-IN", gender="female")
        print(f"Success! Received {len(audio)} bytes of audio.")
        with open("test_voice_output.wav", "wb") as f:
            f.write(audio)
        print("Audio saved to test_voice_output.wav")
    except Exception as e:
        print(f"FAILED: {e}")

if __name__ == "__main__":
    # Add parent dir to sys.path to import ai_engine
    sys.path.append(os.getcwd())
    asyncio.run(test())
