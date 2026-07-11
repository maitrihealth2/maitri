import axios from 'axios'

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/$/, '')

const api = axios.create({ baseURL: API_URL })

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('mb_token')
    if (token) config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export default api

export async function register(username: string, email: string, password: string, language = 'en-IN') {
  const res = await api.post('/api/auth/register', { username, email, password, preferred_language: language })
  return res.data
}

export async function login(email: string, password: string) {
  const res = await api.post('/api/auth/login', { email, password })
  return res.data
}

export async function getMe() {
  const res = await api.get('/api/auth/me')
  return res.data
}

export async function startSession() {
  const res = await api.post('/api/consultation/start')
  return res.data
}

export async function sendMessage(session_id: string, message: string, language = 'en-IN') {
  const res = await api.post('/api/consultation/message', { session_id, message, language })
  return res.data
}

export async function getHistory() {
  const res = await api.get('/api/consultation/history')
  return res.data
}

export async function getTranscript(sessionId: string) {
  const res = await api.get(`/api/consultation/${sessionId}`)
  return res.data
}

export async function sendVoiceMessage(sessionId: string, formData: FormData) {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('mb_token') : null;
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_URL}/api/voice/conversation`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Fetch failed with status ${res.status}: ${errText}`);
    }

    return await res.json();
  } catch (err: any) {
    console.error("FETCH ERROR DETAILED:", err.message);
    throw err;
  }
}
