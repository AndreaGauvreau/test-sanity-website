import { parseTargetRef, type TargetRef } from './protocol'
import type { ZoneLabels } from './zones'

/**
 * Repérage des éléments de l'aperçu d'après le marquage du contrat (core/contracts/zones.ts) :
 * `data-edit="<zone>"` sur l'élément, `data-edit-doc` sur un ancêtre, `data-edit-key` sur l'élément de tableau.
 * Seules les zones déclarées dans zones.json (présentes dans `labels`) sont sélectionnables.
 *
 * Pas de `CSS.escape` ni de sélecteur construit à partir d'une valeur : on filtre par `getAttribute`.
 */

const EDIT = 'data-edit'
const EDIT_DOC = 'data-edit-doc'
const EDIT_KEY = 'data-edit-key'

function zoneElements(root: ParentNode, zone: string): Element[] {
  const out: Element[] = []
  for (const el of root.querySelectorAll(`[${EDIT}]`)) {
    if (el.getAttribute(EDIT) === zone) out.push(el)
  }
  return out
}

function docOf(el: Element): string | undefined {
  return el.closest(`[${EDIT_DOC}]`)?.getAttribute(EDIT_DOC) ?? undefined
}

/**
 * Élément sélectionnable le plus proche d'un nœud (lui-même ou un ancêtre marqué d'une zone connue).
 * Les zones inconnues sont traversées (un marquage non déclaré ne bloque pas la zone parente).
 */
export function selectableFrom(node: EventTarget | null, labels: ZoneLabels): Element | null {
  let el: Element | null = node && (node as Node).nodeType === 1 ? (node as Element) : ((node as Node | null)?.parentElement ?? null)
  while (el) {
    const found: Element | null = el.closest(`[${EDIT}]`)
    if (!found) return null
    const zone = found.getAttribute(EDIT)
    if (zone && Object.hasOwn(labels, zone)) return found
    el = found.parentElement
  }
  return null
}

/** Référence (zone, rang, doc, clé) d'un élément marqué ; null si la zone est inconnue ou les attributs douteux. */
export function targetFromElement(el: Element, labels: ZoneLabels, root: ParentNode = el.ownerDocument): TargetRef | null {
  const zone = el.getAttribute(EDIT)
  if (!zone || !Object.hasOwn(labels, zone)) return null
  const index = Math.max(0, zoneElements(root, zone).indexOf(el))
  return parseTargetRef({ zone, index, doc: docOf(el), key: el.getAttribute(EDIT_KEY) ?? undefined })
}

/**
 * Élément désigné par une référence. Ordre : clé de tableau (+ doc), puis rang (si le doc concorde), puis doc.
 * La clé passe avant le rang : l'ordre d'un tableau peut changer entre la sélection et le rendu suivant.
 */
export function findTargetElement(root: ParentNode, ref: TargetRef): Element | null {
  const all = zoneElements(root, ref.zone)
  if (all.length === 0) return null
  if (ref.key) {
    const byKey = all.find((el) => el.getAttribute(EDIT_KEY) === ref.key && (!ref.doc || docOf(el) === ref.doc))
    if (byKey) return byKey
  }
  const byIndex = all[ref.index]
  if (byIndex && (!ref.doc || docOf(byIndex) === ref.doc) && (!ref.key || !byIndex.hasAttribute(EDIT_KEY))) return byIndex
  if (ref.doc && !ref.key) return all.find((el) => docOf(el) === ref.doc) ?? null
  return null
}
