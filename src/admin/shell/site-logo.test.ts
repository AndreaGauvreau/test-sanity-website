import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { fetchSiteLogo, SITE_LOGO_QUERY, type SiteLogoClient } from './site-logo'

const DARK = 'https://cdn.sanity.io/images/p/development/dark1-64x64.png'
const LIGHT = 'https://cdn.sanity.io/images/p/development/light1-64x64.png'

const clientReturning = (value: unknown): SiteLogoClient & { calls: unknown[][] } => {
  const calls: unknown[][] = []
  return {
    calls,
    fetch: async (...args: unknown[]) => {
      calls.push(args)
      if (value instanceof Error) throw value
      return value
    },
  }
}

describe('logo de la sidebar au chargement (siteSettings, brouillon compris)', () => {
  it('favicon dark d’abord, dimensionné pour 28 px', async () => {
    const client = clientReturning({ dark: DARK, light: LIGHT })
    expect(await fetchSiteLogo(client)).toBe(`${DARK}?w=56&h=56&fit=max&auto=format`)
    expect(client.calls[0][0]).toBe(SITE_LOGO_QUERY)
    const options = client.calls[0][2] as { signal?: AbortSignal; cache?: string }
    expect(options.signal).toBeInstanceOf(AbortSignal)
    expect(options.cache).toBe('no-store')
  })

  it('sans dark : le light', async () => {
    expect(await fetchSiteLogo(clientReturning({ dark: null, light: LIGHT }))).toBe(`${LIGHT}?w=56&h=56&fit=max&auto=format`)
  })

  it('aucun favicon, réponse inattendue ou erreur de Sanity : globe (undefined), jamais d’exception', async () => {
    expect(await fetchSiteLogo(clientReturning({ dark: null, light: null }))).toBeUndefined()
    expect(await fetchSiteLogo(clientReturning(null))).toBeUndefined()
    expect(await fetchSiteLogo(clientReturning({ dark: 42, light: { url: LIGHT } }))).toBeUndefined()
    expect(await fetchSiteLogo(clientReturning(new Error('timeout')))).toBeUndefined()
  })
})
