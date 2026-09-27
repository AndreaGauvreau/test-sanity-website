import type { AdminConfig } from '@/admin/core/contracts'

import type { GeneralImage } from './images'

/**
 * Modèle de l'écran B2, construit côté serveur et passé au composant client. PUR.
 */

export type GeneralView = {
  values: {
    title: string
    description: string
    allowIndexing: boolean
    faviconLight: GeneralImage | null
    faviconDark: GeneralImage | null
    socialImage: GeneralImage | null
  }
  /** Le document n'existe pas encore (ni publié ni brouillon). */
  missing: boolean
  /** Un brouillon non publié existe. */
  hasDraft: boolean
  site: { name: string; domain: string; url: string }
}

type State = { published: Record<string, unknown> | null; draft: Record<string, unknown> | null; value: Record<string, unknown> | null }

const text = (value: unknown): string => (typeof value === 'string' ? value : '')

export function toGeneralView(
  state: State,
  site: AdminConfig['site'],
  toImage: (value: unknown) => GeneralImage | null,
): GeneralView {
  const doc = state.value ?? {}
  return {
    values: {
      title: text(doc.title),
      description: text(doc.description),
      // Schéma : initialValue true ; absent = indexé (le site lit `allowIndexing != false`).
      allowIndexing: doc.allowIndexing !== false,
      faviconLight: toImage(doc.faviconLight),
      faviconDark: toImage(doc.faviconDark),
      socialImage: toImage(doc.socialImage),
    },
    missing: !state.value,
    hasDraft: !!state.draft,
    site: { name: site.name, domain: site.domain, url: publicUrl(site) },
  }
}

/**
 * URL affichée dans l'aperçu Google : l'URL publique du site si elle est en https, sinon « https://<domaine> »
 * (en local, `site.url` vaut http://127.0.0.1:4040, qui n'a pas de sens dans un aperçu de recherche).
 */
export function publicUrl(site: AdminConfig['site']): string {
  try {
    const url = new URL(site.url)
    if (url.protocol === 'https:') return url.origin
  } catch {
    // URL invalide : repli sur le domaine.
  }
  return `https://${site.domain}`
}

/** « Schedule dock appointments, cut wait times… » : coupe au mot sous `max` caractères (carte sociale du Figma). */
export function truncateWords(value: string, max: number): string {
  const clean = value.trim()
  if ([...clean].length <= max) return clean
  const cut = [...clean].slice(0, max).join('')
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.—–-]+$/u, '')}…`
}
