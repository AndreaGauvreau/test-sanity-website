import { describe, expect, it, vi } from 'vitest'

import type { Session } from '@/admin/core/contracts/session'

import { safeAssetFilename, uploadImageAssetWith } from './assets-core'

const session = (role: Session['role'] = 'editor'): Session => ({
  user: { id: 'u1', name: 'M', email: 'm@c.com' },
  role,
  sanityRoles: ['editor'],
  sanityToken: 'user-token',
  dev: false,
  expiresAt: '2026-09-28T00:00:00.000Z',
})
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])

describe('uploadImageAssetWith (FOLLOWUPS #20)', () => {
  it('envoie avec le nom nettoyé et le type en minuscules ; renvoie { _id, url }', async () => {
    const upload = vi.fn(async () => ({ _id: 'image-abc-1x1-png', url: 'https://cdn.sanity.io/x.png' }))
    const res = await uploadImageAssetWith(session(), upload, png, { filename: 'Mon logo (final).png', contentType: 'IMAGE/PNG' })
    expect(res).toEqual({ _id: 'image-abc-1x1-png', url: 'https://cdn.sanity.io/x.png' })
    expect(upload).toHaveBeenCalledWith(png, { filename: 'Mon-logo-final-.png', contentType: 'image/png' })
  })
  it('refuse : type hors liste, fichier vide (sans appeler Sanity)', async () => {
    const upload = vi.fn(async () => ({ _id: 'image-x', url: 'u' }))
    await expect(uploadImageAssetWith(session(), upload, png, { contentType: 'application/pdf' })).rejects.toMatchObject({ code: 'bad_request' })
    await expect(uploadImageAssetWith(session(), upload, new Uint8Array(), { contentType: 'image/png' })).rejects.toMatchObject({ message: 'This file is empty.' })
    expect(upload).not.toHaveBeenCalled()
  })
  it('traduit les erreurs de Sanity (403 → forbidden, 5xx → unavailable) ; réponse inattendue → unavailable', async () => {
    const denied = vi.fn(async () => Promise.reject(Object.assign(new Error('x'), { statusCode: 403 })))
    await expect(uploadImageAssetWith(session(), denied, png, { contentType: 'image/png' })).rejects.toMatchObject({ code: 'forbidden' })
    const down = vi.fn(async () => Promise.reject(Object.assign(new Error('x'), { statusCode: 503 })))
    await expect(uploadImageAssetWith(session(), down, png, { contentType: 'image/png' })).rejects.toMatchObject({ code: 'unavailable' })
    const odd = vi.fn(async () => ({ _id: 'file-abc', url: 'u' }))
    await expect(uploadImageAssetWith(session(), odd, png, { contentType: 'image/png' })).rejects.toMatchObject({ code: 'unavailable' })
  })
  it('accepte un ArrayBuffer', async () => {
    const upload = vi.fn(async (data: Uint8Array) => ({ _id: 'image-y', url: String(data.byteLength) }))
    expect((await uploadImageAssetWith(session(), upload, png.buffer, { contentType: 'image/webp' })).url).toBe('8')
  })
  it('safeAssetFilename', () => {
    expect(safeAssetFilename('')).toBe('image')
    expect(safeAssetFilename(null)).toBe('image')
    expect(safeAssetFilename('../../etc/passwd')).toBe('etc-passwd')
    expect(safeAssetFilename('a'.repeat(300))).toHaveLength(100)
  })
})
