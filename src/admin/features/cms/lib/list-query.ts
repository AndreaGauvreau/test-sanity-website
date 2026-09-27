import type { CollectionDef } from '@/admin/core/contracts/manifest'

import { compareRanks, isValidRank } from './order'
import { normalizeSearch, type CmsRow } from './rows'

/**
 * Tri, filtres et recherche de la liste C3 (barre d'outils G5). Pur, côté client.
 * « Un seul tri à la fois » ; filtres « champ · is / is not · valeur » cumulés (ET) ; recherche pendant la frappe.
 */

export type SortField = 'manual' | 'updated' | 'title' | 'date'
export type SortDirection = 'asc' | 'desc'
export type SortState = { by: SortField; direction: SortDirection }

export type Condition = { id: string; field: string; operator: string; value: string | null }

export type ListQuery = { sort: SortState; conditions: readonly Condition[]; search: string }

export type SortOption = { value: SortField; label: string }

/** Critères de tri proposés (G5 : Last updated / Title / Date ; « Manual order » si la collection est ordonnable). */
export function sortOptions(collection: CollectionDef): SortOption[] {
  const options: SortOption[] = []
  if (collection.orderable) options.push({ value: 'manual', label: 'Manual order' })
  options.push({ value: 'updated', label: 'Last updated' }, { value: 'title', label: 'Title' })
  if (collection.columns.some((c) => c.kind === 'date')) options.push({ value: 'date', label: 'Date' })
  return options
}

/** Libellés de sens selon le critère : dates « Newest first / Oldest first », titre « A to Z / Z to A ». */
export function directionOptions(by: SortField): { value: SortDirection; label: string }[] {
  if (by === 'manual') return []
  if (by === 'title') {
    return [
      { value: 'asc', label: 'A to Z' },
      { value: 'desc', label: 'Z to A' },
    ]
  }
  return [
    { value: 'desc', label: 'Newest first' },
    { value: 'asc', label: 'Oldest first' },
  ]
}

/** Tri par défaut d'après le manifeste (`defaultSort`). */
export function defaultSort(collection: CollectionDef): SortState {
  const { field, direction } = collection.defaultSort
  if (field === 'orderRank' && collection.orderable) return { by: 'manual', direction: 'asc' }
  if (field === collection.titleField) return { by: 'title', direction }
  const dateColumn = collection.columns.find((c) => c.kind === 'date')
  if (dateColumn && field === dateColumn.field) return { by: 'date', direction }
  return { by: 'updated', direction }
}

const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true })

function compareNullable(a: string | null, b: string | null, cmp: (x: string, y: string) => number): number {
  if (a === b) return 0
  if (a === null || a === '') return 1
  if (b === null || b === '') return -1
  return cmp(a, b)
}

export function sortRows(rows: readonly CmsRow[], sort: SortState): CmsRow[] {
  const sign = sort.direction === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    let result = 0
    switch (sort.by) {
      case 'manual': {
        const va = isValidRank(a.rank)
        const vb = isValidRank(b.rank)
        result = va && vb ? compareRanks(a.rank as string, b.rank as string) : va ? -1 : vb ? 1 : 0
        return result || compareRanks(a.id, b.id)
      }
      case 'title':
        result = collator.compare(a.title, b.title) * sign
        break
      case 'date':
        // Sans date : toujours en fin de liste, quel que soit le sens.
        result = compareNullable(a.date, b.date, (x, y) => (Date.parse(x) - Date.parse(y)) * sign)
        break
      case 'updated':
        result = compareNullable(a.updatedAt, b.updatedAt, (x, y) => (Date.parse(x) - Date.parse(y)) * sign)
        break
    }
    return result || collator.compare(a.title, b.title) || compareRanks(a.id, b.id)
  })
}

/** Conditions complètes seulement (une ligne sans valeur ne filtre pas). */
export function activeConditions(conditions: readonly Condition[]): Condition[] {
  return conditions.filter((c) => c.field && c.value !== null && c.value !== '')
}

export function matchesConditions(row: CmsRow, conditions: readonly Condition[]): boolean {
  return activeConditions(conditions).every((c) => {
    const equal = (row.filters[c.field] ?? '') === c.value
    return c.operator === 'is-not' ? !equal : equal
  })
}

export function matchesSearch(row: CmsRow, search: string): boolean {
  const terms = normalizeSearch(search).split(/\s+/).filter(Boolean)
  return terms.every((t) => row.search.includes(t))
}

export function applyListQuery(rows: readonly CmsRow[], query: ListQuery): CmsRow[] {
  const filtered = rows.filter((r) => matchesConditions(r, query.conditions) && matchesSearch(r, query.search))
  return sortRows(filtered, query.sort)
}

/** Le glisser-déposer n'a de sens qu'en ordre manuel, sans filtre ni recherche (liste complète visible). */
export function canReorder(collection: CollectionDef, query: ListQuery): boolean {
  return collection.orderable && query.sort.by === 'manual' && activeConditions(query.conditions).length === 0 && query.search.trim() === ''
}

/** Validation d'un état relu du stockage de session (entrée non fiable). */
export function parseStoredQuery(raw: unknown, collection: CollectionDef): Partial<ListQuery> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Partial<ListQuery> = {}
  const r = raw as Record<string, unknown>
  const sort = r.sort as Record<string, unknown> | undefined
  const allowed = sortOptions(collection).map((o) => o.value)
  if (sort && allowed.includes(sort.by as SortField) && (sort.direction === 'asc' || sort.direction === 'desc')) {
    out.sort = { by: sort.by as SortField, direction: sort.direction }
  }
  const fields = new Set((collection.filters ?? []).map((f) => f.field))
  if (Array.isArray(r.conditions)) {
    out.conditions = r.conditions
      .filter((c): c is Condition => !!c && typeof c === 'object' && typeof c.id === 'string' && fields.has(c.field) && (c.operator === 'is' || c.operator === 'is-not'))
      .map((c) => ({ id: c.id, field: c.field, operator: c.operator, value: typeof c.value === 'string' ? c.value : null }))
  }
  if (typeof r.search === 'string') out.search = r.search.slice(0, 200)
  return out
}
