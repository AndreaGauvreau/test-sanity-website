/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { MediaAsset } from '../lib/assets'

const updateAltTextAction = vi.fn(async (input: { assetId: string; altText: string }) => ({ ok: true as const, altText: input.altText }))
vi.mock('../server/actions', () => ({ updateAltTextAction: (input: { assetId: string; altText: string }) => updateAltTextAction(input) }))
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }))

const { MediaDetails } = await import('./MediaDetails')

afterEach(() => {
  cleanup()
  updateAltTextAction.mockClear()
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
