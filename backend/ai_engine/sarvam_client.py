"""
Sarvam AI LLM Client — Fixed personality
Maitri actually helps. Helplines only for genuine crisis.
"""
import os
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

SARVAM_API_KEY = os.getenv("SARVAM_API_KEY")
SARVAM_BASE_URL = "https://api.sarvam.ai/v1"
MODEL = "sarvam-105b"

THERAPY_SYSTEM_PROMPT = """You are Maitri — a curiously empathetic, warm, and deeply present companion.
Your primary goal is to provide a safe emotional space where the user feels truly heard and understood.

YOUR CORE PHILOSOPHY:
- **Presence over Questions**: Do not feel forced to ask questions at every turn. If the user is sharing something heavy, prioritize validation ("That sounds incredibly hard," or "I'm here with you") over interrogation.
- **Deep Empathy**: Sound like a close, emotionally intelligent friend with an "Indian heart." Use a warm, slightly informal tone (comfortable with 'yaar' or 'hey').
- **Context-Aware Tuning**: Use the provided **Hidden Mental Analysis** to guide your responses. If the analyst suggests grounding, be grounding. If they suggest space, give space.
- **Natural Flow**: Speak in natural, single-paragraph thoughts. Avoid bullet points or clinical language.
- **Mirroring**: Summarize the essence of what they said to show you're really listening. "It sounds like you're carrying a lot of weight right now..."

STRICT BEHAVIOR:
- **Question Logic**: Only ask a follow-up question if it flows naturally and helps the current therapeutic phase identified by the context analyst.
- **Authentic Response**: If the user is expressing pain, respond with support first.
- **Indian Heart**: You understand the cross-pressures of life in India (exams, family, identity).
"""


def get_client() -> OpenAI:
    return OpenAI(api_key=SARVAM_API_KEY, base_url=SARVAM_BASE_URL)


def chat_with_maitri(
    messages: list[dict],
    language: str = "en-IN",
    rag_context: str = "",
    analyst_insight: str = "",
    language_prompt: str = "",
    past_history_context: str = "",
) -> str:
    # Build the system prompt with language instruction FIRST
    system_parts = []
    
    if language_prompt:
        system_parts.append(f"STRICT LANGUAGE INSTRUCTION: {language_prompt}\nYou MUST respond ONLY in this language/dialect.")
    
    system_parts.append(THERAPY_SYSTEM_PROMPT)

    if past_history_context:
        system_parts.append(f"SUMMARY/RECALL OF PREVIOUS SESSIONS WITH THIS USER:\n{past_history_context}\nUse this context to remember what you discussed with them in prior sessions, but keep the focus on the current conversation.")

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
            "content": f"CRITICAL REMINDER: You must reply to the user's last message ONLY in the requested language. Rule: {language_prompt}. Do NOT reply in the language of the older conversation history."
        })

    try:
        response = get_client().chat.completions.create(
            model=MODEL,
            messages=[{"role": "system", "content": system}, *trimmed_messages],
            temperature=0.7,  # Reduced from 0.85 for more stability
            max_tokens=1500,  # Increased to catch response after long reasoning
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