import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const revalidateTag = vi.fn()
const revalidatePath = vi.fn()
vi.mock('next/cache', () => ({ revalidateTag, revalidatePath }))

const { POST } = await import('./route')

const SECRET = 'test-revalidate-secret'

function request(body: unknown, secret: string | null = SECRET) {
  const headers = new Headers({ 'content-type': 'application/json' })
  if (secret !== null) headers.set('x-kz-revalidate', secret)
  return new Request('http://127.0.0.1:4040/api/revalidate', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.stubEnv('REVALIDATE_SECRET', SECRET)
  revalidateTag.mockClear()
  revalidatePath.mockClear()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('POST /api/revalidate', () => {
  it('401 sans en-tête, avec un faux secret, ou si le serveur n’a pas de secret', async () => {
    expect((await POST(request({}, null))).status).toBe(401)
    expect((await POST(request({}, 'wrong')))).toHaveProperty('status', 401)
    expect((await POST(request({}, `${SECRET}x`))).status).toBe(401)
    vi.stubEnv('REVALIDATE_SECRET', '')
    expect((await POST(request({}, '')))).toHaveProperty('status', 401)
    expect(revalidateTag).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('tags → revalidateTag(tag, { expire: 0 }) ; chemins → revalidatePath', async () => {
    const response = await POST(request({ tags: ['sanity:abc', 'sanity:abc'], paths: ['/', '/blog/[slug]'] }))
    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json).toMatchObject({ revalidated: true, tags: ['sanity:abc'], paths: ['/', '/blog/[slug]'] })
    expect(revalidateTag).toHaveBeenCalledExactlyOnceWith('sanity:abc', { expire: 0 })
    expect(revalidatePath).toHaveBeenCalledWith('/')
    expect(revalidatePath).toHaveBeenCalledWith('/blog/[slug]', 'page')
  })

  it('corps vide : tout le site', async () => {
    expect((await POST(request(''))).status).toBe(200)
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith('/', 'layout')
  })

  it('400 : JSON invalide, clé inconnue, chemin hors site ou traversée', async () => {
    for (const body of ['{', { other: 1 }, { paths: ['https://evil.test/'] }, { paths: ['/a/../b'] }, { tags: [''] }]) {
      expect((await POST(request(body))).status).toBe(400)
    }
    expect(revalidateTag).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
