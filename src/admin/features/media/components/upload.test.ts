/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { UPLOAD_MAX_BYTES } from '../lib/upload-limits'
import { uploadFile } from './upload'

function fakeFile(name: string, type: string, size: number): File {
  const file = new File(['x'], name, { type })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

afterEach(() => vi.unstubAllGlobals())

describe('uploadFile (navigateur)', () => {
  it('refuse tout de suite un fichier au-delà de la limite de son genre, sans rien envoyer', async () => {
    const open = vi.fn()
    vi.stubGlobal('XMLHttpRequest', vi.fn(() => ({ open, send: vi.fn(), upload: {} })))
    const result = await uploadFile(fakeFile('clip.mp4', 'video/mp4', UPLOAD_MAX_BYTES.video + 1))
    expect(result).toEqual({ ok: false, error: 'clip.mp4: This file is too large (100 MB max).' })
    expect(open).not.toHaveBeenCalled()
  })

  it('refuse un type hors liste blanche', async () => {
    const result = await uploadFile(fakeFile('page.html', 'text/html', 10))
    expect(result.ok).toBe(false)
  })
})
