/**
 * Boutons des fournisseurs de connexion de A1 (logique pure). Les fournisseurs viennent de Sanity
 * (`getLoginProviders`, auth-core) : `google`, `github`, `sanity` (e-mail et mot de passe), et parfois d'autres
 * (SAML d'entreprise). Figma A1 : « Continue with Google », « Continue with GitHub », « Continue with email ».
 */

export type LoginProvider = { name: string; title: string; href: string }

const ORDER = ['google', 'github', 'sanity']

export function providerButtonLabel(provider: Pick<LoginProvider, 'name' | 'title'>): string {
  if (provider.name === 'sanity') return 'Continue with email'
  const title = provider.title.trim() || provider.name
  return `Continue with ${title}`
}

/** Ordre du Figma (Google, GitHub, e-mail), puis les autres dans l'ordre de Sanity. */
export function sortProviders<T extends Pick<LoginProvider, 'name'>>(providers: readonly T[]): T[] {
  const rank = (p: T) => {
    const i = ORDER.indexOf(p.name)
    return i === -1 ? ORDER.length : i
  }
  return providers
    .map((p, index) => ({ p, index }))
    .sort((a, b) => rank(a.p) - rank(b.p) || a.index - b.index)
    .map(({ p }) => p)
}

/** Premier élément d'un paramètre de recherche Next (`string | string[] | undefined`). */
export function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}
