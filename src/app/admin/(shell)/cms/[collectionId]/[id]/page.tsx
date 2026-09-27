import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { requireCapability } from '@/admin/core/auth/session'
import { ItemDrawer } from '@/admin/features/cms/components/ItemDrawer'
import { loadItem } from '@/admin/features/cms/server/data'
import adminConfig from '@/admin.config'

type Params = { collectionId: string; id: string }

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { collectionId } = await params
  const collection = adminConfig.collections.find((c) => c.id === collectionId)
  return { title: collection ? `${collection.singular} · ${collection.label}` : 'CMS' }
}

/**
 * C4 · fiche d'un élément dans un panneau par-dessus la liste (URL partageable). `?field=<nom>` : champ à
 * focaliser (clic sur une cellule image, texte riche ou liste dans C3).
 */
export default async function ItemPage({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireCapability('content.write')
  const [{ collectionId, id }, query] = await Promise.all([params, searchParams])
  const collection = adminConfig.collections.find((c) => c.id === collectionId)
  if (!collection) notFound()
  const item = await loadItem(adminConfig, collection, decodeURIComponent(id))
  if (!item) notFound()
  const field = typeof query.field === 'string' && collection.fields.some((f) => f.name === query.field) ? query.field : null

  return (
    <ItemDrawer
      key={item.id}
      collection={collection}
      item={item}
      listHref={`/admin/cms/${collection.id}`}
      siteUrl={adminConfig.site.url}
      siteDomain={adminConfig.site.domain}
      focusField={field}
    />
  )
}
