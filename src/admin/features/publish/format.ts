/**
 * Formats de la publication (E1, E2, G3). PUR : aucune dépendance React / Next, testé.
 * Textes en anglais recopiés du Figma : « 12 min ago », « Today 09:10 · Andrea », « Sep 26, 2026 · 09:10 »,
 * « 3 changes waiting · last validated 5 min ago », « Publish 3 changes ».
 *
 * Les heures sont formatées dans le fuseau du NAVIGATEUR (pas de fuseau imposé) : les composants qui les affichent
 * posent `suppressHydrationWarning` (le serveur peut être en UTC).
 */

const MINUTE = 60_000
const HOUR = 60 * MINUTE

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

function toDate(value: string | number | Date): Date {
  return value instanceof Date ? value : new Date(value)
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

/** « 14:32 » (24 h, heure locale). */
export function formatClock(value: string | number | Date): string {
  const d = toDate(value)
  if (Number.isNaN(d.getTime())) return ''
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/** « Sep 24 » (même année) ou « Sep 24, 2025 ». */
export function formatShortDate(value: string | number | Date, now: number | Date = Date.now()): string {
  const d = toDate(value)
  if (Number.isNaN(d.getTime())) return ''
  const n = toDate(now)
  const base = `${MONTHS[d.getMonth()]} ${d.getDate()}`
  return d.getFullYear() === n.getFullYear() ? base : `${base}, ${d.getFullYear()}`
}

/**
 * Temps écoulé pour les listes de E1 : « just now », « 5 min ago », « 2 h ago », puis « Sep 24 ».
 * Une date future (horloges décalées) compte comme « just now ».
 */
export function formatRelative(value: string | number | Date, now: number | Date = Date.now()): string {
  const d = toDate(value)
  if (Number.isNaN(d.getTime())) return ''
  const diff = toDate(now).getTime() - d.getTime()
  if (diff < MINUTE) return 'just now'
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} min ago`
  if (diff < 24 * HOUR) return `${Math.floor(diff / HOUR)} h ago`
  return formatShortDate(d, now)
}

/**
 * Date d'une version dans la liste de E2 (Figma : « 2 h ago », « Today 09:10 », « Sep 24 ») :
 * moins de 3 h → relatif ; même jour → « Today HH:MM » ; la veille → « Yesterday HH:MM » ; sinon la date.
 */
export function formatVersionWhen(value: string | number | Date, now: number | Date = Date.now()): string {
  const d = toDate(value)
  if (Number.isNaN(d.getTime())) return ''
  const n = toDate(now)
  const diff = n.getTime() - d.getTime()
  if (diff < 3 * HOUR) return formatRelative(d, n)
  if (sameDay(d, n)) return `Today ${formatClock(d)}`
  const yesterday = new Date(n.getFullYear(), n.getMonth(), n.getDate() - 1)
  if (sameDay(d, yesterday)) return `Yesterday ${formatClock(d)}`
  return formatShortDate(d, n)
}

/** « Sep 26, 2026 · 09:10 » (fiche de version, E2). */
export function formatDateTime(value: string | number | Date): string {
  const d = toDate(value)
  if (Number.isNaN(d.getTime())) return ''
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} · ${formatClock(d)}`
}

/** « 1 change » / « 3 changes ». */
export function pluralChanges(count: number): string {
  return `${count} change${count === 1 ? '' : 's'}`
}

/** Libellé du bouton de E1 : « Publish 3 changes » ; sans rien en attente : « Publish ». */
export function publishButtonLabel(count: number): string {
  return count > 0 ? `Publish ${pluralChanges(count)}` : 'Publish'
}

/** Onglet de E1 : « Pending (3) ». */
export function pendingTabLabel(count: number): string {
  return `Pending (${count})`
}

/**
 * Méta de l'en-tête « Publish » (E1, E2) : « 3 changes waiting · last validated 5 min ago »,
 * « 1 change waiting », ou « Everything is published. ».
 */
export function pendingHeaderMeta(count: number, lastValidatedAt: string | undefined, now: number | Date = Date.now()): string {
  if (count <= 0) return 'Everything is published.'
  const waiting = `${pluralChanges(count)} waiting`
  const validated = lastValidatedAt ? formatRelative(lastValidatedAt, now) : ''
  return validated ? `${waiting} · last validated ${validated}` : waiting
}

/** Méta d'une ligne de contenu : « “Dock scheduling, solved.” · Marie · 12 min ago ». */
export function contentItemMeta(item: { summary: string; author?: string; updatedAt: string }, now: number | Date = Date.now()): string {
  return [item.summary, item.author, formatRelative(item.updatedAt, now)].filter(Boolean).join(' · ')
}

/** Méta d'une ligne de design : « AI editor · validated by Marie · 5 min ago ». */
export function designItemMeta(item: { validatedBy: string; validatedAt: string }, now: number | Date = Date.now()): string {
  return ['AI editor', item.validatedBy ? `validated by ${item.validatedBy}` : '', formatRelative(item.validatedAt, now)]
    .filter(Boolean)
    .join(' · ')
}

/** Nom court de l'auteur d'une publication : « Andrea (Kuartz) » → « Andrea ». */
export function shortName(by: string): string {
  return by.replace(/\s*\([^)]*\)\s*$/, '').trim() || by
}

/** Ligne de la liste des versions : « Today 09:10 · Andrea », « Sep 2 · Andrea · first delivery ». */
export function versionLabel(publication: { at: string; by: string; note?: string }, now: number | Date = Date.now()): string {
  return [formatVersionWhen(publication.at, now), shortName(publication.by), publication.note].filter(Boolean).join(' · ')
}

/** « publication-12 · 7f3c2a1 » (tag et commit court) ; sans tag : « publication-12 ». */
export function versionId(publication: { number: number; tag?: string; commit?: string }): string {
  const tag = publication.tag ?? `publication-${publication.number}`
  return publication.commit ? `${tag} · ${publication.commit.slice(0, 7)}` : tag
}
