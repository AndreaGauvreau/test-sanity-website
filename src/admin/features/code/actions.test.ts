import { beforeEach, describe, expect, it, vi } from 'vitest'

import { signScript, verifyScript, type SignableScript } from '@/lib/script-signature'

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

/** Écriture « concurrente » jouée juste avant la prochaine transaction (un autre onglet), une seule fois. */
let race: (() => void) | null = null
let revision = 1

/** Faux Sanity à révisions : `create` (409 si le document existe), `ifRevisionID` (409 si la révision a changé), `_rev` renouvelé. */
function conflict(): Error {
  return Object.assign(new Error('conflict'), { statusCode: 409 })
}

vi.mock('@/admin/core/sanity/clients', () => ({
  getReadClient: () => ({ fetch: async () => 0 }),
  getWriteClient: () => ({
    getDocuments: async (ids: string[]) => ids.map((id) => (db.has(id) ? structuredClone(db.get(id)!) : null)),
    mutate: async (list: Record<string, never>[]) => {
      if (race) {
        const before = race
        race = null
        before()
      }
      const all = list as Record<string, Record<string, unknown>>[]
      // Préconditions d'abord : la transaction est atomique.
      for (const m of all) {
        if (m.create && db.has(m.create._id as string)) throw conflict()
        if (m.patch?.ifRevisionID && db.get(m.patch.id as string)?._rev !== m.patch.ifRevisionID) throw conflict()
      }
      mutations.push(list)
      for (const m of all) {
        const created = m.createIfNotExists ?? m.create
        if (created && !db.has(created._id as string)) db.set(created._id as string, structuredClone(created) as Doc)
        if (m.patch) applyPatch(db.get(m.patch.id as string)!, m.patch.set as Record<string, unknown>, m.patch.unset as string[])
        const id = (created?._id ?? m.patch?.id) as string
        if (db.has(id)) db.get(id)!._rev = `r${++revision}`
      }
    },
  }),
}))

const SECRET = 'test-secret-'.padEnd(40, 'x')
process.env.SCRIPTS_SIGNING_SECRET = SECRET

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

/** Signe les scripts du jeu de test comme l'aurait fait l'admin (SEC-04). */
type RawScript = SignableScript & { signature?: string; [k: string]: unknown }

async function signed(doc: Doc): Promise<Doc> {
  const out = structuredClone(doc)
  for (const s of out.scripts as RawScript[]) s.signature = await signScript(SECRET, s)
  return out
}

const script = (key: string) => (draft().scripts as RawScript[]).find((s) => s._key === key)!
const isValid = (key: string) => verifyScript(SECRET, script(key))

beforeEach(async () => {
  process.env.SCRIPTS_SIGNING_SECRET = SECRET
  db.clear()
  db.set('siteSettings', await signed(PUBLISHED))
  mutations.length = 0
  race = null
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
      actions.resignScriptAction({ key: 'css', expected: { placement: 'headEnd', page: 'all', run: 'once', code: '<style>img{}</style>', enabled: true } }),
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
    // SEC-04 : toutes les valeurs signées sont écrites avec la signature, dans le même patch.
    expect(Object.keys(patch.set)).toEqual(['name', 'placement', 'page', 'run', 'code', 'enabled', 'signature'].map((f) => `scripts[_key=="gtm"].${f}`))
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

describe('signature des scripts (SEC-04)', () => {
  it('ajout : le nouveau script est signé', async () => {
    const r = (await actions.saveScriptAction({ values })) as { ok: true; key: string }
    expect(await isValid(r.key)).toBe(true)
  })

  it('modification : re-signé avec les nouvelles valeurs ; les autres scripts gardent leur signature', async () => {
    await actions.saveScriptAction({ key: 'gtm', values })
    expect(script('gtm').code).toBe(values.code)
    expect(await isValid('gtm')).toBe(true)
    expect(await isValid('css')).toBe(true)
  })

  it('modification d’un script désactivé : l’état fait partie de la signature', async () => {
    await actions.setScriptEnabledAction({ key: 'gtm', enabled: false })
    await actions.saveScriptAction({ key: 'gtm', values })
    expect(script('gtm').enabled).toBe(false)
    expect(await isValid('gtm')).toBe(true)
  })

  it('activation / désactivation d’un script signé : re-signé', async () => {
    await actions.setScriptEnabledAction({ key: 'css', enabled: false })
    expect(await isValid('css')).toBe(true)
    await actions.setScriptEnabledAction({ key: 'css', enabled: true })
    expect(script('css').enabled).toBe(true)
    expect(await isValid('css')).toBe(true)
  })

  it('script modifié hors de l’admin : Enable refusé, Disable accepté sans le signer', async () => {
    const doc = await signed(PUBLISHED)
    ;(doc.scripts as Record<string, unknown>[])[1].code = '<script>steal()</script>'
    ;(doc.scripts as Record<string, unknown>[])[1].enabled = false
    db.set('siteSettings', doc)
    expect(await actions.setScriptEnabledAction({ key: 'gtm', enabled: true })).toEqual({
      ok: false,
      error: 'This script was modified outside the admin. Check its code, then re-sign it.',
    })
    expect(mutations).toHaveLength(0)
    ;(doc.scripts as Record<string, unknown>[])[1].enabled = true
    db.set('siteSettings', doc)
    expect((await actions.setScriptEnabledAction({ key: 'gtm', enabled: false })).ok).toBe(true)
    expect(script('gtm').enabled).toBe(false)
    expect(await isValid('gtm')).toBe(false)
  })

  it('Re-sign : signe exactement les valeurs vues par Kuartz', async () => {
    const doc = await signed(PUBLISHED)
    ;(doc.scripts as Record<string, unknown>[])[0].code = '<style>body{}</style>'
    db.set('siteSettings', doc)
    const expected = { placement: 'headEnd' as const, page: 'all', run: 'once' as const, code: '<style>body{}</style>', enabled: true }
    expect(await actions.resignScriptAction({ key: 'css', expected })).toEqual({ ok: true, key: 'css' })
    expect(await isValid('css')).toBe(true)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('Re-sign refusé si le script a changé depuis l’affichage (rien n’est signé)', async () => {
    const doc = await signed(PUBLISHED)
    ;(doc.scripts as Record<string, unknown>[])[0].code = '<script>steal()</script>'
    db.set('siteSettings', doc)
    const seen = { placement: 'headEnd' as const, page: 'all', run: 'once' as const, code: '<style>body{}</style>', enabled: true }
    expect(await actions.resignScriptAction({ key: 'css', expected: seen })).toEqual({
      ok: false,
      error: 'This script changed since the page loaded. Reload and check it again.',
    })
    expect(mutations).toHaveLength(0)
    expect(await actions.resignScriptAction({ key: 'gone', expected: seen })).toEqual({ ok: false, error: 'This item no longer exists. Reload and try again.' })
    expect(await actions.resignScriptAction({ key: 'css', expected: { ...seen, code: 1 } as never })).toEqual({ ok: false, error: 'Invalid request.' })
  })

  it('déplacement : les signatures sont conservées', async () => {
    await actions.moveScriptAction({ key: 'gtm', direction: 'up' })
    expect(await isValid('gtm')).toBe(true)
    expect(await isValid('css')).toBe(true)
  })

  it('secret absent : ajout, modification, activation et Re-sign refusés, rien n’est écrit', async () => {
    delete process.env.SCRIPTS_SIGNING_SECRET
    const missing = { ok: false, error: expect.stringContaining('SCRIPTS_SIGNING_SECRET') }
    expect(await actions.saveScriptAction({ values })).toEqual(missing)
    expect(await actions.saveScriptAction({ key: 'gtm', values })).toEqual(missing)
    expect(await actions.setScriptEnabledAction({ key: 'css', enabled: true })).toEqual(missing)
    expect(await actions.resignScriptAction({ key: 'css', expected: { placement: 'headEnd', page: 'all', run: 'once', code: '<style>img{}</style>', enabled: true } })).toEqual(missing)
    expect(mutations).toHaveLength(0)
  })
})

describe('tableau scripts sans course (FOLLOWUPS #40)', () => {
  /** Un autre onglet ajoute un script signé dans le brouillon entre la lecture et l'écriture de B3. */
  async function otherTabAdds(): Promise<void> {
    const base = structuredClone(db.get('drafts.siteSettings') ?? { ...db.get('siteSettings')!, _id: 'drafts.siteSettings' })
    const other = { _key: 'other', _type: 'siteScript', name: 'Other tab', placement: 'bodyEnd', page: 'all', run: 'once', code: '<script>o()</script>', enabled: true }
    ;(base.scripts as RawScript[]).push({ ...other, signature: await signScript(SECRET, other as RawScript) } as RawScript)
    base._rev = 'other-tab'
    db.set('drafts.siteSettings', base)
  }

  it('ajout concurrent (brouillon né entre-temps) : les deux scripts restent, signatures valides', async () => {
    await otherTabAdds() // prépare la version de l'autre onglet…
    const theirs = db.get('drafts.siteSettings')!
    db.delete('drafts.siteSettings') // … écrite seulement au moment de notre transaction
    race = () => db.set('drafts.siteSettings', theirs)
    const r = (await actions.saveScriptAction({ values })) as { ok: true; key: string }
    expect(r.ok).toBe(true)
    expect(keys()).toEqual(['css', 'gtm', 'other', r.key])
    for (const k of ['css', 'gtm', 'other', r.key]) expect(await isValid(k)).toBe(true)
  })

  it('ajout sur un brouillon existant : écriture conditionnée par ifRevisionID, relue après 409', async () => {
    await actions.setScriptEnabledAction({ key: 'css', enabled: false }) // crée le brouillon
    await otherTabAdds()
    const snapshot = db.get('drafts.siteSettings')!
    db.set('drafts.siteSettings', { ...structuredClone(snapshot), scripts: (snapshot.scripts as RawScript[]).filter((s) => s._key !== 'other'), _rev: 'mine' })
    race = () => db.set('drafts.siteSettings', snapshot)
    mutations.length = 0
    const r = (await actions.saveScriptAction({ values })) as { ok: true; key: string }
    expect(keys()).toEqual(['css', 'gtm', 'other', r.key])
    const patch = (mutations.at(-1)!.at(-1) as { patch: { ifRevisionID?: string } }).patch
    expect(patch.ifRevisionID).toBe('other-tab')
  })

  it('déplacement concurrent d’un ajout : l’ajout de l’autre onglet est gardé, signatures recopiées telles quelles', async () => {
    await otherTabAdds()
    const theirs = db.get('drafts.siteSettings')!
    db.delete('drafts.siteSettings')
    race = () => db.set('drafts.siteSettings', theirs)
    expect((await actions.moveScriptAction({ key: 'gtm', direction: 'up' })).ok).toBe(true)
    expect(keys()).toEqual(['gtm', 'css', 'other'])
    for (const k of ['css', 'gtm', 'other']) expect(await isValid(k)).toBe(true)
    expect(await actions.moveScriptAction({ key: 'other', direction: 'down' })).toEqual({ ok: false, error: 'This script is already last.' })
    expect(await actions.moveScriptAction({ key: 'gone', direction: 'up' })).toEqual({ ok: false, error: 'This item no longer exists. Reload and try again.' })
  })

  it('suppression concurrente d’un ajout : seul le script visé disparaît, les autres gardent leur signature', async () => {
    await otherTabAdds()
    const theirs = db.get('drafts.siteSettings')!
    db.delete('drafts.siteSettings')
    race = () => db.set('drafts.siteSettings', theirs)
    expect((await actions.deleteScriptAction({ key: 'css' })).ok).toBe(true)
    expect(keys()).toEqual(['gtm', 'other'])
    for (const k of ['gtm', 'other']) expect(await isValid(k)).toBe(true)
    expect(await actions.deleteScriptAction({ key: 'css' })).toEqual({ ok: false, error: 'This item no longer exists. Reload and try again.' })
  })

  it('plafond de scripts vérifié sur le tableau relu ; réglages absents : message clair', async () => {
    const full = await signed(PUBLISHED)
    full.scripts = Array.from({ length: 50 }, (_, i) => ({ ...(PUBLISHED.scripts as RawScript[])[0], _key: `s${i}` }))
    db.set('siteSettings', full)
    expect(await actions.saveScriptAction({ values })).toEqual({ ok: false, error: 'You can add up to 50 scripts.' })
    db.clear()
    expect(await actions.saveScriptAction({ values })).toEqual({ ok: false, error: 'Site settings are missing. Ask Kuartz to create them.' })
    expect(mutations).toHaveLength(0)
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
    expect(await actions.saveScriptAction({ values: { ...values, page: 'pricing' } })).toMatchObject({ ok: false, fieldErrors: { page: 'Choose a page.' } })
    expect(await actions.saveScriptAction({ values: { ...values, code: 'hj()' } })).toMatchObject({ ok: false, fieldErrors: { code: expect.stringContaining('<script>') } })
    expect(mutations).toHaveLength(0)
    // Les nouvelles pages (Q15 révisée) sont acceptées, page article comprise.
    expect((await actions.saveScriptAction({ values: { ...values, page: 'faq/slug' } })).ok).toBe(true)
  })

  it('balise non fermée : enregistrée quand même (avertissement seulement)', async () => {
    expect((await actions.saveScriptAction({ values: { ...values, code: '<script>hj(' } })).ok).toBe(true)
  })
})
