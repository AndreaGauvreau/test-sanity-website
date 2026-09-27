/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Avatar } from './Avatar'
import { initialsOf } from './initials'

afterEach(cleanup)

describe('Avatar', () => {
  it('initiales et nom accessible', () => {
    render(<Avatar name="Marie Dupont" tone="green" size={28} />)
    const avatar = screen.getByRole('img', { name: 'Marie Dupont' })
    expect(avatar.textContent).toBe('MD')
    expect(avatar.getAttribute('data-size')).toBe('28')
  })

  it('image puis repli sur les initiales si elle ne charge pas', () => {
    const { container } = render(<Avatar name="Kuartz" src="/x.png" />)
    const img = container.querySelector('img')!
    fireEvent.error(img)
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByRole('img', { name: 'Kuartz' }).textContent).toBe('K')
  })

  it('décoratif : caché des lecteurs d\'écran', () => {
    const { container } = render(<Avatar name="A" decorative />)
    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true')
  })

  it('initialsOf', () => {
    expect(initialsOf('marie@conduit.com')).toBe('MC')
    expect(initialsOf('  ')).toBe('?')
    expect(initialsOf('Andrea · Kuartz')).toBe('AK')
  })
})
