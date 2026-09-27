'use server'

import { requireCapability } from '@/admin/core/auth/session'
import type { Publication, PublishStatus } from '@/admin/core/contracts/engine'
import { engineFetch } from '@/admin/core/engine/server'

import {
  diffCore,
  discardCore,
  publishCore,
  retryCore,
  rollbackCore,
  unstageCore,
  type ActionDeps,
  type ActionResult,
} from './actions-core'

/**
 * Server actions de la publication (E1, E2, G3). Minces : la logique (droit en premier, zod, moteur, erreurs)
 * est dans actions-core.ts, testée avec de faux clients. Le jeton Sanity ne sort jamais : seule l'identité signée
 * (id, nom, e-mail, rôle) part vers le moteur, par engineFetch.
 */

const deps: ActionDeps = {
  requireCapability: (capability, context) => requireCapability(capability, context),
  engineFetch: (session, method, path, options) => engineFetch(session, method, path, options),
  log: (message) => console.error(message),
}

export async function publishChangesAction(input: { expected: string[] }): Promise<ActionResult<PublishStatus>> {
  return publishCore(deps, input)
}

export async function retryPublishAction(): Promise<ActionResult<PublishStatus>> {
  return retryCore(deps)
}

export async function discardChangeAction(
  input: { kind: 'content'; id: string } | { kind: 'design'; changeId: string },
): Promise<ActionResult<PublishStatus>> {
  return discardCore(deps, input)
}

export async function unstageChangeAction(input: { id: string }): Promise<ActionResult<PublishStatus>> {
  return unstageCore(deps, input)
}

export async function loadDiffAction(input: { changeId: string }): Promise<ActionResult<{ diff: string }>> {
  return diffCore(deps, input)
}

export async function rollbackVersionAction(input: { number: number }): Promise<ActionResult<Publication>> {
  return rollbackCore(deps, input)
}
