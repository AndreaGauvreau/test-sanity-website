const dateParts = new Intl.DateTimeFormat('en-US', { day: '2-digit', month: 'short', year: 'numeric' })

// « 04 Feb 2026 » : le format des cartes du blog dans le Figma (jour, mois en 3 lettres, année).
// Assemblé à la main : en-GB donnerait l'ordre voulu mais écrit « Sept ».
export const formatDate = (date: string) => {
  const parts = Object.fromEntries(dateParts.formatToParts(new Date(date)).map(({ type, value }) => [type, value]))
  return `${parts.day} ${parts.month} ${parts.year}`
}

// Le temps de lecture est calculé par la requête GROQ ; un texte très court donne 0.
export const formatReadingTime = (minutes: number | null) => `${Math.max(1, minutes ?? 0)} min read`
