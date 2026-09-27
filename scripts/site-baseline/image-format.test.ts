// npx tsx --test scripts/site-baseline/image-format.test.ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pinImageRoute, STABLE_IMAGE_ACCEPT, withStableImageAccept } from './image-format'

test("l'Accept des images exclut l'AVIF (sinon cdn.sanity.io alterne AVIF/WebP)", () => {
  assert.ok(!STABLE_IMAGE_ACCEPT.includes('avif'))
  const h = withStableImageAccept({ Accept: 'image/avif,image/webp,*/*', referer: 'x' })
  assert.deepEqual(h, { referer: 'x', accept: STABLE_IMAGE_ACCEPT })
})

function fakeRoute(type: string) {
  const calls: unknown[] = []
  const route = {
    request: () => ({ resourceType: () => type, headers: () => ({ accept: 'image/avif,image/webp' }) }),
    continue: async (o?: unknown) => { calls.push(o) },
  }
  return { route, calls }
}

test('seules les requêtes d’images sont réécrites', async () => {
  const img = fakeRoute('image')
  await pinImageRoute(img.route as never)
  assert.deepEqual(img.calls, [{ headers: { accept: STABLE_IMAGE_ACCEPT } }])
  const doc = fakeRoute('document')
  await pinImageRoute(doc.route as never)
  assert.deepEqual(doc.calls, [undefined])
})
