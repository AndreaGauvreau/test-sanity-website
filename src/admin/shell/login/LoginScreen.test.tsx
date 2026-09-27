/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { ACCESS_NOTE, LoginScreen, NO_PROVIDER_MESSAGE } from './LoginScreen'

afterEach(cleanup)

const site = { name: 'Conduit', domain: 'conduit.com' }
const providers = [
  { name: 'sanity', title: 'E-mail / password', href: '/admin/api/auth/login?provider=sanity' },
  { name: 'github', title: 'GitHub', href: '/admin/api/auth/login?provider=github' },
  { name: 'google', title: 'Google', href: '/admin/api/auth/login?provider=google&next=%2Fadmin%2Fmedia' },
]

describe('A1 · LoginScreen', () => {
  it('textes du Figma et un lien par fournisseur, dans l’ordre Google, GitHub, email', () => {
    render(<LoginScreen site={site} providers={providers} />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Conduit — Admin')
    expect(screen.getByText('conduit.com/admin · Sign in with your Sanity account')).toBeTruthy()
    const list = screen.getByRole('list', { name: 'Sign-in methods' })
    const links = within(list).getAllByRole('link')
    expect(links.map((l) => l.textContent)).toEqual(['Continue with Google', 'Continue with GitHub', 'Continue with email'])
    expect(links[0].getAttribute('href')).toBe('/admin/api/auth/login?provider=google&next=%2Fadmin%2Fmedia')
    expect(screen.getByText(ACCESS_NOTE)).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('form', { name: 'Development sign-in' })).toBeNull()
  })

  it('erreur (fournisseur injoignable) : alerte, fournisseurs toujours proposés, pas de « Try again »', () => {
    render(<LoginScreen site={site} providers={providers} error="Couldn't reach this sign-in provider. Please try again." retryHref="/admin/login" />)
    expect(screen.getByRole('alert').textContent).toContain("Couldn't reach this sign-in provider.")
    expect(screen.queryByRole('link', { name: 'Try again' })).toBeNull()
    expect(screen.getAllByRole('link', { name: /Continue with/ })).toHaveLength(3)
  })

  it('Sanity injoignable (aucun fournisseur) : alerte + « Try again » vers la même page', () => {
    render(<LoginScreen site={site} providers={[]} error="Sanity isn't responding. Please try again in a moment." retryHref="/admin/login?next=%2Fadmin%2Fmedia" />)
    expect(screen.getByRole('alert').textContent).toContain("Sanity isn't responding")
    expect(screen.getByRole('link', { name: 'Try again' }).getAttribute('href')).toBe('/admin/login?next=%2Fadmin%2Fmedia')
    expect(screen.queryByRole('list', { name: 'Sign-in methods' })).toBeNull()
  })

  it('aucun fournisseur sans erreur : message clair', () => {
    render(<LoginScreen site={site} providers={[]} />)
    expect(screen.getByText(NO_PROVIDER_MESSAGE)).toBeTruthy()
  })

  it('connexion de développement : formulaire POST vers dev-role, un bouton par rôle, `next` conservé', () => {
    render(<LoginScreen site={site} providers={providers} dev={{ roles: ['kuartz', 'client', 'editor'], next: '/admin/media' }} />)
    const form = screen.getByRole('form', { name: 'Development sign-in' })
    expect(form.getAttribute('method')).toBe('post')
    expect(form.getAttribute('action')).toBe('/admin/api/auth/dev-role')
    expect((form.querySelector('input[name="next"]') as HTMLInputElement).value).toBe('/admin/media')
    const buttons = within(form).getAllByRole('button')
    expect(buttons.map((b) => [b.textContent, b.getAttribute('name'), b.getAttribute('value')])).toEqual([
      ['Kuartz', 'role', 'kuartz'],
      ['Client admin', 'role', 'client'],
      ['Editor', 'role', 'editor'],
    ])
  })
})
