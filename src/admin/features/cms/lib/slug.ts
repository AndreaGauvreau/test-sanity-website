/**
 * Slugs des éléments de collection (C4 « Slug : généré depuis le titre à la création, modifiable »). Pur.
 * Format accepté par la validation serveur (core/sanity/validate.ts) : `a-z0-9` et tirets.
 */

export const SLUG_MAX = 96

export function slugify(input: string, max = SLUG_MAX): string {
  const base = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return base.slice(0, max).replace(/-+$/g, '')
}

/** Premier slug libre : `base`, puis `base-2`, `base-3`… */
export function uniqueSlug(base: string, taken: ReadonlySet<string>, max = SLUG_MAX): string {
  const root = base || 'item'
  if (!taken.has(root)) return root
  for (let n = 2; n < 10_000; n++) {
    const suffix = `-${n}`
    const candidate = `${root.slice(0, max - suffix.length).replace(/-+$/g, '')}${suffix}`
    if (!taken.has(candidate)) return candidate
  }
  return `${root.slice(0, max - 9)}-${Date.now().toString(36)}`
}

/** Chemin public d'un élément : « /blog/:slug » → « /blog/carrier-portals ». */
export function articlePathFor(pattern: string | undefined, slug: string | null | undefined): string | null {
  if (!pattern || !slug) return null
  return pattern.replace(':slug', slug)
}
