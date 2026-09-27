import 'server-only'

import { getReadClient } from '@/admin/core/sanity/clients'
import { getDocumentState } from '@/admin/core/sanity/drafts'
import adminConfig from '@/admin.config'

import { normalizeScripts, pageOptions, type PageOption, type ScriptItem } from './scripts'
import { isSigningReady, withSignatureStatus } from './signing'

/**
 * Données de B3 (Server Component). SERVEUR SEULEMENT, appelé APRÈS `requireCapability('settings.code')`.
 * Scripts : brouillon de siteSettings s'il existe, sinon le publié (jeton Viewer). Nombre d'articles par
 * collection de page article (« slug: 12 » du menu Page). SEC-04 : `signed` de chaque script vérifié ici (valeurs
 * brutes du document, SCRIPTS_SIGNING_SECRET) ; la signature elle-même ne part pas vers le navigateur.
 */
export async function loadCodeScreen(): Promise<{ scripts: ScriptItem[]; pages: PageOption[]; hasDraft: boolean; signingReady: boolean }> {
  const counts: Record<string, number> = {}
  const listingCollections = adminConfig.collections.filter((c) => adminConfig.pages.some((p) => p.article?.collection === c.type || p.article?.collection === c.id))
  const [state, ...totals] = await Promise.all([
    getDocumentState(adminConfig.settings.id),
    ...listingCollections.map((c) =>
      getReadClient({ perspective: 'published' })
        .fetch<number>('count(*[_type == $type])', { type: c.type })
        .catch(() => undefined),
    ),
  ])
  listingCollections.forEach((c, i) => {
    const n = totals[i]
    if (typeof n === 'number') counts[c.id] = n
  })
  const value = state.value as Record<string, unknown> | null
  const scripts = await withSignatureStatus(normalizeScripts(value?.scripts), value?.scripts)
  return { scripts, pages: pageOptions(adminConfig, counts), hasDraft: !!state.draft, signingReady: isSigningReady() }
}
