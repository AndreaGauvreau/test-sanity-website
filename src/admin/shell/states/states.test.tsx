/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

const { ShellError, ERROR_TITLE } = await import('./ShellError')
const { ShellNotFound, NOT_FOUND_TITLE } = await import('./ShellNotFound')
const { ShellSkeleton } = await import('./ShellSkeleton')

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('états de la coque', () => {
  it('erreur : message anglais, référence (digest), « Try again » → retry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const retry = vi.fn()
    const error = Object.assign(new Error('secret SQL detail'), { digest: 'abc123' })
    render(<ShellError error={error} retry={retry} />)
    expect(screen.getByRole('alert').textContent).toContain(ERROR_TITLE)
    expect(screen.getByText('Reference: abc123')).toBeTruthy()
    expect(document.body.textContent).not.toContain('secret SQL detail')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('introuvable : titre + retour à Overview ; version plein écran', () => {
    const { rerender } = render(<ShellNotFound />)
    expect(screen.getByRole('heading', { name: NOT_FOUND_TITLE })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to Overview' }).getAttribute('href')).toBe('/admin')
    rerender(<ShellNotFound standalone />)
    expect(screen.getByRole('main')).toBeTruthy()
  })

  it('chargement : annoncé (role="status", aria-busy) avec un texte masqué', () => {
    render(<ShellSkeleton />)
    const status = screen.getByRole('status')
    expect(status.getAttribute('aria-busy')).toBe('true')
    expect(status.textContent).toContain('Loading…')
  })
})
