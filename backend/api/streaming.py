import os
import json
import asyncio
import websockets
import base64
import traceback
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from sqlalchemy.orm import Session
from dotenv import load_dotenv

from db.models import get_db, Session as DBSession, User
from api.voice import handle_voice_turn

load_dotenv()

router = APIRouter(prefix="/api/streaming", tags=["streaming"])
SARVAM_API_KEY = os.getenv("SARVAM_API_KEY")

@router.websocket("/ws/stream/{session_id}")
async def streaming_stt(websocket: WebSocket, session_id: str):
    headers = dict(websocket.headers)
    origin = headers.get("origin", "No Origin")
    host = headers.get("host", "No Host")
    print(f"[WS] Attempting connection. Session: {session_id}, Origin: {origin}, Host: {host}")
    
    try:
        await websocket.accept()
        print(f"[WS] Handshake successful: {session_id}")
    except Exception as e:
        print(f"[WS] Handshake failed for {session_id}: {e}")
        return
    
    # Sarvam Streaming URL — Using Saarika v2.5 for reliable STT
    sarvam_url = "wss://api.sarvam.ai/speech-to-text/ws"
    headers = {"api-subscription-key": SARVAM_API_KEY}
    
    try:
        # Use additional_headers for better compatibility with newer websockets/asyncio
        async with websockets.connect(sarvam_url, additional_headers=headers) as sarvam_ws:
            # ── Session State ──
            config_sent = False
            last_transcript = "" 
            
            # Lookup user from session for handle_voice_turn
            generator = get_db()
            db = next(generator)
            try:
                db_session = db.query(DBSession).filter(DBSession.session_token == session_id).first()
                current_user = db.query(User).get(db_session.user_id) if db_session else None
            finally:
                # We close immediately after lookup to stay lean
                # handle_voice_turn will open its own db context if needed (it takes db as arg)
                pass 

            async def receive_from_sarvam():
                """Relay transcripts from Sarvam back to Browser."""
                nonlocal last_transcript
                try:
                    async for message in sarvam_ws:
                        data = json.loads(message)
                        if "transcript" in data:
                            text = data["transcript"]
                            is_final = data.get("is_final", False)
                            
                            if is_final:
                                last_transcript = text
                                
                            print(f"[Sarvam -> Browser] {text[:30]}... (final={is_final})")
                            await websocket.send_json({
                                "type": "transcript",
                                "text": text,
                                "is_final": is_final
                            })
                except Exception as e:
                    print(f"[WS] Error receiving from Sarvam: {e}")
                    raise RuntimeError(f"Sarvam connection dropped: {e}")

            async def send_to_sarvam():
                """Relay audio chunks from Browser to Sarvam."""
                nonlocal config_sent, last_transcript
                try:
                    while True:
                        data = await websocket.receive_text()
                        msg = json.loads(data)
                        
                        if msg["type"] == "config":
                            lang = msg.get("language", "en-IN")
                            config = {
                                "config": {
                                    "language_code": lang,
                                    "model": "saarika:v2.5",
                                    "with_timestamps": False
                                }
                            }
                            await sarvam_ws.send(json.dumps(config))
                            config_sent = True
                            print(f"[WS] Sent config to Sarvam: {lang}")
                        
                        elif msg["type"] == "audio":
                            if not config_sent: continue
                            await sarvam_ws.send(json.dumps({"audio": msg["data"]}))
                            
                        elif msg["type"] == "flush":
                            # Trigger Full Turn Logic
                            print(f"[WS] Flush received. Triggering turn logic for: '{last_transcript}'")
                            if not last_transcript or not current_user:
                                print("[WS] Skip turn: empty transcript or no user")
                                continue
                                
                            # Notify client that we are thinking
                            await websocket.send_json({"type": "status", "status": "thinking"})
                            
                            try:
                                # Call the shared turn-taking logic
                                lang = msg.get("language", "en-IN")
                                
                                # Use a fresh DB session for the turn
                                gen = get_db()
                                turn_db = next(gen)
                                try:
                                    response_data = await handle_voice_turn(
                                        transcript=last_transcript,
                                        session_id=session_id,
                                        language=lang,
                                        current_user=current_user,
                                        db=turn_db
                                    )
                                    
                                    # Send full response back over WebSocket
                                    await websocket.send_json({
                                        "type": "response",
                                        "data": response_data
                                    })
                                    last_transcript = "" # Reset for next turn
                                finally:
                                    # Explicitly close the generator
                                    try: next(gen) 
                                    except StopIteration: pass
                                
                            except Exception as e:
                                print(f"[WS] Error in handle_voice_turn: {e}")
                                traceback.print_exc()
                                await websocket.send_json({"type": "error", "message": str(e)})

                except WebSocketDisconnect:
                    print(f"[WS] Client disconnected: {session_id}")
                except Exception as e:
                    print(f"[WS] Error sending to Sarvam: {e}")
                    # Log the close code if available from the Sarvam connection object
                    try:
                        print(f"[WS] Sarvam Connection Closed: {sarvam_ws.close_code} {sarvam_ws.close_reason}")
                    except: pass

            # Run both tasks concurrently
            try:
                await asyncio.gather(receive_from_sarvam(), send_to_sarvam())
            except asyncio.CancelledError:
                print(f"[WS] Connection for {session_id} was cancelled (Normal disconnect)")

    except Exception as e:
        print(f"[WS] Critical connection error to Sarvam or Client: {type(e).__name__}: {e}")
        try:
            # We only close with 1011 if the connection is still alive but we hit a server error
            if not isinstance(e, asyncio.CancelledError):
                await websocket.close(code=1011) # Internal Error
        except:
            pass
