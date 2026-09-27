import { describe, expect, it } from 'vitest'

import adminConfig from '@/admin.config'

import {
  applyMediaQuery,
  assetMetaLine,
  isAssetId,
  isDeletable,
  librarySummary,
  lockReason,
  mediaKind,
  partitionForDelete,
  typeLabel,
  usageLabel,
  type MediaAsset,
} from './assets'
import { describeUsage, findAssetPaths, usagesOf } from './usage'

const ASSET = 'image-abc123-1600x900-jpg'
const SITE = 'https://conduit.com'

describe('findAssetPaths', () => {
  it('trouve les champs image, les objets imbriqués et les éléments de tableau par _key', () => {
    const doc = {
      _id: 'p1',
      _type: 'post',
      image: { _type: 'image', asset: { _ref: ASSET } },
      seo: { ogImage: { asset: { _ref: ASSET } } },
      content: [
        { _type: 'block', _key: 'b1', children: [] },
        { _type: 'image', _key: 'i1', asset: { _ref: ASSET } },
        { _type: 'image', asset: { _ref: ASSET } },
      ],
      other: { asset: { _ref: 'image-other-1x1-png' } },
    }
    expect(findAssetPaths(doc, ASSET)).toEqual([
      { path: 'image', names: ['image'] },
      { path: 'seo.ogImage', names: ['seo', 'ogImage'] },
      { path: 'content[_key=="i1"]', names: ['content'] },
      { path: null, names: ['content'] },
    ])
  })
  it('aucune référence → liste vide', () => {
    expect(findAssetPaths({ _id: 'x', title: 'y' }, ASSET)).toEqual([])
  })
})

describe('describeUsage (libellés du manifeste)', () => {
  it('élément de collection : « Blog › Titre — Cover image », fiche CMS et page publique', () => {
    const doc = { _id: 'drafts.post-1', _type: 'post', title: 'How to cut dock wait times', slug: { current: 'how-to' } }
    expect(describeUsage(doc, ['image'], adminConfig, SITE)).toEqual({
      label: 'Blog › How to cut dock wait times — Cover image',
      adminHref: '/admin/cms/blog/post-1',
      siteHref: 'https://conduit.com/blog/how-to',
    })
    expect(describeUsage(doc, ['content'], adminConfig, SITE).label).toBe('Blog › How to cut dock wait times — Body image')
  })
  it('page : section et champ ; SEO', () => {
    const doc = { _id: 'dockSchedulingPage', _type: 'dockSchedulingPage' }
    expect(describeUsage(doc, ['hero', 'background'], adminConfig, SITE)).toMatchObject({ label: 'Home › Hero — Background', adminHref: '/admin/pages/home', siteHref: 'https://conduit.com/' })
    expect(describeUsage(doc, ['seo', 'ogImage'], adminConfig, SITE)).toMatchObject({ label: 'Home › SEO — Social image', adminHref: '/admin/pages/home/seo' })
  })
  it('réglages et modèle SEO d’article', () => {
    expect(describeUsage({ _id: 'siteSettings', _type: 'siteSettings' }, ['socialImage'], adminConfig, SITE)).toMatchObject({
      label: 'Site settings — Social image',
      adminHref: '/admin/settings/general',
    })
    expect(describeUsage({ _id: 'articleSeo-post', _type: 'articleSeoTemplate' }, ['ogImage'], adminConfig, SITE)).toMatchObject({
      label: 'Blog › Article page — SEO image',
      adminHref: '/admin/pages/blog/slug/seo',
    })
  })
  it('brouillon et publié d’un même document comptés une fois (libellé du brouillon)', () => {
    const published = { _id: 'post-1', _type: 'post', title: 'Old', image: { asset: { _ref: ASSET } } }
    const draft = { ...published, _id: 'drafts.post-1', title: 'New' }
    const usages = usagesOf(ASSET, [published, draft], adminConfig, SITE)
    expect(usages).toHaveLength(1)
    expect(usages[0].label).toBe('Blog › New — Cover image')
  })
})

const asset = (over: Partial<MediaAsset>): MediaAsset => ({
  id: 'image-a-1x1-jpg',
  kind: 'image',
  name: 'a.jpg',
  mimeType: 'image/jpeg',
  extension: 'jpg',
  size: 1000,
  createdAt: '2026-09-01T00:00:00Z',
  altText: '',
  thumb: null,
  preview: null,
  url: '',
  usages: [],
  ...over,
})

describe('médiathèque : libellés, tri, filtres, recherche', () => {
  const list = [
    asset({ id: 'image-1-1x1-jpg', name: 'hero-truck.jpg', size: 1_200_000, createdAt: '2026-09-12T00:00:00Z', usages: [{ id: 'u', label: 'x' }, { id: 'v', label: 'y' }], altText: 'Truck backing up' }),
    asset({ id: 'file-2-mp4', name: 'demo-tour.mp4', kind: 'video', mimeType: 'video/mp4', extension: 'mp4', size: 14_300_000, createdAt: '2026-09-10T00:00:00Z', usages: [{ id: 'u', label: 'x' }] }),
    asset({ id: 'file-3-pdf', name: 'brochure.pdf', kind: 'file', mimeType: 'application/pdf', extension: 'pdf', size: 5_200_000, createdAt: '2026-08-01T00:00:00Z' }),
  ]
  const q = { sort: { by: 'date' as const, direction: 'desc' as const }, conditions: [], search: '' }

  it('type et libellés', () => {
    expect(mediaKind('image/svg+xml')).toBe('image')
    expect(mediaKind('video/mp4')).toBe('video')
    expect(mediaKind('application/pdf')).toBe('file')
    expect(list.map(typeLabel)).toEqual(['IMG', 'VIDEO', 'PDF'])
    expect(usageLabel(2)).toBe('Used ×2')
    expect(usageLabel(0)).toBe('Unused')
    expect(librarySummary(list)).toBe('3 files · 19.7 MB')
  })

  it('ligne de méta « JPG · 2400 × 1600 · 1.2 MB · added Sep 12 »', () => {
    const meta = assetMetaLine({ extension: 'jpg', width: 2400, height: 1600, size: 1_258_291, createdAt: '2026-09-12T10:00:00Z' }, new Date('2026-09-27'))
    expect(meta).toBe('JPG · 2400 × 1600 · 1.2 MB · added Sep 12')
    expect(assetMetaLine({ extension: 'pdf', size: 2048, createdAt: '2025-01-02T00:00:00Z' }, new Date('2026-09-27'))).toBe('PDF · 2 KB · added Jan 2, 2025')
  })

  it('tri par date, nom, taille', () => {
    expect(applyMediaQuery(list, q).map((a) => a.name)).toEqual(['hero-truck.jpg', 'demo-tour.mp4', 'brochure.pdf'])
    expect(applyMediaQuery(list, { ...q, sort: { by: 'name', direction: 'asc' } }).map((a) => a.name)).toEqual(['brochure.pdf', 'demo-tour.mp4', 'hero-truck.jpg'])
    expect(applyMediaQuery(list, { ...q, sort: { by: 'size', direction: 'desc' } }).map((a) => a.name)[0]).toBe('demo-tour.mp4')
  })

  it('filtres type et usage, recherche (nom et texte alternatif)', () => {
    expect(applyMediaQuery(list, { ...q, conditions: [{ id: '1', field: 'type', operator: 'is', value: 'video' }] }).map((a) => a.name)).toEqual(['demo-tour.mp4'])
    expect(applyMediaQuery(list, { ...q, conditions: [{ id: '1', field: 'usage', operator: 'is', value: 'unused' }] }).map((a) => a.name)).toEqual(['brochure.pdf'])
    expect(applyMediaQuery(list, { ...q, conditions: [{ id: '1', field: 'usage', operator: 'is-not', value: 'unused' }] })).toHaveLength(2)
    expect(applyMediaQuery(list, { ...q, search: 'truck' }).map((a) => a.name)).toEqual(['hero-truck.jpg'])
  })
})

describe('garde de suppression des médias utilisés', () => {
  it('seuls les fichiers inutilisés sont supprimables', () => {
    const used = asset({ id: 'image-u-1x1-jpg', usages: [{ id: 'x', label: 'Home' }] })
    const unused = asset({ id: 'image-f-1x1-jpg' })
    expect(isDeletable(used)).toBe(false)
    expect(isDeletable(unused)).toBe(true)
    const { deletable, locked } = partitionForDelete([used, unused, used])
    expect(deletable.map((a) => a.id)).toEqual(['image-f-1x1-jpg'])
    expect(locked).toHaveLength(2)
  })
  it('raison du cadenas', () => {
    expect(lockReason(2)).toBe('Used in 2 places — remove it from the site before deleting.')
    expect(lockReason(1)).toBe('Used in 1 place — remove it from the site before deleting.')
  })
  it('ids d’asset acceptés', () => {
    expect(isAssetId('image-abc123-1600x900-jpg')).toBe(true)
    expect(isAssetId('file-abc123-pdf')).toBe(true)
    expect(isAssetId('post-1')).toBe(false)
    expect(isAssetId('image-abc*-1x1-jpg')).toBe(false)
  })
})
