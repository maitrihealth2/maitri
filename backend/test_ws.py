import asyncio
import websockets
import json
import os
from dotenv import load_dotenv

load_dotenv()
SARVAM_API_KEY = os.getenv("SARVAM_API_KEY")

async def test_ws_pcm():
    url = "wss://api.sarvam.ai/speech-to-text/ws?language-code=en-IN&model=saaras:v3"
    headers = {"api-subscription-key": SARVAM_API_KEY}
    
    try:
        async with websockets.connect(url, extra_headers=headers) as ws:
            print("Connected!")
            payload = {
                "audio": {
                    "data": "dummy",
                    "sample_rate": 16000,
                    "encoding": "pcm_s16le"
                }
            }
            await ws.send(json.dumps(payload))
            print("Sent audio payload")
            response = await ws.recv()
            print("Response:", response)
            await ws.close()
    except Exception as e:
        print(f"Failed: {e}")

if __name__ == "__main__":
    asyncio.run(test_ws_pcm())
