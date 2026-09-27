import { describe, expect, it } from 'vitest'

/**
 * Test d'intégration QA-1 contre le VRAI serveur (proxy compris), désactivé par défaut.
 * Lancement : `KZ_ADMIN_LIVE_URL=http://127.0.0.1:4040 npx vitest run src/admin/features/media/server/upload-route.live.test.ts`
 * Prérequis : `next dev` avec ADMIN_DEV_AUTOLOGIN (session de dev choisie par le cookie kz_dev_role).
 *
 * Aucun asset n'est créé : le fichier a un type REFUSÉ (application/octet-stream). Si le corps arrive entier,
 * uploadCore répond « This file type is not supported » ; s'il est tronqué en route (proxy qui met le corps en
 * mémoire tampon jusqu'à 10 Mo), la lecture du multipart échoue : « Invalid upload. » (le bug d'origine).
 */

const BASE = process.env.KZ_ADMIN_LIVE_URL
const MB = 1024 * 1024

async function post(size: number) {
  const form = new FormData()
  form.append('file', new File([new Uint8Array(size)], `qa1-${size}.bin`, { type: 'application/octet-stream' }))
  const res = await fetch(`${BASE}/admin/media/upload`, {
    method: 'POST',
    body: form,
    headers: { origin: BASE as string, cookie: 'kz_dev_role=client' },
  })
  return { status: res.status, body: (await res.json().catch(() => null)) as unknown }
}

describe.runIf(!!BASE)('QA-1 en vrai : envoi au-delà de 10 Mo', () => {
  it('12 Mo : le corps arrive entier (refus de type, pas « Invalid upload. »)', async () => {
    const { status, body } = await post(12 * MB)
    expect(body).toEqual({ ok: false, error: expect.stringMatching(/file type is not supported/) })
    expect(status).toBe(400)
  }, 60_000)

  it('60 Mo : idem (au-delà de toute mise en mémoire tampon du proxy)', async () => {
    const { body } = await post(60 * MB)
    expect(body).toEqual({ ok: false, error: expect.stringMatching(/file type is not supported/) })
  }, 120_000)
})
