import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import { EDITOR_VIEWPORTS, VIEWPORT_WIDTHS } from '../../../src/admin/core/contracts'
import { designSystem } from '../claude/fixtures'
import { EngineError } from '../server/errors'
import { createEngineLock } from './lock'
import { checkRequestAgainst, isPagePath, parseRequestShape } from './request'
import { routeOf } from './site'
import { describeChanges } from './summary'

/** Petites briques du cycle : demande venue du navigateur, verrou partagé, résumé, pages du site. */

const REQUEST = { page: '/', targets: [{ zone: 'hero.title', index: 0, label: '<b>injected</b>' }], scope: ['style', 'style'], note: ' Bigger​ title ', viewport: 1280 }

describe('parseRequestShape / checkRequestAgainst', () => {
  it('normalise : périmètre dédoublonné, note nettoyée, libellé remplacé par celui de zones.json', () => {
    const ds = designSystem()
    const request = checkRequestAgainst(ds, parseRequestShape(REQUEST))
    assert.deepEqual(request.scope, ['style'])
    assert.equal(request.note, 'Bigger  title')
    assert.equal(request.targets[0].label, 'Hero · Title')
  })

  it('refus 400 avec un message anglais', () => {
    const refused = (body: unknown) => {
      try {
        checkRequestAgainst(designSystem(), parseRequestShape(body))
      } catch (error) {
        assert.ok(error instanceof EngineError && error.status === 400)
        return error.message
      }
      return null
    }
    assert.equal(refused({ ...REQUEST, note: '' }), 'Describe the change (600 characters at most).')
    assert.equal(refused({ ...REQUEST, targets: [] }), 'Select 1 to 8 elements.')
    assert.equal(refused({ ...REQUEST, scope: ['layout'] }), 'Choose “Style”, “Text” or both.')
    assert.equal(refused({ ...REQUEST, targets: [{ zone: 'constructor', index: 0 }] }), 'This element can no longer be edited: reload the preview.')
    assert.equal(refused({ ...REQUEST, targets: [{ zone: 'hero.title', index: 0, doc: 'drafts.x' }] }), 'Select 1 to 8 elements.')
    assert.equal(refused({ ...REQUEST, changeId: '../x' }), 'Invalid change.')
    assert.equal(refused(null), 'Invalid request.')
  })

  it('formats de l’aperçu : ceux du contrat (EDITOR_VIEWPORTS) ; 768, l’ancien Tablet, refusé dans une NOUVELLE demande', () => {
    for (const viewport of VIEWPORT_WIDTHS) assert.equal(parseRequestShape({ ...REQUEST, viewport }).viewport, viewport)
    assert.equal(parseRequestShape({ ...REQUEST, viewport: EDITOR_VIEWPORTS.tablet }).viewport, 810)
    for (const viewport of [768, 1024, '810', null]) {
      assert.throws(() => parseRequestShape({ ...REQUEST, viewport }), (error) => error instanceof EngineError && error.status === 400 && error.message === 'Invalid screen size.', String(viewport))
    }
  })

  it('chemins de page', () => {
    for (const ok of ['/', '/blog', '/blog/carrier-portals', '/blog/%C3%A9']) assert.equal(isPagePath(ok), true, ok)
    for (const bad of ['', 'blog', '//evil.example', '/a?b=1', '/a#x', '/../admin', '/a\\b', '/a b', `/${'x'.repeat(200)}`]) assert.equal(isPagePath(bad), false, bad)
  })
})

describe('verrou partagé éditeur / publication', () => {
  it('publication refusée pendant une demande ou une modification en attente ; une à la fois', async () => {
    const lock = createEngineLock()
    let blocker: 'busy' | 'awaiting_validation' | null = 'busy'
    lock.setEditorGate({ blocker: () => blocker })
    await assert.rejects(lock.runPublish(async () => 1), (e: unknown) => (e as EngineError).code === 'busy')
    blocker = 'awaiting_validation'
    await assert.rejects(lock.runPublish(async () => 1), (e: unknown) => (e as EngineError).code === 'awaiting_validation')
    blocker = null
    const release = lock.acquirePublish()
    assert.equal(lock.isPublishing(), true)
    await assert.rejects(lock.runPublish(async () => 1), (e: unknown) => (e as EngineError).code === 'publishing')
    release()
    release()
    assert.equal(await lock.runPublish(async () => 42), 42)
    assert.equal(lock.isPublishing(), false)
  })
})

describe('describeChanges', () => {
  it('déclarations changées → libellé du token ; retirées → default ; textes Sanity', () => {
    const ds = designSystem()
    const css = 'src/components/sections/Hero/Hero.module.css'
    const items = describeChanges({
      ds,
      zones: ['hero.title'],
      files: [
        {
          file: css,
          before: '.title { color: var(--color-text); margin: 0 }\n.lede { color: red }',
          after: '.title { color: var(--color-text-muted) }\n.title:hover { color: var(--color-text) }\n.lede { color: red }',
        },
      ],
      texts: [{ document: 'dockSchedulingPage', path: 'hero.title', before: 'A', after: 'Book docks   faster' }],
      textZones: new Map([['dockSchedulingPage:hero.title', 'hero.title']]),
    })
    assert.equal(items.length, 4)
    assert.equal(items[0].target, 'Hero · Title')
    assert.match(items[0].description, /^color → .+ \(token\)$/)
    assert.match(items[1].description, /^color \(hover\) → /)
    assert.equal(items[2].description, 'margin → default')
    assert.deepEqual(items[3], { target: 'Hero · Title', description: 'Text → “Book docks faster”', kind: 'text', where: 'sanity-draft' })
  })
})

describe('pages du site', () => {
  it('routeOf : groupes retirés, segments dynamiques gardés', () => {
    assert.equal(routeOf('page.tsx'), '/')
    assert.equal(routeOf('blog/[slug]/page.tsx'), '/blog/[slug]')
    assert.equal(routeOf('(marketing)/pricing/page.tsx'), '/pricing')
    assert.equal(routeOf('blog/layout.tsx'), null)
  })
})
