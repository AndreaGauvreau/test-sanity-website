import { describe, expect, it } from 'vitest'

import { pickSiteFavicon, siteLogoSrc } from './site-logo-src'

const PNG = 'https://cdn.sanity.io/images/dwa2djm3/development/abc123-640x640.png'

describe('logo de la sidebar (favicon du site)', () => {
  it('favicon dark d’abord (admin sombre), sinon light, sinon rien', () => {
    expect(pickSiteFavicon({ dark: 'd', light: 'l' })).toBe('d')
    expect(pickSiteFavicon({ dark: null, light: 'l' })).toBe('l')
    expect(pickSiteFavicon({ dark: '', light: undefined })).toBeNull()
  })

  it('image du CDN Sanity : 56 × 56, format automatique, paramètres d’origine retirés', () => {
    expect(siteLogoSrc(`${PNG}?w=2400&rect=0,0,10,10#x`)).toBe(`${PNG}?w=56&h=56&fit=max&auto=format`)
  })

  it('SVG laissé tel quel (le CDN ne le redimensionne pas)', () => {
    const svg = 'https://cdn.sanity.io/images/p/d/logo-24x24.svg'
    expect(siteLogoSrc(`${svg}?w=10`)).toBe(svg)
  })

  it('refus : autre hôte, http, chemin hors /images, adresse invalide, vide → globe', () => {
    for (const url of [
      'https://evil.example/images/a.png',
      'http://cdn.sanity.io/images/p/d/a-1x1.png',
      'https://cdn.sanity.io/files/p/d/a.pdf',
      'javascript:alert(1)',
      'not a url',
      '',
      null,
      undefined,
    ]) {
      expect(siteLogoSrc(url)).toBeUndefined()
    }
  })
})
