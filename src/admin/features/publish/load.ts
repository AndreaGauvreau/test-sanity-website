import 'server-only'

import type { Session } from '@/admin/core/contracts/session'
import type { PublishStatus } from '@/admin/core/contracts/engine'
import { EngineRequestError } from '@/admin/core/engine/errors'
import { engineFetch } from '@/admin/core/engine/server'

import type { VersionsData } from './VersionsView'

/**
 * Lectures serveur des écrans E1 / E2 (Server Components). Une panne du moteur ne casse pas la page : elle rend un
 * message clair (anglais, venu du relais : « The AI engine isn't responding… ») et l'écran propose de réessayer.
 */

type Loaded<T> = { data: T; error: null } | { data: null; error: string }

function messageOf(err: unknown): string {
  if (err instanceof EngineRequestError) return err.message
  console.error('[publish] engine read failed', err)
  return 'Couldn’t reach the publishing engine. Try again in a moment.'
}

export async function loadPublishStatus(session: Session): Promise<Loaded<PublishStatus>> {
  try {
    return { data: await engineFetch<PublishStatus>(session, 'GET', 'publish/status'), error: null }
  } catch (err) {
    return { data: null, error: messageOf(err) }
  }
}

export async function loadVersions(session: Session): Promise<Loaded<VersionsData>> {
  try {
    const data = await engineFetch<VersionsData>(session, 'GET', 'versions')
    return { data: { publications: Array.isArray(data?.publications) ? data.publications : [], rollback: data?.rollback ?? { available: false } }, error: null }
  } catch (err) {
    return { data: null, error: messageOf(err) }
  }
}
