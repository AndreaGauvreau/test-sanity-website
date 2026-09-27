import { describe, expect, it, vi } from 'vitest'

import { checkUpload, IMAGE_ACCEPT, IMAGE_FORMATS_LABEL, UPLOAD_ACCEPT, UPLOAD_MAX_BODY, UPLOAD_MAX_BYTES, uploadLimitLabel } from '../lib/upload-limits'
import type { UploadInput } from './actions-core'
import { handleUploadRequest, readBodyCapped, type UploadRouteDeps } from './upload-route'

const MB = 1024 * 1024
const ORIGIN = 'http://127.0.0.1:4040'

function jsonError(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status })
}

function deps(overrides: Partial<UploadRouteDeps> = {}) {
  const upload = vi.fn(async (file: UploadInput) => ({
    ok: true as const,
    asset: { id: 'file-abc-pdf', name: file.name, size: file.size } as never,
    updated: 0,
  }))
  return { upload, deps: { authorize: async () => null, jsonError, upload, ...overrides } satisfies UploadRouteDeps }
}

function multipart(size: number, type = 'application/pdf', name = 'big.pdf'): Request {
  const form = new FormData()
  form.append('file', new File([new Uint8Array(size)], name, { type }))
  return new Request(`${ORIGIN}/admin/media/upload`, { method: 'POST', body: form, headers: { origin: ORIGIN, host: '127.0.0.1:4040' } })
}

/** Corps en flux SANS Content-Length (transfert « chunked ») de `size` octets. */
function streamed(size: number): Request {
  let sent = 0
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= size) return controller.close()
      const n = Math.min(64 * 1024, size - sent)
      sent += n
      controller.enqueue(new Uint8Array(n))
    },
  })
  return new Request(`${ORIGIN}/admin/media/upload`, {
    method: 'POST',
    body,
    headers: { origin: ORIGIN, host: '127.0.0.1:4040', 'content-type': 'multipart/form-data; boundary=x' },
    duplex: 'half',
  } as RequestInit)
}

describe('POST /admin/media/upload (handleUploadRequest)', () => {
  it('QA-1 : un fichier de 12 Mo (au-delà des 10 Mo du proxy) arrive entier à uploadCore', async () => {
    const { deps: d, upload } = deps()
    const res = await handleUploadRequest(multipart(12 * MB), d)
    expect(res.status).toBe(200)
    expect(upload).toHaveBeenCalledTimes(1)
    const [file] = upload.mock.calls[0]
    expect(file.size).toBe(12 * MB)
    expect(file.data.byteLength).toBe(12 * MB)
    expect(file.type).toBe('application/pdf')
  })

  it('une vidéo de 100 Mo (limite annoncée) passe la borne du corps', async () => {
    const { deps: d, upload } = deps()
    const res = await handleUploadRequest(multipart(UPLOAD_MAX_BYTES.video, 'video/mp4', 'clip.mp4'), d)
    expect(res.status).toBe(200)
    expect(upload.mock.calls[0][0].size).toBe(UPLOAD_MAX_BYTES.video)
  })

  it('corps sans Content-Length plus long que la borne : 413, lecture arrêtée, rien envoyé', async () => {
    const { deps: d, upload } = deps({ maxBody: 1 * MB })
    const res = await handleUploadRequest(streamed(3 * MB), d)
    expect(res.status).toBe(413)
    expect(upload).not.toHaveBeenCalled()
  })

  it('Content-Length annoncé au-delà de la borne : 413 sans lire le corps', async () => {
    const { deps: d, upload } = deps({ maxBody: 1 * MB })
    const res = await handleUploadRequest(multipart(2 * MB), d)
    expect(res.status).toBe(413)
    expect(await res.json()).toEqual({ error: { code: 'bad_request', message: 'This file is too large.' } })
    expect(upload).not.toHaveBeenCalled()
  })

  it('droit vérifié EN PREMIER : réponse du garde, corps jamais lu', async () => {
    const request = multipart(1024)
    const { deps: d, upload } = deps({ authorize: async () => jsonError(401, 'unauthenticated', 'Sign in.') })
    const res = await handleUploadRequest(request, d)
    expect(res.status).toBe(401)
    expect(request.bodyUsed).toBe(false)
    expect(upload).not.toHaveBeenCalled()
  })

  it('requête d’une autre origine : 403', async () => {
    const form = new FormData()
    form.append('file', new File([new Uint8Array(10)], 'a.pdf', { type: 'application/pdf' }))
    const request = new Request(`${ORIGIN}/admin/media/upload`, { method: 'POST', body: form, headers: { origin: 'https://evil.example', host: '127.0.0.1:4040' } })
    const { deps: d, upload } = deps()
    expect((await handleUploadRequest(request, d)).status).toBe(403)
    expect(upload).not.toHaveBeenCalled()
  })

  it('multipart invalide : 400 « Invalid upload. » ; sans fichier : message clair', async () => {
    const { deps: d } = deps()
    const bad = new Request(`${ORIGIN}/admin/media/upload`, { method: 'POST', body: 'nope', headers: { origin: ORIGIN, host: '127.0.0.1:4040', 'content-type': 'multipart/form-data; boundary=x' } })
    expect((await handleUploadRequest(bad, d)).status).toBe(400)
    const form = new FormData()
    form.append('other', 'x')
    const empty = new Request(`${ORIGIN}/admin/media/upload`, { method: 'POST', body: form, headers: { origin: ORIGIN, host: '127.0.0.1:4040' } })
    const res = await handleUploadRequest(empty, d)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ ok: false, error: 'Choose a file to upload.' })
  })

  it('readBodyCapped : lit tout sous la borne', async () => {
    const out = await readBodyCapped(streamed(200 * 1024), 1 * MB)
    expect(out).not.toBe('too-large')
    expect((out as Uint8Array).byteLength).toBe(200 * 1024)
  })
})

describe('limites d’envoi (une seule source)', () => {
  it('libellés « MB max » tirés de UPLOAD_MAX_BYTES', () => {
    expect(uploadLimitLabel('image')).toBe(`${UPLOAD_MAX_BYTES.image / MB} MB`)
    expect(IMAGE_FORMATS_LABEL).toContain(`${uploadLimitLabel('image')} max`)
    expect(checkUpload({ type: 'video/mp4', size: UPLOAD_MAX_BYTES.video + 1 })).toBe(`This file is too large (${uploadLimitLabel('video')} max).`)
  })

  it('la borne du corps couvre le plus gros fichier permis', () => {
    expect(UPLOAD_MAX_BODY).toBeGreaterThan(Math.max(...Object.values(UPLOAD_MAX_BYTES)))
  })

  it('accept : liste blanche exacte (pas de image/*), le champ image ne propose que des images', () => {
    expect(UPLOAD_ACCEPT).not.toContain('image/*')
    expect(IMAGE_ACCEPT.split(',').every((t) => t.startsWith('image/'))).toBe(true)
    expect(IMAGE_ACCEPT).toContain('image/avif')
  })
})
