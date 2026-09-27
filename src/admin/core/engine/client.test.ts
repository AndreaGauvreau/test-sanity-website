import { describe, expect, it, vi } from 'vitest'

import { EngineClientError, engineClient } from './client'

function fakeFetch(response: Response | Error) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
    if (response instanceof Error) throw response
    return response
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>
}

describe('engineClient (navigateur → relais)', () => {
  it('appelle le relais same-origin, sans secret', async () => {
    const f = fakeFetch(Response.json({ ok: true }))
    await engineClient.editor.state('/', { fetchImpl: f })
    const [url, init] = f.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/admin/api/engine/editor/state?page=%2F')
    expect(init.credentials).toBe('same-origin')
    expect(new Headers(init.headers).get('authorization')).toBeNull()
  })
  it('POST JSON', async () => {
    const f = fakeFetch(Response.json({ id: 'j1' }, { status: 201 }))
    await engineClient.editor.answer('j 1', [{ questionId: 'q1', optionId: 'a' }], { fetchImpl: f })
    const [url, init] = f.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/admin/api/engine/editor/jobs/j%201/answer')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ answers: [{ questionId: 'q1', optionId: 'a' }] })
  })
  it('erreur du contrat → EngineClientError avec le message anglais', async () => {
    const f = fakeFetch(Response.json({ error: { code: 'busy', message: 'Claude is already working.' } }, { status: 409 }))
    await expect(engineClient.editor.request({} as never, { fetchImpl: f })).rejects.toMatchObject({ status: 409, code: 'busy', message: 'Claude is already working.' })
  })
  it('réseau coupé → unavailable ; réponse illisible → internal', async () => {
    await expect(engineClient.health({ fetchImpl: fakeFetch(new TypeError('Failed to fetch')) })).rejects.toBeInstanceOf(EngineClientError)
    await expect(engineClient.health({ fetchImpl: fakeFetch(new Response('<html>', { status: 500 })) })).rejects.toMatchObject({ code: 'internal' })
  })
  it('shotUrl pour <img>', () => {
    expect(engineClient.editor.shotUrl('j1', '001-before.png')).toBe('/admin/api/engine/editor/jobs/j1/shots/001-before.png')
  })
})
