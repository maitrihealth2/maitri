import type { Metadata } from 'next'
import { Inter, Plus_Jakarta_Sans } from 'next/font/google'
import { Providers } from './providers'
import TopNav from './components/TopNav'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
})

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-headline',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Maitri — Digital Sanctuary',
  description: 'A safe, quiet space for reflection and healing.',
  keywords: 'mental health, AI companion, therapy, support',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
      </head>
      <body className={`${inter.variable} ${jakarta.variable} font-body antialiased min-h-screen bg-background text-on-background selection:bg-primary-container selection:text-on-primary-container transition-colors duration-300`}>
        <Providers>
          <TopNav />
          {children}
        </Providers>
      </body>
    </html>
  )
}
