import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'

import { requireCapability } from '@/admin/core/auth/session'
import { CollectionScreen } from '@/admin/features/cms/components/CollectionScreen'
import { loadCollectionRows } from '@/admin/features/cms/server/data'
import adminConfig from '@/admin.config'

type Params = { collectionId: string }

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { collectionId } = await params
  const collection = adminConfig.collections.find((c) => c.id === collectionId)
  return { title: collection ? collection.label : 'CMS' }
}

/**
 * C3 · CMS › <collection> (/admin/cms/<collection>) : la liste vit dans le LAYOUT pour rester affichée (et ne
 * pas être rechargée) quand le panneau C4 s'ouvre par-dessus (page enfant /admin/cms/<collection>/<id>).
 */
export default async function CollectionLayout({ params, children }: { params: Promise<Params>; children: ReactNode }) {
  await requireCapability('content.write')
  const { collectionId } = await params
  const collection = adminConfig.collections.find((c) => c.id === collectionId)
  if (!collection) notFound()
  const rows = await loadCollectionRows(collection)
  return (
    <CollectionScreen collection={collection} rows={rows}>
      {children}
    </CollectionScreen>
  )
}
