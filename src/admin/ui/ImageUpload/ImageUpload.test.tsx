/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatBytes } from './format'
import { ImageUpload } from './ImageUpload'

afterEach(cleanup)

const file = (name: string, type: string, size: number) => {
  const f = new File(['x'], name, { type })
  Object.defineProperty(f, 'size', { value: size })
  return f
}

describe('ImageUpload', () => {
  it('empty : zone bouton nommée, parcourir au clavier, fichier valide transmis', async () => {
    const onFile = vi.fn()
    render(<ImageUpload label="Social preview" hint="1200 × 630 px" onFile={onFile} />)
    const zone = screen.getByRole('button', { name: /Social preview Drop an image or browse/ })
    expect(document.getElementById(zone.getAttribute('aria-describedby')!.split(' ')[0])?.textContent).toBe('1200 × 630 px')
    const input = document.querySelector('input[type=file]') as HTMLInputElement
    await userEvent.upload(input, file('og.png', 'image/png', 1000))
    expect(onFile).toHaveBeenCalledTimes(1)
  })

  it('glisser-déposer : état dragover puis fichier transmis', () => {
    const onFile = vi.fn()
    const { container } = render(<ImageUpload onFile={onFile} />)
    const zone = screen.getByRole('button')
    const dataTransfer = { types: ['Files'], files: [file('a.jpg', 'image/jpeg', 2000)], dropEffect: 'none' }
    fireEvent.dragEnter(zone, { dataTransfer })
    expect(container.firstElementChild?.getAttribute('data-state')).toBe('dragover')
    expect(screen.getByText('Drop to upload')).toBeTruthy()
    fireEvent.drop(screen.getByRole('button'), { dataTransfer })
    expect(onFile).toHaveBeenCalledTimes(1)
    expect(container.firstElementChild?.getAttribute('data-state')).toBe('empty')
  })

  it('refuse un type ou une taille hors limites, avec message', () => {
    const onFile = vi.fn()
    const onReject = vi.fn()
    render(<ImageUpload onFile={onFile} onReject={onReject} maxSize={1000} />)
    const zone = screen.getByRole('button')
    fireEvent.drop(zone, { dataTransfer: { types: ['Files'], files: [file('doc.pdf', 'application/pdf', 10)] } })
    expect(onReject).toHaveBeenLastCalledWith(expect.objectContaining({ reason: 'type' }))
    fireEvent.drop(zone, { dataTransfer: { types: ['Files'], files: [file('big.png', 'image/png', 5000)] } })
    expect(onReject).toHaveBeenLastCalledWith(expect.objectContaining({ reason: 'size' }))
    expect(onFile).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('big.png')
  })

  it('uploading et filled', async () => {
    const onRemove = vi.fn()
    const { rerender } = render(<ImageUpload onFile={() => {}} uploading={{ name: 'og-home.jpg', progress: 50 }} />)
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('50')
    expect(screen.getByRole('status').textContent).toBe('Uploading og-home.jpg… 50%')
    rerender(<ImageUpload onFile={() => {}} value={{ name: 'og-home.jpg', size: 188_416 }} onRemove={onRemove} />)
    expect(screen.getByText('og-home.jpg · 184 KB')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Replace/ })).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Remove og-home.jpg' }))
    expect(onRemove).toHaveBeenCalled()
  })

  it('formatBytes', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(188_416)).toBe('184 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5 MB')
  })
})
