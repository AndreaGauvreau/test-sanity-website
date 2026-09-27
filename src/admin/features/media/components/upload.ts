'use client'

import type { MediaAsset } from '../lib/assets'
import { checkUpload } from '../lib/upload-limits'

/**
 * Envoi d'un fichier vers la route `/admin/media/upload` (même origine, cookie de session) avec la
 * progression (XMLHttpRequest : fetch ne donne pas l'avancement de l'envoi). `replace` : id de l'asset
 * remplacé (ses utilisations suivent, dans les brouillons). Un fichier d'un type refusé ou plus gros que la
 * limite de son genre (lib/upload-limits.ts) est refusé tout de suite, sans être envoyé ; le serveur revérifie.
 */

export const UPLOAD_URL = '/admin/media/upload'

export type UploadResult = { ok: true; asset: MediaAsset; updated: number } | { ok: false; error: string }

export function uploadFile(
  file: File,
  options: { replace?: string; onProgress?: (percent: number) => void; signal?: AbortSignal } = {},
): Promise<UploadResult> {
  const problem = checkUpload({ type: file.type, size: file.size })
  if (problem) return Promise.resolve({ ok: false, error: `${file.name}: ${problem}` })
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest()
    const form = new FormData()
    form.append('file', file)
    if (options.replace) form.append('replace', options.replace)
    xhr.open('POST', UPLOAD_URL)
    xhr.responseType = 'json'
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) options.onProgress?.(Math.min(99, (event.loaded / event.total) * 100))
    }
    xhr.onload = () => {
      const body = xhr.response as UploadResult | { error?: { message?: string } } | null
      if (body && 'ok' in body) resolve(body)
      else resolve({ ok: false, error: (body as { error?: { message?: string } } | null)?.error?.message ?? `Upload failed (${xhr.status}).` })
    }
    xhr.onerror = () => resolve({ ok: false, error: "Couldn't upload. Check your connection and try again." })
    xhr.onabort = () => resolve({ ok: false, error: 'Upload cancelled.' })
    options.signal?.addEventListener('abort', () => xhr.abort())
    xhr.send(form)
  })
}

/** Lien de téléchargement du CDN Sanity (`?dl=` force l'enregistrement sous le nom d'origine). */
export function downloadUrl(asset: Pick<MediaAsset, 'url' | 'name'>): string {
  if (!asset.url) return ''
  return `${asset.url}?dl=${encodeURIComponent(asset.name)}`
}

/** Télécharge plusieurs fichiers l'un après l'autre (un lien par fichier). */
export function downloadAll(assets: readonly Pick<MediaAsset, 'url' | 'name'>[]): void {
  assets.forEach((asset, i) => {
    const href = downloadUrl(asset)
    if (!href) return
    setTimeout(() => {
      const a = document.createElement('a')
      a.href = href
      a.rel = 'noopener'
      a.download = asset.name
      document.body.appendChild(a)
      a.click()
      a.remove()
    }, i * 250)
  })
}
