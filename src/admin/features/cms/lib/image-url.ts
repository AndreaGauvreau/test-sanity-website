/**
 * URL CDN d'une image Sanity à partir de l'id de son asset (« image-<hash>-<w>x<h>-<ext> »). Pur.
 * Pas de dépendance à @sanity/image-url : l'admin n'a besoin que de vignettes et d'aperçus.
 */

export type ImageCdnEnv = { projectId: string; dataset: string }

const IMAGE_ID = /^image-([a-f0-9]+)-(\d+)x(\d+)-([a-z0-9]+)$/i
const FILE_ID = /^file-([a-f0-9]+)-([a-z0-9]+)$/i

export function parseImageId(ref: unknown): { hash: string; width: number; height: number; ext: string } | null {
  if (typeof ref !== 'string') return null
  const m = IMAGE_ID.exec(ref)
  return m ? { hash: m[1], width: Number(m[2]), height: Number(m[3]), ext: m[4].toLowerCase() } : null
}

/** Vignette recadrée (w × h, `fit=crop`) ou image à largeur max (`w` seul). */
export function imageUrl(ref: unknown, env: ImageCdnEnv, params: { w?: number; h?: number; fit?: 'crop' | 'max' } = {}): string | null {
  const parsed = parseImageId(ref)
  if (!parsed) return null
  const base = `https://cdn.sanity.io/images/${env.projectId}/${env.dataset}/${parsed.hash}-${parsed.width}x${parsed.height}.${parsed.ext}`
  const query = new URLSearchParams()
  if (params.w) query.set('w', String(params.w))
  if (params.h) query.set('h', String(params.h))
  if (params.fit) query.set('fit', params.fit)
  query.set('auto', 'format')
  return `${base}?${query.toString()}`
}

/** URL d'origine d'un fichier (vidéo, PDF…) d'après son id « file-<hash>-<ext> ». */
export function fileUrl(ref: unknown, env: ImageCdnEnv): string | null {
  if (typeof ref !== 'string') return null
  const m = FILE_ID.exec(ref)
  return m ? `https://cdn.sanity.io/files/${env.projectId}/${env.dataset}/${m[1]}.${m[2].toLowerCase()}` : null
}
