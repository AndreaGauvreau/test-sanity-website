import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing'

/**
 * Ordre manuel d'une collection (G5 ⇅, champ `orderRank`, clés fractional-indexing). Pur.
 *
 * Déplacer un élément n'écrit QU'UNE clé : celle de l'élément, choisie entre ses deux nouveaux voisins.
 * Si les clés voisines sont absentes, invalides ou dans le désordre (données écrites à la main, doublons),
 * toute la collection est renumérotée (plusieurs écritures, cas rare).
 */

export type Ranked = { id: string; rank: string | null | undefined }

export type RankUpdate = { id: string; rank: string }

/** Clé fractional-indexing valide (sinon la bibliothèque lève une exception). */
export function isValidRank(rank: unknown): rank is string {
  if (typeof rank !== 'string' || rank === '') return false
  try {
    generateKeyBetween(rank, null)
    return true
  } catch {
    return false
  }
}

/** Comparaison de clés : ordre des chaînes (points de code), comme GROQ `order(orderRank asc)`. */
export function compareRanks(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Tri par ordre manuel : clés valides d'abord (croissantes), puis les éléments sans clé, par id. */
export function sortByRank<T extends Ranked>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    const va = isValidRank(a.rank)
    const vb = isValidRank(b.rank)
    if (va && vb) return compareRanks(a.rank as string, b.rank as string) || compareRanks(a.id, b.id)
    if (va) return -1
    if (vb) return 1
    return compareRanks(a.id, b.id)
  })
}

/** Les clés sont-elles toutes valides et strictement croissantes dans cet ordre ? */
export function isStrictlyOrdered(items: readonly Ranked[]): boolean {
  for (let i = 0; i < items.length; i++) {
    if (!isValidRank(items[i].rank)) return false
    if (i > 0 && compareRanks(items[i - 1].rank as string, items[i].rank as string) >= 0) return false
  }
  return true
}

/** Clé entre deux voisins (null = bord de liste). Lève une exception si a ≥ b. */
export function keyBetween(before: string | null, after: string | null): string {
  return generateKeyBetween(before, after)
}

/** Clé d'un nouvel élément placé en fin de liste. */
export function rankAfterLast(items: readonly Ranked[]): string {
  const valid = items.map((i) => i.rank).filter(isValidRank).sort(compareRanks)
  return generateKeyBetween(valid.length ? valid[valid.length - 1] : null, null)
}

/** Renumérote toute la liste dans l'ordre donné ; ne renvoie que les clés qui changent. */
export function rebalance(ordered: readonly Ranked[]): RankUpdate[] {
  const keys = generateNKeysBetween(null, null, ordered.length)
  const updates: RankUpdate[] = []
  ordered.forEach((item, index) => {
    if (item.rank !== keys[index]) updates.push({ id: item.id, rank: keys[index] })
  })
  return updates
}

/**
 * Déplace `id` pour qu'il se retrouve à la position `toIndex` de la liste FINALE (0 = en tête).
 * `items` : la collection complète, dans son ordre manuel actuel (voir sortByRank).
 * Renvoie les clés à écrire (une seule dans le cas normal ; aucune si l'élément ne bouge pas).
 */
export function planMove(items: readonly Ranked[], id: string, toIndex: number): RankUpdate[] {
  const from = items.findIndex((i) => i.id === id)
  if (from === -1) throw new Error('Unknown item.')
  const rest = items.filter((i) => i.id !== id)
  const target = Math.max(0, Math.min(rest.length, Math.trunc(toIndex)))
  if (target === from && isValidRank(items[from].rank) && isStrictlyOrdered(items)) return []

  const moved = items[from]
  const finalOrder = [...rest.slice(0, target), moved, ...rest.slice(target)]
  const before = target > 0 ? rest[target - 1] : null
  const after = target < rest.length ? rest[target] : null

  // Cas normal : voisins valides et dans l'ordre → une seule clé.
  const neighboursOk =
    (!before || isValidRank(before.rank)) &&
    (!after || isValidRank(after.rank)) &&
    (!before || !after || compareRanks(before.rank as string, after.rank as string) < 0)
  if (neighboursOk && isStrictlyOrdered(rest)) {
    return [{ id, rank: keyBetween(before ? (before.rank as string) : null, after ? (after.rank as string) : null) }]
  }
  return rebalance(finalOrder)
}

/** Position de destination d'après les voisins envoyés par l'interface (id avant / après). */
export function targetIndexFromNeighbours(items: readonly Ranked[], id: string, beforeId: string | null, afterId: string | null): number {
  const rest = items.filter((i) => i.id !== id)
  if (beforeId) {
    const i = rest.findIndex((r) => r.id === beforeId)
    if (i !== -1) return i + 1
  }
  if (afterId) {
    const i = rest.findIndex((r) => r.id === afterId)
    if (i !== -1) return i
  }
  return beforeId ? rest.length : 0
}
