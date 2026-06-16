'use client'
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { getHistory, getTranscript } from '../../lib/api'

/**
 * modernised History Page — Next.js 15 + Tailwind 4
 * consistent with Consultation and Login aesthetics
 * premium glass session cards
 */

// ── Icons ─────────────────────────────────────────────────────────────────────
const BackIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
    <path d="m15 18-6-6 6-6" />
  </svg>
)

const NewIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14m-7-7v14" />
  </svg>
)

const ChevronRight = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
    <path d="m9 18 6-6-6-6" />
  </svg>
)

const SessionIcon = ({ crisis }: { crisis?: boolean }) => (
  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl transition-all ${
    crisis ? 'bg-secondary/10 border border-secondary/20 text-secondary shadow-lg shadow-secondary/5' : 'bg-primary/10 border border-primary/20 text-primary shadow-lg shadow-primary/5'
  }`}>
    {crisis ? '🌸' : '💬'}
  </div>
)

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

  // ── Transcript View ───────────────────────────────────────────────────────
  if (selected) return (
    <div className="min-h-screen bg-bg-dark flex flex-col">
      <nav className="fixed top-0 left-0 right-0 h-18 z-50 glass border-b border-white/5 px-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => { setSelected(null); setTranscript(null) }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface-dark/50 border border-white/5 text-text-muted hover:text-text-bright hover:bg-surface-dark transition-all outline-none text-xs font-bold"
          >
            <BackIcon /> Back
          </button>
          <div className="flex flex-col">
            <span className="text-[10px] font-black uppercase tracking-widest text-text-dim">Session Insight</span>
            <span className="text-xs font-bold text-text-muted">{toIST(selected.started_at)}</span>
          </div>
        </div>

        {selected.is_crisis_flagged && (
          <div className="px-3 py-1 rounded-full bg-secondary/10 border border-secondary/20 text-secondary text-[10px] font-black uppercase tracking-wider h-7 flex items-center">
            Emergency Support
          </div>
        )}
      </nav>

      <main className="flex-1 w-full max-w-3xl mx-auto px-6 pt-28 pb-16 space-y-8 overflow-y-auto scrollbar-hide">
        {loadingTranscript && (
          <div className="flex flex-col items-center justify-center gap-4 py-20">
            <svg className="animate-spin h-5 w-5 text-white/50" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
            <p className="text-xs text-text-dim font-bold uppercase tracking-widest">Loading history…</p>
          </div>
        )}

        {!loadingTranscript && transcript?.messages?.length === 0 && (
          <p className="text-center text-text-dim text-sm py-20">This session has no recorded messages.</p>
        )}

        {transcript?.messages?.map((m: any, i: number) => (
          <div 
            key={i} 
            className={`flex gap-4 animate-msg-in ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
          >
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-1 shadow-sm text-sm ${
              m.role === 'user' ? 'bg-primary/10 border border-primary/20 text-primary' : 'bg-linear-to-br from-primary to-secondary text-white'
            }`}>
              {m.role === 'assistant' ? '🌸' : '👤'}
            </div>

            <div className={`flex flex-col gap-1 ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div className={`px-5 py-4 text-sm leading-relaxed max-w-[85%] sm:max-w-md shadow-lg ${
                m.role === 'user' 
                  ? 'bg-primary text-white rounded-2xl rounded-tr-sm' 
                  : 'bg-surface-dark/60 backdrop-blur-md border border-white/10 text-text-bright rounded-2xl rounded-tl-sm'
              }`}>
                {m.role === 'assistant' && (
                  <div className="text-[10px] font-black tracking-widest uppercase mb-1 text-primary">Maitri AI</div>
                )}
                <p className="whitespace-pre-wrap">{m.content}</p>
                <p className={`text-[10px] mt-3 font-bold opacity-40 ${m.role === 'user' ? 'text-white' : 'text-text-dim'}`}>
                  {toIST(m.created_at)}
                </p>
              </div>
            </div>
          </div>
        ))}
      </main>
    </div>
  )

  // ── Session List ──────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-bg-dark flex flex-col">
      <nav className="fixed top-0 left-0 right-0 h-18 z-50 glass border-b border-white/5 px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xl bg-surface-dark border border-white/10">🌸</div>
          <h1 className="text-xl font-bold tracking-tight gradient-text">Your History</h1>
        </div>

        <button 
          onClick={() => router.push('/consultation')}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-linear-to-r from-primary to-primary-600 text-white shadow-lg shadow-primary/20 hover:scale-[1.03] transition-all font-bold text-xs uppercase tracking-tight outline-none"
        >
          <NewIcon /> New Voice Session
        </button>
      </nav>

      <main className="flex-1 w-full max-w-2xl mx-auto px-6 pt-28 pb-12">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-4 py-20">
            <svg className="animate-spin h-5 w-5 text-white/50" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
            <p className="text-xs text-text-dim font-bold uppercase tracking-widest">Retrieving sessions…</p>
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-6 animate-fade-up">
            <div className="w-20 h-20 bg-surface-dark/50 border border-white/5 rounded-3xl flex items-center justify-center text-4xl shadow-2xl">🌸</div>
            <div className="text-center">
              <h2 className="text-xl font-bold text-text-bright">No whispers yet</h2>
              <p className="text-sm text-text-dim mt-2">Start your journey with Maitri to see your progress here.</p>
            </div>
            <button 
              onClick={() => router.push('/consultation')}
              className="px-6 py-3 bg-linear-to-r from-primary to-secondary text-white font-bold rounded-2xl shadow-xl shadow-primary/20 hover:scale-105 transition-all outline-none"
            >
              Begin Session →
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <header className="flex items-center justify-between px-2 mb-6">
              <span className="text-[11px] font-black uppercase tracking-[0.2em] text-text-dim opacity-60">Memory Bank · {sessions.length} sessions</span>
            </header>

            {sessions.map(s => (
              <div
                key={s.session_id}
                onClick={() => openSession(s)}
                className="group flex items-center justify-between p-5 bg-surface-dark/40 border border-white/5 rounded-3xl hover:bg-surface-hover/60 hover:border-primary/20 hover:-translate-y-1 transition-all duration-300 cursor-pointer shadow-sm hover:shadow-2xl hover:shadow-primary/5 active:scale-[0.98]"
              >
                <div className="flex items-center gap-5">
                  <SessionIcon crisis={s.is_crisis_flagged} />
                  <div className="space-y-1.5">
                    <p className="text-sm font-bold text-text-bright group-hover:text-primary transition-colors">{toIST(s.started_at)}</p>
                    <div className="flex items-center gap-2">
                       <span className={`text-[10px] uppercase font-black tracking-widest px-2 py-0.5 rounded-md ${
                         s.is_crisis_flagged ? 'bg-secondary/10 text-secondary' : 'bg-primary/10 text-primary'
                       }`}>
                         {s.is_crisis_flagged ? 'Crisis Protocol' : s.channel || 'Voice'}
                       </span>
                       <span className="text-[11px] text-text-dim font-medium tracking-tight">
                         {s.is_crisis_flagged ? 'Emergency Support Provided' : 'Session Completed'}
                       </span>
                    </div>
                  </div>
                </div>
                <div className="text-text-dim group-hover:text-primary group-hover:translate-x-1 transition-all">
                  <ChevronRight />
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
