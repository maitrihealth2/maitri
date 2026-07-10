"""
Neural Analyst — The 'Psychologically Neutral' Mental Model.
Performs clinical-style context analysis (hidden from the user) to inform Maitri's companion responses.
"""
import os
from openai import AsyncOpenAI
from dotenv import load_dotenv
import pathlib

_BASE = pathlib.Path(__file__).resolve().parent.parent
load_dotenv(_BASE / ".env")
load_dotenv(_BASE / ".env.local", override=True)

SARVAM_API_KEY = os.getenv("SARVAM_API_KEY")
SARVAM_BASE_URL = "https://api.sarvam.ai/v1"
MODEL = "sarvam-105b"

ANALYST_SYSTEM_PROMPT = """You are a Psychologically Neutral Context Analyst.
Your task is to perform a deep, objective analysis of the user's current mental and emotional state to inform a therapeutic companion's response.

YOUR OBJECTIVE:
- **Analyze History**: Look at the conversation history for patterns (recurring stressors, emotional shifts).
- **Incorporate Knowledge**: Ground the current situation in the provided RAG context (therapy principles).
- **Identify Core Need**: Does the user need validation, active listening, reality testing, or grounding?
- **Synthesize Emotion**: Use the detected emotion label as a data point in your analysis.

STRICT FORMAT:
Produce a concise internal report (max 3-4 sentences). Do NOT speak to the user. Speak ONLY to the Companion (Maitri).

Example Analysis Format:
"User is showing signs of exam-related burnout (exhaustion, low self-efficacy). RAG context on 'Test Anxiety' applies here. They primarily need validation of their effort, not more questions. Move from probing to supportive grounding."
"""

async def analyze_context(
    messages: list[dict],
    emotion_label: str,
    rag_context: str = "",
) -> str:
    """
    Produce a clinical insight summary for the Responder to use.
    """
    client = AsyncOpenAI(api_key=SARVAM_API_KEY, base_url=SARVAM_BASE_URL)
    
    # Context-heavy system build
    meta_info = f"Current Emotion: {emotion_label}\n"
    if rag_context:
        meta_info += f"Local Therapeutic Knowledge (RAG):\n{rag_context}\n"
    
    analysis_input = [
        {"role": "system", "content": ANALYST_SYSTEM_PROMPT},
        {"role": "system", "content": f"DATA INPUTS:\n{meta_info}"},
    ]
    
    # Last few messages for immediate context
    analysis_input.extend(messages[-10:])

    try:
        response = await client.chat.completions.create(
            model=MODEL,
            messages=analysis_input,
            temperature=0.3, # Low temperature for objectivity
            max_tokens=250,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        print(f"Analyst Error: {e}")
        return "User needs warm support and active listening."
