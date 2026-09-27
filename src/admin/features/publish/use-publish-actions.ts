'use client'

import { useCallback, useState, useTransition } from 'react'

import type { PublishStatus } from '@/admin/core/contracts/engine'

import { publishChangesAction, retryPublishAction } from './actions'
import type { ActionResult } from './actions-core'
import { expectedIds } from './bar-state'
import { publishStatusStore } from './use-publish-status'

/**
 * Publish / Retry partagés par la Top bar (G3) et E1 : appellent les server actions, posent l'état renvoyé dans le
 * magasin partagé (la barre passe à « Publishing… step 1 / 4 » tout de suite), et gardent le message d'erreur à
 * afficher. 409 conflict : la liste a changé → relecture immédiate + message (jamais de publication à l'aveugle).
 */
export function usePublishActions() {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const handle = useCallback((result: ActionResult<PublishStatus>) => {
    if (result.ok) {
      setError(null)
      publishStatusStore.set(result.data)
      return true
    }
    setError(result.message)
    // L'état a pu changer (conflit, publication lancée par quelqu'un d'autre, élément disparu) : relire.
    void publishStatusStore.refresh()
    return false
  }, [])

  const publish = useCallback(
    (status: PublishStatus | null, onDone?: (ok: boolean) => void) => {
      const expected = expectedIds(status)
      startTransition(async () => {
        const ok = handle(await publishChangesAction({ expected }))
        onDone?.(ok)
      })
    },
    [handle],
  )

  const retry = useCallback(
    (onDone?: (ok: boolean) => void) => {
      startTransition(async () => {
        const ok = handle(await retryPublishAction())
        onDone?.(ok)
      })
    },
    [handle],
  )

  return { publish, retry, pending, error, clearError: useCallback(() => setError(null), []) }
}
