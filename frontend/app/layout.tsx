import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { Providers } from './providers'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Maitri — Mental Health Support',
  description: 'Your compassionate AI mental health companion · Hindi & English',
  keywords: 'mental health, AI companion, Hindi, English, therapy, support',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased min-h-screen bg-[#0d0f1a] selection:bg-primary/30 selection:text-primary-foreground`}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}
