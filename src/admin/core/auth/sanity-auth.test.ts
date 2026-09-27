import { describe, expect, it, vi } from 'vitest'

import { buildProviderLoginUrl, exchangeSid, fetchProviders, fetchSanityMe, isPlausibleSid, revokeSanityToken } from './sanity-auth'

const SID = 'abcdefghijklmnopqrstuvwxyz0123'

function fakeFetch(routes: Record<string, (init?: RequestInit) => Response>) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const key = Object.keys(routes).find((k) => url.startsWith(k))
    if (!key) throw new Error(`unexpected ${url}`)
    return routes[key](init)
  })
}

describe('fetchProviders', () => {
  it('lit /auth/providers et filtre les entrées douteuses', async () => {
    const f = fakeFetch({
      'https://api.sanity.io/v2021-06-07/auth/providers': () =>
        Response.json({
          providers: [
            { name: 'google', title: 'Google', url: 'https://api.sanity.io/v1/auth/login/google' },
            { name: 'evil', title: 'Evil', url: 'https://evil.com/login' },
            { name: 'x y', title: 'Bad', url: 'https://api.sanity.io/v1/auth/login/x' },
            { name: 'github' },
          ],
        }),
    })
    expect(await fetchProviders(f)).toEqual([{ name: 'google', title: 'Google', url: 'https://api.sanity.io/v1/auth/login/google' }])
  })
})

describe('buildProviderLoginUrl', () => {
  it('suit le flux token du Studio : origin=callback?next, projectId, withSid=true', () => {
    const url = new URL(
      buildProviderLoginUrl({
        provider: { name: 'google', title: 'Google', url: 'https://api.sanity.io/v1/auth/login/google' },
        projectId: 'dwa2djm3',
        adminOrigin: 'http://127.0.0.1:4040',
        next: '/admin/media',
      }),
    )
    expect(url.origin + url.pathname).toBe('https://api.sanity.io/v1/auth/login/google')
    expect(url.searchParams.get('origin')).toBe('http://127.0.0.1:4040/admin/auth/callback?next=%2Fadmin%2Fmedia')
    expect(url.searchParams.get('projectId')).toBe('dwa2djm3')
    expect(url.searchParams.get('withSid')).toBe('true')
  })
  it('nettoie un next hostile', () => {
    const url = new URL(
      buildProviderLoginUrl({
        provider: { name: 'google', title: 'Google', url: 'https://api.sanity.io/v1/auth/login/google' },
        projectId: 'p',
        adminOrigin: 'https://conduit.com',
        next: 'https://evil.com',
      }),
    )
    expect(url.searchParams.get('origin')).toBe('https://conduit.com/admin/auth/callback?next=%2Fadmin')
  })
})

describe('exchangeSid / fetchSanityMe / revoke', () => {
  it('échange le sid sur l’hôte du projet', async () => {
    const f = fakeFetch({ 'https://dwa2djm3.api.sanity.io/v2021-06-07/auth/fetch?sid=': () => Response.json({ token: 'user-token-abcdef' }) })
    expect(await exchangeSid('dwa2djm3', SID, f)).toBe('user-token-abcdef')
    expect(f.mock.calls[0][0]).toBe(`https://dwa2djm3.api.sanity.io/v2021-06-07/auth/fetch?sid=${SID}`)
  })
  it('sid inconnu (404) → invalid-sid ; réseau → unavailable', async () => {
    const f404 = fakeFetch({ 'https://p.api.sanity.io': () => Response.json({ message: 'Session not found' }, { status: 404 }) })
    await expect(exchangeSid('p', SID, f404)).rejects.toMatchObject({ kind: 'invalid-sid' })
    const down = vi.fn(async () => {
      throw new TypeError('fetch failed')
    })
    await expect(exchangeSid('p', SID, down)).rejects.toMatchObject({ kind: 'unavailable' })
  })
  it('refuse un sid mal formé sans appeler Sanity', async () => {
    const f = vi.fn()
    expect(isPlausibleSid('short')).toBe(false)
    expect(isPlausibleSid(`${SID}&x=1`)).toBe(false)
    await expect(exchangeSid('p', 'short', f)).rejects.toMatchObject({ kind: 'invalid-sid' })
    expect(f).not.toHaveBeenCalled()
  })
  it('lit identité et rôles du projet (roles[].name et role)', async () => {
    const f = fakeFetch({
      'https://p.api.sanity.io/v2021-06-07/users/me': (init) => {
        expect(new Headers(init?.headers).get('authorization')).toBe('Bearer tok-1234567890')
        return Response.json({ id: 'pUser', name: 'Marie', email: 'm@c.com', profileImage: 'https://img', role: 'administrator', roles: [{ name: 'administrator', title: 'Administrator' }, { name: 'editor' }] })
      },
    })
    expect(await fetchSanityMe('p', 'tok-1234567890', f)).toEqual({
      id: 'pUser',
      name: 'Marie',
      email: 'm@c.com',
      imageUrl: 'https://img',
      roles: ['administrator', 'editor'],
    })
  })
  it('revokeSanityToken ne lève jamais', async () => {
    const down = vi.fn(async () => {
      throw new Error('x')
    })
    expect(await revokeSanityToken('p', 't', down)).toBe(false)
    const ok = fakeFetch({ 'https://p.api.sanity.io/v2021-06-07/auth/logout': (init) => {
      expect(init?.method).toBe('POST')
      return new Response(null, { status: 200 })
    } })
    expect(await revokeSanityToken('p', 't', ok)).toBe(true)
  })
})
