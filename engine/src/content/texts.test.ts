import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import { createFakeSanity } from './fake'
import { getAtPath, parsePath, setAtPath } from './path'
import { discardDraft, listDrafts, publishDocument, sanityPort } from './sanity'
import { canonical, createTextStore, TextStoreError } from './texts'
import { createPreviewSignal, normalizeVisible, visibleText } from './visible'

/** Magasin Sanity des textes (faux client en mémoire, jamais de réseau), chemins, publication, signal d'aperçu. */

const PAGE = { _id: 'home', _type: 'page', hero: { title: 'Old title' }, items: [{ _key: 'k1', title: 'One' }, { _key: 'k2', title: 'Two' }] }

describe('chemins Sanity', () => {
  it('lit et écrit par _key, jamais par index ; refuse toute autre forme', () => {
    assert.deepEqual(parsePath('items[_key=="k2"].title'), [{ field: 'items', key: 'k2' }, { field: 'title' }])
    assert.equal(getAtPath(PAGE, 'items[_key=="k2"].title'), 'Two')
    assert.equal(getAtPath(PAGE, 'items[_key=="nope"].title'), undefined)
    assert.equal((setAtPath(PAGE, 'items[_key=="k1"].title', 'Uno').items[0] as { title: string }).title, 'Uno')
    assert.equal(PAGE.items[0].title, 'One', 'copie, jamais l’original')
    assert.deepEqual(setAtPath({ _id: 'x' }, 'a.b', 'v'), { _id: 'x', a: { b: 'v' } })
    assert.equal(getAtPath(setAtPath(PAGE, 'hero.title', undefined), 'hero.title'), undefined)
    for (const bad of ['items[0].title', 'a..b', '__proto__.x', 'a[_key=="x"]x', '', 'a["b"]', 'hero.title[_key=="a b"]']) {
      assert.throws(() => parsePath(bad), /Invalid Sanity path/, bad)
    }
    assert.throws(() => setAtPath(PAGE, 'items[_key=="zz"].title', 'x'), /not found/)
  })
})

describe('createTextStore', () => {
  it('instantané : valeur du brouillon s’il existe, sinon du publié ; autres textes ; existence du brouillon', async () => {
    const sanity = createFakeSanity([PAGE])
    const store = createTextStore(sanity)
    const read = await store.snapshot([{ document: 'home', type: 'page', paths: ['hero.title', 'items[_key=="k1"].title', 'hero.missing'] }])
    assert.deepEqual(read.snapshot.home, {
      id: 'home',
      type: 'page',
      draftExisted: false,
      fields: { 'hero.title': 'Old title', 'items[_key=="k1"].title': 'One', 'hero.missing': null },
    })
    assert.deepEqual(read.current, { 'home:hero.title': 'Old title', 'home:items[_key=="k1"].title': 'One', 'home:hero.missing': '' })
    assert.deepEqual(read.others, { 'items[_key=="k2"].title': 'Two' })
    await sanity.createIfNotExists({ ...PAGE, _id: 'drafts.home', hero: { title: 'Draft title' } })
    const again = await store.snapshot([{ document: 'home', type: 'page', paths: ['hero.title'] }])
    assert.equal(again.snapshot.home.draftExisted, true)
    assert.equal(again.current['home:hero.title'], 'Draft title')
  })

  it('refus : document absent, mauvais type, champ non textuel ; sans jeton → unavailable', async () => {
    const store = createTextStore(createFakeSanity([PAGE]))
    await assert.rejects(store.snapshot([{ document: 'nope', type: 'page', paths: ['a'] }]), (e: unknown) => (e as TextStoreError).code === 'not_found')
    await assert.rejects(store.snapshot([{ document: 'home', type: 'post', paths: ['hero.title'] }]), (e: unknown) => (e as TextStoreError).code === 'bad_request')
    await assert.rejects(store.snapshot([{ document: 'home', type: 'page', paths: ['hero'] }]), /not plain text/)
    const none = createTextStore(null)
    assert.equal(none.available, false)
    await assert.rejects(none.write({ document: 'home', type: 'page', path: 'hero.title', value: 'x' }), (e: unknown) => (e as TextStoreError).code === 'unavailable')
  })

  it('écriture dans drafts.<id> seulement (créé depuis le publié, sans champs système), le publié ne bouge pas', async () => {
    const sanity = createFakeSanity([PAGE])
    const store = createTextStore(sanity)
    await store.write({ document: 'home', type: 'page', path: 'hero.title', value: 'New title' })
    await store.write({ document: 'home', type: 'page', path: 'cta.label', value: 'Go' })
    const docs = sanity.docs
    assert.equal((docs['drafts.home'].hero as { title: string }).title, 'New title')
    assert.deepEqual(docs['drafts.home'].cta, { label: 'Go' })
    assert.equal((docs.home.hero as { title: string }).title, 'Old title')
    assert.deepEqual(sanity.log.slice(0, 2), ['createIfNotExists drafts.home', 'patch drafts.home'])
    assert.deepEqual(await store.read('home', ['hero.title', 'nope']), { 'hero.title': 'New title', nope: null })
  })

  it('restauration exacte ; brouillon créé par la demande supprimé s’il est redevenu identique au publié', async () => {
    const sanity = createFakeSanity([PAGE])
    const store = createTextStore(sanity)
    const { snapshot } = await store.snapshot([{ document: 'home', type: 'page', paths: ['hero.title', 'hero.subtitle'] }])
    await store.write({ document: 'home', type: 'page', path: 'hero.title', value: 'New' })
    await store.write({ document: 'home', type: 'page', path: 'hero.subtitle', value: 'Added' })
    await store.restore(snapshot)
    assert.equal(sanity.docs['drafts.home'], undefined)
    assert.ok(sanity.log.includes('delete drafts.home'))
    // Le publié n'a jamais bougé, dates comprises.
    assert.equal(canonical(sanity.docs.home.hero), canonical(PAGE.hero))
  })

  it('brouillon préexistant ou retouché ailleurs : champs remis, brouillon gardé', async () => {
    const sanity = createFakeSanity([PAGE, { ...PAGE, _id: 'drafts.home', hero: { title: 'Human draft' } }])
    const store = createTextStore(sanity)
    const { snapshot } = await store.snapshot([{ document: 'home', type: 'page', paths: ['hero.title'] }])
    await store.write({ document: 'home', type: 'page', path: 'hero.title', value: 'Claude' })
    await store.restore(snapshot)
    assert.equal((sanity.docs['drafts.home'].hero as { title: string }).title, 'Human draft')

    const fresh = createFakeSanity([PAGE])
    const other = createTextStore(fresh)
    const snap = (await other.snapshot([{ document: 'home', type: 'page', paths: ['hero.title'] }])).snapshot
    await other.write({ document: 'home', type: 'page', path: 'hero.title', value: 'Claude' })
    await fresh.patch('drafts.home', { set: { 'items[_key=="k2"].title': 'Edited by hand' } })
    await other.restore(snap, { home: ['hero.title'] })
    assert.equal((fresh.docs['drafts.home'].items as { title: string }[])[1].title, 'Edited by hand', 'brouillon gardé : il porte autre chose')
    assert.equal((fresh.docs['drafts.home'].hero as { title: string }).title, 'Old title')
    // Restreint à des champs absents de l'instantané : rien.
    await other.restore(snap, { other: ['x'] })
  })
})

describe('publication et abandon (pour engine-publish)', () => {
  it('publie avec ifDraftRevisionId ; refus si le brouillon a changé ; abandon', async () => {
    const sanity = createFakeSanity([PAGE, { ...PAGE, _id: 'drafts.home', hero: { title: 'To publish' } }])
    const rev = sanity.docs['drafts.home']._rev!
    await assert.rejects(publishDocument(sanity, { id: 'home', ifDraftRevisionId: 'stale' }), /revision/)
    await publishDocument(sanity, { id: 'drafts.home', ifDraftRevisionId: rev })
    assert.equal((sanity.docs.home.hero as { title: string }).title, 'To publish')
    assert.equal(sanity.docs['drafts.home'], undefined)
    await sanity.createIfNotExists({ ...PAGE, _id: 'drafts.home' })
    await discardDraft(sanity, 'home')
    assert.equal(sanity.docs['drafts.home'], undefined)
    await assert.rejects(publishDocument(sanity, { id: '../x' }), /Invalid Sanity document id/)
    sanity.onFetch((query) => (query.includes('drafts.**') ? [{ _id: 'drafts.a', _type: 'page', _rev: 'r', _updatedAt: 't' }] : []))
    assert.equal((await listDrafts(sanity))[0]._id, 'drafts.a')
  })

  it('sanityPort : passe les opérations au client Sanity (set, unset, setIfMissing, verrou, actions)', async () => {
    const calls: string[] = []
    const patch = {
      setIfMissing: (v: unknown) => (calls.push(`setIfMissing ${JSON.stringify(v)}`), patch),
      set: (v: unknown) => (calls.push(`set ${JSON.stringify(v)}`), patch),
      unset: (v: unknown) => (calls.push(`unset ${JSON.stringify(v)}`), patch),
      ifRevisionId: (v: string) => (calls.push(`if ${v}`), patch),
      commit: async (options: unknown) => void calls.push(`commit ${JSON.stringify(options)}`),
    }
    const client = {
      getDocuments: async (ids: string[]) => ids.map(() => null),
      createIfNotExists: async (doc: { _id: string }) => void calls.push(`create ${doc._id}`),
      patch: (id: string) => (calls.push(`patch ${id}`), patch),
      delete: async (id: string) => void calls.push(`delete ${id}`),
      action: async (actions: unknown) => void calls.push(`action ${JSON.stringify(actions)}`),
      fetch: async () => [],
    }
    const port = sanityPort(client as never)
    await port.patch('drafts.x', { setIfMissing: { a: {} }, set: { 'a.b': 'v' }, unset: ['c'], ifRevisionId: 'r1' })
    await port.createIfNotExists({ _id: 'drafts.x', _type: 't' })
    await port.delete('drafts.x')
    await publishDocument(port, { id: 'x' })
    assert.deepEqual(calls, [
      'patch drafts.x',
      'setIfMissing {"a":{}}',
      'set {"a.b":"v"}',
      'unset ["c"]',
      'if r1',
      'commit {"autoGenerateArrayKeys":false}',
      'create drafts.x',
      'delete drafts.x',
      'action [{"actionType":"sanity.action.document.publish","draftId":"drafts.x","publishedId":"x"}]',
    ])
  })
})

describe('signal « aperçu à jour »', () => {
  it('texte visible : balises, entités et guillemets typographiques normalisés', () => {
    assert.equal(visibleText('<h1 class="x">Dock <em>scheduling</em>&nbsp;that&#39;s&amp; “easy”</h1><script>var a="hidden"</script>'), 'Dock scheduling that\'s& "easy"')
    assert.equal(normalizeVisible('  *Fast*\n dock ’s '), "Fast dock 's")
  })

  it('attend que la page réponde avec le texte écrit ; cookie du secret seulement ; false au délai', async () => {
    const seen: { url: string; cookie: string | null }[] = []
    let calls = 0
    const fetchImpl = (async (url: URL, init: RequestInit) => {
      seen.push({ url: String(url), cookie: new Headers(init.headers).get('cookie') })
      calls++
      if (calls === 1) throw new Error('ECONNREFUSED')
      return new Response(calls < 3 ? '<h1>Old</h1>' : '<h1>New&nbsp;title</h1>', { status: 200 })
    }) as unknown as typeof fetch
    const signal = createPreviewSignal({ origin: 'http://127.0.0.1:4999', secret: 's3cret-preview', fetchImpl, sleep: async () => {} })
    assert.equal(await signal.waitFresh('/blog/a', ['New title']), true)
    assert.equal(calls, 3)
    assert.equal(seen[0].url, 'http://127.0.0.1:4999/blog/a')
    assert.equal(seen[0].cookie, 'kz_preview=s3cret-preview')
    assert.ok(seen.every((call) => !call.url.includes('s3cret')))
    const never = createPreviewSignal({ origin: 'http://127.0.0.1:4999', secret: 's', fetchImpl: (async () => new Response('<p>x</p>')) as unknown as typeof fetch, sleep: async () => {}, timeoutMs: 0 })
    assert.equal(await never.waitFresh('/', ['absent']), false)
    assert.equal(await never.waitFresh('//evil.example/x', []), false)
  })
})
