# 🌿 Mythri

<p align="center">
  <i>An AI-powered, empathetic mental health companion.</i>
</p>

---

## 🌟 What is Mythri?
Mythri is an advanced, multilingual AI mental health companion designed to provide accessible, empathetic, and culturally aware psychological support. Powered by Sarvam AI, Mythri engages with users through natural voice and text conversations, making mental wellness support conversational and inclusive.

## 🎯 What Problem It Solves
Accessing mental health care is often hindered by stigma, high costs, and a lack of culturally relevant resources. Mythri bridges this gap by offering:

- **Instant Accessibility:** 24/7 on-demand mental health support without waiting for appointments.
- **Linguistic Inclusivity:** Overcoming language barriers by supporting regional languages and accents natively, fostering a deeper sense of connection.
- **Safety First:** Real-time crisis detection algorithms to identify when a user is in danger and seamlessly provide helpline resources.
- **Stigma-Free Environment:** A private, non-judgmental space where users can safely voice their thoughts and process emotions.

## 🚀 What's Built So Far
Mythri currently features a robust, modern architecture with a full end-to-end pipeline:

- **Real-Time Voice Pipeline:** Deep integration with Sarvam AI for high-accuracy Speech-to-Text (STT) and emotionally expressive Text-to-Speech (TTS).
- **Contextual AI Engine:** An advanced LLM system with an underlying Neural Analyst, designed to evaluate conversation history, detect emotional shifts, and provide therapeutic responses.
- **Emotion & Crisis Detection:** Real-time analysis to gauge the user's emotional state and instantly flag high-risk phrases.
- **RAG Knowledge Base:** Context-aware generation drawing from established psychological frameworks.
- **Interactive Modern UI:** A calming, responsive frontend built with Next.js 16, React 19, Tailwind CSS v4, HeroUI, and Framer Motion.
- **Robust Backend:** A high-performance FastAPI Python backend managing JWT authentication, streaming pipelines, and SQLite session history.

---

## 📂 File & Folder Tree

```text
mindbridge/
│
├── backend/
│   ├── app.py                        ← FastAPI entry point (run this)
│   ├── requirements.txt              ← Python packages
│   ├── .env                          ← Your API keys (create this)
│   │
│   ├── api/
│   │   ├── auth.py                   ← Register / Login / JWT routes
│   │   ├── consultation.py           ← Chat / Session / History routes
│   │   └── voice.py                  ← Voice pipeline routes
│   │
│   ├── ai_engine/
│   │   ├── sarvam_client.py          ← Sarvam AI (LLM) integration
│   │   └── analyst.py                ← Neural Analyst context engine
│   │
│   ├── db/
│   │   └── models.py                 ← SQLAlchemy DB models + init
│   │
│   └── services/
│       ├── auth.py                   ← Password hashing + JWT utils
│       └── crisis_handler.py         ← Safety / crisis detection
│
└── frontend/
    ├── package.json                  ← Next.js dependencies
    ├── .env.local                    ← NEXT_PUBLIC_API_URL
    │
    ├── lib/
    │   └── api.ts                    ← All API calls to backend
    │
    └── app/
        ├── layout.tsx                ← Root layout + Google Fonts
        ├── globals.css               ← Global styles + CSS variables
        ├── consultation/
        │   └── page.tsx              ← Chat/Voice with Mythri
        └── history/
            └── page.tsx              ← Session history + transcripts
```

---

## 💻 Setup (Windows PowerShell)

### Step 1 — Backend
```powershell
cd mindbridge\backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
```

### Step 2 — Create `backend\.env`
```properties
SARVAM_API_KEY=your_key_from_dashboard.sarvam.ai
DATABASE_URL=sqlite:///./mindbridge.db
SECRET_KEY=anyrandomstring123
```

### Step 3 — Frontend
```powershell
cd mindbridge\frontend
npm install
```

---

## ▶️ Run the Application

**Terminal 1 — Backend:**
```powershell
cd mindbridge\backend
.\venv\Scripts\activate
uvicorn app:app --reload --port 8000
```

**Terminal 2 — Frontend:**
```powershell
cd mindbridge\frontend
npm run dev
```

Open your browser and navigate to: **http://localhost:3000**

---

## ⚠️ Important Notes

- `backend\.env` must exist with your Sarvam API key before starting.
- If you need to reset the DB: `del mindbridge\backend\mindbridge.db` then restart the uvicorn server.
- The `__init__.py` files inside the backend subfolders MUST exist for Python to recognize the packages.

---

## 🤝 Academic Collaboration
Mythri is actively seeking collaboration with psychology researchers and clinical professionals for:

- Psychologically validated conversation corpus in Telugu, Tamil, Hindi and English
- ICMR compliance guidance for mental health data handling
- Clinical review of crisis detection and escalation protocols
- Joint research publications on AI-assisted mental health support in India

If you are a researcher, psychologist, or institution interested in building responsible mental health AI for India — reach out at yugavardhank@gmail.com