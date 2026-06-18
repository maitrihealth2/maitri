'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { startSession, sendMessage, sendVoiceMessage } from '../../lib/api'

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

const LANGUAGES = [
  { code: 'en-IN', name: 'English', native: 'EN' },
  { code: 'hi-IN', name: 'Hindi', native: 'HI' },
  { code: 'ta-IN', name: 'Tamil', native: 'TA' },
  { code: 'te-IN', name: 'Telugu', native: 'TE' },
]

const STATE_COLORS: Record<ConvState, { orbFrom: string; orbTo: string; glow: string }> = {
  idle:      { orbFrom: 'var(--color-secondary)', orbTo: 'var(--color-primary)', glow: 'rgba(108, 91, 77, 0.2)' },
  listening: { orbFrom: 'var(--color-secondary)', orbTo: 'var(--color-primary)', glow: 'rgba(108, 91, 77, 0.4)' },
  thinking:  { orbFrom: 'var(--color-primary)',   orbTo: 'var(--color-tertiary)',  glow: 'rgba(97, 104, 68, 0.2)' },
  speaking:  { orbFrom: 'var(--color-tertiary)',  orbTo: 'var(--color-secondary)', glow: 'rgba(104, 101, 85, 0.4)' },
}

const QUICK_REPLIES: Record<string, { label: string; text: string }[]> = {
  'en-IN': [
    { label: 'Anxious', text: 'I have been feeling very anxious lately' },
    { label: "Can't sleep", text: 'I am having trouble sleeping' },
    { label: 'Work stress', text: 'I am feeling overwhelmed by work stress' },
    { label: 'Feeling lonely', text: 'I just need someone to talk to right now' },
  ],
  'hi-IN': [
    { label: 'चिंता', text: 'मुझे बहुत चिंता हो रही है' },
    { label: 'नींद नहीं आती', text: 'मुझे नींद नहीं आती' },
    { label: 'काम का तनाव', text: 'काम के तनाव से मैं बहुत परेशान हूँ' },
    { label: 'अकेलापन', text: 'मुझे बस किसी से बात करनी है' },
  ],
  'ta-IN': [
    { label: 'கவலை', text: 'நான் மிகவும் கவலையாக உணர்கிறேன்' },
    { label: 'தூக்கமின்மை', text: 'எனக்கு தூக்கம் வரவில்லை' },
    { label: 'வேலை அழுத்தம்', text: 'வேலை அழுத்தத்தால் நான் மிகவும் சிரமப்படுகிறேன்' },
    { label: 'தனிமை', text: 'எனக்கு யாரிடமாவது பேச வேண்டும்' },
  ],
  'te-IN': [
    { label: 'ఆందోళన', text: 'నేను చాలా ఆందోళనగా ఉన్నాను' },
    { label: 'నిద్రపట్టడం లేదు', text: 'నాకు నిద్ర పట్టడం లేదు' },
    { label: 'పని ఒత్తిడి', text: 'పని ఒత్తిడి వల్ల నేను చాలా ఇబ్బంది పడుతున్నాను' },
    { label: 'ఒంటరితనం', text: 'నేను ఎవరితోనైనా మాట్లాడాలి' },
  ],
}

const SILENCE_THRESHOLD = 0.015
const SILENCE_MS = 3000
const MIN_SPEECH_MS = 500

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
  const isAssistantSpeakingRef = useRef(false)
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
  const voiceSessionIdRef = useRef<number>(0)
  const animFrameRef = useRef<number>(0)
  const sessionIdRef = useRef<string | null>(null)
  const languageRef = useRef('en-IN')

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
      setMessages([{ role: 'assistant', content: "Hello. I'm here for you. Would you like to talk about what's been on your mind?" }])
    } catch {
      router.replace('/')
    } finally {
      setStarting(false)
    }
  }

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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      streamRef.current = stream
      isListeningRef.current = true
      isSpeakingRef.current = false
      voiceSessionIdRef.current += 1
      setConvState('listening')
      setVoiceStatus(`Listening...`)

      const { audioCtx, analyser } = initAudio()
      const source = audioCtx.createMediaStreamSource(stream)
      source.connect(analyser)

      startChunk()
      startVisualizer() 
    } catch (err) {
      console.error(err)
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
      const dummyGain = audioCtxRef.current.createGain()
      dummyGain.gain.value = 0
      analyser.connect(dummyGain)
      dummyGain.connect(audioCtxRef.current.destination)
      analyserRef.current = analyser
    }
    return { audioCtx: audioCtxRef.current, analyser: analyserRef.current }
  }

  const processVoiceTurn = async (blob: Blob, currentVoiceSession: number) => {
    const sid = sessionIdRef.current
    if (!sid) return
    setConvState('thinking')
    setVoiceStatus('Thinking...')
    const formData = new FormData()
    formData.append('audio', blob, 'audio.webm')
    formData.append('language', languageRef.current)
    formData.append('session_id', sid)
    try {
      const data = await sendVoiceMessage(sid, formData)
      if (data.transcript) {
         setMessages(prev => [...prev, { role: 'user', content: data.transcript, via: 'voice' }])
         setLiveTranscript(data.transcript)
      }
      if (data.response) {
         setMessages(prev => [...prev, { role: 'assistant', content: data.response }])
      }
      if (data.emotion) setCurrentEmotion(data.emotion)
      if (data.audio_b64 && isListeningRef.current) {
         setConvState('speaking')
         isAssistantSpeakingRef.current = true
         setVoiceStatus('Speaking...')
         await playWav(data.audio_b64)
         isAssistantSpeakingRef.current = false
      }
    } catch (e) {} finally {
       if (isListeningRef.current && voiceSessionIdRef.current === currentVoiceSession) {
          setConvState('listening')
          setVoiceStatus('Listening...')
          setLiveTranscript('')
          startChunk()
       } else if (!isListeningRef.current) {
          setConvState('idle')
          setVoiceStatus('')
       }
    }
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
        source.onended = () => { source.disconnect(); resolve(true) }
      })
      source.start(0)
      startVisualizer()
      return playPromise
    } catch (err) { return Promise.resolve(false) }
  }

  const stopVoice = () => {
    isListeningRef.current = false
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.onstop = null
        mediaRecorderRef.current.stop()
    }
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setConvState('idle')
    setVoiceStatus('')
    setLiveTranscript('')
    setBars(Array(24).fill(4))
  }

  const startChunk = () => {
    if (!streamRef.current || !isListeningRef.current) return
    try {
      const recorder = new MediaRecorder(streamRef.current, { mimeType: 'audio/webm' })
      let chunks: BlobPart[] = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }
      recorder.onstop = async () => {
        if (chunks.length > 0 && isListeningRef.current) {
          const blob = new Blob(chunks, { type: 'audio/webm' })
          await processVoiceTurn(blob, voiceSessionIdRef.current)
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
      analyser.getByteFrequencyData(freqData)
      analyser.getFloatTimeDomainData(timeData)
      let sum = 0
      for (let i = 0; i < timeData.length; i++) sum += timeData[i] * timeData[i]
      const rms = Math.sqrt(sum / timeData.length)
      const isVoiceDetected = rms > SILENCE_THRESHOLD
      const vol = Math.min(rms / 0.1, 1)

      setIsActuallySpeaking(isListeningRef.current ? isVoiceDetected : isAssistantSpeakingRef.current)

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
        } else if (isSpeakingRef.current && !silenceTimerRef.current) {
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
        recorder.onstop = null
        recorder.stop()
        startChunk()
        return
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
    <div className="bg-background text-on-background min-h-screen flex items-center justify-center">
       <span className="material-symbols-outlined text-4xl text-primary animate-pulse">spa</span>
    </div>
  )

  return (
    <div className="bg-background text-on-background font-body-md h-screen flex flex-col overflow-hidden relative selection:bg-secondary/30 selection:text-secondary-fixed">
      {/* Background radial gradient */}
      <div className="absolute inset-0 z-0 pointer-events-none" style={{ backgroundImage: "radial-gradient(circle at 50% -20%, var(--color-primary-container), transparent 60%)" }}></div>
      
      {/* Top Navbar */}
      <header className="fixed top-0 left-0 w-full z-50 flex justify-between items-center px-gutter py-4 bg-surface/80 backdrop-blur-xl shadow-sm border-b border-outline-variant/30">
        <div className="flex items-center gap-2 cursor-pointer hover:bg-surface-container-highest transition-colors duration-200 p-2 rounded-lg" onClick={() => window.location.reload()}>
          <span className="font-headline text-2xl font-bold tracking-tight text-primary">Maitri</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex bg-surface-container rounded-full p-1 border border-outline-variant/30">
             {LANGUAGES.map(l => (
                <button key={l.code} onClick={() => handleLanguageChange(l.code)} className={`px-4 py-1.5 rounded-full text-xs font-semibold tracking-wide transition-all ${language === l.code ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}`}>
                   {l.native}
                </button>
             ))}
          </div>
          <button onClick={() => router.push('/history')} className="text-primary font-bold hover:bg-surface-container-highest transition-colors duration-200 p-2 rounded-full flex items-center justify-center group">
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>history</span>
          </button>
          <button 
            onClick={() => { 
              try { stopVoice() } catch (err) { console.error(err) }
              localStorage.removeItem('mb_token')
              localStorage.removeItem('mb_username')
              window.location.href = '/'
            }} 
            className="text-on-surface-variant hover:text-error hover:bg-surface-container-highest transition-colors duration-200 p-2 rounded-full flex items-center justify-center group"
          >
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 0" }}>logout</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-container-max mx-auto px-gutter pt-24 pb-32 overflow-y-auto flex flex-col gap-stack-lg relative z-10 custom-scrollbar">
        
        <div className="text-center w-full my-4">
           <span className="font-label-sm text-label-sm text-on-surface-variant px-4 py-1 bg-surface-container/50 rounded-full backdrop-blur-sm border border-outline-variant/30">Today</span>
        </div>

        {messages.map((m, i) => (
          m.role === 'assistant' ? (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} key={i} className="flex flex-col items-start gap-stack-sm max-w-[80%]">
              <div className="flex items-center gap-2 ml-2 mb-1">
                <div className="w-6 h-6 rounded-full bg-primary-container flex items-center justify-center">
                  <span className="material-symbols-outlined text-[14px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>eco</span>
                </div>
                <span className="font-label-sm text-label-sm text-on-surface-variant">Maitri</span>
              </div>
              <div className="glass-panel p-6 rounded-2xl rounded-tl-sm text-on-surface font-body text-body-md relative overflow-hidden">
                <p className="whitespace-pre-wrap relative z-10">{m.content}</p>
                
                {m.emotion && m.emotion !== 'Neutral' && (
                  <div className="flex flex-wrap gap-2 mt-4 relative z-10">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-primary/10 text-primary text-xs font-medium rounded-full border border-primary/20 shadow-sm">
                        <span className="material-symbols-outlined text-[14px]">psychology</span>
                        {m.emotion}
                    </span>
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} key={i} className="flex flex-col items-end gap-stack-sm max-w-[80%] self-end mt-2">
              <div className="bg-primary-container text-on-primary-container p-4 rounded-2xl rounded-tr-sm shadow-sm font-body text-body-md">
                <p className="whitespace-pre-wrap">{m.content}</p>
              </div>
            </motion.div>
          )
        ))}
        {loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-start gap-stack-sm max-w-[80%]">
             <div className="flex items-center gap-2 ml-2 mb-1">
                <div className="w-6 h-6 rounded-full bg-primary-container flex items-center justify-center">
                  <span className="material-symbols-outlined text-[14px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>eco</span>
                </div>
                <span className="font-label-sm text-label-sm text-on-surface-variant">Maitri</span>
              </div>
              <div className="glass-panel p-6 rounded-2xl rounded-tl-sm text-on-surface font-body text-body-md flex gap-2">
                 <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }}></div>
                 <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }}></div>
                 <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
          </motion.div>
        )}
        <div ref={bottomRef} />
      </main>

      {/* Input Dock (Fixed Bottom) */}
      <div className={`fixed bottom-0 left-0 w-full bg-gradient-to-t from-background via-background to-transparent pt-12 pb-6 px-gutter z-40 transition-opacity duration-300 ${isVoiceActive ? 'opacity-0 pointer-events-none' : 'opacity-100 pointer-events-auto'}`}>
        <div className="max-w-container-max mx-auto flex flex-col gap-4">
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {quickReplies.map((q, i) => (
              <button key={i} onClick={() => handleTextSend(q.text)} className="whitespace-nowrap font-label-md text-label-md px-4 py-2 rounded-full border border-secondary/30 text-secondary hover:bg-secondary/10 transition-colors bg-surface-container-low/50 backdrop-blur-sm shadow-sm active:scale-95">
                {q.label}
              </button>
            ))}
          </div>
          
          <div className="flex items-end gap-3 glass-panel p-2 pl-6 rounded-3xl focus-within:border-primary/50 focus-within:shadow-[0_0_15px_rgba(108,91,77,0.1)] transition-all">
            <textarea 
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleTextSend() } }}
              className="w-full bg-transparent border-none text-on-surface placeholder-on-surface-variant focus:ring-0 resize-none py-3 font-body-md text-body-md max-h-32" 
              placeholder={language === 'hi-IN' ? "अपने मन की बात साझा करें..." : "Type a message or use voice..."} 
              rows={1}
            />
            <div className="flex gap-2 pb-1">
              <button onClick={() => handleTextSend()} disabled={!input.trim() || loading} className="w-12 h-12 rounded-full flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors disabled:opacity-40 disabled:hover:text-on-surface-variant active:scale-90">
                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 0" }}>send</span>
              </button>
              <button onClick={toggleVoice} className="w-12 h-12 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-[0_4px_12px_rgba(108,91,77,0.2)] hover:scale-105 transition-transform active:scale-95 group">
                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>mic</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Voice Interaction Overlay */}
      <AnimatePresence>
        {isVoiceActive && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="fixed inset-0 z-[100] bg-surface-dim/90 backdrop-blur-2xl flex flex-col items-center justify-center pointer-events-auto"
          >
            <button className="absolute top-6 right-6 text-on-surface-variant hover:text-on-surface p-2 transition-colors active:scale-90" onClick={stopVoice}>
              <span className="material-symbols-outlined text-[32px]">close</span>
            </button>
            
            <div className="flex-1 flex flex-col items-center justify-center w-full">
              {/* Pulsing Orb */}
              <div className="w-32 h-32 rounded-full flex items-center justify-center blur-sm relative"
                   style={{
                     background: `linear-gradient(to top right, ${STATE_COLORS[convState].orbFrom}40, ${STATE_COLORS[convState].orbTo}40)`
                   }}>
                <motion.div 
                  className="w-20 h-20 rounded-full blur-none z-10 flex items-center justify-center voice-orb"
                  style={{
                     background: `linear-gradient(to bottom right, ${STATE_COLORS[convState].orbFrom}, ${STATE_COLORS[convState].orbTo})`,
                     boxShadow: `0 0 50px ${STATE_COLORS[convState].glow}`
                  }}
                  animate={{ scale: isActuallySpeaking ? 1.1 : 1 }}
                >
                  <span className="material-symbols-outlined text-surface-dim text-[48px]" style={{ fontVariationSettings: "'FILL' 1" }}>graphic_eq</span>
                </motion.div>
              </div>

              <motion.p 
                className="mt-12 font-headline-lg text-headline-lg tracking-wide opacity-80 animate-pulse"
                style={{ color: STATE_COLORS[convState].orbFrom }}
              >
                {voiceStatus}
              </motion.p>
              
              <div className="mt-4 font-body-lg text-body-lg text-on-surface-variant text-center max-w-md px-6 min-h-[80px]">
                {liveTranscript && (
                  <p className="animate-pulse">
                      "{liveTranscript}"
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}