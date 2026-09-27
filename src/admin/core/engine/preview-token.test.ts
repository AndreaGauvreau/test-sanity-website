import { describe, expect, it } from 'vitest'

import { PREVIEW_TOKEN_TTL_SECONDS, renewPreviewToken, signPreviewToken, verifyPreviewToken } from './preview-token'

const SECRET = 'preview-secret-0123456789abcdef'
const NOW = 1_790_000_000

describe('jeton d’aperçu court', () => {
  it('verifyPreviewToken rend l’échéance ET l’utilisateur (pour re-signer, FOLLOWUPS #39)', async () => {
    const t = await signPreviewToken(SECRET, 'user-é/1', NOW)
    expect(await verifyPreviewToken(SECRET, t, NOW)).toEqual({ exp: NOW + PREVIEW_TOKEN_TTL_SECONDS, userId: 'user-é/1' })
    expect(await verifyPreviewToken('another-secret-0123456789abcdef', t, NOW)).toBeNull()
  })
  it('renewPreviewToken : même utilisateur, échéance glissante, jamais raccourcie', async () => {
    const t = await signPreviewToken(SECRET, 'user-1', NOW)
    const v = (await verifyPreviewToken(SECRET, t, NOW + 300))!
    const renewed = await renewPreviewToken(SECRET, v, NOW + 300)
    expect(renewed.exp).toBe(NOW + 300 + PREVIEW_TOKEN_TTL_SECONDS)
    expect(await verifyPreviewToken(SECRET, renewed.token, NOW + 300)).toEqual({ exp: renewed.exp, userId: 'user-1' })
    const long = await renewPreviewToken(SECRET, { exp: NOW + 7_200, userId: 'kz-engine' }, NOW)
    expect(long.exp).toBe(NOW + 7_200)
  })
})
