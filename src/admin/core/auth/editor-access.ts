import { can as contractCan, type AdminRole, type Capability } from '@/admin/core/contracts/roles'
import type { PageDef } from '@/admin/core/contracts'

import { sanitizeNextPath } from './next-path'

/**
 * Accès à l'éditeur IA depuis le SITE PUBLIC (question 9 du Figma, décision du 2026-09-27 : bouton « Edit with AI »
 * sur le site en ligne quand on est connecté à l'admin). Pur.
 *
 * Réponse de `GET /admin/api/auth/editor-access?path=<chemin public>` : `{ canEdit: false }` dans tous les cas de refus
 * (pas de session, rôle sans `ai.editor`, chemin illisible, page inconnue ou sans `aiEditor`), sans dire lequel ;
 * sinon `{ canEdit: true, href }` vers l'éditeur plein écran de la page. Rien d'autre (ni rôle, ni identité).
 */
export type EditorAccess = { canEdit: false } | { canEdit: true; href: string }

export const NO_EDITOR_ACCESS: EditorAccess = Object.freeze({ canEdit: false })

/** Longueur maximale d'un chemin public accepté (au-delà : refus sans analyse). */
const MAX_PATH_LENGTH = 512

/**
 * Chemin public normalisé (`/`, `/blog`…) ou null. N'accepte qu'un chemin RELATIF (`/…`, jamais `//hôte`, antislash,
 * caractère de contrôle) ; la requête et le fragment sont ignorés, la barre finale retirée (`/blog/` = `/blog`).
 */
export function normalizePublicPath(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_PATH_LENGTH) return null
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(raw)) return null
  if (!raw.startsWith('/') || raw.startsWith('//')) return null
  let url: URL
  try {
    url = new URL(raw, 'http://kz.invalid')
  } catch {
    return null
  }
  if (url.origin !== 'http://kz.invalid') return null
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : url.pathname
  return path || '/'
}

/** Page du manifeste servie à ce chemin ET ouverte à l'éditeur IA (`aiEditor: true`), sinon null. */
export function editablePageForPath(pages: readonly PageDef[], path: string): PageDef | null {
  // Chemins exacts seulement : un motif (`/blog/:slug`) n'est jamais une page de l'éditeur.
  return (
    pages.find(
      (p) => p.aiEditor === true && p.path === path && !/[:[*]/.test(p.path) && /^[a-z0-9-]{1,64}$/i.test(p.id),
    ) ?? null
  )
}

/**
 * Lien vers l'éditeur de la page. `back` (« ‹ Admin » de l'éditeur) = l'écran admin de la page : `sanitizeNextPath`
 * n'accepte que des chemins `/admin…`, le retour direct vers le site public n'est donc pas possible.
 */
export function editorHrefFor(pageId: string): string {
  const back = sanitizeNextPath(`/admin/pages/${pageId}`)
  return `/admin/editor?page=${encodeURIComponent(pageId)}&back=${encodeURIComponent(back)}`
}

export function decideEditorAccess(input: {
  role: AdminRole | null | undefined
  path: unknown
  pages: readonly PageDef[]
  /** Injectable pour les tests ; par défaut le contrat (`core/contracts/roles.ts`). */
  can?: (role: AdminRole, capability: Capability) => boolean
}): EditorAccess {
  const can = input.can ?? contractCan
  if (!input.role || !can(input.role, 'ai.editor')) return NO_EDITOR_ACCESS
  const path = normalizePublicPath(input.path)
  if (!path) return NO_EDITOR_ACCESS
  const page = editablePageForPath(input.pages, path)
  if (!page) return NO_EDITOR_ACCESS
  return { canEdit: true, href: editorHrefFor(page.id) }
}
