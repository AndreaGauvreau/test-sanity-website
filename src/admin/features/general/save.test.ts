import { describe, expect, it, vi } from 'vitest'

import { UPLOAD_MAX_BYTES } from './fields'
import { removeGeneralImage, saveGeneralValue, uploadGeneralImage, type GeneralDeps } from './save'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])

function fakeDeps(overrides: Partial<GeneralDeps> = {}) {
  const saveField = vi.fn(async () => ({ draftId: 'drafts.siteSettings' }))
  const uploadImage = vi.fn(async () => ({ _id: 'image-abc123-64x64-png' }))
  const deps: GeneralDeps = { saveField, uploadImage, projectId: 'proj1', dataset: 'development', ...overrides }
  return { deps, saveField, uploadImage }
}

function form(slot: unknown, file?: Blob | string, name = 'logo.png') {
  const f = new FormData()
  if (slot !== undefined) f.set('slot', String(slot))
  if (file instanceof Blob) f.set('file', new File([file], name))
  else if (file !== undefined) f.set('file', file)
  return f
}

describe('saveGeneralValue', () => {
  it('écrit le titre avec le FieldDef (≤ 60, requis)', async () => {
    const { deps, saveField } = fakeDeps()
    await expect(saveGeneralValue(deps, { field: 'title', value: 'Conduit — Dock Scheduling' })).resolves.toEqual({ ok: true })
    expect(saveField).toHaveBeenCalledWith('title', 'Conduit — Dock Scheduling', expect.objectContaining({ name: 'title', maxLength: 60, required: true }))
  })

  it('description vide → champ retiré ; retours à la ligne aplatis', async () => {
    const { deps, saveField } = fakeDeps()
    await saveGeneralValue(deps, { field: 'description', value: '' })
    expect(saveField).toHaveBeenLastCalledWith('description', null, expect.objectContaining({ maxLength: 160 }))
    await saveGeneralValue(deps, { field: 'description', value: 'a\nb' })
    expect(saveField).toHaveBeenLastCalledWith('description', 'a b', expect.anything())
  })

  it('indexation : booléen seulement', async () => {
    const { deps, saveField } = fakeDeps()
    await saveGeneralValue(deps, { field: 'allowIndexing', value: false })
    expect(saveField).toHaveBeenCalledWith('allowIndexing', false, expect.objectContaining({ kind: 'boolean' }))
    await expect(saveGeneralValue(deps, { field: 'allowIndexing', value: 'no' })).resolves.toMatchObject({ ok: false })
  })

  it('refuse un champ inconnu ou une valeur mal formée sans rien écrire', async () => {
    const { deps, saveField } = fakeDeps()
    for (const input of [null, {}, { field: 'scripts', value: '<script>' }, { field: 'title', value: 42 }, { field: 'title', value: 'x'.repeat(6000) }]) {
      await expect(saveGeneralValue(deps, input)).resolves.toMatchObject({ ok: false })
    }
    expect(saveField).not.toHaveBeenCalled()
  })

  it('laisse remonter l’erreur de validation du serveur (message anglais)', async () => {
    const err = Object.assign(new Error('Title must be 60 characters or fewer.'), { name: 'SanityWriteError' })
    const { deps } = fakeDeps({ saveField: vi.fn(async () => Promise.reject(err)) })
    await expect(saveGeneralValue(deps, { field: 'title', value: 'x'.repeat(61) })).rejects.toBe(err)
  })
})

describe('removeGeneralImage', () => {
  it('retire l’image de l’emplacement', async () => {
    const { deps, saveField } = fakeDeps()
    await expect(removeGeneralImage(deps, { slot: 'faviconDark' })).resolves.toEqual({ ok: true })
    expect(saveField).toHaveBeenCalledWith('faviconDark', null, expect.objectContaining({ kind: 'image' }))
  })
  it('refuse un emplacement inconnu', async () => {
    const { deps, saveField } = fakeDeps()
    await expect(removeGeneralImage(deps, { slot: 'title' })).resolves.toMatchObject({ ok: false })
    expect(saveField).not.toHaveBeenCalled()
  })
})

describe('uploadGeneralImage', () => {
  it('envoie l’asset puis écrit la référence dans le brouillon', async () => {
    const { deps, saveField, uploadImage } = fakeDeps()
    const result = await uploadGeneralImage(deps, form('faviconLight', new Blob([PNG]), 'Logo Conduit.png'))
    expect(result).toEqual({
      ok: true,
      image: { ref: 'image-abc123-64x64-png', url: 'https://cdn.sanity.io/images/proj1/development/abc123-64x64.png', width: 64, height: 64 },
    })
    expect(uploadImage).toHaveBeenCalledWith(expect.any(Uint8Array), { filename: 'Logo-Conduit.png', contentType: 'image/png' })
    expect(saveField).toHaveBeenCalledWith(
      'faviconLight',
      { _type: 'image', asset: { _type: 'reference', _ref: 'image-abc123-64x64-png' } },
      expect.objectContaining({ kind: 'image' }),
    )
  })

  it('refuse un faux PNG (contenu HTML), un format non permis, un fichier vide ou trop lourd', async () => {
    const { deps, uploadImage } = fakeDeps()
    const html = new Blob(['<html><script>alert(1)</script>'])
    await expect(uploadGeneralImage(deps, form('faviconLight', html, 'x.png'))).resolves.toMatchObject({ ok: false, error: /PNG, JPG, SVG or ICO/ })
    const svg = new Blob(['<svg xmlns="http://www.w3.org/2000/svg"/>'])
    await expect(uploadGeneralImage(deps, form('socialImage', svg, 'x.svg'))).resolves.toMatchObject({ ok: false, error: /PNG, JPG or WebP/ })
    await expect(uploadGeneralImage(deps, form('faviconLight', new Blob([]), 'x.png'))).resolves.toMatchObject({ ok: false, error: /empty/ })
    const big = new Uint8Array(UPLOAD_MAX_BYTES + 1)
    big.set(PNG)
    await expect(uploadGeneralImage(deps, form('socialImage', new Blob([big]), 'x.png'))).resolves.toMatchObject({ ok: false, error: /1 MB/ })
    expect(uploadImage).not.toHaveBeenCalled()
  })

  it('refuse un emplacement inconnu ou l’absence de fichier', async () => {
    const { deps, uploadImage } = fakeDeps()
    await expect(uploadGeneralImage(deps, form('scripts', new Blob([PNG])))).resolves.toMatchObject({ ok: false })
    await expect(uploadGeneralImage(deps, form('faviconLight', 'not a file'))).resolves.toMatchObject({ ok: false })
    await expect(uploadGeneralImage(deps, form(undefined, new Blob([PNG])))).resolves.toMatchObject({ ok: false })
    expect(uploadImage).not.toHaveBeenCalled()
  })

  it('n’écrit pas de référence si Sanity renvoie un asset illisible', async () => {
    const { deps, saveField } = fakeDeps({ uploadImage: vi.fn(async () => ({ _id: 'file-xyz-pdf' })) })
    await expect(uploadGeneralImage(deps, form('faviconLight', new Blob([PNG])))).resolves.toMatchObject({ ok: false })
    expect(saveField).not.toHaveBeenCalled()
  })
})
