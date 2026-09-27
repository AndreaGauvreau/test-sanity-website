'use client'

import type { PublishStatus } from '@/admin/core/contracts/engine'
import { engineClient } from '@/admin/core/engine/client'

import type { StageClient } from '../lib/staging'

/**
 * Accès au moteur pour « dépublier / supprimer au prochain Publish » (C3, C4) : relais same-origin
 * `/admin/api/engine/publish/{status,stage,unstage}` par le client typé de core/engine (cookie de session).
 */

export const stageClient: StageClient = {
  stage: (item) => engineClient.publish.stage(item),
  unstage: (id) => engineClient.publish.unstage(id),
}

/** État de publication (actions programmées) ; null si le moteur est injoignable (la liste reste utilisable). */
export async function loadPublishStatus(): Promise<PublishStatus | null> {
  try {
    return await engineClient.publish.status()
  } catch {
    return null
  }
}
