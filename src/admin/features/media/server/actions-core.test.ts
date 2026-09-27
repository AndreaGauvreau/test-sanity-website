import { describe, expect, it } from 'vitest'

import type { Session } from '@/admin/core/contracts/session'
import { applyDraftPatch } from '@/admin/core/sanity/draft-core'
import type { DraftStore, SanityDoc } from '@/admin/core/sanity/store'
import adminConfig from '@/admin.config'

import { checkUpload, deleteAssetsCore, safeFilename, updateAltTextCore, uploadCore, type AssetDoc, type MediaDeps } from './actions-core'

const session: Session = {
  user: { id: 'u1', name: 'Marie', email: 'marie@example.com' },
  role: 'client',
  sanityRoles: ['administrator'],
  sanityToken: 'user-token',
  dev: false,
  expiresAt: '2099-01-01T00:00:00Z',
}

const USED = 'image-aaa-100x100-jpg'
const FREE = 'image-bbb-100x100-jpg'

function makeDeps(options: { denied?: boolean } = {}) {
  const docs = new Map<string, SanityDoc>([
    ['post-1', { _id: 'post-1', _type: 'post', title: 'Hello', image: { _type: 'image', asset: { _type: 'reference', _ref: USED } } }],
    ['drafts.post-2', { _id: 'drafts.post-2', _type: 'post', title: 'Draft', content: [{ _type: 'image', _key: 'i1', asset: { _type: 'reference', _ref: USED } }] }],
  ])
  const assets = new Map<string, AssetDoc>([
    [USED, { _id: USED, _type: 'sanity.imageAsset', mimeType: 'image/jpeg', extension: 'jpg', originalFilename: 'hero.jpg', size: 10, altText: 'A truck' }],
    [FREE, { _id: FREE, _type: 'sanity.imageAsset', mimeType: 'image/jpeg', extension: 'jpg', originalFilename: 'free.jpg', size: 10 }],
    ['file-ccc-pdf', { _id: 'file-ccc-pdf', _type: 'sanity.fileAsset', mimeType: 'application/pdf', extension: 'pdf', originalFilename: 'b.pdf', size: 10 }],
  ])
  const calls: string[] = []
  const store: DraftStore = {
    async getDocuments(ids) {
      return ids.map((id) => docs.get(id) ?? null)
    },
    async mutate(mutations) {
      for (const m of mutations) {
        if ('createIfNotExists' in m && !docs.has(m.createIfNotExists._id)) docs.set(m.createIfNotExists._id, structuredClone(m.createIfNotExists))
        if ('patch' in m) {
          const doc = docs.get(m.patch.id)!
          for (const [path, value] of Object.entries(m.patch.set ?? {})) {
            // Chemins de ce test : « image.asset » et « content[_key=="i1"].asset ».
            const keyed = /^(\w+)\[_key=="([\w-]+)"\]\.asset$/.exec(path)
            if (keyed) {
              const item = (doc[keyed[1]] as { _key: string; asset: unknown }[]).find((i) => i._key === keyed[2])!
              item.asset = value
            } else {
              ;(doc[path.split('.')[0]] as Record<string, unknown>).asset = value
            }
          }
        }
      }
    },
  }
  const refsOf = (id: string) => [...docs.values()].filter((d) => JSON.stringify(d).includes(`"_ref":"${id}"`))
  const deps: MediaDeps = {
    requireCapability: async () => {
      if (options.denied) throw Object.assign(new Error('no'), { status: 403 })
      return session
    },
    config: adminConfig,
    env: { projectId: 'p', dataset: 'development' },
    siteUrl: 'https://conduit.com',
    assets: {
      get: async (id) => assets.get(id) ?? null,
      referencingDocs: async (_s, id) => refsOf(id),
      patch: async (_s, id, patch) => {
        calls.push(`patch ${id} ${JSON.stringify(patch)}`)
        const a = assets.get(id)!
        Object.assign(a, patch.set ?? {})
        for (const k of patch.unset ?? []) delete (a as Record<string, unknown>)[k]
      },
      delete: async (_s, id) => {
        calls.push(`delete ${id}`)
        assets.delete(id)
      },
      upload: async (_s, kind, input) => {
        calls.push(`upload ${kind} ${input.name}`)
        const doc: AssetDoc = { _id: 'image-new-100x100-png', _type: 'sanity.imageAsset', mimeType: input.type, extension: 'png', originalFilename: input.name, size: input.size }
        assets.set(doc._id, doc)
        return doc
      },
    },
    setDraftFields: (_s, id, patch, o) => applyDraftPatch(store, id, patch, o.fields),
  }
  return { deps, docs, assets, calls }
}

const png = (size = 100, name = 'new.png', type = 'image/png') => ({ name, type, size, data: new Uint8Array(size) })

describe('garde de suppression des médias utilisés', () => {
  it('seuls les fichiers non référencés sont supprimés, revérifié côté serveur', async () => {
    const { deps, calls, assets } = makeDeps()
    const result = await deleteAssetsCore(deps, { ids: [USED, FREE, 'file-ccc-pdf'] })
    expect(result).toEqual({ ok: true, deleted: [FREE, 'file-ccc-pdf'], locked: [USED] })
    expect(assets.has(USED)).toBe(true)
    expect(calls).toEqual([`delete ${FREE}`, 'delete file-ccc-pdf'])
  })
  it('droit exigé avant toute lecture ; ids invalides refusés', async () => {
    const denied = makeDeps({ denied: true })
    expect(await deleteAssetsCore(denied.deps, { ids: [FREE] })).toEqual({ ok: false, error: "You don't have access to this." })
    expect(denied.calls).toEqual([])
    const { deps } = makeDeps()
    expect(await deleteAssetsCore(deps, { ids: ['post-1'] })).toMatchObject({ ok: false, error: 'Invalid request.' })
    expect(await deleteAssetsCore(deps, { ids: [] })).toMatchObject({ ok: false })
  })
})

describe('texte alternatif sur l’asset', () => {
  it('écrit, efface, valide la longueur, refuse un fichier', async () => {
    const { deps, assets } = makeDeps()
    expect(await updateAltTextCore(deps, { assetId: FREE, altText: '  Truck at the dock  ' })).toEqual({ ok: true, altText: 'Truck at the dock' })
    expect(assets.get(FREE)?.altText).toBe('Truck at the dock')
    expect(await updateAltTextCore(deps, { assetId: FREE, altText: '' })).toEqual({ ok: true, altText: '' })
    expect(assets.get(FREE)).not.toHaveProperty('altText')
    expect(await updateAltTextCore(deps, { assetId: FREE, altText: 'x'.repeat(251) })).toMatchObject({ ok: false, error: 'Alt text must be 250 characters or fewer.' })
    expect(await updateAltTextCore(deps, { assetId: FREE, altText: 'a\nb' })).toMatchObject({ ok: false })
    expect(await updateAltTextCore(deps, { assetId: 'file-ccc-pdf', altText: 'x' })).toMatchObject({ ok: false })
  })
})

describe('envoi et remplacement', () => {
  it('type et taille vérifiés', () => {
    expect(checkUpload({ type: 'image/png', size: 10 })).toBeNull()
    expect(checkUpload({ type: 'text/html', size: 10 })).toMatch(/not supported/)
    expect(checkUpload({ type: 'image/png', size: 30 * 1024 * 1024 })).toMatch(/too large/)
    expect(checkUpload({ type: 'application/pdf', size: 10 }, 'image')).toMatch(/Choose an image/)
    expect(safeFilename('../../etc/pass\u0000wd.png')).toBe('passwd.png')
  })

  it('envoi simple : nouvel asset, inutilisé', async () => {
    const { deps, calls } = makeDeps()
    const result = await uploadCore(deps, png(), null)
    expect(result).toMatchObject({ ok: true, updated: 0, asset: { id: 'image-new-100x100-png', kind: 'image', usages: [] } })
    expect(calls).toEqual(['upload image new.png'])
  })

  it('remplacement : texte alternatif repris, utilisations repointées dans les brouillons', async () => {
    const { deps, docs } = makeDeps()
    const result = await uploadCore(deps, png(), USED)
    expect(result).toMatchObject({ ok: true, updated: 2, asset: { altText: 'A truck' } })
    expect((result as { asset: { usages: unknown[] } }).asset.usages).toHaveLength(2)
    // Publié intact ; son brouillon pointe vers le nouvel asset.
    expect((docs.get('post-1')!.image as { asset: { _ref: string } }).asset._ref).toBe(USED)
    expect((docs.get('drafts.post-1')!.image as { asset: { _ref: string } }).asset._ref).toBe('image-new-100x100-png')
    expect((docs.get('drafts.post-2')!.content as { asset: { _ref: string } }[])[0].asset._ref).toBe('image-new-100x100-png')
  })

  it('remplacement d’une image par un PDF refusé', async () => {
    const { deps, calls } = makeDeps()
    expect(await uploadCore(deps, png(10, 'b.pdf', 'application/pdf'), USED)).toMatchObject({ ok: false })
    expect(calls).toEqual([])
  })
})
