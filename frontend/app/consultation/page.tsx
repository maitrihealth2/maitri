'use client'
import { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Button, 
  Card, 
  Avatar,
  Tooltip
} from '@heroui/react'
import { startSession, sendMessage } from '../../lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Message {
  role: 'user' | 'assistant'
  content: string
  is_crisis?: boolean
  helplines?: string[]
  emotion?: string
  emotion_emoji?: string
  rag_used?: boolean
  via?: 'text' | 'voice'
}

type ConvState = 'idle' | 'listening' | 'thinking' | 'speaking'

// ── Constants ────────────────────────────────────────────────────────────────
const LANGUAGES = [
  { code: 'en-IN', name: 'English', native: 'EN' },
  { code: 'hi-IN', name: 'Hindi', native: 'हिं' },
  { code: 'ta-IN', name: 'Tamil', native: 'த' },
  { code: 'te-IN', name: 'Telugu', native: 'తె' },
]

const EMOTION_THEMES: Record<string, { bg: string; orb: string; secondary: string; text: string }> = {
  Positive: { bg: 'radial-gradient(circle at center, rgba(250,204,21,0.2) 0%, rgba(0,0,0,0) 70%)', orb: '#FACC15', secondary: '#EAB308', text: 'text-yellow-400' },
  Anxiety:  { bg: 'radial-gradient(circle at center, rgba(168,85,247,0.2) 0%, rgba(0,0,0,0) 70%)', orb: '#A855F7', secondary: '#9333EA', text: 'text-purple-400' },
  Sadness:  { bg: 'radial-gradient(circle at center, rgba(59,130,246,0.2) 0%, rgba(0,0,0,0) 70%)', orb: '#3B82F6', secondary: '#2563EB', text: 'text-blue-400' },
  Anger:    { bg: 'radial-gradient(circle at center, rgba(239,68,68,0.2) 0%, rgba(0,0,0,0) 70%)', orb: '#EF4444', secondary: '#DC2626', text: 'text-red-400' },
  Neutral:  { bg: 'radial-gradient(circle at center, rgba(99,102,241,0.15) 0%, rgba(0,0,0,0) 70%)', orb: '#6366F1', secondary: '#4F46E5', text: 'text-indigo-400' },
  Crisis:   { bg: 'radial-gradient(circle at center, rgba(249,115,22,0.25) 0%, rgba(0,0,0,0) 70%)', orb: '#F97316', secondary: '#EA580C', text: 'text-orange-500' },
}

const STATE_COLORS: Record<ConvState, { orb: string; bg: string; text: string }> = {
  idle:      { orb: '#6366F1', bg: 'rgba(99,102,241,0.15)', text: 'text-indigo-400' }, 
  listening: { orb: '#22C55E', bg: 'rgba(34,197,94,0.2)',  text: 'text-green-400' },
  thinking:  { orb: '#EAB308', bg: 'rgba(234,179,8,0.2)',   text: 'text-yellow-400' },
  speaking:  { orb: '#EC4899', bg: 'rgba(236,72,153,0.2)',  text: 'text-pink-400' },
}

const QUICK_REPLIES: Record<string, { label: string; text: string }[]> = {
  'en-IN': [
    { label: '😔 Anxious', text: 'I have been feeling very anxious lately' },
    { label: '😴 Can\'t sleep', text: 'I am having trouble sleeping' },
    { label: '😤 Pressure', text: 'I am dealing with a lot of family pressure' },
    { label: '😞 Lonely', text: 'I have been feeling very lonely' },
    { label: '😰 Exam stress', text: 'I am really stressed about my exams' },
  ],
  'hi-IN': [
    { label: '😔 चिंता', text: 'मुझे बहुत चिंता हो रही है' },
    { label: '😴 नींद नहीं', text: 'मुझे नींद नहीं आती' },
    { label: '😤 परिवार दबाव', text: 'घर में बहुत दबाव है' },
    { label: '😞 अकेलापन', text: 'मुझे बहुत अकेलापन लग रहा है' },
    { label: '😰 परीक्षा तनाव', text: 'परीक्षा की वजह से बहुत तनाव में हूँ' },
  ],
}

const PLACEHOLDER: Record<string, string> = {
  'en-IN': "Share what's on your mind…",
  'hi-IN': 'अपने मन की बात साझा करें…',
}

const EMOTION_THEME: Record<string, { bg: string; text: string; ring: string }> = {
  Anxiety: { bg: 'bg-primary/10', text: 'text-primary', ring: 'ring-primary/20' },
  Sadness: { bg: 'bg-indigo-500/10', text: 'text-indigo-400', ring: 'ring-indigo-500/20' },
  Anger: { bg: 'bg-red-500/10', text: 'text-red-400', ring: 'ring-red-500/20' },
  Positive: { bg: 'bg-green-500/10', text: 'text-green-400', ring: 'ring-green-500/20' },
  Neutral: { bg: 'bg-surface-dark/50', text: 'text-text-muted', ring: 'ring-border-dim' },
  Crisis: { bg: 'bg-secondary/10', text: 'text-secondary', ring: 'ring-secondary/20' },
}

const SILENCE_THRESHOLD = 0.015 
const SILENCE_MS = 1500
const MIN_SPEECH_MS = 500

// ── Icons ─────────────────────────────────────────────────────────────────────
const SendIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
    <path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" />
  </svg>
)

const MicIcon = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="22"></line></svg>
)

const XIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
)

const HistoryIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 8v4l3 3" /><circle cx="12" cy="12" r="9" />
  </svg>
)

const LogoutIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" x2="9" y1="12" y2="12" />
  </svg>
)

// ── Main Page ───────────────────────────────────────────────────────────────
export default function ConsultationPage() {
  const router = useRouter()
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [language, setLanguage] = useState('en-IN')
  const [username, setUsername] = useState('')
  const [starting, setStarting] = useState(true)
  const [currentEmotion, setCurrentEmotion] = useState('Neutral')
  const [convState, setConvState] = useState<ConvState>('idle')
  const [liveTranscript, setLiveTranscript] = useState('')
  const [voiceStatus, setVoiceStatus] = useState('')
  const [isActuallySpeaking, setIsActuallySpeaking] = useState(false)
  const [bars, setBars] = useState<number[]>(Array(24).fill(4))

  const bottomRef = useRef<HTMLDivElement>(null)
  const initialized = useRef(false)
  const streamRef = useRef<MediaStream | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const speechStartRef = useRef<number>(0)
  const isListeningRef = useRef(false)
  const isSpeakingRef = useRef(false)
  const animFrameRef = useRef<number>(0)
  const sessionIdRef = useRef<string | null>(null)
  const languageRef = useRef('en-IN')
  const wsRef = useRef<WebSocket | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)

  const currentLang = useMemo(() => LANGUAGES.find(l => l.code === language) || LANGUAGES[0], [language])
  const quickReplies = QUICK_REPLIES[language] || QUICK_REPLIES['en-IN']

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('mb_token') : null
    if (!token) { router.replace('/'); return }

    setUsername(localStorage.getItem('mb_username') || 'Friend')
    const lang = localStorage.getItem('mb_language') || 'en-IN'
    setLanguage(lang)
    languageRef.current = lang

    if (!initialized.current) {
      initialized.current = true
      initSession()
    }

    return () => stopVoice()
  }, [])

  useEffect(() => {
    if (messages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, loading, convState])

  const initSession = async () => {
    try {
      const data = await startSession()
      setSessionId(data.session_id)
      sessionIdRef.current = data.session_id
      setMessages([{ role: 'assistant', content: "Namaste 🙏 I'm Maitri. I'm here to listen. How are you feeling today?" }])
    } catch {
      router.replace('/')
    } finally {
      setStarting(false)
    }
  }

  // ── Voice Engine ─────────────────────────────────────────────────────────
  const toggleVoice = () => {
    initAudio()
    if (isListeningRef.current || convState !== 'idle') {
      stopVoice()
    } else {
      startVoice()
    }
  }

  const startVoice = async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      isListeningRef.current = true

      const { audioCtx, analyser } = initAudio()
      if (sourceRef.current) sourceRef.current.disconnect()
      const source = audioCtx.createMediaStreamSource(stream)
      source.connect(analyser)
      sourceRef.current = source

      setConvState('listening')
      setVoiceStatus(`Listening…`)

      initLiveSTT()
      startChunk()
      startVisualizer() 
    } catch (err) {
      console.error('[startVoice] Error:', err)
      alert('Maitri needs microphone access to hear you.')
    }
  }

  const initAudio = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume()
    }
    if (!analyserRef.current) {
      const analyser = audioCtxRef.current.createAnalyser()
      analyser.fftSize = 512
      analyser.smoothingTimeConstant = 0.75
      analyserRef.current = analyser
    }
    return { audioCtx: audioCtxRef.current, analyser: analyserRef.current }
  }

  const initLiveSTT = () => {
    const sid = sessionIdRef.current
    if (!sid) return
    const wsUrl = `ws://127.0.0.1:8000/api/streaming/ws/stream/${sid}`
    const ws = new WebSocket(wsUrl)

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'config', language: languageRef.current }))
    }

    ws.onmessage = (e) => {
      const data = JSON.parse(e.data)
      if (data.type === 'transcript') {
        setLiveTranscript(data.text)
      } else if (data.type === 'status' && data.status === 'thinking') {
        setConvState('thinking')
        setVoiceStatus('Maitri is thinking…')
      } else if (data.type === 'response') {
        const resp = data.data
        if (resp.response) {
          setMessages(prev => [...prev, { role: 'assistant', content: resp.response }])
        }
        if (resp.emotion) setCurrentEmotion(resp.emotion)
        
        if (resp.audio_b64) {
          setConvState('speaking')
          setVoiceStatus('Maitri is speaking…')
          playWav(resp.audio_b64).then(() => {
            setConvState('idle')
            setVoiceStatus('')
          })
        } else {
          setConvState('idle')
          setVoiceStatus('')
        }
        setLiveTranscript('')
      }
    }
    wsRef.current = ws
  }

  const playWav = async (data: ArrayBuffer | Uint8Array | string) => {
    try {
      const { audioCtx, analyser } = initAudio()
      let arrayBuffer: ArrayBuffer
      if (typeof data === 'string') {
        const binary = atob(data); const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
        arrayBuffer = bytes.buffer
      } else if (data instanceof Uint8Array) {
        arrayBuffer = new Uint8Array(data).buffer as ArrayBuffer
      } else {
        arrayBuffer = data as ArrayBuffer
      }

      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
      const source = audioCtx.createBufferSource()
      source.buffer = audioBuffer
      source.connect(analyser)
      source.connect(audioCtx.destination)

      const playPromise = new Promise((resolve) => {
        source.onended = () => {
          source.disconnect()
          resolve(true)
        }
      })
      source.start(0)
      startVisualizer()
      return playPromise
    } catch (err) {
      return Promise.resolve(false)
    }
  }

  const stopVoice = () => {
    isListeningRef.current = false
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    if (mediaRecorderRef.current?.state !== 'inactive') mediaRecorderRef.current?.stop()
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    if (wsRef.current) wsRef.current.close()
    setConvState('idle')
    setVoiceStatus('')
    setLiveTranscript('')
    setBars(Array(24).fill(4))
  }

  const startChunk = () => {
    if (!streamRef.current || !isListeningRef.current) return
    try {
      const recorder = new MediaRecorder(streamRef.current, { mimeType: 'audio/webm' })
      recorder.ondataavailable = async (e) => {
        if (e.data.size > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
          const reader = new FileReader()
          reader.onload = () => {
            const base64 = (reader.result as string).split(',')[1]
            wsRef.current?.send(JSON.stringify({ type: 'audio', data: base64 }))
          }
          reader.readAsDataURL(e.data)
        }
      }
      recorder.start(250)
      mediaRecorderRef.current = recorder
    } catch (e) {}
  }

  const startVisualizer = () => {
    const analyser = analyserRef.current
    if (!analyser) return
    const freqData = new Uint8Array(analyser.frequencyBinCount)
    const timeData = new Float32Array(analyser.fftSize)
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)

    const tick = () => {
      if (convState === 'idle') {
        setBars(Array(24).fill(4))
        return
      }
      analyser.getByteFrequencyData(freqData)
      analyser.getFloatTimeDomainData(timeData)

      let sum = 0
      for (let i = 0; i < timeData.length; i++) sum += timeData[i] * timeData[i]
      const rms = Math.sqrt(sum / timeData.length)
      const isVoiceDetected = rms > SILENCE_THRESHOLD
      const vol = Math.min(rms / 0.1, 1)

      setIsActuallySpeaking(isListeningRef.current ? isVoiceDetected : (convState === 'speaking'))

      const newBars = Array(24).fill(0).map((_, i) => {
        const sampleIdx = Math.floor(i * (freqData.length / 32))
        return Math.max(4, (freqData[sampleIdx] / 255) * 80 * (vol + 0.6))
      })
      setBars(prev => prev.map((old, i) => old * 0.7 + newBars[i] * 0.3))

      if (isListeningRef.current) {
        if (isVoiceDetected) {
          if (!isSpeakingRef.current) speechStartRef.current = Date.now()
          isSpeakingRef.current = true
          if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null }
          setVoiceStatus('I hear you…')
        } else if (isSpeakingRef.current && !silenceTimerRef.current) {
          setVoiceStatus('Listening…')
          silenceTimerRef.current = setTimeout(() => {
            silenceTimerRef.current = null
            if (isListeningRef.current) flushChunk()
          }, SILENCE_MS)
        }
      }
      animFrameRef.current = requestAnimationFrame(tick)
    }
    animFrameRef.current = requestAnimationFrame(tick)
  }

  const flushChunk = () => {
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state === 'inactive') return
    if (Date.now() - speechStartRef.current < MIN_SPEECH_MS || !isSpeakingRef.current) {
        startChunk(); return
    }
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'flush', language: languageRef.current }))
    }
    recorder.stop()
    isSpeakingRef.current = false
    setIsActuallySpeaking(false)
  }

  const handleTextSend = async (text?: string) => {
    const msg = (text || input).trim()
    if (!msg || !sessionId || loading) return
    setInput(''); setLoading(true)
    setMessages(prev => [...prev, { role: 'user', content: msg, via: 'text' }])
    try {
      const data = await sendMessage(sessionId, msg, language)
      setCurrentEmotion(data.emotion || 'Neutral')
      setMessages(prev => [...prev, {
        role: 'assistant', content: data.response,
        is_crisis: data.is_crisis, helplines: data.helplines,
        emotion: data.emotion, rag_used: data.rag_used,
      }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Connection issue.' }])
    } finally { setLoading(false) }
  }

  const handleLanguageChange = (lang: string) => {
    setLanguage(lang); languageRef.current = lang
    localStorage.setItem('mb_language', lang)
  }

  const isVoiceActive = convState !== 'idle'

  if (starting) return (
    <div className="min-h-screen bg-bg-dark flex flex-col items-center justify-center gap-6">
      <div className="w-16 h-16 flex items-center justify-center text-3xl rounded-2xl animate-pulse-glow bg-linear-to-br from-primary to-secondary">🌸</div>
      <p className="text-sm text-text-muted font-medium">Initializing secure session…</p>
    </div>
  )

  return (
    <div className="min-h-screen flex flex-col bg-bg-dark pi-gradient overflow-hidden">
      {/* ── Navbar ── */}
      <nav className="fixed top-0 left-0 right-0 h-18 z-50 glass border-b border-white/5 px-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-surface-dark border border-white/10 flex items-center justify-center text-xl">🌸</div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-text-bright">Maitri</span>
              {currentEmotion && (
                <span className={`text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full ring-1 ${EMOTION_THEME[currentEmotion]?.bg} ${EMOTION_THEME[currentEmotion]?.text}`}>
                  {currentEmotion}
                </span>
              )}
            </div>
            <span className="text-[10px] font-bold text-text-dim uppercase tracking-tighter">Secure & Confidential</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex bg-surface-dark/50 p-1 rounded-full border border-white/5 gap-1">
             {LANGUAGES.map(l => (
               <button key={l.code} onClick={() => handleLanguageChange(l.code)} className={`px-3 py-1 text-[11px] font-bold rounded-full ${language === l.code ? 'bg-primary text-white' : 'text-text-muted'}`}>{l.native}</button>
             ))}
          </div>
          <button onClick={() => router.push('/history')} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-text-muted"><HistoryIcon /></button>
          <button onClick={() => { stopVoice(); localStorage.removeItem('mb_token'); router.replace('/') }} className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400"><LogoutIcon /></button>
        </div>
      </nav>

      {/* ── Chat Messages ── */}
      <div className={`flex-1 w-full max-w-3xl mx-auto px-6 pt-28 pb-64 space-y-8 transition-all duration-700 ${isVoiceActive ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100'}`}>
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-4 ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
            <div className={`w-2 h-2 rounded-full mt-3.5 ${m.role === 'user' ? 'bg-primary/40' : 'bg-linear-to-br from-primary to-secondary'}`} />
            <div className={`max-w-[85%] ${m.role === 'user' ? 'text-primary text-right' : 'text-text-bright'}`}>
              <p className="text-lg font-medium leading-relaxed whitespace-pre-wrap">{m.content}</p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* ── Fixed Input Control ── */}
      <div className="fixed bottom-0 left-0 right-0 p-6 z-50">
        <div className="max-w-3xl mx-auto glass p-5 rounded-3xl space-y-4">
          {!isVoiceActive && (
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
              {quickReplies.map((q, i) => (
                <button key={i} onClick={() => handleTextSend(q.text)} className="px-4 py-1.5 rounded-full bg-primary/5 hover:bg-primary/20 text-primary text-[11px] font-bold border border-primary/10 whitespace-nowrap">{q.label}</button>
              ))}
            </div>
          )}
          
          <div className="flex items-center gap-3 w-full">
            <textarea 
              value={input} 
              onChange={e => setInput(e.target.value)} 
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleTextSend() } }} 
              placeholder={PLACEHOLDER[language]} 
              rows={1} 
              className="flex-1 bg-surface-dark/40 border border-white/5 rounded-2xl p-4 text-sm text-text-bright outline-none focus:border-primary/50 resize-none h-[52px] leading-[20px]" 
            />
            <button 
              onClick={() => handleTextSend()} 
              disabled={!input.trim() || loading}
              className="w-[52px] h-[52px] flex items-center justify-center rounded-2xl bg-primary text-white shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all outline-none disabled:opacity-50"
            >
              <SendIcon />
            </button>
            <button 
              onClick={toggleVoice}
              className="w-[52px] h-[52px] flex items-center justify-center rounded-2xl bg-linear-to-r from-primary to-secondary text-white shadow-lg shadow-secondary/20 hover:scale-105 active:scale-95 transition-all outline-none"
            >
              <MicIcon />
            </button>
          </div>
        </div>
      </div>

      {/* ── Voice UI Overlay ── */}
      <AnimatePresence>
        {isVoiceActive && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }} 
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden"
          >
            {/* Dynamic Background Aura */}
            <motion.div 
              className="absolute inset-0 z-0" 
              animate={{ 
                background: `radial-gradient(circle at center, ${STATE_COLORS[convState].bg} 0%, rgba(0,0,0,0) 70%)`
              }} 
              transition={{ duration: 1.5 }} 
            />
            <div className="absolute inset-0 z-0 bg-bg-dark/80 backdrop-blur-3xl" />
            
            {/* Header */}
            <div className="absolute top-10 w-full px-10 flex justify-between items-center z-10">
               <div className="flex items-center gap-3">
                  <Avatar size="sm" className="bg-linear-to-br from-primary to-secondary" />
                  <span className="font-bold text-text-bright">Maitri Voice</span>
               </div>
               <button 
                 onClick={stopVoice} 
                 className="p-3 rounded-full bg-white/5 hover:bg-white/10 text-text-muted transition-all"
               >
                 <XIcon />
               </button>
            </div>

            {/* Minimalist Orb Centerpiece */}
            <div className="relative flex-1 flex flex-col items-center justify-center w-full z-10">
               <div className="relative h-64 w-64 flex items-center justify-center">
                  <motion.div 
                    className="absolute h-full w-full rounded-full blur-3xl opacity-30" 
                    animate={{ 
                      scale: [1, 1.2, 1], 
                      background: STATE_COLORS[convState].orb
                    }} 
                    transition={{ repeat: Infinity, duration: 4 }} 
                  />
                  <motion.div 
                    className="absolute h-48 w-48 rounded-full border-2 opacity-20" 
                    style={{ borderColor: STATE_COLORS[convState].orb }} 
                    animate={{ scale: isActuallySpeaking ? [1, 1.1, 1] : 1 }} 
                    transition={{ repeat: isActuallySpeaking ? Infinity : 0, duration: 2 }} 
                  />
                  <motion.div 
                    className="relative h-32 w-32 rounded-full shadow-2xl" 
                    animate={{ 
                      scale: isActuallySpeaking ? 1.1 : 1, 
                      backgroundColor: STATE_COLORS[convState].orb, 
                      boxShadow: `0 0 40px ${STATE_COLORS[convState].orb}66` 
                    }} 
                  />
               </div>

               <div className="mt-16 text-center px-8 space-y-6">
                  <h2 className={`text-2xl font-semibold transition-colors duration-500 ${STATE_COLORS[convState].text}`}>
                    {voiceStatus}
                  </h2>
                  {liveTranscript && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-md mx-auto">
                       <p className="text-xl text-text-bright font-medium opacity-90 leading-tight">"{liveTranscript}"</p>
                    </motion.div>
                  )}
               </div>
            </div>

            {/* Bottom Controls */}
            <div className="absolute bottom-16 w-full flex justify-center px-6 z-10">
               <Card className="bg-white/5 backdrop-blur-2xl border-white/10 p-4 rounded-3xl flex flex-row items-center gap-6">
                  <Button 
                    onPress={toggleVoice} 
                    className="bg-primary/20 text-white font-bold h-14 px-8 rounded-full flex items-center gap-2"
                  >
                    <MicIcon size={20} />
                    {isActuallySpeaking ? 'Listening...' : 'Maitri is listening'}
                  </Button>
                  <div className="w-[1px] h-8 bg-white/10 mx-2" />
                  <Button 
                    onPress={stopVoice} 
                    className="h-14 px-8 font-bold rounded-full bg-red-500/20 text-red-400 hover:bg-red-500/30"
                  >
                    End Session
                  </Button>
               </Card>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}