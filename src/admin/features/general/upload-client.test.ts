import { describe, expect, it, vi } from 'vitest'

import { GENERAL_IMAGE_ROUTE, uploadGeneralImageRequest } from './upload-client'

/** Envoi d'image de B2 côté navigateur (FOLLOWUPS #40) : route handler, résultat normalisé quelle que soit la réponse. */

const IMAGE = { ref: 'image-a-64x64-png', url: 'https://cdn.sanity.io/images/p/d/a-64x64.png', width: 64, height: 64 }

function fakeFetch(response: Response | Error) {
  return vi.fn(async () => {
    if (response instanceof Error) throw response
    return response
  }) as unknown as typeof fetch & { mock: { calls: unknown[][] } }
}

describe('uploadGeneralImageRequest', () => {
  it('POST multipart sur la route de B2 (même origine), pas une server action', async () => {
    const form = new FormData()
    form.set('slot', 'faviconLight')
    const fetchImpl = fakeFetch(Response.json({ ok: true, image: IMAGE }))
    await expect(uploadGeneralImageRequest(form, fetchImpl)).resolves.toEqual({ ok: true, image: IMAGE })
    expect(GENERAL_IMAGE_ROUTE).toBe('/admin/settings/general/image')
    expect(fetchImpl.mock.calls[0]).toEqual([GENERAL_IMAGE_ROUTE, { method: 'POST', body: form, credentials: 'same-origin' }])
  })

  it('erreurs : { ok: false, error } ; { error: { message } } ; redirection ; illisible ; réseau', async () => {
    const form = new FormData()
    await expect(uploadGeneralImageRequest(form, fakeFetch(Response.json({ ok: false, error: 'Use a PNG, JPG or WebP image.' }, { status: 400 })))).resolves.toEqual({
      ok: false,
      error: 'Use a PNG, JPG or WebP image.',
    })
    await expect(
      uploadGeneralImageRequest(form, fakeFetch(Response.json({ error: { code: 'bad_request', message: 'This image is larger than 5 MB. Use a smaller file.' } }, { status: 413 }))),
    ).resolves.toEqual({ ok: false, error: 'This image is larger than 5 MB. Use a smaller file.' })
    const redirected = new Response('<html>', { status: 200 })
    Object.defineProperty(redirected, 'redirected', { value: true })
    await expect(uploadGeneralImageRequest(form, fakeFetch(redirected))).resolves.toEqual({ ok: false, error: 'Your session has expired. Sign in again.' })
    await expect(uploadGeneralImageRequest(form, fakeFetch(new Response('oops', { status: 502 })))).resolves.toEqual({
      ok: false,
      error: "Couldn't save this change. Please try again.",
    })
    await expect(uploadGeneralImageRequest(form, fakeFetch(new TypeError('Failed to fetch')))).resolves.toEqual({
      ok: false,
      error: "Couldn't reach the server. Check your connection and try again.",
    })
  })
})
