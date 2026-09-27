import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Session } from '@/admin/core/contracts/session'

// FOLLOWUPS #40 : l'envoi d'une IMAGE passe par l'aide partagée `uploadImageAsset` de core/sanity ; les autres
// fichiers (vidéo, PDF…) restent envoyés par le client Sanity de l'utilisateur.

const sanity = vi.hoisted(() => ({
  uploadImageAsset: vi.fn(),
  rawUpload: vi.fn(),
  fetch: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/admin/core/auth/session', () => ({ requireCapability: vi.fn() }))
vi.mock('@/admin/core/sanity/drafts', () => ({ setDraftFields: vi.fn() }))
vi.mock('@/admin/core/sanity/env', () => ({ readSanityEnv: () => ({ projectId: 'p', dataset: 'development', apiVersion: '2026-09-01' }) }))
vi.mock('@/admin/core/sanity/assets', () => ({ uploadImageAsset: sanity.uploadImageAsset }))
vi.mock('@/admin/core/sanity/clients', () => ({
  getReadClient: () => ({ fetch: sanity.fetch }),
  getWriteClient: () => ({ assets: { upload: sanity.rawUpload }, fetch: sanity.fetch }),
}))

const { mediaDeps, uploadAsset } = await import('./deps')
const { SanityWriteError } = await import('@/admin/core/sanity/paths')

const session: Session = {
  user: { id: 'u1', name: 'Marie', email: 'marie@example.com' },
  role: 'client',
  sanityRoles: ['administrator'],
  sanityToken: 'user-token',
  dev: false,
  expiresAt: '2099-01-01T00:00:00Z',
}

const png = { name: 'hero.png', type: 'image/png', size: 4, data: new Uint8Array([137, 80, 78, 71]) }

beforeEach(() => {
  Object.values(sanity).forEach((f) => f.mockReset())
})

describe('media — envoi (FOLLOWUPS #40)', () => {
  it('image : uploadImageAsset (session, octets, nom, type), puis relecture de l’asset complet', async () => {
    sanity.uploadImageAsset.mockResolvedValue({ _id: 'image-abc-10x10-png', url: 'https://cdn.sanity.io/x.png' })
    sanity.fetch.mockResolvedValue({ _id: 'image-abc-10x10-png', _type: 'sanity.imageAsset', size: 4, metadata: { dimensions: { width: 10, height: 10 } } })
    const doc = await mediaDeps().assets.upload(session, 'image', png)
    expect(sanity.uploadImageAsset).toHaveBeenCalledWith(session, png.data, { filename: 'hero.png', contentType: 'image/png' })
    expect(sanity.rawUpload).not.toHaveBeenCalled()
    expect(sanity.fetch).toHaveBeenCalledWith(expect.stringContaining('*[_id == $id][0]'), { id: 'image-abc-10x10-png' })
    expect(doc.metadata?.dimensions?.width).toBe(10)
  })

  it('image pas encore lisible : vue minimale tirée de l’envoi', async () => {
    sanity.uploadImageAsset.mockResolvedValue({ _id: 'image-abc-10x10-png', url: 'https://cdn.sanity.io/x.png' })
    sanity.fetch.mockResolvedValue(null)
    const doc = await uploadAsset(session, 'image', png)
    expect(doc).toMatchObject({ _id: 'image-abc-10x10-png', _type: 'sanity.imageAsset', originalFilename: 'hero.png', mimeType: 'image/png', extension: 'png', size: 4 })
  })

  it('erreur de l’aide partagée transmise telle quelle (message prêt à afficher)', async () => {
    sanity.uploadImageAsset.mockRejectedValue(new SanityWriteError('forbidden', "You don't have access to this."))
    await expect(mediaDeps().assets.upload(session, 'image', png)).rejects.toMatchObject({ code: 'forbidden', message: "You don't have access to this." })
  })

  it('fichier (PDF) : client Sanity de l’utilisateur, pas l’aide des images', async () => {
    sanity.rawUpload.mockResolvedValue({ _id: 'file-ccc-pdf', _type: 'sanity.fileAsset' })
    const pdf = { name: 'b.pdf', type: 'application/pdf', size: 3, data: new Uint8Array([1, 2, 3]) }
    const doc = await mediaDeps().assets.upload(session, 'file', pdf)
    expect(sanity.uploadImageAsset).not.toHaveBeenCalled()
    expect(sanity.rawUpload).toHaveBeenCalledWith('file', expect.any(Buffer), { filename: 'b.pdf', contentType: 'application/pdf' })
    expect(doc._id).toBe('file-ccc-pdf')
  })
})
