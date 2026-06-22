'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getHistory } from '../../lib/api'

interface Session {
  session_id: string
  started_at: string
  ended_at: string | null
  is_crisis_flagged: boolean
  channel: string
}

export default function HistoryPage() {
  const router = useRouter()
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('mb_token') : null
    if (!token) {
      router.replace('/')
      return
    }

    const fetchHistory = async () => {
      try {
        const data = await getHistory()
        setSessions(data)
      } catch (err) {
        console.error("Failed to fetch history", err)
      } finally {
        setLoading(false)
      }
    }

    fetchHistory()
  }, [router])

  const handleSessionClick = (sessionId: string) => {
    localStorage.setItem('mb_session_id', sessionId)
    router.push('/consultation')
  }

  const handleNewChat = () => {
    localStorage.removeItem('mb_session_id')
    router.push('/consultation')
  }

  return (
    <div className="min-h-screen bg-background font-body-md text-on-surface pt-24 pb-12 px-4 md:px-8">
      <main className="w-full max-w-3xl mx-auto flex flex-col space-y-8">
        <header className="flex flex-col md:flex-row items-center justify-between space-y-4 md:space-y-0">
          <div>
            <h1 className="text-3xl font-headline tracking-tight text-primary">Conversation History</h1>
            <p className="text-on-surface-variant mt-2 text-sm">Review your past sessions or start a new one.</p>
          </div>
          <button 
            onClick={handleNewChat}
            className="flex items-center space-x-2 bg-primary text-on-primary px-6 py-3 rounded-full hover:bg-primary/90 transition-colors shadow-sm font-label-md uppercase tracking-wider text-sm"
          >
            <span className="material-symbols-outlined text-[20px]">add</span>
            <span>New Chat</span>
          </button>
        </header>

        {loading ? (
          <div className="flex justify-center py-20">
            <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-20 bg-surface-container rounded-3xl border border-outline-variant/30">
            <p className="text-on-surface-variant italic">No previous conversations found.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {sessions.map((session) => (
              <button
                key={session.session_id}
                onClick={() => handleSessionClick(session.session_id)}
                className="w-full text-left bg-surface-container hover:bg-surface-container-highest transition-colors rounded-2xl p-6 border border-outline-variant/50 shadow-sm flex items-center justify-between group"
              >
                <div className="flex flex-col space-y-1">
                  <span className="font-label-md text-primary tracking-wide text-sm flex items-center space-x-2">
                    <span className="material-symbols-outlined text-[18px]">forum</span>
                    <span>Session</span>
                  </span>
                  <span className="text-on-surface text-lg">
                    {new Date(session.started_at).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                  </span>
                  <span className="text-on-surface-variant text-sm">
                    {new Date(session.started_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className="flex items-center space-x-4">
                  {session.is_crisis_flagged && (
                    <span className="bg-error-container text-on-error-container text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                      Flagged
                    </span>
                  )}
                  <span className="material-symbols-outlined text-outline group-hover:text-primary transition-colors">
                    arrow_forward_ios
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
