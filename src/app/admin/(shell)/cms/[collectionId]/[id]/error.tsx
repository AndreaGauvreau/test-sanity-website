'use client'

import { useEffect } from 'react'

import { ItemDrawerState } from '@/admin/features/cms/components/ItemDrawerState'

// Erreur de chargement de la fiche : la liste reste derrière ; « Try again » refait la requête (retry de Next 16).
export default function ItemError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])
  return <ItemDrawerState kind="error" onRetry={retry} />
}
