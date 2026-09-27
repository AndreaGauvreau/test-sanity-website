import { findPage } from './lib/manifest'

/** Titre de l'onglet du navigateur : « Home · SEO ». Page inconnue : « Pages » (la page répondra 404). */
export function pageTitle(pageId: string, tab: string): string {
  const page = findPage(pageId)
  return page ? `${page.label} · ${tab}` : 'Pages'
}
