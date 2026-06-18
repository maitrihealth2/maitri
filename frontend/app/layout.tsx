import type { Metadata } from 'next'
import { Inter, EB_Garamond, Public_Sans } from 'next/font/google'
import { Providers } from './providers'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
})

const ebGaramond = EB_Garamond({
  subsets: ['latin'],
  variable: '--font-headline',
  display: 'swap',
})

const publicSans = Public_Sans({
  subsets: ['latin'],
  variable: '--font-label',
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
      <body className={`${inter.variable} ${ebGaramond.variable} ${publicSans.variable} font-body antialiased min-h-screen bg-surface-container-low text-on-surface selection:bg-primary-container selection:text-on-primary-container`}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}
