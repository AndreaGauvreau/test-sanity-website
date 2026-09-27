import type { PendingContentItem } from '@/admin/core/contracts/engine'
import type { IconName } from '@/admin/ui/icons'

/**
 * Présentation des éléments en attente (E1). PUR, testé.
 * Icône d'une ligne de contenu d'après le manifeste (la seule porte vers le site) : élément de collection → base de
 * données (« Blog › … »), réglages du site → curseurs, page → page. Ligne de design → « ai » (éditeur IA).
 */
export type ItemKinds = {
  /** Types Sanity des collections du manifeste (`adminConfig.collections[].type`). */
  collectionTypes: readonly string[]
  /** Type du document des réglages (`adminConfig.settings.type`). */
  settingsType: string
}

export function contentItemIcon(item: Pick<PendingContentItem, 'type'>, kinds: ItemKinds): IconName {
  if (kinds.collectionTypes.includes(item.type)) return 'database'
  if (item.type === kinds.settingsType) return 'sliders'
  return 'page'
}

export const DESIGN_ITEM_ICON: IconName = 'ai'

/**
 * URL « View ↗ » d'un brouillon de contenu : le chemin public sur le site (`viewPath` du moteur). Seulement un
 * chemin relatif sûr (« /blog/… ») : jamais une URL absolue venue des données.
 */
export function viewUrl(siteUrl: string, viewPath: string | undefined): string | null {
  if (!viewPath || !viewPath.startsWith('/') || viewPath.startsWith('//')) return null
  try {
    return new URL(viewPath, siteUrl.endsWith('/') ? siteUrl : `${siteUrl}/`).toString()
  } catch {
    return null
  }
}

/**
 * URL « View ↗ » d'une modification de design : le contrat ne dit pas sur quelle page elle se voit
 * (voir « Demandes de contrat ») ; l'éditeur IA montre le brouillon (code de `draft` + brouillons Sanity).
 */
export const DESIGN_VIEW_HREF = '/admin/editor'
