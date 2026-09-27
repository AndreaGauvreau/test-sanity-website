import { describe, expect, it } from 'vitest'

import { firstParam, providerButtonLabel, sortProviders } from './providers'

describe('fournisseurs de A1', () => {
  it('libellés du Figma', () => {
    expect(providerButtonLabel({ name: 'google', title: 'Google' })).toBe('Continue with Google')
    expect(providerButtonLabel({ name: 'github', title: 'GitHub' })).toBe('Continue with GitHub')
    expect(providerButtonLabel({ name: 'sanity', title: 'E-mail / password' })).toBe('Continue with email')
    expect(providerButtonLabel({ name: 'saml-acme', title: ' ' })).toBe('Continue with saml-acme')
  })

  it('ordre : Google, GitHub, e-mail, puis les autres dans l’ordre reçu', () => {
    const sorted = sortProviders([{ name: 'saml-b' }, { name: 'sanity' }, { name: 'saml-a' }, { name: 'github' }, { name: 'google' }])
    expect(sorted.map((p) => p.name)).toEqual(['google', 'github', 'sanity', 'saml-b', 'saml-a'])
  })

  it('firstParam', () => {
    expect(firstParam(['a', 'b'])).toBe('a')
    expect(firstParam('x')).toBe('x')
    expect(firstParam(undefined)).toBeNull()
    expect(firstParam([])).toBeNull()
  })
})
