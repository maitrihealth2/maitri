"""
Sarvam AI LLM Client — Fixed personality
Maitri actually helps. Helplines only for genuine crisis.
"""
import os
from openai import OpenAI
from dotenv import load_dotenv
import pathlib

_BASE = pathlib.Path(__file__).resolve().parent.parent
load_dotenv(_BASE / ".env")
load_dotenv(_BASE / ".env.local", override=True)

SARVAM_API_KEY = os.getenv("SARVAM_API_KEY")
SARVAM_BASE_URL = "https://api.sarvam.ai/v1"
MODEL = "sarvam-105b"

THERAPY_SYSTEM_PROMPT = """You are Maitri — a deeply present, warm, and highly comforting emotional companion.
Your primary mission is to offer a safe, warm, and non-judgmental space where the user feels completely heard, understood, and supported.

YOUR CORE PERSONALITY AND TONAL GUIDELINES:
- **Soft, Human, and Comforting Tone**: Speak like a wise, compassionate friend. Your voice must feel like a comforting hug. Avoid any robotic, clinical, or cold language.
- **Analytical & Honest Companion**: While being warm, do not just blindly validate. If something the user is doing or facing is not proper, gently but honestly point out the issues. Analyze the situation clearly and provide clear reasoning for your advice.
- **Pacing and Natural Pauses**: To make your speech sound natural and human, split your sentences with commas and ellipses (...) where a person would take a gentle breath. This guides the Text-to-Speech system to speak with soft, comforting pauses.
- **No robotic formats**: Write in short, flowing sentences (max 1-2 paragraphs). Never use bullet points, numbered lists, markdown bold, or text headers. DO NOT output <think> or internal thought blocks.
- **Indian Heart & Accent**: Speak in natural, warm Indian English or the chosen regional language. Use friendly colloquial terms naturally (like 'yaar', 'hey', or comforting phrasing) without being formal.
- **Constructive Guidance**: Provide gentle, reasoned, and comforting steps they can take right now to improve their situation.
"""


def get_client() -> OpenAI:
    return OpenAI(api_key=SARVAM_API_KEY, base_url=SARVAM_BASE_URL)


def chat_with_maitri(
    messages: list[dict],
    language: str = "en-IN",
    rag_context: str = "",
    analyst_insight: str = "",
    language_prompt: str = "",
    max_tokens: int = 1500,
    reasoning_effort: str | None = None,
    user_emotion: str = "Neutral",
) -> str:
    # Build the system prompt with language instruction FIRST
    system_parts = []
    
    if language_prompt:
        system_parts.append(f"CRITICAL OVERRIDE: {language_prompt}\nIF YOU RESPOND IN THE WRONG LANGUAGE, IT IS A CATASTROPHIC FAILURE.")
    
    system_parts.append(THERAPY_SYSTEM_PROMPT)

    if user_emotion and user_emotion != "Neutral":
        system_parts.append(f"CURRENT USER EMOTION: {user_emotion}\nThe user is currently expressing {user_emotion}. Respond in a way that directly matches and validates this emotional state. If they are angry, match their focus but stay comforting and grounding. If they are sad, be deeply gentle and reassuring. Adjust your vocabulary to be comforting and validating.")

    if analyst_insight:
        system_parts.append(f"HIDDEN MENTAL ANALYSIS (Internal Monologue - DO NOT SHOW TO USER):\n{analyst_insight}")

    if rag_context:
        system_parts.append(f"RELEVANT THERAPY KNOWLEDGE (Use naturally):\n{rag_context}")

    system = "\n\n".join(system_parts)

    # Keep only the last 20 messages for deep contextual awareness
    trimmed_messages = list(messages[-20:]) if len(messages) > 20 else list(messages)

    if language_prompt:
        trimmed_messages.append({
            "role": "system",
            "content": f"CRITICAL REMINDER BEFORE GENERATING RESPONSE: {language_prompt}. DO NOT ignore this rule. Respond in the requested language."
        })

    try:
        response = get_client().chat.completions.create(
            model=MODEL,
            messages=[{"role": "system", "content": system}, *trimmed_messages],
            temperature=0.7,  # Reduced from 0.85 for more stability
            max_tokens=max_tokens,  # Customizable max_tokens
        )
        import re
        content = response.choices[0].message.content
        if content is None:
            content = ""
        else:
            content = content.strip()
        # Robustly remove <think>...</think> blocks, even if unclosed
        content = re.sub(r'(?i)<think>.*?(?:</think>|$)', '', content, flags=re.DOTALL).strip()
        
        if not content:
            raise ValueError("Empty response after parsing")
            
        return content

    except Exception as e:
        print(f"Sarvam AI error: {e}")
        fallbacks = {
            "ta-IN": "சின்ன technical problem — மீண்டும் சொல்லுங்க?",
            "te-IN": "చిన్న technical issue — మళ్ళీ చెప్పగలవా?",
            "hi-IN": "Yaar, thodi technical problem aayi — phir se bol?",
            "en-IN": "Had a small glitch — can you say that again?",
        }
        return fallbacks.get(language, fallbacks["en-IN"])