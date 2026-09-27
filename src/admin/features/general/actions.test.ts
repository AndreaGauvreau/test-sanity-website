import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Server actions de B2 avec un faux Next et un FAUX CLIENT Sanity : on passe par le vrai `saveDraftField`
 * (core/sanity : validation d'après le FieldDef, création du brouillon depuis le publié, transaction).
 */

vi.mock('server-only', () => ({}))

const auth = vi.hoisted(() => ({ session: null as unknown, fail: null as null | { status: 401 | 403; message: string } }))

vi.mock('@/admin/core/auth/session', () => {
  class AdminAuthError extends Error {
    constructor(
      readonly status: number,
      readonly code: string,
      message: string,
    ) {
      super(message)
      this.name = 'AdminAuthError'
    }
  }
  return {
    AdminAuthError,
    requireCapability: vi.fn(async (capability: string, context: string) => {
      if (context !== 'action') throw new Error('wrong context')
      if (auth.fail) throw new AdminAuthError(auth.fail.status, 'x', auth.fail.message)
      if (capability !== 'content.write') throw new Error('wrong capability')
      return auth.session
    }),
  }
})

type Mutation = Record<string, unknown>
const sanity = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  mutations: [] as Mutation[][],
  uploads: [] as { kind: string; size: number; options: unknown }[],
  useReal: false,
}))

vi.mock('@/admin/core/sanity/clients', async (importActual) => {
  const actual = await importActual<typeof import('@/admin/core/sanity/clients')>()
  const fake = {
    getDocuments: async (ids: string[]) => ids.map((id) => sanity.docs.get(id) ?? null),
    mutate: async (mutations: Mutation[]) => {
      sanity.mutations.push(mutations)
    },
    assets: {
      upload: async (kind: string, body: Buffer, options: unknown) => {
        sanity.uploads.push({ kind, size: body.length, options })
        return { _id: 'image-f00d-64x64-png' }
      },
    },
  }
  return {
    ...actual,
    getWriteClient: (session: never) => (sanity.useReal ? actual.getWriteClient(session) : fake),
  }
})

const { saveGeneralValueAction, uploadGeneralImageAction, removeGeneralImageAction } = await import('./actions')

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SANITY_PROJECT_ID', 'proj1')
  vi.stubEnv('NEXT_PUBLIC_SANITY_DATASET', 'development')
  auth.fail = null
  auth.session = {
    user: { id: 'u1', name: 'Marie', email: 'm@c.com' },
    role: 'client',
    sanityRoles: ['administrator'],
    sanityToken: 'user-token',
    dev: false,
    expiresAt: new Date(Date.now() + 3600e3).toISOString(),
  }
  sanity.docs = new Map([['siteSettings', { _id: 'siteSettings', _type: 'siteSettings', _rev: 'r1', title: 'Conduit', allowIndexing: true }]])
  sanity.mutations = []
  sanity.uploads = []
  sanity.useReal = false
})

describe('saveGeneralValueAction', () => {
  it('crée le brouillon depuis le publié et y écrit le titre (une transaction)', async () => {
    await expect(saveGeneralValueAction({ field: 'title', value: 'Conduit — Dock Scheduling' })).resolves.toEqual({ ok: true })
    expect(sanity.mutations).toHaveLength(1)
    const [create, patch] = sanity.mutations[0]
    expect(create).toEqual({ createIfNotExists: { _id: 'drafts.siteSettings', _type: 'siteSettings', title: 'Conduit', allowIndexing: true } })
    expect(patch).toEqual({ patch: { id: 'drafts.siteSettings', set: { title: 'Conduit — Dock Scheduling' } } })
  })

  it('refuse un titre de plus de 60 caractères (validation serveur) sans écrire', async () => {
    await expect(saveGeneralValueAction({ field: 'title', value: 'x'.repeat(61) })).resolves.toEqual({
      ok: false,
      error: 'Title must be 60 characters or fewer.',
    })
    await expect(saveGeneralValueAction({ field: 'title', value: '' })).resolves.toEqual({ ok: false, error: 'Title is required.' })
    await expect(saveGeneralValueAction({ field: 'description', value: 'y'.repeat(161) })).resolves.toMatchObject({ ok: false, error: /160/ })
    expect(sanity.mutations).toHaveLength(0)
  })

  it('refuse sans session ou sans droit (message de la garde)', async () => {
    auth.fail = { status: 401, message: 'Your session has expired. Sign in again.' }
    await expect(saveGeneralValueAction({ field: 'title', value: 'A' })).resolves.toEqual({ ok: false, error: 'Your session has expired. Sign in again.' })
    auth.fail = { status: 403, message: "You don't have access to this." }
    await expect(saveGeneralValueAction({ field: 'allowIndexing', value: false })).resolves.toEqual({ ok: false, error: "You don't have access to this." })
    expect(sanity.mutations).toHaveLength(0)
  })

  it('session de dev sans SANITY_API_WRITE_TOKEN : erreur claire, rien d’écrit', async () => {
    sanity.useReal = true
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('SANITY_API_WRITE_TOKEN', '')
    auth.session = { ...(auth.session as object), sanityToken: null, dev: true }
    await expect(saveGeneralValueAction({ field: 'title', value: 'A' })).resolves.toEqual({
      ok: false,
      error: 'Sanity write access is not configured (SANITY_API_WRITE_TOKEN is missing).',
    })
  })
})

describe('uploadGeneralImageAction / removeGeneralImageAction', () => {
  it('envoie l’image dans les assets puis écrit sa référence', async () => {
    const f = new FormData()
    f.set('slot', 'faviconDark')
    f.set('file', new File([PNG], 'dark.png', { type: 'image/png' }))
    const result = await uploadGeneralImageAction(f)
    expect(result).toMatchObject({ ok: true, image: { ref: 'image-f00d-64x64-png', url: 'https://cdn.sanity.io/images/proj1/development/f00d-64x64.png' } })
    expect(sanity.uploads).toEqual([{ kind: 'image', size: PNG.length, options: { filename: 'dark.png', contentType: 'image/png' } }])
    expect(sanity.mutations[0][1]).toEqual({
      patch: { id: 'drafts.siteSettings', set: { faviconDark: { _type: 'image', asset: { _type: 'reference', _ref: 'image-f00d-64x64-png' } } } },
    })
  })

  it('refuse un fichier qui n’est pas une image avant tout envoi', async () => {
    const f = new FormData()
    f.set('slot', 'socialImage')
    f.set('file', new File(['<script>alert(1)</script>'], 'x.png', { type: 'image/png' }))
    await expect(uploadGeneralImageAction(f)).resolves.toMatchObject({ ok: false })
    expect(sanity.uploads).toHaveLength(0)
  })

  it('retire une image (unset dans le brouillon)', async () => {
    sanity.docs.set('drafts.siteSettings', { _id: 'drafts.siteSettings', _type: 'siteSettings', socialImage: { asset: { _ref: 'image-a-1x1-png' } } })
    await expect(removeGeneralImageAction({ slot: 'socialImage' })).resolves.toEqual({ ok: true })
    expect(sanity.mutations[0]).toEqual([{ patch: { id: 'drafts.siteSettings', unset: ['socialImage'] } }])
  })
})
