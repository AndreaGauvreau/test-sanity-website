import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import type { ZonesFile } from '@/admin/core/contracts'
import { requireCapability } from '@/admin/core/auth/session'
import { Bridge } from '@/admin/editor-bridge/Bridge'
import { zoneLabels } from '@/admin/editor-bridge/zones'
import zonesFile from '@/editor/zones.json'

import { HarnessSite } from './HarnessSite'

export const metadata: Metadata = { title: 'AI editor harness', robots: { index: false, follow: false } }

const LABELS = zoneLabels(zonesFile as unknown as ZonesFile)

/**
 * Page d'essai de DÉVELOPPEMENT du pont (/admin/editor/harness) : réplique de l'accueil marquée avec les vraies zones
 * + pont monté, parent autorisé = la même origine que la page (l'admin). 404 hors développement.
 * L'éditeur y pointe quand ENGINE_MOCK=1 (ou /admin/editor?page=home&harness=1).
 */
export default async function EditorHarnessPage() {
  if (process.env.NODE_ENV !== 'development') notFound()
  await requireCapability('ai.editor')
  return (
    <>
      <HarnessSite />
      <Bridge parentOrigin="self" labels={LABELS} />
    </>
  )
}
