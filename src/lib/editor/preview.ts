import { stegaClean } from 'next-sanity'

/**
 * Mode aperçu de l'éditeur IA : `KZ_EDITOR_PREVIEW=1`, posé par le moteur (engine/) sur le `next dev`
 * de son clone de travail (127.0.0.1:4042). La protection d'accès (cookie du secret d'aperçu) est dans
 * src/proxy.ts (auth-core). Dans ce mode, le site :
 * - lit les BROUILLONS (perspective drafts, jeton de lecture), sans stega ni cache (src/sanity/lib/live.ts) ;
 * - ne monte ni VisualEditing, ni DraftModeBanner, ni Analytics, ni SanityLive, ni les scripts de siteSettings ;
 * - rend les attributs data-edit* (editAttrs) et monte le pont <EditorBridge /> (src/admin/editor-bridge).
 * Hors de ce mode, rien de tout cela n'existe dans le HTML : le site public ne change pas d'un octet.
 *
 * Lu à l'exécution, côté serveur seulement (jamais NEXT_PUBLIC_*).
 */
export function isEditorPreview(): boolean {
  return process.env.KZ_EDITOR_PREVIEW === '1'
}

/** Attributs du contrat des zones (src/admin/core/contracts/zones.ts). */
export type EditAttrs = {
  'data-edit'?: string
  'data-edit-doc'?: string
  'data-edit-key'?: string
}

/** Id PUBLIÉ d'un document : sans encodage stega, sans préfixe « drafts. » ni version (« versions.<r>. »). */
export function publishedId(id: string): string {
  const clean = stegaClean(id)
  if (clean.startsWith('drafts.')) return clean.slice('drafts.'.length)
  const version = /^versions\.[^.]+\.(.+)$/.exec(clean)
  return version ? version[1] : clean
}

/**
 * Marquage d'un élément pour l'éditeur IA, rendu SEULEMENT en mode aperçu ; renvoie {} sinon.
 *
 *   <h1 className={styles.title} {...editAttrs('hero.title')}>
 *   <li {...editAttrs('features.card', { key: item._key })}>
 *   <section {...editAttrs('hero', { doc: 'dockSchedulingPage' })}>
 *
 * - `zone` : id déclaré dans src/editor/zones.json (`null` : seulement doc/key, sans zone) ;
 * - `doc`  : id du document Sanity que l'élément et ses descendants affichent (publié, nettoyé) ;
 * - `key`  : `_key` de l'élément de tableau Sanity (nettoyée du stega).
 */
export function editAttrs(zone: string | null, options: { doc?: string | null; key?: string | null } = {}): EditAttrs {
  if (!isEditorPreview()) return {}
  const attrs: EditAttrs = {}
  if (zone) attrs['data-edit'] = zone
  if (options.doc) attrs['data-edit-doc'] = publishedId(options.doc)
  if (options.key) attrs['data-edit-key'] = stegaClean(options.key)
  return attrs
}
