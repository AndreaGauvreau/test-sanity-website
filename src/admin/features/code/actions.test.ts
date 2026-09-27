import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Server actions de B3 avec un faux Sanity en mémoire (getDocuments / mutate) et une fausse session :
 * droits (Kuartz seulement, revérifiés à chaque écriture), validation des entrées, écritures dans le BROUILLON.
 */

type Doc = { _id: string; _type: string; [k: string]: unknown }
const db = new Map<string, Doc>()
const mutations: unknown[][] = []
const state: { role: 'kuartz' | 'client' | 'editor' | null } = { role: 'kuartz' }

class FakeAuthError extends Error {
  constructor(
    readonly status: 401 | 403,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

vi.mock('server-only', () => ({}))
const refresh = vi.fn()
vi.mock('next/cache', () => ({ refresh: () => refresh() }))
vi.mock('@/admin/core/auth/session', async () => {
  const { can } = await import('@/admin/core/contracts/roles')
  return {
    AdminAuthError: FakeAuthError,
    requireCapability: async (cap: 'settings.code', ctx: string) => {
      if (ctx !== 'action') throw new Error('contexte action attendu')
      if (!state.role) throw new FakeAuthError(401, 'unauthorized', 'expired')
      if (!can(state.role, cap)) throw new FakeAuthError(403, 'forbidden', 'forbidden')
      return { role: state.role, dev: true, sanityToken: null, user: { id: 'u', name: 'Andrea', email: 'a@k.studio' } }
    },
  }
})

/** Applique les mutations Sanity utilisées par core/sanity (createIfNotExists, patch set/unset à clé). */
function applyPatch(doc: Doc, set: Record<string, unknown> = {}, unset: string[] = []) {
  const keyed = /^scripts\[_key=="([\w-]+)"\](?:\.(\w+))?$/
  for (const [path, value] of Object.entries(set)) {
    const m = keyed.exec(path)
    if (!m) doc[path] = value
    else {
      const item = (doc.scripts as Record<string, unknown>[]).find((s) => s._key === m[1])
      if (item && m[2]) item[m[2]] = value
    }
  }
  for (const path of unset) {
    const m = keyed.exec(path)
    if (m && !m[2]) doc.scripts = (doc.scripts as Record<string, unknown>[]).filter((s) => s._key !== m[1])
    else delete doc[path]
  }
}

vi.mock('@/admin/core/sanity/clients', () => ({
  getReadClient: () => ({ fetch: async () => 0 }),
  getWriteClient: () => ({
    getDocuments: async (ids: string[]) => ids.map((id) => (db.has(id) ? structuredClone(db.get(id)!) : null)),
    mutate: async (list: Record<string, never>[]) => {
      mutations.push(list)
      for (const m of list as Record<string, Record<string, unknown>>[]) {
        if (m.createIfNotExists && !db.has(m.createIfNotExists._id as string)) db.set(m.createIfNotExists._id as string, structuredClone(m.createIfNotExists) as Doc)
        if (m.patch) applyPatch(db.get(m.patch.id as string)!, m.patch.set as Record<string, unknown>, m.patch.unset as string[])
      }
    },
  }),
}))

const actions = await import('./actions')

const PUBLISHED: Doc = {
  _id: 'siteSettings',
  _type: 'siteSettings',
  _rev: 'r1',
  title: 'Conduit',
  scripts: [
    { _key: 'css', _type: 'siteScript', name: 'CSS_base', placement: 'headEnd', page: 'all', run: 'once', code: '<style>img{}</style>', enabled: true },
    { _key: 'gtm', _type: 'siteScript', name: 'Google Tag Manager', placement: 'bodyStart', page: 'all', run: 'once', code: '<script>gtm()</script>', enabled: true },
  ],
}

const draft = () => db.get('drafts.siteSettings')!
const keys = () => (draft().scripts as { _key: string }[]).map((s) => s._key)
const values = { name: 'Hotjar', placement: 'bodyEnd' as const, page: 'home', run: 'everyPageVisit' as const, code: '<script>hj()</script>' }

beforeEach(() => {
  db.clear()
  db.set('siteSettings', structuredClone(PUBLISHED))
  mutations.length = 0
  refresh.mockReset()
  state.role = 'kuartz'
})

describe('droits de B3', () => {
  it.each(['client', 'editor'] as const)('refuse le rôle %s sans rien écrire', async (role) => {
    state.role = role
    const results = await Promise.all([
      actions.saveScriptAction({ values }),
      actions.setScriptEnabledAction({ key: 'css', enabled: false }),
      actions.deleteScriptAction({ key: 'css' }),
      actions.moveScriptAction({ key: 'gtm', direction: 'up' }),
    ])
    for (const r of results) expect(r).toEqual({ ok: false, error: "You don't have access to this." })
    expect(mutations).toHaveLength(0)
    expect(refresh).not.toHaveBeenCalled()
  })

  it('session expirée', async () => {
    state.role = null
    expect(await actions.deleteScriptAction({ key: 'css' })).toEqual({ ok: false, error: 'Your session has expired. Sign in again.' })
    expect(mutations).toHaveLength(0)
  })

  it('le droit est vérifié AVANT la validation des entrées', async () => {
    state.role = 'client'
    expect(await actions.deleteScriptAction({ key: 'bad key!' })).toEqual({ ok: false, error: "You don't have access to this." })
  })
})

describe('écritures (Kuartz)', () => {
  it('ajout : en dernier, actif, dans le brouillon créé depuis le publié', async () => {
    const r = await actions.saveScriptAction({ values })
    expect(r.ok).toBe(true)
    expect(keys()).toEqual(['css', 'gtm', (r as { key: string }).key])
    expect((draft().scripts as Record<string, unknown>[])[2]).toMatchObject({ _type: 'siteScript', name: 'Hotjar', enabled: true })
    expect(draft().title).toBe('Conduit')
    expect(db.get('siteSettings')!.scripts).toHaveLength(2)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('modification : chemins à clé seulement, nom rogné', async () => {
    const r = await actions.saveScriptAction({ key: 'gtm', values: { ...values, name: '  GTM  ' } })
    expect(r).toEqual({ ok: true, key: 'gtm' })
    const patch = (mutations.at(-1)!.at(-1) as { patch: { set: Record<string, unknown> } }).patch
    expect(Object.keys(patch.set)).toEqual(['name', 'placement', 'page', 'run', 'code'].map((f) => `scripts[_key=="gtm"].${f}`))
    expect((draft().scripts as Record<string, unknown>[])[1]).toMatchObject({ name: 'GTM', page: 'home', run: 'everyPageVisit' })
  })

  it('script supprimé entre-temps : message clair', async () => {
    const r = await actions.saveScriptAction({ key: 'gone', values })
    expect(r).toEqual({ ok: false, error: 'This item no longer exists. Reload and try again.' })
  })

  it('activation / désactivation', async () => {
    expect((await actions.setScriptEnabledAction({ key: 'css', enabled: false })).ok).toBe(true)
    expect((draft().scripts as Record<string, unknown>[])[0].enabled).toBe(false)
  })

  it('suppression', async () => {
    expect((await actions.deleteScriptAction({ key: 'css' })).ok).toBe(true)
    expect(keys()).toEqual(['gtm'])
  })

  it('déplacement : échange avec le voisin, refus aux bords', async () => {
    expect((await actions.moveScriptAction({ key: 'gtm', direction: 'up' })).ok).toBe(true)
    expect(keys()).toEqual(['gtm', 'css'])
    expect(await actions.moveScriptAction({ key: 'gtm', direction: 'up' })).toEqual({ ok: false, error: 'This script is already first.' })
    expect(await actions.moveScriptAction({ key: 'gtm', direction: 'sideways' as never })).toEqual({ ok: false, error: 'Invalid request.' })
  })
})

describe('validation des entrées côté serveur', () => {
  it('forme invalide (zod)', async () => {
    expect(await actions.saveScriptAction({ values: { ...values, placement: 'footer' as never } })).toEqual({ ok: false, error: 'Invalid request.' })
    expect(await actions.saveScriptAction({ key: 'x"]', values })).toEqual({ ok: false, error: 'Invalid request.' })
    expect(await actions.setScriptEnabledAction({ key: 'css', enabled: 'yes' as never })).toEqual({ ok: false, error: 'Invalid request.' })
    expect(await actions.saveScriptAction({ values, extra: 1 } as never)).toEqual({ ok: false, error: 'Invalid request.' })
    expect(mutations).toHaveLength(0)
  })

  it('règles du script : nom, page du manifeste, code dans des balises', async () => {
    expect(await actions.saveScriptAction({ values: { ...values, name: '' } })).toEqual({ ok: false, error: 'Name is required.', fieldErrors: { name: 'Name is required.' } })
    expect(await actions.saveScriptAction({ values: { ...values, page: 'testimonials' } })).toMatchObject({ ok: false, fieldErrors: { page: 'Choose a page.' } })
    expect(await actions.saveScriptAction({ values: { ...values, code: 'hj()' } })).toMatchObject({ ok: false, fieldErrors: { code: expect.stringContaining('<script>') } })
    expect(mutations).toHaveLength(0)
  })

  it('balise non fermée : enregistrée quand même (avertissement seulement)', async () => {
    expect((await actions.saveScriptAction({ values: { ...values, code: '<script>hj(' } })).ok).toBe(true)
  })
})
