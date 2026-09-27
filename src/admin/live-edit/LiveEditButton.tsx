'use client'

import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

/**
 * Bouton « Edit with AI » du SITE EN LIGNE (question 9 du Figma, décision du 2026-09-27). Monté par le layout du
 * site hors aperçu de l'éditeur et hors Draft Mode ; ne rend RIEN côté serveur ni au premier rendu client : le HTML
 * public est identique pour un visiteur. Après montage, il demande à l'admin si la personne peut modifier cette
 * page (`GET /admin/api/auth/editor-access`) ; seulement si la réponse est `canEdit: true`, la pilule (et son CSS)
 * est chargée à la demande.
 *
 * Aucune requête : sous 1 024 px (comme l'admin), dans une iframe (Presentation du Studio, aperçu), ou tant que la
 * fenêtre est trop étroite (la requête part si elle s'élargit).
 */

export const EDITOR_ACCESS_ENDPOINT = '/admin/api/auth/editor-access'

/** Même seuil que la garde « écran d'ordinateur » de l'admin (shell/AdminRoot.module.css). */
export const DESKTOP_QUERY = '(min-width: 1024px)'

const LiveEditPill = dynamic(() => import('./LiveEditPill').then((m) => m.LiveEditPill), { ssr: false })

/** Réponse attendue ; tout le reste (erreur, HTML, lien hors de l'éditeur) = pas de bouton. */
export function editorHrefFromResponse(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const { canEdit, href } = body as { canEdit?: unknown; href?: unknown }
  if (canEdit !== true || typeof href !== 'string') return null
  // Lien relatif vers l'éditeur seulement (jamais une autre origine).
  return href.startsWith('/admin/editor?') ? href : null
}

// Réponses déjà obtenues pendant la vie de l'onglet (navigation client : aller-retour sans nouvelle requête).
const cache = new Map<string, string | null>()

/** Pour les tests. */
export function resetLiveEditCache() {
  cache.clear()
}

function inFrame(): boolean {
  try {
    return window.self !== window.top
  } catch {
    return true
  }
}

export function LiveEditButton() {
  const pathname = usePathname()
  const [access, setAccess] = useState<{ path: string; href: string | null } | null>(null)

  useEffect(() => {
    if (!pathname || inFrame()) return
    const media = typeof window.matchMedia === 'function' ? window.matchMedia(DESKTOP_QUERY) : null
    const controller = new AbortController()
    let started = false

    const check = () => {
      if (started || (media && !media.matches)) return
      started = true
      if (cache.has(pathname)) {
        setAccess({ path: pathname, href: cache.get(pathname) ?? null })
        return
      }
      fetch(`${EDITOR_ACCESS_ENDPOINT}?path=${encodeURIComponent(pathname)}`, {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { accept: 'application/json' },
        signal: controller.signal,
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((body) => {
          const href = editorHrefFromResponse(body)
          cache.set(pathname, href)
          setAccess({ path: pathname, href })
        })
        .catch(() => {
          // Réseau, abandon, JSON illisible : rien à afficher (pas de cache, on réessaiera à la prochaine page).
        })
    }

    check()
    media?.addEventListener?.('change', check)
    return () => {
      controller.abort()
      media?.removeEventListener?.('change', check)
    }
  }, [pathname])

  // Réponse d'une autre page (navigation en cours) : rien tant que la nouvelle n'est pas arrivée.
  if (!access || access.path !== pathname || !access.href) return null
  return <LiveEditPill href={access.href} />
}
