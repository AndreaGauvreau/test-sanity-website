/**
 * Manifeste du site pour l'admin : ce que Kuartz déclare, site par site, pour brancher l'admin.
 * L'instance de Conduit vit dans `src/admin.config.ts` (agent site-adapter) ; l'admin ne connaît le site
 * QUE par elle — aucune feature n'importe un schéma Sanity ou un composant du site directement.
 *
 * Principe du Figma : « la structure est figée ». Pages, sections et champs sont définis ici et dans le schéma
 * Sanity par Kuartz ; le client ne modifie que les valeurs et les éléments des collections.
 *
 * CONTRAT PARTAGÉ — propriétaire : l'orchestrateur.
 */

export type FieldKind =
  | 'string'
  | 'text'
  | 'url'
  | 'slug'
  | 'cta'
  | 'image'
  | 'portableText'
  | 'reference'
  | 'select'
  | 'number'
  | 'boolean'
  | 'date'
  | 'array'
  | 'object'

export type FieldDef = {
  /** Nom du champ dans l'objet parent (ex. « title », « primaryCta »). */
  name: string
  label: string
  kind: FieldKind
  required?: boolean
  /** Longueur visible maximale. Validée côté serveur : l'API Sanity n'applique pas les règles du schéma. */
  maxLength?: number
  /** Retours à la ligne significatifs (white-space: pre-line) : nombre de lignes maximal. */
  maxLines?: number
  /** Texte masqué à l'écran sur le site (titre pour lecteurs d'écran) : pas de surface dans l'aperçu. */
  visuallyHidden?: boolean
  help?: string
  placeholder?: string
  /** select : valeurs fermées. Elles choisissent souvent une classe CSS : jamais de texte libre. */
  options?: readonly { value: string; label: string }[]
  /** reference : types ciblés. */
  to?: readonly string[]
  /** array / object / cta : champs des éléments. */
  fields?: readonly FieldDef[]
  /** array : bornes du nombre d'éléments. Longueur fixe = min === max. */
  min?: number
  max?: number
  /** Nom d'un élément d'array dans l'interface (« Module »). */
  itemLabel?: string
  /** Zone de l'éditeur IA qui affiche ce champ (voir zones.ts), pour les liens « Open in AI editor ». */
  zone?: string
}

export type DocumentRef = { type: string; id: string }

export type SectionDef = {
  /** Champ du document qui porte la section (ex. « hero »). */
  name: string
  label: string
  /** Zone racine de la section dans l'éditeur IA. */
  zone?: string
  fields: readonly FieldDef[]
}

/** Chemins des champs SEO dans le document de la page (C2). */
export type SeoFieldMap = {
  metaTitle: string
  metaDescription: string
  ogImage?: string
  allowIndexing?: string
}

export type PageDef = {
  /** Identifiant stable, utilisé dans les routes de l'admin (/admin/pages/<id>). */
  id: string
  label: string
  /** Chemin public (« / », « /blog »). */
  path: string
  /** Document qui porte les textes. Absent = page sans contenu éditable (C1 le dit et renvoie vers Kuartz). */
  document?: DocumentRef
  sections: readonly SectionDef[]
  seo?: SeoFieldMap
  /** JSON-LD écrit à la main par Kuartz dans le code : affiché en lecture seule en C2. */
  jsonLd?: { file: string; summary: string }
  /** Page listing d'une collection : sa page article (C6, « slug: 12 » dans la sidebar). */
  article?: { collection: string; path: string; seoTemplate: DocumentRef }
  /** « Open in AI editor » disponible (G1). */
  aiEditor: boolean
}

export type ColumnDef = {
  field: string
  label: string
  kind: 'title' | 'text' | 'date' | 'status' | 'image' | 'select' | 'number'
  width?: number
}

export type CollectionDef = {
  /** Identifiant de route de l'admin (« blog » → /admin/cms/blog), stable. */
  id: string
  /** Type Sanity (« post »). */
  type: string
  /** Nom affiché (« Blog »), comme dans la sidebar. */
  label: string
  /** Nom d'un élément (« Article »). */
  singular: string
  /** Nom d'une icône du kit (src/admin/ui/icons). */
  icon: string
  titleField: string
  imageField?: string
  slugField?: string
  columns: readonly ColumnDef[]
  /** Champs du panneau C4. */
  fields: readonly FieldDef[]
  /** Ordre manuel (champ orderRank, G5 ⇅). */
  orderable: boolean
  defaultSort: { field: string; direction: 'asc' | 'desc' }
  searchFields: readonly string[]
  filters?: readonly { field: string; label: string; options: readonly { value: string; label: string }[] }[]
  /** Page article publique (« /blog/:slug »). */
  articlePath?: string
}

/** Variable {{…}} d'un modèle SEO de page article (C6). */
export type SeoTemplateVariable = { token: string; label: string; path: string }

export type AdminConfig = {
  site: {
    name: string
    /** Domaine affiché dans la sidebar (« conduit.com »). */
    domain: string
    /** URL publique (View site ↗). */
    url: string
  }
  /** Document unique des réglages du site (B2, B3). */
  settings: DocumentRef
  pages: readonly PageDef[]
  collections: readonly CollectionDef[]
  articleSeoTemplates: readonly { collection: string; document: DocumentRef; variables: readonly SeoTemplateVariable[] }[]
}
