import type { UsageRow } from '@/admin/core/usage/aggregate'

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

/** Statuts de fin d'une demande qui n'a rien modifié : affichés après le texte de la demande. */
const STATUS_NOTES: Readonly<Record<string, string>> = {
  failed: 'Failed',
  stopped: 'Stopped',
  rejected: 'Nothing changed',
  cancelled: 'Cancelled',
}

/**
 * Colonne « Request ». Le journal ne porte pas encore le texte de la demande (contrat AiUsageDoc) : repli sur
 * la page (éditeur) ou « Question » (Ask AI) tant que le champ `request` n'est pas écrit par le moteur.
 */
export function requestText(row: Pick<UsageRow, 'feature' | 'request' | 'page'>): string {
  if (row.request) return row.request
  if (row.feature === 'editor') return row.page ? `Edit on ${row.page}` : 'Edit request'
  return 'Question'
}

export function statusNote(status: string): string | undefined {
  return STATUS_NOTES[status]
}
