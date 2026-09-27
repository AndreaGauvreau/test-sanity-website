'use client'

import { useEffect, useSyncExternalStore } from 'react'

import type { PublishStatus } from '@/admin/core/contracts/engine'
import { engineClient } from '@/admin/core/engine/client'

import { createPublishStatusStore, type PublishSnapshot } from './status-store'

/**
 * Magasin unique de la page (module client) : la Top bar et les écrans E1 / E2 lisent le même état et un seul
 * sondage tourne. Lecture par le client navigateur du moteur (relais /admin/api/engine/publish/status).
 */
export const publishStatusStore = createPublishStatusStore({
  fetchStatus: (signal) => engineClient.publish.status({ signal }),
  isVisible: () => typeof document === 'undefined' || document.visibilityState !== 'hidden',
  onVisibilityChange: (listener) => {
    if (typeof document === 'undefined') return () => {}
    document.addEventListener('visibilitychange', listener)
    return () => document.removeEventListener('visibilitychange', listener)
  },
})

const SERVER_SNAPSHOT: PublishSnapshot = { status: null, error: null, fetchedAt: null }

/**
 * État partagé de la publication. `initial` : état lu par le Server Component de la page (E1, E2) — rendu tel quel
 * tant que le magasin n'a rien (pas de décalage d'hydratation), puis posé dans le magasin.
 */
export function usePublishStatus(initial?: PublishStatus | null): PublishSnapshot {
  const snapshot = useSyncExternalStore(publishStatusStore.subscribe, publishStatusStore.get, () => SERVER_SNAPSHOT)
  useEffect(() => {
    if (initial) publishStatusStore.seed(initial)
  }, [initial])
  if (!snapshot.status && initial) return { status: initial, error: snapshot.error, fetchedAt: snapshot.fetchedAt }
  return snapshot
}
