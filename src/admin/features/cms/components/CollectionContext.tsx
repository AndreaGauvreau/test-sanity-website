'use client'

import { createContext, useContext } from 'react'

import type { CmsRow } from '../lib/rows'
import type { StagedAction, StagedMap } from '../lib/staging'

/**
 * Lien entre la liste (C3, rendue par le layout de la collection) et le panneau (C4, page enfant) :
 * le panneau met à jour la ligne ouverte (titre, statut…) sans recharger la liste, et partage l'état
 * « dépublier / supprimer au prochain Publish » (lu dans le moteur par la liste).
 */
export type CollectionContextValue = {
  updateRow: (row: CmsRow) => void
  removeRow: (id: string) => void
  /** Actions programmées pour le prochain Publish, par id publié. */
  staged: StagedMap
  /** Programme (kind) ou annule (null) ; renvoie le message d'erreur ou null. Rafraîchit la page (router.refresh). */
  stage: (id: string, kind: StagedAction | null) => Promise<string | null>
}

export const CollectionContext = createContext<CollectionContextValue | null>(null)

export function useCollectionContext(): CollectionContextValue | null {
  return useContext(CollectionContext)
}
