import type { Metadata } from 'next'

import { requireCapability } from '@/admin/core/auth/session'
import { MediaLibrary } from '@/admin/features/media/components/MediaLibrary'
import { loadLibrary } from '@/admin/features/media/server/data'

export const metadata: Metadata = { title: 'Media' }

/** C5 · Assets › Media (/admin/media) : médiathèque (assets Sanity, utilisations, texte alternatif sur l'asset). */
export default async function MediaPage() {
  await requireCapability('content.write')
  const assets = await loadLibrary()
  return <MediaLibrary assets={assets} />
}
