'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { startSession, sendVoiceMessage, getTranscript } from '../../lib/api'
import { useMitraStore } from '../../stores/mitraStore'

type ConvState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'paused'

const SILENCE_THRESHOLD = 0.05
const SILENCE_MS = 3000
const NUM_BARS = 64 // Increased for a smoother circle

export default function VoiceModePage() {
  const router = useRouter()
  
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [convState, setConvState] = useState<ConvState>('idle')
  const [isMuted, setIsMuted] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [bars, setBars] = useState<number[]>(Array(NUM_BARS).fill(15))
  const [userTranscript, setUserTranscript] = useState<string>('')
  const [agentResponse, setAgentResponse] = useState<string>('')
  
  const initialized = useRef(false)
  const streamRef = useRef<MediaStream | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const isListeningRef = useRef(false)
  const isSpeakingRef = useRef(false)
  const isAssistantSpeakingRef = useRef(false)
  const voiceSessionIdRef = useRef<number>(0)
  const animFrameRef = useRef<number>(0)
  const sessionIdRef = useRef<string | null>(null)
  const languageRef = useRef('en-IN')
  
  const mitraStore = useMitraStore()

  const [particles, setParticles] = useState<Array<{ id: number, delay: number, duration: number, size: number, opacity: number }>>([])

  useEffect(() => {
    setParticles(
      Array.from({ length: 12 }).map((_, i) => ({
        id: i,
        delay: Math.random() * 5,
        duration: 10 + Math.random() * 15,
        size: 2 + Math.random() * 4,
        opacity: 0.2 + Math.random() * 0.5
      }))
    )
  }, [])

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('mb_token') : null
    if (!token) {
      router.replace('/')
      return
    }

    const handleLangChange = () => {
      const newLang = localStorage.getItem('mb_language') || 'en-IN'
      languageRef.current = newLang
    }
    
    handleLangChange()
    window.addEventListener('mb_language_changed', handleLangChange)

    if (!initialized.current) {
      initialized.current = true
      initSession()
    }

    return () => {
      window.removeEventListener('mb_language_changed', handleLangChange)
      stopVoice()
    }
  }, [router])

  const initSession = async () => {
    try {
      const existingSessionId = localStorage.getItem('mb_session_id')
      if (existingSessionId) {
         try {
             await getTranscript(existingSessionId)
             setSessionId(existingSessionId)
             sessionIdRef.current = existingSessionId
             startVoice()
             return
         } catch (e) {
             // Invalid session, fallback to new
         }
      }
      const data = await startSession()
      setSessionId(data.session_id)
      sessionIdRef.current = data.session_id
      localStorage.setItem('mb_session_id', data.session_id)
      startVoice()
    } catch {
      router.replace('/')
    }
  }

  const toggleMute = () => {
    const nextMuted = !isMuted
    if (streamRef.current) {
      streamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !nextMuted 
      })
    }
    setIsMuted(nextMuted)

    if (nextMuted) {
      // Stop listening and force AI to respond immediately
      if (isListeningRef.current) {
        isListeningRef.current = false
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current)
          silenceTimerRef.current = null
        }
        flushChunk()
      }
    } else {
      // Resume listening
      if (!isListeningRef.current && !isPaused) {
        isListeningRef.current = true
        setConvState('listening')
        mitraStore.setState('listening')
        startChunk()
      }
    }
  }

  const togglePause = () => {
    if (isPaused) {
      // Resume
      setIsPaused(false)
      setConvState('listening')
      mitraStore.setState('listening')
      isListeningRef.current = true
      startChunk()
    } else {
      // Pause
      setIsPaused(true)
      setConvState('paused')
      mitraStore.setState('idle')
      isListeningRef.current = false
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current)
        silenceTimerRef.current = null
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.onstop = null
        mediaRecorderRef.current.stop()
      }
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
      mitraStore.setState('listening')

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
    mitraStore.setState('curious')

    const formData = new FormData()
    formData.append('audio', blob, 'audio.webm')
    formData.append('language', languageRef.current)
    formData.append('session_id', sid)
    
    try {
      const data = await sendVoiceMessage(sid, formData)
      
      if (data.transcript && data.transcript !== "[Silence]") {
        setUserTranscript(data.transcript)
      }
      if (data.response) {
        setAgentResponse(data.response)
      }
      
      if (data.emotion) {
        mitraStore.setMood('bright')
      }

      if (data.audio_b64 && isListeningRef.current) {
        setConvState('speaking')
        mitraStore.setState('comforting')
        mitraStore.setMood('bright')
        isAssistantSpeakingRef.current = true
        
        await playWav(data.audio_b64)
        
        isAssistantSpeakingRef.current = false
        mitraStore.setMood('warm')
      }
    } catch (e) {
      console.error(e)
    } finally {
      if (isListeningRef.current && voiceSessionIdRef.current === currentVoiceSession) {
        setConvState('listening')
        mitraStore.setState('listening')
        startChunk()
      } else if (!isListeningRef.current && !isPaused) {
        setConvState('idle')
        mitraStore.setState('idle')
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
    mitraStore.setState('idle')
    setBars(Array(NUM_BARS).fill(15))
  }

  const handleStopConversation = () => {
    stopVoice()
    router.push('/consultation')
  }

  const startChunk = () => {
    if (!streamRef.current || !isListeningRef.current) return
    try {
      const types = ['audio/webm', 'audio/mp4', 'audio/ogg', '']
      let selectedType = ''
      for (const t of types) {
        if (t === '' || MediaRecorder.isTypeSupported(t)) {
          selectedType = t
          break
        }
      }
      const options = selectedType ? { mimeType: selectedType } : {}
      const recorder = new MediaRecorder(streamRef.current, options)
      const chunks: BlobPart[] = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }
      recorder.onstop = async () => {
        if (chunks.length > 0 && isListeningRef.current) {
          const blob = new Blob(chunks, { type: selectedType || recorder.mimeType || 'audio/webm' })
          await processVoiceTurn(blob, voiceSessionIdRef.current)
        }
      }
      recorder.start(250)
      mediaRecorderRef.current = recorder
    } catch (e) {
      console.error(e)
    }
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
      
      const timeSec = Date.now() / 1000

      const newBars = Array(NUM_BARS).fill(0).map((_, i) => {
        const wave1 = Math.sin(timeSec * 2 + i * 0.2) * 10
        const wave2 = Math.sin(timeSec * 1.5 - i * 0.1) * 8
        const base = 5
        
        let height = base + wave1 + wave2

        const isActuallySpeaking = isListeningRef.current ? isVoiceDetected : isAssistantSpeakingRef.current
        if (isActuallySpeaking) {
           const sampleIdx = Math.floor(i * (freqData.length / NUM_BARS)) 
           const freqValue = (freqData[sampleIdx] || 0) / 255
           height += freqValue * 50 * (vol + 0.5)
        }
        
        return Math.max(4, Math.min(80, height * (isActuallySpeaking ? 0.8 : 0.3)))
      })
      
      setBars(prev => prev.map((old, i) => old * 0.6 + newBars[i] * 0.4))

      if (isListeningRef.current && !isMuted) {
        if (isVoiceDetected) {
          if (!isSpeakingRef.current) isSpeakingRef.current = true
          if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null }
        } else {
          if (!silenceTimerRef.current) {
            silenceTimerRef.current = setTimeout(() => {
              silenceTimerRef.current = null
              if (isListeningRef.current) flushChunk()
            }, SILENCE_MS)
          }
        }
      }
      animFrameRef.current = requestAnimationFrame(tick)
    }
    animFrameRef.current = requestAnimationFrame(tick)
  }

  const flushChunk = () => {
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state === 'inactive') return
    recorder.stop()
    isSpeakingRef.current = false
  }

  const getStatusText = () => {
    if (isPaused) return "Conversation Paused"
    switch (convState) {
      case 'listening': return "Listening..."
      case 'thinking': return "Thinking..."
      case 'speaking': return "Speaking..."
      case 'idle': return "Standing By"
      default: return "Connecting..."
    }
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes breathing-custom {
            0%, 100% { transform: scale(1); filter: drop-shadow(0 0 20px var(--color-primary-container)); }
            50% { transform: scale(1.05); filter: drop-shadow(0 0 45px var(--color-primary-container)); }
        }
        @keyframes orbit-custom {
            from { transform: rotate(0deg) translateX(120px) rotate(0deg); }
            to { transform: rotate(360deg) translateX(120px) rotate(-360deg); }
        }
        @keyframes pulse-dot-custom {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.4; transform: scale(0.8); }
        }
        .animate-breathing-custom {
            animation: breathing-custom 4s ease-in-out infinite;
        }
        .particle-custom {
            position: absolute;
            background: var(--color-primary);
            border-radius: 50%;
            pointer-events: none;
        }
        .circular-waveform-container {
            position: relative;
            width: 280px;
            height: 280px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .circular-bar {
            position: absolute;
            bottom: 50%;
            left: 50%;
            width: 4px;
            border-radius: 99px;
            background: var(--color-primary);
            transform-origin: bottom center;
            transition: height 0.05s ease-out;
        }
      `}} />
      <div className="bg-background text-on-surface font-body-md overflow-hidden h-[100dvh] w-full flex flex-col relative pt-24 pb-6">
        <main className="relative z-20 flex-1 flex flex-col items-center justify-between w-full max-w-[1000px] mx-auto px-4">
          
          <header className="text-center space-y-2 opacity-90 transition-opacity duration-500 mt-2">
            <div className="flex items-center justify-center space-x-3">
              <span 
                className={`w-2.5 h-2.5 rounded-full ${isPaused ? 'bg-outline' : (isMuted && convState === 'idle') ? 'bg-error' : 'bg-primary'}`} 
                style={{ animation: isPaused || (isMuted && convState === 'idle') || convState !== 'listening' ? 'none' : 'pulse-dot-custom 1.5s ease-in-out infinite' }}
              ></span>
              <span className={`font-label-md tracking-[0.2em] uppercase ${isPaused ? 'text-outline' : (isMuted && convState === 'idle') ? 'text-error' : 'text-primary'}`}>
                {getStatusText()}
              </span>
            </div>
            <p className="font-headline text-xl italic text-on-surface-variant">
              {isPaused ? "Ready when you are." : convState === 'idle' ? "Tap the mic icon to resume." : "Go ahead, I'm here for you."}
            </p>
          </header>

          {/* Centered Circular Visualizer & Glowing Orb */}
          <div className={`relative flex items-center justify-center w-full max-w-[320px] max-h-[320px] aspect-square transition-all duration-1000 my-auto ${isPaused ? 'opacity-40 scale-95 grayscale-[50%]' : convState === 'idle' ? 'opacity-70' : 'opacity-100'}`}>
            <div 
              className={`absolute w-40 h-40 rounded-full blur-[50px] animate-breathing-custom transition-colors duration-1000 opacity-40`}
              style={{
                backgroundColor: isPaused ? 'var(--color-outline)' : 'var(--color-primary)'
              }}
            ></div>
            
            <div className="absolute inset-0 pointer-events-none">
              {particles.map(p => (
                <div 
                  key={p.id}
                  className="particle-custom"
                  style={{
                    width: `${p.size}px`,
                    height: `${p.size}px`,
                    opacity: p.opacity,
                    animation: `orbit-custom ${p.duration}s linear infinite`,
                    animationDelay: `-${p.delay}s`,
                    transformOrigin: 'center center'
                  }}
                ></div>
              ))}
            </div>

            {/* Circular Waveform Array */}
            <div className="circular-waveform-container z-20 animate-breathing-custom">
               {bars.map((height, i) => {
                 const angle = (i / NUM_BARS) * 360;
                 // Radius of the circle where bars start
                 const radius = 80; 
                 const opacity = Math.min(1, 0.4 + (height / 60));
                 return (
                   <div 
                     key={i}
                     className="circular-bar"
                     style={{
                       height: `${isPaused || (convState === 'idle' && !isMuted) ? 4 : height}px`,
                       opacity: opacity,
                       transform: `translate(-50%, 0) rotate(${angle}deg) translateY(-${radius}px)`,
                       backgroundColor: isPaused ? 'var(--color-outline)' : 'var(--color-primary)'
                     }}
                   ></div>
                 )
               })}
            </div>
          </div>

          {/* Live Transcript & Response Display */}
          <div className="w-full max-w-lg text-center space-y-3 px-4 h-24 flex flex-col justify-center overflow-hidden">
            <p className="text-on-surface-variant font-body-md italic opacity-70 text-sm truncate">
              {userTranscript ? `"${userTranscript}"` : ""}
            </p>
            <p className="text-on-surface font-body-lg line-clamp-2">
              {agentResponse}
            </p>
          </div>

          <div className="w-full flex flex-col items-center">
            <footer className="flex items-center justify-center space-x-4 md:space-x-8 w-full">
              
              {/* Stop Session Button */}
              <button 
                onClick={handleStopConversation}
                className="flex flex-col items-center justify-center space-y-1.5 group"
                title="End Conversation"
              >
                <div className="w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 active:scale-90 bg-surface-container text-on-surface group-hover:bg-error group-hover:text-on-error border border-outline-variant shadow-sm">
                  <span className="material-symbols-outlined text-[20px]">call_end</span>
                </div>
                <span className="text-[10px] font-label-md uppercase tracking-wider text-on-surface-variant group-hover:text-error transition-colors">End</span>
              </button>

              {/* Central Pause/Resume Toggle */}
              <button 
                onClick={togglePause}
                className={`px-6 h-14 rounded-full shadow-lg flex items-center space-x-2.5 transition-all duration-300 active:scale-95 cursor-pointer ${isPaused ? 'bg-primary text-on-primary hover:bg-primary/90' : 'bg-surface-container-highest text-on-surface border border-outline-variant hover:bg-outline-variant/30'}`}
              >
                <span className="material-symbols-outlined fill" style={{ fontVariationSettings: "'FILL' 1" }}>
                  {isPaused ? 'play_arrow' : 'pause'}
                </span>
                <span className="uppercase tracking-widest text-sm font-label-md">
                  {isPaused ? 'Resume' : 'Pause'}
                </span>
              </button>

              <button 
                onClick={toggleMute}
                disabled={isPaused}
                className="flex flex-col items-center justify-center space-y-1.5 group disabled:opacity-50 disabled:cursor-not-allowed"
                title={isMuted ? "Resume Listening" : "Respond Now / Stop Listening"}
              >
                <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 active:scale-90 border border-outline-variant shadow-sm ${isMuted ? 'bg-surface-container-highest text-on-surface' : 'bg-surface-container text-on-surface group-hover:bg-surface-container-highest'}`}>
                  <span className="material-symbols-outlined text-[20px]">
                    {isMuted ? 'mic_off' : 'mic'}
                  </span>
                </div>
                <span className={`text-[10px] font-label-md uppercase tracking-wider transition-colors text-on-surface-variant`}>
                  {isMuted ? 'Off' : 'Active'}
                </span>
              </button>

            </footer>
          </div>
        </main>
      </div>
    </>
  )
}
