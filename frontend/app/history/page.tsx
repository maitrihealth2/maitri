'use client'
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { getHistory, getTranscript } from '../../lib/api'

// ── Helpers ───────────────────────────────────────────────────────────────────
const toIST = (d: string) => {
  try {
    const ist = new Date(new Date(d).getTime() + 5.5 * 60 * 60 * 1000)
    return ist.toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    }) + ' IST'
  } catch {
    return d
  }
}

export default function HistoryPage() {
  const router = useRouter()
  const [sessions, setSessions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<any | null>(null)
  const [transcript, setTranscript] = useState<any | null>(null)
  const [loadingTranscript, setLoadingTranscript] = useState(false)

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('mb_token') : null
    if (!token) { router.replace('/'); return }
    
    getHistory()
      .then(data => {
        const seen = new Set<string>()
        const filtered = data.filter((s: any) => {
          if (seen.has(s.session_id)) return false
          seen.add(s.session_id); return true
        })
        setSessions(filtered)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const openSession = async (s: any) => {
    setSelected(s)
    setLoadingTranscript(true)
    setTranscript(null)
    try { 
      const data = await getTranscript(s.session_id)
      setTranscript(data) 
    } catch { 
      setTranscript({ messages: [] }) 
    } finally { 
      setLoadingTranscript(false) 
    }
  }

  return (
    <div className="bg-background text-on-background font-body-md h-screen flex flex-col overflow-hidden selection:bg-secondary/30 selection:text-secondary-fixed">
      {/* Top Navbar */}
      <header className="fixed top-0 left-0 w-full z-50 flex justify-between items-center px-gutter py-4 bg-surface/80 backdrop-blur-xl shadow-none border-b border-outline-variant/20">
        <div className="flex items-center gap-2 cursor-pointer hover:bg-surface-container-highest transition-colors duration-200 p-2 rounded-lg" onClick={() => router.push('/consultation')}>
          <span className="font-headline-lg text-headline-lg font-bold tracking-tight text-primary dark:text-primary-fixed-dim">Maitri</span>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/consultation')} className="px-4 py-2 bg-secondary hover:bg-secondary-container text-on-secondary-container font-label-md text-label-md rounded-full shadow-[0_0_15px_rgba(76,215,246,0.2)] transition-all active:scale-95 flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">add</span>
            <span className="hidden sm:inline">New Session</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex h-screen pt-[72px]">
        {/* Left Pane (Sidebar List) */}
        <aside className={`w-full lg:w-[380px] flex-shrink-0 border-r border-outline-variant/20 bg-surface-dim flex flex-col transition-all duration-300 relative z-10 ${selected ? 'hidden lg:flex' : 'flex'}`}>
          <div className="p-gutter border-b border-outline-variant/10">
            <h2 className="font-headline-md text-headline-md text-on-surface">Journey History</h2>
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-10 opacity-50">
                <span className="material-symbols-outlined animate-spin text-3xl text-primary">progress_activity</span>
                <p className="mt-2 text-sm text-on-surface-variant">Loading records...</p>
              </div>
            ) : sessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 opacity-50 text-center px-4">
                <span className="material-symbols-outlined text-4xl mb-2 text-on-surface-variant">history_toggle_off</span>
                <p className="text-on-surface-variant text-sm">No history found.<br/>Start a session to see it here.</p>
              </div>
            ) : (
              sessions.map((s) => (
                <div 
                  key={s.session_id}
                  onClick={() => openSession(s)}
                  className={`p-4 rounded-2xl cursor-pointer transition-all duration-200 border group ${
                    selected?.session_id === s.session_id 
                      ? 'bg-surface-container-high border-secondary/30 shadow-[0_0_10px_rgba(76,215,246,0.1)]' 
                      : 'bg-surface-container border-transparent hover:bg-surface-container-high hover:border-outline-variant/30'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[16px] ${
                        s.is_crisis_flagged ? 'bg-error/20 text-error' : 'bg-primary/20 text-primary'
                      }`}>
                        <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
                          {s.is_crisis_flagged ? 'emergency' : 'forum'}
                        </span>
                      </div>
                      <span className="font-label-md text-label-md text-on-surface">
                        {toIST(s.started_at).split(' ')[0]} {toIST(s.started_at).split(' ')[1]}
                      </span>
                    </div>
                    <span className="text-xs text-on-surface-variant opacity-60">
                      {toIST(s.started_at).split(' ').slice(2).join(' ')}
                    </span>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant line-clamp-2 pl-10">
                    {s.is_crisis_flagged ? 'Crisis Protocol Activated' : 'Consultation Session'}
                  </p>
                </div>
              ))
            )}
          </div>
        </aside>

        {/* Right Pane (Transcript) */}
        <section className={`flex-1 bg-surface-container-lowest flex flex-col relative z-0 ${!selected ? 'hidden lg:flex' : 'flex'}`}>
          {!selected ? (
            <div className="flex-1 flex flex-col items-center justify-center opacity-40">
              <span className="material-symbols-outlined text-6xl mb-4 text-primary">search_insights</span>
              <p className="font-body-lg text-body-lg">Select a session to view the transcript</p>
            </div>
          ) : (
            <>
              {/* Transcript Header */}
              <div className="p-gutter border-b border-outline-variant/10 bg-surface/50 backdrop-blur-md flex items-center gap-4 shrink-0">
                <button 
                  className="lg:hidden w-10 h-10 flex items-center justify-center rounded-full hover:bg-surface-container transition-colors"
                  onClick={() => setSelected(null)}
                >
                  <span className="material-symbols-outlined">arrow_back</span>
                </button>
                <div>
                  <h3 className="font-headline-sm text-headline-sm text-on-surface">Session Details</h3>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">{toIST(selected.started_at)}</p>
                </div>
                {selected.is_crisis_flagged && (
                  <div className="ml-auto px-3 py-1 bg-error/10 text-error rounded-full text-xs font-bold border border-error/20 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">warning</span>
                    Emergency
                  </div>
                )}
              </div>
              
              {/* Transcript Body */}
              <div className="flex-1 overflow-y-auto p-gutter space-y-stack-md custom-scrollbar">
                {loadingTranscript ? (
                  <div className="flex flex-col items-center justify-center py-20 opacity-50">
                    <span className="material-symbols-outlined animate-spin text-3xl text-primary">progress_activity</span>
                    <p className="mt-2 text-sm text-on-surface-variant">Loading transcript...</p>
                  </div>
                ) : transcript?.messages?.length === 0 ? (
                  <div className="text-center py-20 text-on-surface-variant">
                    No conversation data for this session.
                  </div>
                ) : (
                  transcript?.messages?.map((m: any, i: number) => (
                    <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-up`} style={{ animationDelay: `${i * 0.05}s` }}>
                      {m.role === 'assistant' && (
                        <div className="w-8 h-8 rounded-full bg-primary-container flex items-center justify-center shrink-0 mt-1 mr-3">
                          <span className="material-symbols-outlined text-[16px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>eco</span>
                        </div>
                      )}
                      <div className={`max-w-[85%] lg:max-w-[70%] p-5 rounded-2xl ${
                        m.role === 'user'
                          ? 'bg-surface-variant/50 border border-outline-variant/20 rounded-tr-sm text-on-surface'
                          : 'bg-surface-container-low/80 backdrop-blur-md border border-primary/10 rounded-tl-sm text-on-surface shadow-sm'
                      }`}>
                        <p className="font-body-md text-body-md whitespace-pre-wrap">{m.content}</p>
                        <div className={`text-[10px] mt-2 opacity-50 ${m.role === 'user' ? 'text-right' : 'text-left'}`}>
                          {toIST(m.created_at)}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  )
}
