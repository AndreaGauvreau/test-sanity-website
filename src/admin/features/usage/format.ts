import { formatTokens } from '@/admin/core/contracts/format'
import type { UsageRow, UsageSummary } from '@/admin/core/usage/aggregate'

/**
 * Formats de B5 (purs, testés). Dates en anglais (interface de l'admin), dans le fuseau donné (défaut : celui du
 * serveur qui rend la page).
 */

function parts(date: Date, timeZone?: string) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}`
}

/**
 * Colonne « When » (Figma B5) : « Today 14:12 », « Yesterday », « Sep 24 », et l'année quand elle diffère
 * (« Dec 30, 2025 »).
 */
export function formatWhen(iso: string, now: Date, timeZone?: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  const day = parts(date, timeZone)
  if (day === parts(now, timeZone)) {
    const time = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(date)
    return `Today ${time}`
  }
  if (day === parts(new Date(now.getTime() - 86_400_000), timeZone)) return 'Yesterday'
  const sameYear = day.slice(0, 4) === parts(now, timeZone).slice(0, 4)
  return new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) }).format(date)
}

/** « Sep 2, 2026 » (carte Since launch). */
export function formatDay(iso: string, timeZone?: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

/** Date seule (« 2026-09-02 ») : un jour civil, lu en UTC pour ne pas reculer d'un jour à l'ouest de Greenwich. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/**
 * Indice de la carte « Since launch » (Figma B5) : « 4.9M input · 560k output tokens · online since Sep 2, 2026 ».
 * `launchedAt` = `adminConfig.site.launchedAt` (date de mise en ligne, ISO) ; absente ou invalide → repli sur la date
 * de la première demande (« since Sep 10, 2026 »). Sans demande : « No AI requests yet. » (+ la mise en ligne si connue).
 */
export function sinceLaunchHint(
  allTime: Pick<UsageSummary, 'requests' | 'totals' | 'since'>,
  launchedAt?: string,
  timeZone?: string,
): string {
  const launched = launchedAt ? formatDay(launchedAt, DATE_ONLY.test(launchedAt) ? 'UTC' : timeZone) : ''
  if (allTime.requests === 0) return launched ? `No AI requests yet · online since ${launched}` : 'No AI requests yet.'
  const tokens = `${formatTokens(allTime.totals.inputTokens)} input · ${formatTokens(allTime.totals.outputTokens)} output tokens`
  if (launched) return `${tokens} · online since ${launched}`
  const first = allTime.since ? formatDay(allTime.since, timeZone) : ''
  return first ? `${tokens} · since ${first}` : tokens
}

/** Statuts de fin d'une demande qui n'a rien modifié : affichés après le texte de la demande. */
const STATUS_NOTES: Readonly<Record<string, string>> = {
  failed: 'Failed',
  stopped: 'Stopped',
  rejected: 'Nothing changed',
  cancelled: 'Cancelled',
}

/**
 * Colonne « Request » : le texte de la demande (`AiUsageDoc.request`, écrit par le moteur). Repli pour les demandes
 * journalisées sans ce champ (anciennes, ou moteur pas encore à jour) : la page (éditeur) ou « Question » (Ask AI).
 */
export function requestText(row: Pick<UsageRow, 'feature' | 'request' | 'page'>): string {
  if (row.request) return row.request
  if (row.feature === 'editor') return row.page ? `Edit on ${row.page}` : 'Edit request'
  return 'Question'
}

export function statusNote(status: string): string | undefined {
  return STATUS_NOTES[status]
}
