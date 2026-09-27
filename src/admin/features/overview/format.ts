import { formatCost, formatIncluded, formatTokens, type PublishStatus } from '@/admin/core/contracts'

/**
 * Textes des cartes de B1 (Figma 359:696 et LLM context B1 « ÉTATS ET CAS LIMITES »). PUR.
 * Les heures sont formatées dans le fuseau donné (navigateur côté client, serveur au premier rendu).
 */

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** « just now », « 5 min ago », « 2 h ago », « yesterday », « 3 days ago », « Sep 12 ». */
export function formatAgo(iso: string, now: number, timeZone?: string): string {
  const at = Date.parse(iso)
  if (Number.isNaN(at)) return ''
  const diff = Math.max(0, now - at)
  if (diff < MINUTE) return 'just now'
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} min ago`
  if (diff < DAY) return `${Math.floor(diff / HOUR)} h ago`
  const days = calendarDaysBetween(at, now, timeZone)
  if (days <= 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone }).format(at)
}

/** « today 14:02 », « yesterday 09:10 », « Sep 12, 14:02 » (sans « deployed »). */
export function formatDayTime(iso: string, now: number, timeZone?: string): string {
  const at = Date.parse(iso)
  if (Number.isNaN(at)) return ''
  const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone }).format(at)
  const days = calendarDaysBetween(at, now, timeZone)
  if (days <= 0) return `today ${time}`
  if (days === 1) return `yesterday ${time}`
  return `${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone }).format(at)}, ${time}`
}

function dayKey(ms: number, timeZone?: string): number {
  const parts = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone }).format(ms)
  return Date.parse(`${parts}T00:00:00Z`)
}

function calendarDaysBetween(from: number, to: number, timeZone?: string): number {
  return Math.round((dayKey(to, timeZone) - dayKey(from, timeZone)) / DAY)
}

// ─── Cartes ─────────────────────────────────────────────────────────────────

export type TimeFormat = 'ago' | 'day-time'

/** Texte d'aide : texte fixe, ou préfixe + heure rendue en direct côté client. */
export type CardHint = { text: string } | { prefix: string; iso: string; format: TimeFormat; suffix?: string }

export type CardTone = 'default' | 'working' | 'error' | 'muted'

export type CardModel = { value: string; hint: CardHint; tone: CardTone }

export function hintText(hint: CardHint, now: number, timeZone?: string): string {
  if ('text' in hint) return hint.text
  const time = hint.format === 'ago' ? formatAgo(hint.iso, now, timeZone) : formatDayTime(hint.iso, now, timeZone)
  return `${hint.prefix}${time}${hint.suffix ?? ''}`
}

function provider(status: PublishStatus): string {
  return status.deploy.mode === 'vercel-hook' ? 'Vercel' : 'Local mode'
}

/**
 * Production : « Ready · Vercel · deployed today 14:02 » ; publication en cours : « Building… » ;
 * échec : « Error », la version précédente reste en ligne (lien vers E2). Moteur injoignable : « Unavailable ».
 */
export function productionCard(status: PublishStatus | null): CardModel {
  if (!status) return { value: 'Unavailable', hint: { text: 'The publishing engine isn’t responding.' }, tone: 'muted' }
  if (status.state === 'publishing') {
    return status.run
      ? { value: 'Building…', hint: { prefix: `${provider(status)} · started `, iso: status.run.startedAt, format: 'day-time' }, tone: 'working' }
      : { value: 'Building…', hint: { text: `${provider(status)} · publishing` }, tone: 'working' }
  }
  if (status.state === 'failed') {
    return { value: 'Error', hint: { text: 'Publish failed · the previous version is still live' }, tone: 'error' }
  }
  if (!status.lastPublishedAt) return { value: 'Ready', hint: { text: `${provider(status)} · no publication from the admin yet` }, tone: 'default' }
  return { value: 'Ready', hint: { prefix: `${provider(status)} · deployed `, iso: status.lastPublishedAt, format: 'day-time' }, tone: 'default' }
}

/** Content : « 3 changes · Unpublished · last publish 5 min ago » ; rien en attente : « Up to date ». */
export function contentCard(status: PublishStatus | null): CardModel {
  if (!status) return { value: '—', hint: { text: 'Couldn’t read the pending changes.' }, tone: 'muted' }
  const n = status.pending.total
  const last = status.lastPublishedAt
  if (n > 0) {
    const value = `${n} ${n === 1 ? 'change' : 'changes'}`
    return last
      ? { value, hint: { prefix: 'Unpublished · last publish ', iso: last, format: 'ago' }, tone: 'default' }
      : { value, hint: { text: 'Unpublished · never published' }, tone: 'default' }
  }
  return last
    ? { value: 'Up to date', hint: { prefix: 'Last publish ', iso: last, format: 'ago' }, tone: 'default' }
    : { value: 'Up to date', hint: { text: 'Nothing published from the admin yet' }, tone: 'default' }
}

/** Empreinte de ce qui change les cartes Production / Content (rafraîchissement après une publication). */
export function publishFingerprint(status: Pick<PublishStatus, 'state' | 'lastPublishedAt' | 'pending'> | null): string {
  if (!status) return 'none'
  return `${status.state}|${status.lastPublishedAt ?? ''}|${status.pending.total}`
}

/**
 * Totaux du mois (`UsageSummary.totals` de core/usage) : `costUsd` = coût FACTURÉ seulement (clé API) ; `includedUsd`
 * = demandes passées par l'abonnement Claude (prix de l'API, non facturées).
 */
export type UsageTotals = { inputTokens: number; outputTokens: number; costUsd: number; includedUsd?: number }

/**
 * AI usage this month : « $4.80 · 1.2M input · 147k output tokens » (coût facturé, mêmes chiffres que B5) ; avec
 * l'abonnement Claude : « … output tokens · ≈ $0.30 at API prices — included in your Claude subscription » ; aucune
 * demande : « $0.00 · 0 input · 0 output tokens ».
 */
export function usageCard(totals: UsageTotals | null | 'unavailable'): CardModel {
  if (totals === 'unavailable') return { value: '—', hint: { text: 'Usage isn’t available yet.' }, tone: 'muted' }
  const t = totals ?? { inputTokens: 0, outputTokens: 0, costUsd: 0 }
  const tokens = `${formatTokens(t.inputTokens)} input · ${formatTokens(t.outputTokens)} output tokens`
  const included = t.includedUsd ?? 0
  return {
    value: formatCost(t.costUsd),
    hint: { text: included > 0 ? `${tokens} · ${formatIncluded(included)}` : tokens },
    tone: 'default',
  }
}
