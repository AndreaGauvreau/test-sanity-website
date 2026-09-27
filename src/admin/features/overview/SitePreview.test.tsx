/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PREVIEW_TIMEOUT_MS, SitePreview } from './SitePreview'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('SitePreview (B1)', () => {
  it('chargement : barre de navigateur, domaine, « Live preview of … » ; puis le site', () => {
    render(<SitePreview url="https://conduit.com" domain="conduit.com" frameable />)
    expect(screen.getByRole('region', { name: 'Published site' }).textContent).toContain('conduit.com')
    expect(screen.getByText('Live preview of conduit.com')).toBeTruthy()
    const frame = screen.getByTitle('Live preview of conduit.com') as HTMLIFrameElement
    expect(frame.getAttribute('src')).toBe('https://conduit.com')
    fireEvent.load(frame)
    expect(screen.queryByText('Live preview of conduit.com')).toBeNull()
  })

  it('site qui refuse l’iframe : « Preview unavailable » + lien', () => {
    render(<SitePreview url="https://conduit.com" domain="conduit.com" frameable={false} />)
    expect(screen.queryByTitle('Live preview of conduit.com')).toBeNull()
    expect(screen.getByText('Preview unavailable')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Open conduit.com/ }).getAttribute('target')).toBe('_blank')
  })

  it('cadre muet au-delà du délai : indisponible', () => {
    vi.useFakeTimers()
    render(<SitePreview url="https://conduit.com" domain="conduit.com" frameable={null} />)
    act(() => {
      vi.advanceTimersByTime(PREVIEW_TIMEOUT_MS)
    })
    expect(screen.getByText('Preview unavailable')).toBeTruthy()
  })

  it('contrôle en cours (Suspense) : pas encore d’iframe', () => {
    render(<SitePreview url="https://conduit.com" domain="conduit.com" />)
    expect(screen.queryByTitle('Live preview of conduit.com')).toBeNull()
    expect(screen.getByText('Live preview of conduit.com')).toBeTruthy()
  })
})
