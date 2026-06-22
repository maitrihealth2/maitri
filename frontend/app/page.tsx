'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { login, register } from '../lib/api'

export default function HomePage() {
  const router = useRouter()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [form, setForm] = useState({ username: '', email: '', password: '', language: 'en-IN' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!form.email.trim() || !form.password.trim() || (mode === 'register' && !form.username.trim())) {
      setError('Please fill in all required fields')
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
      localStorage.setItem('mb_language', mode === 'register' ? form.language : 'en-IN')
      localStorage.removeItem('mb_session_id')
      router.replace('/consultation')
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Authentication failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-background text-on-background px-6 pt-16">
      
      {/* Centered Auth Container */}
      <div className="w-full max-w-[440px] animate-fade-up">
        
        {/* Auth Card */}
        <div className="solid-card p-8 md:p-12 flex flex-col items-center relative overflow-hidden">
          
          {/* Subtle accent line top */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-primary"></div>

          {/* Branding */}
          <div className="mb-10 w-full flex flex-col items-center">
            <span className="material-symbols-outlined text-primary text-4xl mb-3">spa</span>
            <h1 className="font-headline text-3xl font-bold tracking-tight text-on-surface text-center">
              {mode === 'login' ? 'Welcome Back' : 'Join Maitri'}
            </h1>
            <p className="font-body-md text-on-surface-variant text-center mt-2">
              {mode === 'login' ? 'Take a deep breath and reconnect.' : 'Create a safe space for your reflection.'}
            </p>
          </div>

          {/* Auth Form */}
          <form className="w-full space-y-5" onSubmit={handleSubmit}>
            {mode === 'register' && (
              <div className="space-y-1.5">
                <label className="font-label-md text-on-surface-variant block">Username</label>
                <input 
                  className="w-full bg-surface-container-low border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary rounded-xl px-4 py-3 transition-colors font-body-md text-on-surface focus:outline-none"
                  placeholder="Choose a username" 
                  type="text"
                  value={form.username}
                  onChange={e => setForm({ ...form, username: e.target.value })}
                  required
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label className="font-label-md text-on-surface-variant block">Email Address</label>
              <input 
                className="w-full bg-surface-container-low border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary rounded-xl px-4 py-3 transition-colors font-body-md text-on-surface focus:outline-none"
                placeholder="example@peace.com" 
                type="email"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="font-label-md text-on-surface-variant">Password</label>
                {mode === 'login' && (
                  <a className="font-label-md text-primary hover:underline text-xs" href="#">Forgot?</a>
                )}
              </div>
              <div className="relative">
                <input 
                  className="w-full bg-surface-container-low border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary rounded-xl px-4 py-3 pr-12 transition-colors font-body-md text-on-surface focus:outline-none"
                  placeholder="••••••••" 
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  required
                />
                <button 
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-primary transition-colors flex items-center" 
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  <span className="material-symbols-outlined text-[20px]">
                    {showPassword ? 'visibility' : 'visibility_off'}
                  </span>
                </button>
              </div>
            </div>

            {mode === 'register' && (
              <div className="space-y-1.5">
                <label className="font-label-md text-on-surface-variant block">Preferred Language</label>
                <select 
                  value={form.language}
                  onChange={e => setForm({ ...form, language: e.target.value })}
                  className="w-full bg-surface-container-low border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary rounded-xl px-4 py-3 transition-colors font-body-md text-on-surface focus:outline-none cursor-pointer appearance-none"
                >
                  <option value="en-IN">English</option>
                  <option value="hi-IN">हिन्दी</option>
                  <option value="ta-IN">தமிழ்</option>
                  <option value="te-IN">తెలుగు</option>
                </select>
              </div>
            )}

            {error && (
              <div className="px-4 py-3 bg-error-container border border-error/20 rounded-xl text-on-error-container text-sm">
                {error}
              </div>
            )}

            <button 
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-on-primary rounded-xl py-3.5 font-label-md hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center mt-6 cursor-pointer"
            >
              {loading ? 'Entering Sanctuary...' : 'Continue to Sanctuary'}
            </button>
          </form>

          {/* Signup Toggle */}
          <p className="mt-8 font-body-md text-on-surface-variant text-sm">
            {mode === 'login' ? 'New to Maitri? ' : 'Already have an account? '}
            <button 
              type="button" 
              onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}
              className="text-primary font-medium hover:underline transition-all cursor-pointer focus:outline-none"
            >
              {mode === 'login' ? 'Create account' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>
    </main>
  )
}
