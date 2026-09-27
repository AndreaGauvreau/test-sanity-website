import type { EngineHealth } from '../../../src/admin/core/contracts'
import { accessKind, type AccessResult } from '../claude'
import { ENGINE_VERSION, type EngineMode } from '../config'
import type { WorkRepo } from '../git/git'

/**
 * Santé du moteur (GET /health, EngineHealth du contrat) : mode, accès Claude (sans secret), jeton d'écriture Sanity
 * présent ou non, aperçu (origine sans secret, prêt ou non), état git du clone de travail.
 */
export function createHealth(input: {
  mode: EngineMode
  access: AccessResult
  editorModel: string
  askModel: string
  sanityWrite: boolean
  preview: () => { url: string; ready: boolean }
  repo: WorkRepo
}): () => Promise<EngineHealth> {
  return async () => {
    const preview = input.preview()
    let git: EngineHealth['git'] = { branch: 'unknown', clean: false, aheadOfMain: 0 }
    try {
      const [branch, clean, aheadOfMain] = await Promise.all([
        input.repo.branch(),
        input.repo.isClean(),
        input.repo.commitsAhead('main', 'HEAD').catch(() => 0),
      ])
      git = { branch, clean, aheadOfMain }
    } catch {
      // Clone illisible : santé dégradée, pas d'erreur.
    }
    const access = accessKind(input.access.ok ? input.access.access : null)
    return {
      ok: access !== 'none' && preview.ready && git.branch === 'draft',
      version: ENGINE_VERSION,
      mode: input.mode,
      claude: { access, editorModel: input.editorModel, askModel: input.askModel },
      sanityWrite: input.sanityWrite,
      preview: { url: preview.url, ready: preview.ready },
      git,
    }
  }
}
