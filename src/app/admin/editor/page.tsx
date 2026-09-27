import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { adminConfig } from '@/admin.config'
import type { ZonesFile } from '@/admin/core/contracts'
import { sanitizeNextPath } from '@/admin/core/auth/next-path'
import { requireCapability } from '@/admin/core/auth/session'
import { zoneLabels } from '@/admin/editor-bridge/zones'
import { EditorScreen, resolveEditorPage } from '@/admin/features/ai-editor/page'
import zonesFile from '@/editor/zones.json'

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

/** Libellés « Section · Label » des zones : seule partie de zones.json envoyée au navigateur. */
const LABELS = zoneLabels(zonesFile as unknown as ZonesFile)

/** Page d'essai du pont (développement) : l'aperçu y pointe quand le moteur est simulé, ou avec ?harness=1. */
const HARNESS_PATH = '/admin/editor/harness'

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const page = resolveEditorPage(adminConfig, (await searchParams).page)
  return { title: page ? `AI editor — ${page.label}` : 'AI editor' }
}

/** D1-D3 · /admin/editor?page=<id> : éditeur IA plein écran sur une page du manifeste qui l'autorise. */
export default async function EditorPage({ searchParams }: Props) {
  await requireCapability('ai.editor')
  const params = await searchParams
  const page = resolveEditorPage(adminConfig, params.page)
  if (!page) notFound()

  const dev = process.env.NODE_ENV === 'development'
  const previewOverride = dev && (process.env.ENGINE_MOCK === '1' || params.harness === '1') ? HARNESS_PATH : null

  // « ‹ Admin » (G1) : l'écran d'origine, passé par « Open in AI editor » (?back=/admin/pages/home/seo) ; nettoyé ici
  // (chemins /admin seulement). Absent : la sidebar revient à /admin/pages/<id>.
  const backHref = typeof params.back === 'string' ? sanitizeNextPath(params.back) : null

  return (
    <EditorScreen
      pageId={page.id}
      path={page.path}
      pageLabel={page.label}
      labels={LABELS}
      backHref={backHref}
      previewOverride={previewOverride}
    />
  )
}
