import 'server-only'

import { createClient, type SanityClient } from '@sanity/client'

import type { Session } from '@/admin/core/contracts/session'

import { readSanityEnv } from './env'
import { SanityWriteError } from './paths'

/**
 * Clients Sanity de l'admin. SERVEUR SEULEMENT : les jetons ne quittent jamais le serveur.
 * Toujours sans CDN (données fraîches) et sans stega (les valeurs lues servent au formulaire, pas à l'affichage du site).
 */

export type ReadPerspective = 'published' | 'drafts' | 'raw'

const readClients = new Map<ReadPerspective, SanityClient>()

/**
 * Lecture avec le jeton Viewer (SANITY_API_READ_TOKEN) : voit les brouillons avec `drafts` ou `raw`.
 * À utiliser pour afficher ; les écritures relisent avec le jeton de l'utilisateur (getWriteClient).
 */
export function getReadClient(options: { perspective?: ReadPerspective } = {}): SanityClient {
  const perspective = options.perspective ?? 'published'
  let client = readClients.get(perspective)
  if (!client) {
    const env = readSanityEnv()
    client = createClient({
      ...env,
      useCdn: false,
      perspective,
      token: process.env.SANITY_API_READ_TOKEN,
      stega: false,
    })
    readClients.set(perspective, client)
  }
  return client
}

/**
 * Écriture AU NOM de l'utilisateur : son jeton Sanity (issu de la connexion A1), donc ses droits Sanity.
 * Session de dev (ADMIN_DEV_AUTOLOGIN, NODE_ENV=development seulement) : jeton robot SANITY_API_WRITE_TOKEN.
 * Aucun autre cas : erreur claire, jamais de repli silencieux sur le jeton robot.
 */
export function getWriteClient(session: Session): SanityClient {
  const env = readSanityEnv()
  let token: string | undefined
  if (session.sanityToken) {
    token = session.sanityToken
  } else if (session.dev) {
    if (process.env.NODE_ENV !== 'development') {
      throw new SanityWriteError('forbidden', 'Development sessions cannot write outside development.')
    }
    token = process.env.SANITY_API_WRITE_TOKEN
    if (!token) {
      throw new SanityWriteError('unavailable', 'Sanity write access is not configured (SANITY_API_WRITE_TOKEN is missing).')
    }
  } else {
    throw new SanityWriteError('forbidden', 'Your session has no Sanity access. Sign in again.')
  }
  return createClient({ ...env, useCdn: false, perspective: 'raw', token, stega: false, ignoreBrowserTokenWarning: true })
}
