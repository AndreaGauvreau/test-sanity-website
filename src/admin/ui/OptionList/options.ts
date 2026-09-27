import type { ReactNode } from 'react'
import type { IconName } from '../icons'

/** Options des listes (Select, OptionList, VariableInput) et navigation clavier : fonctions pures. */
export type ListOption<V extends string = string> = {
  value: V
  label: string
  /** Icône 16 à gauche (Figma Menu item : Show icon). */
  icon?: IconName
  /** Méta à droite (compteur « 12 », raccourci…), en text/muted. */
  meta?: ReactNode
  /** Retrait (arbre de pages : 1 niveau = 20 px). */
  depth?: number
  disabled?: boolean
  /** Ton danger (Menu item state=danger). */
  danger?: boolean
}

export type ListGroup<V extends string = string> = { label: string; options: readonly ListOption<V>[] }

export type ListItems<V extends string = string> = ReadonlyArray<ListOption<V> | ListGroup<V>>

export function isGroup<V extends string>(item: ListOption<V> | ListGroup<V>): item is ListGroup<V> {
  return (item as ListGroup<V>).options !== undefined
}

/** Options à plat, dans l'ordre d'affichage (l'index sert à la navigation clavier). */
export function flattenOptions<V extends string>(items: ListItems<V>): ListOption<V>[] {
  const out: ListOption<V>[] = []
  for (const item of items) {
    if (isGroup(item)) out.push(...item.options)
    else out.push(item)
  }
  return out
}

/** Index suivant activable (sans boucler), ou l'index courant s'il n'y en a pas. */
export function nextEnabled<V extends string>(options: readonly ListOption<V>[], from: number, step: 1 | -1): number {
  for (let i = from + step; i >= 0 && i < options.length; i += step) if (!options[i].disabled) return i
  return from
}

export function firstEnabled<V extends string>(options: readonly ListOption<V>[], fromEnd = false): number {
  if (fromEnd) {
    for (let i = options.length - 1; i >= 0; i--) if (!options[i].disabled) return i
  } else {
    for (let i = 0; i < options.length; i++) if (!options[i].disabled) return i
  }
  return -1
}

/** Recherche au clavier (typeahead) : première option dont le libellé commence par `query`, après `from`. */
export function typeahead<V extends string>(options: readonly ListOption<V>[], query: string, from: number): number {
  const q = query.toLowerCase()
  const n = options.length
  for (let k = 1; k <= n; k++) {
    const i = (((from + k) % n) + n) % n
    if (!options[i].disabled && options[i].label.toLowerCase().startsWith(q)) return i
  }
  return -1
}

