import type { EngineUser, Publication } from '../../../src/admin/core/contracts'
import { can } from '../../../src/admin/core/contracts'
import type { WorkRepo } from '../git/git'
import { listPublicationTags } from '../publish/steps'
import { EngineError, forbidden, notFound } from '../server/errors'
import type { PublicationsStore } from '../store/store'

/**
 * Versions (E2) : l'historique des publications = les publications du magasin du moteur + les tags `publication-N`
 * du clone qui n'y figurent pas (magasin perdu, publication faite avant ce moteur). Statuts : live (la dernière
 * réussie), previous, failed (build ou étape en échec : l'ancienne version est restée en ligne).
 *
 * Retour arrière (Kuartz) : prévu pour Vercel Instant Rollback en mode hébergé. En mode local le moteur ne déploie
 * rien : 501 not_implemented, avec un message clair (la version reste restaurable à la main par son tag git).
 */

export type VersionsDeps = {
  repo: WorkRepo
  publications: PublicationsStore
  mode: 'local' | 'hosted'
}

export type VersionsList = { publications: Publication[]; rollback: { available: boolean; reason?: string } }

export type VersionsService = {
  list(): Promise<VersionsList>
  rollback(user: EngineUser, number: number): Promise<Publication>
}

export const LOCAL_ROLLBACK_REASON =
  'Roll back isn’t available in local mode: the AI engine doesn’t deploy the site. Kuartz can restore a version by hand from its git tag (publication-N).'
export const HOSTED_ROLLBACK_REASON = 'Roll back through Vercel Instant Rollback isn’t connected yet. Ask Kuartz to roll back from Vercel.'

export function rollbackReason(mode: 'local' | 'hosted'): string {
  return mode === 'local' ? LOCAL_ROLLBACK_REASON : HOSTED_ROLLBACK_REASON
}

export function createVersionsService(deps: VersionsDeps): VersionsService {
  async function all(): Promise<Publication[]> {
    const stored = structuredClone(deps.publications.get().publications)
    const byNumber = new Map(stored.map((publication) => [publication.number, publication]))
    const tags = await listPublicationTags(deps.repo).catch(() => [])
    for (const tag of tags) {
      const known = byNumber.get(tag.number)
      if (known) {
        known.tag ??= tag.tag
        known.commit ??= tag.commit
        continue
      }
      byNumber.set(tag.number, {
        number: tag.number,
        at: tag.at,
        by: tag.author || 'Kuartz',
        content: [],
        design: [],
        commit: tag.commit,
        tag: tag.tag,
        status: 'previous',
        note: 'Found in git only: the AI engine has no record of this publication.',
      })
    }
    const list = [...byNumber.values()].sort((a, b) => b.number - a.number)
    // Une seule version « live » : la plus récente réussie (le magasin la pose ; filet si l'historique est incomplet).
    if (!list.some((publication) => publication.status === 'live')) {
      const latest = list.find((publication) => publication.status === 'previous')
      if (latest && !stored.length) latest.status = 'live'
    }
    return list
  }

  return {
    async list() {
      return { publications: await all(), rollback: { available: false, reason: rollbackReason(deps.mode) } }
    },

    async rollback(user, number) {
      if (!can(user.role, 'versions.rollback')) throw forbidden()
      if (!Number.isInteger(number) || number < 1) throw notFound('This version doesn’t exist.')
      const found = (await all()).find((publication) => publication.number === number)
      if (!found) throw notFound('This version doesn’t exist.')
      if (found.status === 'failed') throw new EngineError(409, 'conflict', 'This version failed to publish: there is nothing to roll back to.')
      throw new EngineError(501, 'not_implemented', rollbackReason(deps.mode))
    },
  }
}
