import { describe, expect, it, vi } from 'vitest'

import { UPLOAD_MAX_BODY, UPLOAD_TOO_LARGE } from './fields'
import { handleGeneralImageUpload, readBodyCapped, type GeneralUploadRouteDeps } from './upload-route'

/**
 * Logique de la route d'envoi de B2 (FOLLOWUPS #40) avec de vrais objets Request : ordre des contrôles (droit EN
 * PREMIER), même origine, corps borné (annoncé et réel), multipart, erreurs traduites.
 */

const ORIGIN = 'http://127.0.0.1:4040'
const IMAGE = { ref: 'image-a-64x64-png', url: 'https://cdn.sanity.io/images/p/d/a-64x64.png', width: 64, height: 64 }

function deps(patch: Partial<GeneralUploadRouteDeps> = {}) {
  const order: string[] = []
  const d = {
    authorize: vi.fn(async () => {
      order.push('authorize')
      return null
    }),
    jsonError: (status: number, code: string, message: string) => Response.json({ error: { code, message } }, { status }),
    upload: vi.fn(async (form: FormData) => {
      order.push(`upload:${String(form.get('slot'))}`)
      return { ok: true as const, image: IMAGE }
    }),
    ...patch,
  }
  return { d, order }
}

function formRequest(headers: Record<string, string> = {}, size = 8): Request {
  const f = new FormData()
  f.set('slot', 'faviconLight')
  f.set('file', new File([new Uint8Array(size)], 'a.png', { type: 'image/png' }))
  return new Request(`${ORIGIN}/admin/settings/general/image`, { method: 'POST', body: f, headers: { host: '127.0.0.1:4040', origin: ORIGIN, ...headers } })
}

/** Corps en flux, sans Content-Length : seule la lecture bornée l'arrête. */
function streamRequest(total: number): Request {
  let sent = 0
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= total) return controller.close()
      const chunk = new Uint8Array(Math.min(64 * 1024, total - sent))
      sent += chunk.byteLength
      controller.enqueue(chunk)
    },
  })
  return new Request(`${ORIGIN}/admin/settings/general/image`, {
    method: 'POST',
    body,
    headers: { host: '127.0.0.1:4040', 'content-type': 'multipart/form-data; boundary=x' },
    duplex: 'half',
  } as RequestInit)
}

describe('handleGeneralImageUpload', () => {
  it('droit vérifié EN PREMIER, puis envoi ; réponse { ok, image } sans cache', async () => {
    const { d, order } = deps()
    const response = await handleGeneralImageUpload(formRequest(), d)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({ ok: true, image: IMAGE })
    expect(order).toEqual(['authorize', 'upload:faviconLight'])
  })

  it('refus de la garde : sa réponse telle quelle, corps non lu, aucun envoi', async () => {
    const { d } = deps({ authorize: async () => Response.json({ error: { code: 'unauthorized', message: 'x' } }, { status: 401 }) })
    const request = formRequest()
    expect((await handleGeneralImageUpload(request, d)).status).toBe(401)
    expect(request.bodyUsed).toBe(false)
    expect(d.upload).not.toHaveBeenCalled()
  })

  it('autre origine ou Sec-Fetch-Site cross-site : 403', async () => {
    const cases: Record<string, string>[] = [{ origin: 'https://evil.example' }, { 'sec-fetch-site': 'cross-site' }, { origin: 'null' }]
    for (const headers of cases) {
      const { d } = deps()
      const response = await handleGeneralImageUpload(formRequest(headers), d)
      expect(response.status).toBe(403)
      expect(d.upload).not.toHaveBeenCalled()
    }
  })

  it('taille annoncée au-delà de la borne : 413 sans lire le corps', async () => {
    const { d } = deps()
    const request = formRequest({ 'content-length': String(UPLOAD_MAX_BODY + 1) })
    const response = await handleGeneralImageUpload(request, d)
    expect(response.status).toBe(413)
    await expect(response.json()).resolves.toEqual({ error: { code: 'bad_request', message: UPLOAD_TOO_LARGE } })
    expect(request.bodyUsed).toBe(false)
    expect(d.upload).not.toHaveBeenCalled()
  })

  it('Content-Length invalide : 400', async () => {
    const { d } = deps()
    expect((await handleGeneralImageUpload(formRequest({ 'content-length': 'abc' }), d)).status).toBe(400)
  })

  it('corps sans Content-Length plus long que la borne : coupé, 413', async () => {
    const { d } = deps({ maxBody: 100 * 1024 })
    const response = await handleGeneralImageUpload(streamRequest(300 * 1024), d)
    expect(response.status).toBe(413)
    expect(d.upload).not.toHaveBeenCalled()
  })

  it('borne par défaut = 5 Mo + enveloppe : un fichier de 5 Mo passe', async () => {
    const { d } = deps()
    const response = await handleGeneralImageUpload(formRequest({}, 5 * 1024 * 1024), d)
    expect(response.status).toBe(200)
  })

  it('corps qui n’est pas du multipart : 400 « Invalid upload. »', async () => {
    const { d } = deps()
    const request = new Request(`${ORIGIN}/admin/settings/general/image`, {
      method: 'POST',
      body: JSON.stringify({ slot: 'faviconLight' }),
      headers: { host: '127.0.0.1:4040', 'content-type': 'application/json' },
    })
    const response = await handleGeneralImageUpload(request, d)
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: { code: 'bad_request', message: 'Invalid upload.' } })
  })

  it('refus métier : 400 { ok: false, error }', async () => {
    const { d } = deps({ upload: async () => ({ ok: false as const, error: 'Use a PNG, JPG or WebP image.' }) })
    const response = await handleGeneralImageUpload(formRequest(), d)
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ ok: false, error: 'Use a PNG, JPG or WebP image.' })
  })

  it('erreurs levées : SanityWriteError traduite (403 / 503), inattendue → message générique 500, sans détail', async () => {
    const sanityError = (code: string, message: string) => Object.assign(new Error(message), { name: 'SanityWriteError', code })
    const cases: [unknown, number, string][] = [
      [sanityError('forbidden', "You don't have access to this."), 403, "You don't have access to this."],
      [sanityError('unavailable', "Sanity isn't responding."), 503, "Sanity isn't responding."],
      [sanityError('bad_request', 'This file type is not supported.'), 400, 'This file type is not supported.'],
      [new Error('secret token abc leaked'), 500, "Couldn't save this change. Please try again."],
    ]
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    for (const [err, status, message] of cases) {
      const { d } = deps({ upload: async () => Promise.reject(err) })
      const response = await handleGeneralImageUpload(formRequest(), d)
      expect(response.status).toBe(status)
      await expect(response.json()).resolves.toEqual({ ok: false, error: message })
    }
    expect(spy).toHaveBeenCalledTimes(1)
    spy.mockRestore()
  })
})

describe('readBodyCapped', () => {
  it('renvoie les octets sous la borne, « too-large » au-delà', async () => {
    await expect(readBodyCapped(streamRequest(1000), 2000)).resolves.toHaveLength(1000)
    await expect(readBodyCapped(streamRequest(3000), 2000)).resolves.toBe('too-large')
  })
})
