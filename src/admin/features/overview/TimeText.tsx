'use client'

import { useEffect, useState } from 'react'

import { formatAgo, formatDayTime, type TimeFormat } from './format'

/**
 * Heure d'une carte de B1, recalculée dans le fuseau du navigateur puis chaque minute (« 5 min ago » vieillit).
 * Premier rendu : le texte du serveur (`initial`), pour éviter un saut ; `suppressHydrationWarning` couvre l'écart
 * de fuseau entre serveur et navigateur.
 */
export function TimeText({ iso, format, initial }: { iso: string; format: TimeFormat; initial: string }) {
  const [text, setText] = useState(initial)
  useEffect(() => {
    const update = () => setText(format === 'ago' ? formatAgo(iso, Date.now()) : formatDayTime(iso, Date.now()))
    update()
    const timer = window.setInterval(update, 60_000)
    return () => window.clearInterval(timer)
  }, [iso, format])
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {text}
    </time>
  )
}
