import type { ElementTarget } from '../core/contracts/engine'
import type { ZonesFile } from '../core/contracts/zones'
import type { TargetRef } from './protocol'

/**
 * Libellés des zones (« Hero · Title ») calculés depuis src/editor/zones.json. Pur.
 *
 * Calculés CÔTÉ SERVEUR (layout du site pour le pont, page de l'éditeur pour l'admin) puis passés en props : le
 * fichier complet (fichiers, sélecteurs, textes Sanity) n'est jamais envoyé au navigateur.
 */

/** zone → « Section · Label ». */
export type ZoneLabels = Readonly<Record<string, string>>

export function zoneLabels(file: Pick<ZonesFile, 'zones'>): ZoneLabels {
  const labels: Record<string, string> = {}
  for (const [id, zone] of Object.entries(file.zones)) {
    labels[id] = zone.section ? `${zone.section} · ${zone.label}` : zone.label
  }
  return labels
}

/** Référence du pont → ElementTarget du contrat (libellé recalculé ici) ; null pour une zone inconnue. */
export function toElementTarget(ref: TargetRef, labels: ZoneLabels): ElementTarget | null {
  const label = Object.hasOwn(labels, ref.zone) ? labels[ref.zone] : undefined
  if (!label) return null
  const target: ElementTarget = { zone: ref.zone, index: ref.index, label }
  if (ref.doc) target.doc = ref.doc
  if (ref.key) target.key = ref.key
  return target
}

/** ElementTarget → référence du protocole (sans libellé). */
export function toTargetRef(target: ElementTarget): TargetRef {
  const ref: TargetRef = { zone: target.zone, index: target.index }
  if (target.doc) ref.doc = target.doc
  if (target.key) ref.key = target.key
  return ref
}
