'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { startSession, sendMessage, getTranscript } from '../../lib/api'
import MitraCompanion from '../components/MitraCompanion'

interface Message {
  role: 'user' | 'assistant'
  content: string
  is_crisis?: boolean
  helplines?: string[]
  emotion?: string
  emotion_emoji?: string
  rag_used?: boolean
  via?: 'text' | 'voice'
  is_new?: boolean
}

function TypewriterText({ text, animate }: { text: string; animate: boolean }) {
  const [displayed, setDisplayed] = useState(animate ? '' : text)
  
  useEffect(() => {
    if (!animate) {
      setDisplayed(text)
      return
    }
    
    let currentText = ''
    const words = text.split(/(\s+)/)
    let i = 0
    
    const interval = setInterval(() => {
      if (i < words.length) {
        currentText += words[i]
        setDisplayed(currentText)
        i++
      } else {
        clearInterval(interval)
      }
    }, 50)
    
    return () => clearInterval(interval)
  }, [text, animate])

  return <>{displayed}</>
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

  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const initialized = useRef(false)

  const quickReplies = QUICK_REPLIES[language] || QUICK_REPLIES['en-IN']

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('mb_token') : null
    if (!token) { router.replace('/'); return }

    setUsername(localStorage.getItem('mb_username') || 'Friend')
    const handleLangChange = () => {
      const newLang = localStorage.getItem('mb_language') || 'en-IN'
      setLanguage(newLang)
    }
    const handleNewChat = () => {
      localStorage.removeItem('mb_session_id')
      setSessionId(null)
      setMessages([])
      setStarting(true)
      initialized.current = false
      initSession()
    }

    handleLangChange()
    window.addEventListener('mb_language_changed', handleLangChange)
    window.addEventListener('mb_new_chat', handleNewChat)

    if (!initialized.current) {
      initialized.current = true
      initSession()
    }

    return () => {
      window.removeEventListener('mb_language_changed', handleLangChange)
      window.removeEventListener('mb_new_chat', handleNewChat)
    }
  }, [language, router])

  useEffect(() => {
    if (messages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, loading])

  const initSession = async () => {
    try {
      const existingSessionId = localStorage.getItem('mb_session_id')
      if (existingSessionId) {
        try {
          const data = await getTranscript(existingSessionId)
          setSessionId(existingSessionId)
          if (data.messages && data.messages.length > 0) {
            setMessages(data.messages)
            setStarting(false)
            return
          }
        } catch (e) {
          // Invalid session, fallback to new
        }
      }

      const data = await startSession()
      setSessionId(data.session_id)
      localStorage.setItem('mb_session_id', data.session_id)
      setMessages([{ role: 'assistant', content: "Hello. I'm here for you. Would you like to talk about what's been on your mind?" }])
    } catch {
      router.replace('/')
    } finally {
      setStarting(false)
    }
  }

  const handleTextSend = async (text?: string) => {
    const msg = (text || input).trim()
    if (!msg || !sessionId || loading) return
    setInput(''); setLoading(true)
    setMessages(prev => [...prev, { role: 'user', content: msg, via: 'text' }])
    
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    try {
      const data = await sendMessage(sessionId, msg, language)
      setCurrentEmotion(data.emotion || 'Neutral')
      setMessages(prev => [...prev, {
        role: 'assistant', content: data.response,
        is_crisis: data.is_crisis, helplines: data.helplines,
        emotion: data.emotion, rag_used: data.rag_used,
        is_new: true,
      }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Connection issue.' }])
    } finally { setLoading(false) }
  }

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = `${e.target.scrollHeight}px`
  }

  if (starting) return (
    <div className="bg-background text-on-background min-h-screen flex items-center justify-center pt-24">
       <span className="material-symbols-outlined text-4xl text-primary animate-pulse">spa</span>
    </div>
  )

  return (
    <div className="bg-background text-on-surface min-h-screen flex flex-col relative overflow-hidden pt-24">
      {/* Main Content Area */}
      <main className="flex-grow flex flex-col w-full max-w-[1000px] mx-auto px-margin-mobile md:px-margin-desktop">
        
        {/* Conversation Feed */}
        <section className="flex-grow overflow-y-auto pt-8 pb-36 custom-scrollbar w-full relative z-10">
          
          {/* Welcome Info (Bento Style) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-stack-lg animate-fade-up">
            <div className="solid-card p-6 flex flex-col justify-between min-h-[160px]">
              <div className="text-primary mb-2">
                <span className="material-symbols-outlined text-3xl">lightbulb</span>
              </div>
              <div>
                <h3 className="font-headline text-2xl mb-1 text-on-surface">Morning, {username}</h3>
                <p className="font-body-md text-on-surface-variant">
                  I noticed you've been focused on mental wellness. How are you feeling right now?
                </p>
              </div>
            </div>
            
            <div className="solid-card p-6 flex flex-col justify-center">
              <span className="font-label-md text-primary mb-3">CURRENT EMOTIONAL RESILIENCE</span>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary text-2xl">self_improvement</span>
                <span className="font-body-lg text-secondary font-medium">Emotion: {currentEmotion}</span>
              </div>
            </div>
          </div>

          {/* Message List */}
          <div className="space-y-stack-md w-full">
            {messages.map((m, i) => {
              return (
                <div key={i} className="relative group w-full flex flex-col">
                  <div className={`flex flex-col gap-2 ${m.role === 'user' ? 'items-end ml-auto max-w-[85%] md:max-w-[70%]' : 'items-start max-w-[85%] md:max-w-[70%]'}`}>
                    <div 
                      className={
                        m.role === 'user' 
                          ? "user-bubble px-6 py-4" 
                          : "ai-card px-6 py-4"
                      }
                    >
                      <p className="font-body-md leading-relaxed whitespace-pre-wrap text-sm md:text-base">
                        {m.role === 'assistant' ? (
                          <TypewriterText text={m.content} animate={!!m.is_new} />
                        ) : (
                          m.content
                        )}
                      </p>
                      
                      {/* Crisis & Helplines */}
                      {m.is_crisis && m.helplines && m.helplines.length > 0 && (
                        <div className="mt-4 p-4 bg-error-container border border-error/20 rounded-xl">
                          <span className="font-label-sm text-error block mb-2 font-bold">Helpline Information:</span>
                          <ul className="list-disc pl-5 space-y-1 text-xs text-on-error-container">
                            {m.helplines.map((h, hi) => (
                              <li key={hi}>{h}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      {/* RAG metadata badge */}
                      {m.role === 'assistant' && m.rag_used && (
                        <div className="mt-3 flex items-center gap-1 text-[10px] text-primary bg-primary-container px-2 py-0.5 rounded-full w-fit">
                          <span className="material-symbols-outlined text-[12px]">library_books</span>
                          <span>Sanctuary Library Referenced</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}

            {/* Thinking Indicator */}
            {loading && (
              <div className="flex items-center gap-3 text-on-surface-variant ml-4 py-2 animate-pulse w-full max-w-[70%]">
                <span className="font-label-sm uppercase tracking-widest text-[10px]">Mitra is typing</span>
                <div className="flex gap-1">
                  <span className="typing-dot"></span>
                  <span className="typing-dot"></span>
                  <span className="typing-dot"></span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </section>

        {/* Floating Input Layer */}
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-background/90 backdrop-blur-md border-t border-outline-variant/30 pb-stack-md pt-4">
          <div className="max-w-[1000px] mx-auto w-full px-margin-mobile md:px-margin-desktop">
            
            {/* Quick Replies */}
            <div className="flex gap-2 mb-4 overflow-x-auto pb-2 scrollbar-hide">
              {quickReplies.map((q, i) => (
                <button 
                  key={i} 
                  onClick={() => handleTextSend(q.text)} 
                  className="bg-surface-container border border-outline-variant px-5 py-2 rounded-full font-label-md text-primary whitespace-nowrap hover:bg-primary-container hover:text-on-primary-container transition-colors active:scale-95 text-xs shadow-sm cursor-pointer"
                >
                  {q.label}
                </button>
              ))}
            </div>
            
            {/* Input Bar */}
            <div className="solid-card p-2 flex items-center gap-2 border border-outline-variant bg-surface">
              <textarea 
                ref={textareaRef}
                value={input}
                onChange={handleTextareaChange}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleTextSend() } }}
                className="flex-grow bg-transparent border-none focus:ring-0 font-body-md text-on-surface resize-none py-3 px-4 placeholder:text-on-surface-variant max-h-32 focus:outline-none" 
                placeholder="Share your thoughts..." 
                rows={1}
              />
              <div className="flex items-center gap-2 pr-2">
                <button 
                  onClick={() => router.push('/voice')}
                  className="w-12 h-12 rounded-full bg-surface-container-high text-primary flex items-center justify-center hover:bg-primary-container transition-colors active:scale-95 cursor-pointer border border-outline-variant"
                  title="Voice Mode"
                >
                  <span className="material-symbols-outlined">mic</span>
                </button>
                <button 
                  onClick={() => handleTextSend()}
                  disabled={!input.trim() || loading}
                  className="w-12 h-12 rounded-full bg-primary text-on-primary flex items-center justify-center hover:opacity-90 transition-opacity active:scale-95 disabled:opacity-40 cursor-pointer"
                  title="Send Message"
                >
                  <span className="material-symbols-outlined">send</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>


    </div>
  )
}