'use client'

import { createContext, useContext } from 'react'

import type { CmsRow } from '../lib/rows'

/**
 * Lien entre la liste (C3, rendue par le layout de la collection) et le panneau (C4, page enfant) :
 * le panneau met à jour la ligne ouverte (titre, statut…) sans recharger la liste.
 */
export type CollectionContextValue = {
  updateRow: (row: CmsRow) => void
  removeRow: (id: string) => void
}

export const CollectionContext = createContext<CollectionContextValue | null>(null)

export function useCollectionContext(): CollectionContextValue | null {
  return useContext(CollectionContext)
}
