import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import { createFakeSanity } from './fake'

/** Faux Sanity : actions unpublish / delete (demande d'engine-publish), tout ou rien comme l'API Actions. */

const post = { _id: 'post-1', _type: 'post', title: 'Hello' }

describe('createFakeSanity > action', () => {
  it('unpublish : le publié disparaît, son contenu reste en brouillon (créé s’il manque, gardé s’il existe)', async () => {
    const sanity = createFakeSanity([post, { _id: 'post-2', _type: 'post', title: 'Live' }, { _id: 'drafts.post-2', _type: 'post', title: 'Edited' }])
    await sanity.action([
      { actionType: 'sanity.action.document.unpublish', draftId: 'drafts.post-1', publishedId: 'post-1' },
      { actionType: 'sanity.action.document.unpublish', draftId: 'drafts.post-2', publishedId: 'post-2' },
    ])
    const docs = sanity.docs
    assert.equal(docs['post-1'], undefined)
    assert.equal(docs['drafts.post-1']?.title, 'Hello')
    assert.equal(docs['post-2'], undefined)
    assert.equal(docs['drafts.post-2']?.title, 'Edited')
    assert.deepEqual(sanity.log, ['sanity.action.document.unpublish post-1', 'sanity.action.document.unpublish post-2'])
  })

  it('delete : le publié et les brouillons listés supprimés ; un brouillon non listé = refus, rien ne change', async () => {
    const sanity = createFakeSanity([post, { _id: 'drafts.post-1', _type: 'post', title: 'Draft' }])
    await assert.rejects(
      sanity.action([{ actionType: 'sanity.action.document.delete', publishedId: 'post-1', includeDrafts: [] }]),
      /draft exists that is not specified/,
    )
    assert.ok(sanity.docs['post-1'] && sanity.docs['drafts.post-1'])
    await sanity.action([{ actionType: 'sanity.action.document.delete', publishedId: 'post-1', includeDrafts: ['drafts.post-1'] }])
    assert.deepEqual(Object.keys(sanity.docs), [])
    assert.deepEqual(sanity.log, ['sanity.action.document.delete post-1'])
  })

  it('tout ou rien : une action impossible (publié absent) annule toute la requête', async () => {
    const sanity = createFakeSanity([post, { _id: 'drafts.post-1', _type: 'post', title: 'Draft' }])
    await assert.rejects(
      sanity.action([
        { actionType: 'sanity.action.document.publish', draftId: 'drafts.post-1', publishedId: 'post-1' },
        { actionType: 'sanity.action.document.unpublish', draftId: 'drafts.ghost', publishedId: 'ghost' },
      ]),
      /ghost is not published/,
    )
    await assert.rejects(sanity.action([{ actionType: 'sanity.action.document.delete', publishedId: 'ghost', includeDrafts: [] }]), /ghost not found/)
    assert.equal(sanity.docs['drafts.post-1']?.title, 'Draft')
    assert.equal(sanity.docs['post-1']?.title, 'Hello')
    assert.deepEqual(sanity.log, [])
  })

  it('publish et discard inchangés', async () => {
    const sanity = createFakeSanity([post, { _id: 'drafts.post-1', _type: 'post', title: 'New' }, { _id: 'drafts.post-3', _type: 'post', title: 'Tmp' }])
    await sanity.action([
      { actionType: 'sanity.action.document.publish', draftId: 'drafts.post-1', publishedId: 'post-1' },
      { actionType: 'sanity.action.document.discard', draftId: 'drafts.post-3' },
    ])
    assert.equal(sanity.docs['post-1']?.title, 'New')
    assert.equal(sanity.docs['drafts.post-1'], undefined)
    assert.equal(sanity.docs['drafts.post-3'], undefined)
  })
})
