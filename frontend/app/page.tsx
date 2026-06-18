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

  useEffect(() => {
    const token = localStorage.getItem('mb_token')
    if (token) {
      router.replace('/consultation')
    }
  }, [router])

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
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
      router.replace('/consultation')
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Authentication failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex w-full h-screen overflow-hidden bg-background text-on-background selection:bg-secondary/30 selection:text-secondary-fixed">
      {/* Left Side: Visual/Sanctuary (60% Desktop, Hidden Mobile) */}
      <section className="hidden lg:flex w-3/5 relative bg-surface-container-lowest items-center justify-center p-margin-desktop overflow-hidden">
        {/* Background gradient/glow effect */}
        <div className="absolute inset-0 bg-gradient-to-br from-surface-container/60 to-surface-container-lowest pointer-events-none"></div>
        {/* Typography Overlay */}
        <div className="z-10 absolute bottom-margin-desktop left-margin-desktop max-w-lg">
          <h1 className="font-headline-xl text-headline-xl text-on-surface mb-stack-sm drop-shadow-sm">
            Welcome to your digital sanctuary.
          </h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant opacity-80">
            A safe, quiet space for reflection and healing.
          </p>
        </div>
      </section>
      
      {/* Right Side: Authentication Form (40% Desktop, 100% Mobile) */}
      <section className="w-full lg:w-2/5 flex flex-col items-center justify-center bg-surface-dim p-margin-mobile md:p-margin-desktop relative z-10 overflow-y-auto">
        {/* Brand Anchor */}
        <div className="w-full max-w-sm mb-stack-lg flex justify-center lg:justify-start">
          <span className="font-headline-lg-mobile text-headline-lg-mobile font-bold text-primary tracking-tight">Maitri</span>
        </div>
        
        {/* Form Container */}
        <div className="w-full max-w-sm flex flex-col space-y-stack-lg">
          {/* Tab Switcher */}
          <div className="flex space-x-unit border-b border-surface-variant pb-unit">
            <button 
              onClick={() => { setMode('login'); setError('') }}
              className={`flex-1 pb-unit font-label-md text-label-md transition-colors ${mode === 'login' ? 'text-primary border-b-2 border-primary' : 'text-on-surface-variant hover:text-on-surface'}`}
            >
              Login
            </button>
            <button 
              onClick={() => { setMode('register'); setError('') }}
              className={`flex-1 pb-unit font-label-md text-label-md transition-colors ${mode === 'register' ? 'text-primary border-b-2 border-primary' : 'text-on-surface-variant hover:text-on-surface'}`}
            >
              Sign up
            </button>
          </div>
          
          {/* Input Fields */}
          <form className="space-y-stack-md" onSubmit={handleSubmit}>
            {mode === 'register' && (
              <div className="flex flex-col space-y-stack-sm animate-fade-up">
                <label className="font-label-sm text-label-sm text-on-surface-variant px-1" htmlFor="username">Username</label>
                <div className="relative flex items-center bg-surface-container rounded-lg focus-aura transition-shadow duration-300">
                  <span className="material-symbols-outlined absolute left-3 text-on-surface-variant">person</span>
                  <input 
                    className="w-full bg-transparent border-none text-on-surface font-body-md text-body-md py-3 pl-10 pr-4 rounded-lg focus:ring-0 placeholder-on-surface-variant/50" 
                    id="username" 
                    placeholder="Choose a username" 
                    type="text"
                    value={form.username}
                    onChange={e => setForm({...form, username: e.target.value})}
                  />
                </div>
              </div>
            )}

            <div className="flex flex-col space-y-stack-sm">
              <label className="font-label-sm text-label-sm text-on-surface-variant px-1" htmlFor="email">Email</label>
              <div className="relative flex items-center bg-surface-container rounded-lg focus-aura transition-shadow duration-300">
                <span className="material-symbols-outlined absolute left-3 text-on-surface-variant">mail</span>
                <input 
                  className="w-full bg-transparent border-none text-on-surface font-body-md text-body-md py-3 pl-10 pr-4 rounded-lg focus:ring-0 placeholder-on-surface-variant/50" 
                  id="email" 
                  placeholder="hello@example.com" 
                  type="email"
                  value={form.email}
                  onChange={e => setForm({...form, email: e.target.value})}
                />
              </div>
            </div>
            
            <div className="flex flex-col space-y-stack-sm">
              <label className="font-label-sm text-label-sm text-on-surface-variant px-1" htmlFor="password">Password</label>
              <div className="relative flex items-center bg-surface-container rounded-lg focus-aura transition-shadow duration-300">
                <span className="material-symbols-outlined absolute left-3 text-on-surface-variant">lock</span>
                <input 
                  className="w-full bg-transparent border-none text-on-surface font-body-md text-body-md py-3 pl-10 pr-10 rounded-lg focus:ring-0 placeholder-on-surface-variant/50" 
                  id="password" 
                  placeholder="••••••••" 
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={e => setForm({...form, password: e.target.value})}
                />
                <button 
                  className="absolute right-3 text-on-surface-variant hover:text-on-surface" 
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  <span className="material-symbols-outlined">{showPassword ? 'visibility' : 'visibility_off'}</span>
                </button>
              </div>
            </div>

            {mode === 'register' && (
              <div className="flex flex-col space-y-stack-sm animate-fade-up">
                <label className="font-label-sm text-label-sm text-on-surface-variant px-1" htmlFor="language">Preferred Language</label>
                <div className="relative flex items-center bg-surface-container rounded-lg focus-aura transition-shadow duration-300">
                  <span className="material-symbols-outlined absolute left-3 text-on-surface-variant">language</span>
                  <select 
                    id="language"
                    value={form.language}
                    onChange={e => setForm({...form, language: e.target.value})}
                    className="w-full bg-transparent border-none text-on-surface font-body-md text-body-md py-3 pl-10 pr-8 rounded-lg focus:ring-0 appearance-none cursor-pointer"
                  >
                    <option value="en-IN" className="bg-surface-container">English</option>
                    <option value="hi-IN" className="bg-surface-container">हिंदी (Hindi)</option>
                    <option value="ta-IN" className="bg-surface-container">தமிழ் (Tamil)</option>
                    <option value="te-IN" className="bg-surface-container">తెలుగు (Telugu)</option>
                  </select>
                  <span className="material-symbols-outlined absolute right-3 text-on-surface-variant pointer-events-none">expand_more</span>
                </div>
              </div>
            )}

            {mode === 'login' && (
              <div className="flex justify-end">
                <a className="font-label-sm text-label-sm text-secondary hover:text-secondary-fixed transition-colors" href="#">Forgot password?</a>
              </div>
            )}

            {error && (
              <div className="px-4 py-3 bg-error/10 border border-error/20 rounded-lg text-error text-xs mb-6 animate-fade-up">
                {error}
              </div>
            )}

            {/* Primary Action */}
            <button 
              className="w-full bg-secondary hover:bg-secondary-container text-on-secondary-container font-label-md text-label-md py-3 rounded-full transition-all duration-300 shadow-[0_0_15px_rgba(76,215,246,0.2)] hover:shadow-[0_0_25px_rgba(76,215,246,0.4)] active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2" 
              type="submit"
              disabled={loading}
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-on-secondary-container" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                  <span>Authenticating...</span>
                </>
              ) : (
                <span>{mode === 'login' ? 'Sign in' : 'Create Account'}</span>
              )}
            </button>
          </form>
          
          {/* Divider */}
          <div className="relative flex items-center py-stack-sm">
            <div className="flex-grow border-t border-surface-variant"></div>
            <span className="flex-shrink-0 mx-4 text-on-surface-variant font-label-sm text-label-sm">or continue with</span>
            <div className="flex-grow border-t border-surface-variant"></div>
          </div>
          
          {/* Social Login */}
          <div className="flex space-x-stack-md">
            <button className="flex-1 flex items-center justify-center space-x-2 py-3 rounded-lg border border-outline-variant/30 surface_glass hover:bg-surface-container-high transition-colors group">
              <svg className="w-5 h-5 text-on-surface group-hover:scale-110 transition-transform" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.748L12.545,10.239z"></path>
              </svg>
              <span className="font-label-md text-label-md text-on-surface">Google</span>
            </button>
            <button className="flex-1 flex items-center justify-center space-x-2 py-3 rounded-lg border border-outline-variant/30 surface_glass hover:bg-surface-container-high transition-colors group">
              <svg className="w-5 h-5 text-on-surface group-hover:scale-110 transition-transform" fill="currentColor" viewBox="0 0 24 24">
                <path d="M16.365 21.424c-1.282 1.34-2.673 1.332-4.14 0.612-1.422-.68-2.637-.668-4.103 0-1.503.73-2.766.726-3.955-.545-6.502-6.953-5.267-15.65 1.558-16.141 1.701-.132 3.033.918 4.015.918 1.002 0 2.607-1.286 4.606-1.077 1.636.145 3.072.825 3.931 2.057-3.484 2.115-2.88 6.551.728 8.006-1.082 2.764-2.787 5.432-4.64 6.17m-1.55-15.82c-.053-2.222 1.674-4.225 3.738-4.604.464 2.45-1.925 4.542-3.738 4.604"></path>
              </svg>
              <span className="font-label-md text-label-md text-on-surface">Apple</span>
            </button>
          </div>
        </div>
        
        {/* Bottom Links */}
        <div className="mt-8 mb-4 lg:absolute lg:bottom-margin-desktop font-label-sm text-label-sm text-on-surface-variant flex space-x-4">
          <a className="hover:text-on-surface transition-colors" href="#">Privacy</a>
          <a className="hover:text-on-surface transition-colors" href="#">Terms</a>
        </div>
      </section>
    </main>
  )
}
