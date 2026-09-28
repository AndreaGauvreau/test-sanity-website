/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { MediaAsset } from '../lib/assets'

const updateAltTextAction = vi.fn(async (input: { assetId: string; altText: string }) => ({ ok: true as const, altText: input.altText }))
vi.mock('../server/actions', () => ({ updateAltTextAction: (input: { assetId: string; altText: string }) => updateAltTextAction(input) }))
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }))

const { MediaDetails } = await import('./MediaDetails')

beforeEach(() => {
  // Sorties de la Modal sans attendre l'animation (kit : voir Modal.test.tsx).
  MotionGlobalConfig.skipAnimations = true
})
afterEach(() => {
  cleanup()
  updateAltTextAction.mockClear()
  MotionGlobalConfig.skipAnimations = false
})

const asset = (over: Partial<MediaAsset> = {}): MediaAsset => ({
  id: 'image-abc-2400x1600-jpg',
  kind: 'image',
  name: 'hero-truck.jpg',
  mimeType: 'image/jpeg',
  extension: 'jpg',
  size: 1_258_291,
  width: 2400,
  height: 1600,
  createdAt: '2026-09-12T10:00:00Z',
  altText: 'Truck backing up to a loading dock',
  thumb: null,
  preview: null,
  full: null,
  url: 'https://cdn.sanity.io/images/p/d/abc-2400x1600.jpg',
  usages: [
    { id: 'a', label: 'Home › Hero — background', adminHref: '/admin/pages/home' },
    { id: 'b', label: 'Blog › How to cut dock wait times — cover', adminHref: '/admin/cms/blog/post-1' },
  ],
  ...over,
})

describe('MediaDetails (C5, fiche à droite)', () => {
  it('fichier utilisé : cadenas avec la raison, lignes d’usage cliquables, Delete bloqué', () => {
    const onDelete = vi.fn()
    render(<MediaDetails asset={asset()} onReplace={() => {}} onDelete={onDelete} onAltSaved={() => {}} replacing={false} />)
    expect(screen.getByRole('img', { name: 'Used in 2 places — remove it from the site before deleting.' })).toBeTruthy()
    expect(screen.getByText('Used in 2 places')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Home › Hero — background' }).getAttribute('href')).toBe('/admin/pages/home')
    const del = screen.getByRole('button', { name: 'Delete' })
    expect(del.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(del)
    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.getByText('JPG · 2400 × 1600 · 1.2 MB · added Sep 12')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Download' }).getAttribute('href')).toContain('?dl=hero-truck.jpg')
  })

  it('fichier inutilisé : Delete disponible', () => {
    const onDelete = vi.fn()
    render(<MediaDetails asset={asset({ usages: [] })} onReplace={() => {}} onDelete={onDelete} onAltSaved={() => {}} replacing={false} />)
    expect(screen.getByText('Not used on the site')).toBeTruthy()
    expect(screen.queryByRole('img', { name: /Used in/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onDelete).toHaveBeenCalled()
  })

  it('texte alternatif enregistré sur l’asset pendant la frappe', async () => {
    const onAltSaved = vi.fn()
    render(<MediaDetails asset={asset()} onReplace={() => {}} onDelete={() => {}} onAltSaved={onAltSaved} replacing={false} />)
    const input = screen.getByLabelText('Alt text')
    fireEvent.change(input, { target: { value: 'Truck at dock 4' } })
    fireEvent.blur(input)
    await waitFor(() => expect(updateAltTextAction).toHaveBeenCalledWith({ assetId: 'image-abc-2400x1600-jpg', altText: 'Truck at dock 4' }))
    await waitFor(() => expect(onAltSaved).toHaveBeenCalledWith('Truck at dock 4'))
  })

  it('pas de texte alternatif pour une vidéo', () => {
    render(<MediaDetails asset={asset({ kind: 'video', mimeType: 'video/mp4', extension: 'mp4', usages: [] })} onReplace={() => {}} onDelete={() => {}} onAltSaved={() => {}} replacing={false} />)
    expect(screen.queryByLabelText('Alt text')).toBeNull()
  })

  it('actions : ToolLinks du kit (groupe nommé, Download en lien, Delete au ton danger, raison du blocage) — FOLLOWUPS #40', () => {
    const onReplace = vi.fn()
    render(<MediaDetails asset={asset()} onReplace={onReplace} onDelete={() => {}} onAltSaved={() => {}} replacing />)
    const group = screen.getByRole('group', { name: 'File actions' })
    const replace = within(group).getByRole('button', { name: 'Replacing…' })
    expect(replace.getAttribute('aria-disabled')).toBe('true')
    const download = within(group).getByRole('link', { name: 'Download' })
    expect(download.hasAttribute('download')).toBe(true)
    const del = within(group).getByRole('button', { name: 'Delete' })
    expect(del.getAttribute('data-tone')).toBe('danger')
    expect(del.getAttribute('aria-disabled')).toBe('true')
  })
})

const PREVIEW = 'https://cdn.sanity.io/images/p/d/abc-2400x1600.jpg?w=576&h=576&fit=max&auto=format'
const FULL = 'https://cdn.sanity.io/images/p/d/abc-2400x1600.jpg?w=2400&h=2400&fit=max&auto=format'

describe('MediaDetails : aperçu dans son ratio et grand aperçu', () => {
  it('aperçu dans le ratio de l’asset (favicon carré : 640 / 640), image en contain, cadenas inchangé', () => {
    render(
      <MediaDetails
        asset={asset({ name: 'favicon.png', extension: 'png', mimeType: 'image/png', width: 640, height: 640, preview: PREVIEW, full: FULL })}
        onReplace={() => {}}
        onDelete={() => {}}
        onAltSaved={() => {}}
        replacing={false}
      />,
    )
    const button = screen.getByRole('button', { name: 'Preview favicon.png' })
    expect(button.getAttribute('aria-haspopup')).toBe('dialog')
    const box = button.parentElement as HTMLElement
    expect(box.style.getPropertyValue('--preview-ratio')).toBe('640 / 640')
    expect(button.querySelector('img')?.getAttribute('src')).toBe(PREVIEW)
    // La pastille reste une sœur du bouton (pas d'élément interactif dans un bouton), en haut à gauche.
    const lock = screen.getByRole('img', { name: /Used in 2 places/ })
    expect(button.contains(lock)).toBe(false)
    expect(box.contains(lock)).toBe(true)
  })

  it('sans dimensions : cadre du Figma (pas de ratio posé)', () => {
    render(<MediaDetails asset={asset({ width: undefined, height: undefined, preview: PREVIEW })} onReplace={() => {}} onDelete={() => {}} onAltSaved={() => {}} replacing={false} />)
    const box = screen.getByRole('button', { name: 'Preview hero-truck.jpg' }).parentElement as HTMLElement
    expect(box.style.getPropertyValue('--preview-ratio')).toBe('')
  })

  it('clic : Modal nommée par le fichier, image en grand (alt = texte alternatif), légende ; Échap ferme et rend le focus', async () => {
    const user = userEvent.setup()
    render(<MediaDetails asset={asset({ preview: PREVIEW, full: FULL })} onReplace={() => {}} onDelete={() => {}} onAltSaved={() => {}} replacing={false} />)
    const trigger = screen.getByRole('button', { name: 'Preview hero-truck.jpg' })
    await user.click(trigger)
    const dialog = await screen.findByRole('dialog', { name: 'hero-truck.jpg' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    const image = within(dialog).getByRole('img', { name: 'Truck backing up to a loading dock' })
    expect(image.getAttribute('src')).toBe(FULL)
    expect(within(dialog).getByText('2400 × 1600 · JPG · 1.2 MB').tagName).toBe('FIGCAPTION')
    // jsdom : fenêtre 1024 × 768 → image 888 × 592 (ratio gardé, dans ~90vw × 85vh et dans la fenêtre modale).
    const frame = image.parentElement as HTMLElement
    expect([frame.style.width, frame.style.height]).toEqual(['888px', '592px'])
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(trigger))
  })

  it('Entrée sur l’aperçu ouvre ; ✕ ferme', async () => {
    const user = userEvent.setup()
    render(<MediaDetails asset={asset({ preview: PREVIEW, full: FULL })} onReplace={() => {}} onDelete={() => {}} onAltSaved={() => {}} replacing={false} />)
    screen.getByRole('button', { name: 'Preview hero-truck.jpg' }).focus()
    await user.keyboard('{Enter}')
    const dialog = await screen.findByRole('dialog', { name: 'hero-truck.jpg' })
    await user.click(within(dialog).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('vidéo : la Modal lit la vidéo (controls) ; PDF : pas de grand aperçu', async () => {
    const user = userEvent.setup()
    const video = asset({ id: 'file-abc-mp4', kind: 'video', name: 'demo-tour.mp4', mimeType: 'video/mp4', extension: 'mp4', width: undefined, height: undefined, url: 'https://cdn.sanity.io/files/p/d/abc.mp4', usages: [] })
    const { unmount } = render(<MediaDetails asset={video} onReplace={() => {}} onDelete={() => {}} onAltSaved={() => {}} replacing={false} />)
    await user.click(screen.getByRole('button', { name: 'Preview demo-tour.mp4' }))
    const dialog = await screen.findByRole('dialog', { name: 'demo-tour.mp4' })
    const player = dialog.querySelector('video') as HTMLVideoElement
    expect(player.getAttribute('src')).toBe('https://cdn.sanity.io/files/p/d/abc.mp4')
    expect(player.hasAttribute('controls')).toBe(true)
    await waitFor(() => expect(document.activeElement).toBe(player))
    unmount()
    const pdf = asset({ id: 'file-def-pdf', kind: 'file', name: 'brochure.pdf', mimeType: 'application/pdf', extension: 'pdf', width: undefined, height: undefined, usages: [] })
    render(<MediaDetails asset={pdf} onReplace={() => {}} onDelete={() => {}} onAltSaved={() => {}} replacing={false} />)
    expect(screen.queryByRole('button', { name: /Preview/ })).toBeNull()
  })
})
