'use client'

import { useEffect, useState } from 'react'

/**
 * Horloge des textes relatifs (« 5 min ago ») : relue toutes les 30 s. Les éléments qui l'affichent posent
 * `suppressHydrationWarning` (le rendu serveur a pu se faire une minute plus tôt, ou dans un autre fuseau).
 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}
