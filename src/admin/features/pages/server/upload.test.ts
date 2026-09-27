import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/admin/core/auth/session', () => ({
  AdminAuthError: class extends Error {},
  authErrorResponse: () => new Response(null, { status: 401 }),
  jsonError: (status: number, code: string, message: string) => Response.json({ error: { code, message } }, { status }),
  requireCapability: async () => {
    throw new Error('not used here')
  },
}))

import type { Session } from '@/admin/core/contracts'
import type { DraftMutation, DraftStore, SanityDoc } from '@/admin/core/sanity/store'

const { MAX_IMAGE_BYTES, sniffImageType, uploadPageImage } = await import('./upload')

const session = { role: 'client', sanityToken: 't', dev: false, user: { id: 'u', name: 'M', email: 'm@c' } } as Session
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0])
const WEBP = new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 ')

function store() {
  const docs: Record<string, SanityDoc> = { dockSchedulingPage: { _id: 'dockSchedulingPage', _type: 'dockSchedulingPage' } }
  const mutations: DraftMutation[][] = []
  const s: DraftStore = { getDocuments: async (ids) => ids.map((id) => docs[id] ?? null), mutate: async (m) => void mutations.push(m) }
  return { s, mutations }
}

function form(parts: Record<string, string | Blob>) {
  const data = new FormData()
  for (const [k, v] of Object.entries(parts)) data.set(k, v)
  return data
}

describe('sniffImageType', () => {
  it('reconnaît PNG, JPEG, WebP d’après les octets', () => {
    expect(sniffImageType(PNG)).toBe('image/png')
    expect(sniffImageType(JPEG)).toBe('image/jpeg')
    expect(sniffImageType(WEBP)).toBe('image/webp')
    expect(sniffImageType(new TextEncoder().encode('<svg onload=alert(1)>'))).toBeNull()
  })
})

describe('uploadPageImage', () => {
  // Envoi BRUT injecté sous uploadImageAsset (core/sanity) : c'est lui qui nettoie le nom et traduit les erreurs.
  const upload = vi.fn(async (_data: Uint8Array, _meta: { filename: string; contentType: string }) => ({
    _id: 'image-abc123def456-1200x630-png',
    url: 'https://cdn.sanity.io/x.png',
  }))

  it('image OG de la page : asset envoyé puis champ du brouillon', async () => {
    const { s, mutations } = store()
    const file = new File([PNG], 'og image.png', { type: 'image/png' })
    const result = await uploadPageImage(session, 'home', form({ target: 'seo', file }), { store: s, upload })
    expect(result).toEqual({ ok: true, assetId: 'image-abc123def456-1200x630-png', url: 'https://cdn.sanity.io/x.png' })
    expect(upload).toHaveBeenCalledWith(expect.any(Uint8Array), { filename: 'og-image.png', contentType: 'image/png' })
    expect(mutations[0].at(-1)).toMatchObject({ patch: { set: { 'seo.ogImage': { asset: { _ref: 'image-abc123def456-1200x630-png' } } } } })
  })

  it('refuse : type annoncé mensonger, SVG, trop gros, vide, cible inconnue, chemin hors manifeste', async () => {
    const { s, mutations } = store()
    const deps = { store: s, upload }
    upload.mockClear()
    expect(await uploadPageImage(session, 'home', form({ target: 'seo', file: new File([JPEG], 'x.png', { type: 'image/png' }) }), deps)).toMatchObject({ ok: false, status: 415 })
    expect(await uploadPageImage(session, 'home', form({ target: 'seo', file: new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' }) }), deps)).toMatchObject({ ok: false, status: 415 })
    const big = new Uint8Array(MAX_IMAGE_BYTES + 1)
    big.set(PNG)
    expect(await uploadPageImage(session, 'home', form({ target: 'seo', file: new File([big], 'x.png', { type: 'image/png' }) }), deps)).toMatchObject({ ok: false, status: 413 })
    expect(await uploadPageImage(session, 'home', form({ target: 'seo', file: new File([], 'x.png', { type: 'image/png' }) }), deps)).toMatchObject({ ok: false, status: 400 })
    expect(await uploadPageImage(session, 'home', form({ target: 'nope', file: new File([PNG], 'x.png', { type: 'image/png' }) }), deps)).toMatchObject({ ok: false, status: 400 })
    expect(upload).not.toHaveBeenCalled()
    const offList = await uploadPageImage(session, 'home', form({ target: 'field', path: 'seo.ogImage', file: new File([PNG], 'x.png', { type: 'image/png' }) }), deps)
    expect(offList).toMatchObject({ ok: false, error: "This field can't be edited here." })
    expect(mutations).toHaveLength(0)
  })

  it('FOLLOWUPS #40 : passe par uploadImageAsset (nom nettoyé, erreurs Sanity traduites, réponse inattendue refusée)', async () => {
    const { s, mutations } = store()
    const png = (name: string) => form({ target: 'seo', file: new File([PNG], name, { type: 'image/png' }) })
    // Nom nettoyé par safeAssetFilename (point initial retiré), plus par un code propre à pages.
    upload.mockClear()
    expect(await uploadPageImage(session, 'home', png('.cover (final).png'), { store: s, upload })).toMatchObject({ ok: true })
    expect(upload.mock.calls[0][1]).toEqual({ filename: 'cover-final-.png', contentType: 'image/png' })
    // 403 de Sanity → SanityWriteError forbidden → statut 403, message anglais, rien d'écrit.
    const before = mutations.length
    const denied = vi.fn(async () => {
      throw Object.assign(new Error('Forbidden'), { statusCode: 403 })
    })
    expect(await uploadPageImage(session, 'home', png('x.png'), { store: s, upload: denied })).toEqual({
      ok: false,
      error: "You don't have permission to edit this in Sanity.",
      status: 403,
    })
    // Réponse sans id d'image : refusée par uploadImageAsset (502), champ jamais écrit.
    const odd = vi.fn(async () => ({ _id: 'file-abc', url: 'https://cdn.sanity.io/x' }))
    expect(await uploadPageImage(session, 'home', png('x.png'), { store: s, upload: odd })).toMatchObject({ ok: false, status: 502 })
    expect(mutations).toHaveLength(before)
  })
})
