'use client'

export function Providers({ children }: { children: React.ReactNode }) {
  // HeroUI v3 is atomic and headless-first via React Aria Components.
  // We no longer need a global provider for styles (handled by Tailwind v4).
  return <>{children}</>
}
