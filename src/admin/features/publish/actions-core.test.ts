import { describe, expect, it, vi } from 'vitest'

import type { PublishStatus } from '@/admin/core/contracts/engine'
import { can, type AdminRole, type Capability } from '@/admin/core/contracts/roles'
import type { Session } from '@/admin/core/contracts/session'
import { EngineRequestError } from '@/admin/core/engine/errors'

import { diffCore, discardCore, publishCore, PUBLISH_MESSAGES, retryCore, rollbackCore, type ActionDeps } from './actions-core'

/** Même forme que AdminAuthError (core/auth/session.ts, server-only). */
class FakeAuthError extends Error {
  name = 'AdminAuthError'
  constructor(
    readonly status: 401 | 403,
    readonly code: 'unauthorized' | 'forbidden',
    message: string,
  ) {
    super(message)
  }
}

function session(role: AdminRole): Session {
  return {
    user: { id: `u-${role}`, name: role, email: `${role}@x.test` },
    role,
    sanityRoles: [],
    sanityToken: 'secret-token',
    dev: false,
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  }
}

const OK_STATUS: PublishStatus = { state: 'publishing', pending: { content: [], design: [], total: 0 }, deploy: { mode: 'local' } }

/** Faux client : garde du rôle (comme requireCapability) + faux moteur ; journal des appels. */
function deps(role: AdminRole | null, engine: (method: string, path: string, body: unknown) => unknown = () => OK_STATUS) {
  const calls: string[] = []
  const d: ActionDeps = {
    requireCapability: vi.fn(async (cap: Capability) => {
      calls.push(`auth:${cap}`)
      if (!role) throw new FakeAuthError(401, 'unauthorized', 'Your session has expired. Log in again.')
      if (!can(role, cap)) throw new FakeAuthError(403, 'forbidden', "You don't have access to this.")
      return session(role)
    }),
    engineFetch: vi.fn(async <T,>(s: Session, method: string, path: string, options?: { body?: unknown }) => {
      calls.push(`engine:${method} ${path}`)
      expect(s.sanityToken).toBe('secret-token') // la session complète reste côté serveur…
      const result = engine(method, path, options?.body)
      if (result instanceof Error) throw result
      return result as T
    }) as ActionDeps['engineFetch'],
    log: vi.fn(),
  }
  return { d, calls }
}

describe('publishCore (Publish N changes)', () => {
  it('droit EN PREMIER, puis moteur avec expected', async () => {
    const { d, calls } = deps('client')
    const result = await publishCore(d, { expected: ['dockSchedulingPage', 'chg-hero'] })
    expect(result).toEqual({ ok: true, data: OK_STATUS })
    expect(calls).toEqual(['auth:publish.run', 'engine:POST publish'])
    expect(d.engineFetch).toHaveBeenCalledWith(expect.anything(), 'POST', 'publish', { body: { expected: ['dockSchedulingPage', 'chg-hero'] } })
  })

  it('sans session : 401, sans appel au moteur', async () => {
    const { d, calls } = deps(null)
    const result = await publishCore(d, { expected: ['a'] })
    expect(result).toMatchObject({ ok: false, status: 401, code: 'unauthorized' })
    expect(calls).toEqual(['auth:publish.run'])
  })

  it('entrées invalides refusées par zod (ids de brouillon, chemins, champs en trop, liste vide)', async () => {
    const { d } = deps('kuartz')
    expect(await publishCore(d, { expected: ['drafts.home'] })).toMatchObject({ ok: false, code: 'bad_request' })
    expect(await publishCore(d, { expected: ['../x'] })).toMatchObject({ ok: false, code: 'bad_request' })
    expect(await publishCore(d, { expected: ['a'], force: true })).toMatchObject({ ok: false, code: 'bad_request' })
    expect(await publishCore(d, 'nope')).toMatchObject({ ok: false, code: 'bad_request', message: PUBLISH_MESSAGES.invalid })
    expect(await publishCore(d, { expected: [] })).toMatchObject({ ok: false, code: 'bad_request', message: PUBLISH_MESSAGES.nothing })
    expect(d.engineFetch).not.toHaveBeenCalled()
  })

  it('409 conflict : la liste a changé → message clair (l’interface relit l’état)', async () => {
    const { d } = deps('client', () => new EngineRequestError(409, 'conflict', 'expected mismatch'))
    const result = await publishCore(d, { expected: ['a'] })
    expect(result).toEqual({ ok: false, status: 409, code: 'conflict', message: PUBLISH_MESSAGES.conflict })
  })

  it('409 publishing : message du moteur relayé', async () => {
    const { d } = deps('editor', () => new EngineRequestError(409, 'publishing', 'A publish is already running.'))
    expect(await publishCore(d, { expected: ['a'] })).toMatchObject({ ok: false, code: 'publishing', message: 'A publish is already running.' })
  })

  it('erreur inattendue : message générique, détail seulement dans le journal serveur', async () => {
    const { d } = deps('client', () => new Error('socket hang up at 10.0.0.1'))
    const result = await publishCore(d, { expected: ['a'] })
    expect(result).toEqual({ ok: false, status: 500, code: 'internal', message: PUBLISH_MESSAGES.unexpected })
    expect(d.log).toHaveBeenCalled()
  })
})

describe('retry et discard', () => {
  it('retry : POST publish/retry', async () => {
    const { d, calls } = deps('client')
    expect(await retryCore(d)).toMatchObject({ ok: true })
    expect(calls).toEqual(['auth:publish.run', 'engine:POST publish/retry'])
  })

  it('discard : contenu (id publié) ou design (changeId), rien d’autre', async () => {
    const { d } = deps('client')
    expect(await discardCore(d, { kind: 'content', id: 'post-demo-x' })).toMatchObject({ ok: true })
    expect(d.engineFetch).toHaveBeenLastCalledWith(expect.anything(), 'POST', 'publish/discard', { body: { kind: 'content', id: 'post-demo-x' } })
    expect(await discardCore(d, { kind: 'design', changeId: 'chg-1' })).toMatchObject({ ok: true })
    expect(await discardCore(d, { kind: 'content', changeId: 'chg-1' })).toMatchObject({ ok: false, code: 'bad_request' })
    expect(await discardCore(d, { kind: 'all' })).toMatchObject({ ok: false, code: 'bad_request' })
  })

  it('discard d’un élément disparu : 404 relayé', async () => {
    const { d } = deps('client', () => new EngineRequestError(404, 'not_found', 'This draft no longer exists.'))
    expect(await discardCore(d, { kind: 'content', id: 'x' })).toMatchObject({ ok: false, status: 404, message: 'This draft no longer exists.' })
  })
})

describe('droits du diff et du retour arrière (Kuartz seulement)', () => {
  it('diff : Kuartz lit le diff', async () => {
    const { d, calls } = deps('kuartz', () => ({ diff: '+ a' }))
    expect(await diffCore(d, { changeId: 'chg-hero' })).toEqual({ ok: true, data: { diff: '+ a' } })
    expect(calls).toEqual(['auth:publish.diff', 'engine:GET publish/diff/chg-hero'])
  })

  it.each(['client', 'editor'] as const)('diff : %s refusé (403) sans appel au moteur', async (role) => {
    const { d, calls } = deps(role)
    expect(await diffCore(d, { changeId: 'chg-hero' })).toMatchObject({ ok: false, status: 403, code: 'forbidden' })
    expect(calls).toEqual(['auth:publish.diff'])
  })

  it('diff : id hostile refusé', async () => {
    const { d } = deps('kuartz')
    expect(await diffCore(d, { changeId: '../../etc' })).toMatchObject({ ok: false, code: 'bad_request' })
  })

  it('rollback : client refusé ; Kuartz en mode local → 501 avec un message clair', async () => {
    expect(await rollbackCore(deps('client').d, { number: 12 })).toMatchObject({ ok: false, status: 403 })
    const { d } = deps('kuartz', () => new EngineRequestError(501, 'not_implemented', 'Not implemented'))
    expect(await rollbackCore(d, { number: 12 })).toEqual({
      ok: false,
      status: 501,
      code: 'not_implemented',
      message: PUBLISH_MESSAGES.rollbackLocal,
    })
    expect(await rollbackCore(d, { number: 0 })).toMatchObject({ ok: false, code: 'bad_request' })
    expect(await rollbackCore(d, { number: '12' })).toMatchObject({ ok: false, code: 'bad_request' })
  })
})
