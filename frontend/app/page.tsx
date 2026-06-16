'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { login, register } from '../lib/api'

/** 
 * modernised Login Page using HeroUI v3 + Tailwind v4 
 * uses RAC-based components with utility-first accessibility 
 */

// ── Icons ─────────────────────────────────────────────────────────────
const MailIcon = () => (
  <svg className="w-4 h-4 text-text-dim" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
)

const LockIcon = () => (
  <svg className="w-4 h-4 text-text-dim" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
  </svg>
)

const UserIcon = () => (
  <svg className="w-4 h-4 text-text-dim" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
)

const GlobeIcon = () => (
  <svg className="w-4 h-4 text-text-dim" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)

const LANGUAGES = [
  { key: 'en-IN', label: 'English' },
  { key: 'hi-IN', label: 'हिंदी (Hindi)' },
  { key: 'ta-IN', label: 'தமிழ் (Tamil)' },
  { key: 'te-IN', label: 'తెలుగు (Telugu)' },
]

export default function HomePage() {
  const router = useRouter()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [form, setForm] = useState({ username: '', email: '', password: '', language: 'en-IN' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    if (!form.email.trim() || !form.password.trim()) {
      setError('Please enter your email and password')
      return
    }
    setError('')
    setLoading(true)
    try {
      const data = mode === 'login'
        ? await login(form.email, form.password)
        : await register(form.username, form.email, form.password, form.language)
      localStorage.setItem('mb_token', data.access_token)
      localStorage.setItem('mb_username', data.username)
      router.replace('/consultation')
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Authentication failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-bg-dark">
      
      {/* ── Background decoration ─────────────────────────────────── */}
      <div className="orb w-[500px] h-[500px] -top-20 -right-20 bg-secondary/10" />
      <div className="orb w-[400px] h-[400px] -bottom-20 -left-20 bg-primary/10" />
      
      {/* ── Auth Card ────────────────────────────────────────────── */}
      <section className="glass w-full max-w-md p-8 rounded-3xl z-10 animate-fade-up">
        
        {/* Header */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mb-4 bg-linear-to-br from-primary to-secondary shadow-lg shadow-primary/25 animate-pulse-glow">
            🌸
          </div>
          <h1 className="text-4xl font-bold tracking-tight gradient-text">Maitri</h1>
          <p className="text-sm text-text-muted mt-2">Personal AI care in your language</p>
        </div>

        {/* Tab Toggle */}
        <div className="flex bg-surface-dark/50 p-1 rounded-2xl mb-8">
          {(['login', 'register'] as const).map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); setError('') }}
              className={`flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all duration-300 ${
                mode === m 
                  ? 'bg-primary text-white shadow-lg shadow-primary/20' 
                  : 'text-text-muted hover:text-text-bright'
              }`}
            >
              {m === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          ))}
        </div>

        {/* Form Fields */}
        <div className="space-y-4 mb-6">
          {mode === 'register' && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-text-dim px-1">Username</label>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2"><UserIcon /></div>
                <input 
                  type="text"
                  placeholder="Choose a username"
                  value={form.username}
                  onChange={e => setForm({...form, username: e.target.value})}
                  className="w-full h-12 pl-11 pr-4 bg-surface-dark/40 border border-border-dim rounded-2xl text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-text-dim px-1">Email address</label>
            <div className="relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2"><MailIcon /></div>
              <input 
                type="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={e => setForm({...form, email: e.target.value})}
                className="w-full h-12 pl-11 pr-4 bg-surface-dark/40 border border-border-dim rounded-2xl text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-text-dim px-1">Password</label>
            <div className="relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2"><LockIcon /></div>
              <input 
                type="password"
                placeholder="••••••••"
                value={form.password}
                onChange={e => setForm({...form, password: e.target.value})}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                className="w-full h-12 pl-11 pr-4 bg-surface-dark/40 border border-border-dim rounded-2xl text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
          </div>

          {mode === 'register' && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-text-dim px-1">Preferred Language</label>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2"><GlobeIcon /></div>
                <select 
                  value={form.language}
                  onChange={e => setForm({...form, language: e.target.value})}
                  className="w-full h-12 pl-11 pr-8 bg-surface-dark/40 border border-border-dim rounded-2xl text-sm appearance-none transition-all focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary cursor-pointer"
                >
                  {LANGUAGES.map(l => (
                    <option key={l.key} value={l.key} className="bg-surface-dark">{l.label}</option>
                  ))}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-text-dim">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Error Messaging */}
        {error && (
          <div className="px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs mb-6 animate-shake">
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full h-14 bg-linear-to-r from-primary to-primary-600 text-white font-bold rounded-2xl shadow-xl shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed group"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
              Connecting...
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              {mode === 'login' ? 'Sign In to Maitri' : 'Get Started'}
              <svg className="w-5 h-5 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
            </span>
          )}
        </button>

        <p className="text-center text-xs text-text-dim mt-8 leading-relaxed">
          🔒 Secured & Encrypted<br />
          No data sharing · Free forever
        </p>
      </section>
    </main>
  )
}
