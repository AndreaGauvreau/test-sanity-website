import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import { verifyPreviewToken } from '../../../src/admin/core/engine/preview-token'
import { createPreviewCredential, createPreviewSignal, ENGINE_PREVIEW_TOKEN_TTL, ENGINE_PREVIEW_UID } from './visible'

/** Accès du moteur à l'aperçu : jeton dérivé du secret racine (le proxy n'accepte plus le secret racine, SEC-09). */

const ROOT = 'preview-root-secret-0123456789'

describe('createPreviewCredential', () => {
  it('jeton du moteur valide 2 h, jamais le secret racine, réutilisé puis renouvelé à moins d’1 h de la fin', async () => {
    let now = Date.parse('2026-09-27T10:00:00Z')
    const credential = createPreviewCredential(ROOT, { now: () => now })
    const first = await credential()
    assert.notEqual(first, ROOT)
    assert.ok(!first.includes(ROOT))
    const verified = await verifyPreviewToken(ROOT, first, now / 1000)
    assert.equal(verified?.exp, now / 1000 + ENGINE_PREVIEW_TOKEN_TTL)
    assert.equal(Buffer.from(first.split('.')[2], 'base64url').toString(), ENGINE_PREVIEW_UID)
    now += 30 * 60_000
    assert.equal(await credential(), first)
    now += 31 * 60_000
    const renewed = await credential()
    assert.notEqual(renewed, first)
    assert.ok(await verifyPreviewToken(ROOT, renewed, now / 1000))
  })

  it('le signal d’aperçu envoie le jeton en cookie', async () => {
    const cookies: string[] = []
    const signal = createPreviewSignal({
      origin: 'http://127.0.0.1:4999',
      secret: createPreviewCredential(ROOT),
      minDelayMs: 0,
      fetchImpl: (async (_url: unknown, init?: RequestInit) => {
        cookies.push(new Headers(init?.headers).get('cookie') ?? '')
        return new Response('<p>Hello</p>')
      }) as typeof fetch,
    })
    assert.equal(await signal.waitFresh('/', ['Hello']), true)
    const token = cookies[0].replace(/^kz_preview=/, '')
    assert.ok(await verifyPreviewToken(ROOT, token))
  })
})
