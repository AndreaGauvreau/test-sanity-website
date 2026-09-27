import 'server-only'

import { getReadClient } from '@/admin/core/sanity/clients'
import { readSanityEnv } from '@/admin/core/sanity/env'
import adminConfig from '@/admin.config'

import type { MediaAsset } from '../lib/assets'
import type { ReferencingDoc } from '../lib/usage'
import { toMediaAsset, type AssetDoc } from './actions-core'
import { ASSET_FIELDS } from './deps'

/**
 * Lecture de la médiathèque (C5) pour le Server Component : assets (images et fichiers) et documents qui
 * les référencent (publiés et brouillons), pour compter et nommer les utilisations. Jeton Viewer.
 */

type AssetWithRefs = AssetDoc & { refs: string[] }

export async function loadLibrary(): Promise<MediaAsset[]> {
  const client = getReadClient({ perspective: 'raw' })
  const assets = await client.fetch<AssetWithRefs[]>(
    `*[_type in ["sanity.imageAsset", "sanity.fileAsset"]] | order(_createdAt desc)[0...1000]{
      ${ASSET_FIELDS},
      "refs": *[references(^._id) && !(_id in path("versions.**"))]._id
    }`,
  )
  const ids = [...new Set(assets.flatMap((a) => a.refs ?? []))]
  const docs = ids.length ? await client.fetch<ReferencingDoc[]>(`*[_id in $ids]`, { ids }) : []
  const byId = new Map(docs.map((d) => [d._id, d]))
  const deps = { config: adminConfig, env: readSanityEnv(), siteUrl: adminConfig.site.url }
  return assets.map((asset) => {
    const refs = (asset.refs ?? []).map((id) => byId.get(id)).filter((d): d is ReferencingDoc => !!d)
    return toMediaAsset(asset, refs, deps)
  })
}
