import 'server-only'

import { getReadClient } from '@/admin/core/sanity/clients'
import { getDocumentState } from '@/admin/core/sanity/drafts'
import adminConfig from '@/admin.config'

import { normalizeScripts, pageOptions, type PageOption, type ScriptItem } from './scripts'

/**
 * Données de B3 (Server Component). SERVEUR SEULEMENT, appelé APRÈS `requireCapability('settings.code')`.
 * Scripts : brouillon de siteSettings s'il existe, sinon le publié (jeton Viewer). Nombre d'articles par
 * collection de page article (« slug: 12 » du menu Page).
 */
export async function loadCodeScreen(): Promise<{ scripts: ScriptItem[]; pages: PageOption[]; hasDraft: boolean }> {
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
  return { scripts: normalizeScripts(value?.scripts), pages: pageOptions(adminConfig, counts), hasDraft: !!state.draft }
}
