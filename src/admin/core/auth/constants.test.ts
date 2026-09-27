import { describe, expect, it } from 'vitest'

import { AUTH_MESSAGES, loginErrorMessage } from './constants'

describe('messages de A1', () => {
  it('?error=provider → message anglais ; code inconnu → null', () => {
    expect(loginErrorMessage('provider')).toMatch(/sign-in provider/)
    expect(loginErrorMessage('<script>')).toBeNull()
    expect(loginErrorMessage(null)).toBeNull()
  })
  it('refus de rôle : nomme le rôle et renvoie vers le propriétaire du site', () => {
    expect(AUTH_MESSAGES.roleDenied('Viewer')).toMatch(/\(Viewer\).*Ask the site owner/)
  })
})
