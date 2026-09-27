/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FaviconPreview } from './FaviconPreview'

afterEach(cleanup)

const images = (container: HTMLElement) => Array.from(container.querySelectorAll('img'))

describe('FaviconPreview', () => {
  it('fond Figma selon le thème (180 × 110) + favicon superposé 16 × 16', () => {
    const { container, rerender } = render(<FaviconPreview theme="light" src="/icon.png" />)
    let [bg, icon] = images(container)
    expect(bg.getAttribute('src')).toMatch(/favicon-bg-light.*\.png/)
    expect([bg.getAttribute('width'), bg.getAttribute('height')]).toEqual(['180', '110'])
    expect(icon.getAttribute('src')).toBe('/icon.png')
    expect([icon.getAttribute('width'), icon.getAttribute('height')]).toEqual(['16', '16'])
    expect(screen.getByText('Light')).toBeTruthy()

    rerender(<FaviconPreview theme="dark" src="/icon.png" />)
    ;[bg] = images(container)
    expect(bg.getAttribute('src')).toMatch(/favicon-bg-dark.*\.png/)
    expect(screen.getByText('Dark')).toBeTruthy()
  })

  it('sans favicon : pastille de repli, pas de Remove badge', () => {
    const { container } = render(<FaviconPreview src={null} onRemove={() => {}} />)
    expect(images(container)).toHaveLength(1)
    expect(container.querySelector('[data-placeholder]')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Remove/ })).toBeNull()
  })

  it('image illisible : repli sur la pastille, puis nouvelle URL affichée', () => {
    const { container, rerender } = render(<FaviconPreview src="/broken.png" />)
    fireEvent.error(images(container)[1])
    expect(images(container)).toHaveLength(1)
    expect(container.querySelector('[data-placeholder]')).toBeTruthy()
    rerender(<FaviconPreview src="/ok.png" />)
    expect(images(container)[1].getAttribute('src')).toBe('/ok.png')
  })

  it('Upload transmet le fichier, Remove appelle onRemove', async () => {
    const onFile = vi.fn()
    const onRemove = vi.fn()
    const { container } = render(<FaviconPreview theme="dark" src="/icon.png" onFile={onFile} onRemove={onRemove} />)
    const upload = screen.getByRole('button', { name: 'Upload' })
    expect(document.getElementById(upload.getAttribute('aria-describedby')!)?.textContent).toBe('Dark')
    const input = container.querySelector('input[type=file]') as HTMLInputElement
    await userEvent.upload(input, new File(['x'], 'icon.png', { type: 'image/png' }))
    expect(onFile).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole('button', { name: 'Remove dark favicon' }))
    expect(onRemove).toHaveBeenCalledTimes(1)
  })

  it('disabled : Upload et Remove inactifs ; sans onFile, pas de bouton Upload', () => {
    const { rerender } = render(<FaviconPreview src="/icon.png" onFile={() => {}} onRemove={() => {}} disabled />)
    expect((screen.getByRole('button', { name: 'Upload' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Remove light favicon' }) as HTMLButtonElement).disabled).toBe(true)
    rerender(<FaviconPreview src="/icon.png" />)
    expect(screen.queryByRole('button', { name: 'Upload' })).toBeNull()
  })
})
