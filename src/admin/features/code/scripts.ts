import type { AdminConfig, FieldDef } from '@/admin/core/contracts/manifest'
import type { SignableScript } from '@/lib/script-signature'
import { parseScriptCode, scriptVariables } from '@/lib/site-scripts'

/**
 * Scripts du site (B3 Code, G6) : modèle, libellés, options de page, contrôle d'un script. PUR (client et serveur).
 *
 * Donnée : `siteSettings.scripts[]` (siteScript) = { _key, name (60), placement, page, run, code, enabled }.
 * L'ordre du tableau = l'ordre d'injection pour un même emplacement. Voir src/lib/site-scripts.ts (rendu du site).
 *
 * POINT SENSIBLE : le code est injecté TEL QUEL sur le site publié (XSS par conception). Seul Kuartz
 * (`settings.code`) le lit et l'écrit ; chaque server action le revérifie. SEC-04 : chaque écriture de l'admin
 * SIGNE le script (champ `signature`, src/lib/script-signature.ts) et le site n'injecte que les scripts signés.
 */

export type ScriptPlacement = 'headEnd' | 'bodyStart' | 'bodyEnd'
export type ScriptRun = 'once' | 'everyPageVisit'

export type ScriptItem = {
  key: string
  name: string
  placement: ScriptPlacement
  /** « all », id d'une page du manifeste (« home ») ou « <page>/slug » (page article). */
  page: string
  run: ScriptRun
  code: string
  enabled: boolean
  /**
   * SEC-04 : signature valide (vérifiée côté SERVEUR, data.ts). `false` = modifié hors de l'admin (Studio, API) ou
   * jamais signé : le site ne l'injecte pas. La signature elle-même ne part jamais vers le navigateur.
   */
  signed: boolean
}

export type ScriptValues = Omit<ScriptItem, 'key' | 'enabled' | 'signed'>

/** Emplacements, dans l'ordre du menu (Figma B3 : Start of <body> · End of <head> · End of <body>). */
export const PLACEMENT_OPTIONS: readonly { value: ScriptPlacement; label: string }[] = [
  { value: 'headEnd', label: 'End of <head>' },
  { value: 'bodyStart', label: 'Start of <body>' },
  { value: 'bodyEnd', label: 'End of <body>' },
]

export const RUN_OPTIONS: readonly { value: ScriptRun; label: string }[] = [
  { value: 'once', label: 'Once' },
  { value: 'everyPageVisit', label: 'On every page visit' },
]

export const NAME_MAX = 60
/** Borne du code (le document siteSettings est limité à quelques Mo par Sanity ; un script réel fait quelques Ko). */
export const CODE_MAX = 100_000
export const SCRIPTS_MAX = 50

export const DEFAULT_SCRIPT: ScriptValues = { name: '', placement: 'bodyEnd', page: 'all', run: 'once', code: '' }

/** Champ CMS d'une page article, insérable dans le code ({{title}}…). */
export type ArticleField = { token: string; label: string }

/** Option du menu Page (G6) : « All pages », une page, ou la page article d'une page listing (« slug: »). */
export type PageOption = {
  value: string
  /** Libellé du menu : « All pages », « Home », « /blog », « slug: ». */
  label: string
  /** Libellé du tableau : « All pages », « / », « /blog », « /blog/:slug ». */
  path: string
  icon?: 'house' | 'page' | 'database'
  depth?: 0 | 1
  /** Nombre d'éléments de la collection (« slug: 12 »). */
  count?: number
  /** Page article : collection et champs utilisables en {{…}}. */
  article?: { collection: string; collectionLabel: string; fields: readonly ArticleField[] }
}

/**
 * Options de page tirées du manifeste (la seule porte vers le site) : All pages, chaque page, et sous chaque page
 * listing sa page article « slug: ». `counts` : nombre d'éléments par collection (id de CollectionDef).
 */
export function pageOptions(config: Pick<AdminConfig, 'pages' | 'collections' | 'articleSeoTemplates'>, counts: Readonly<Record<string, number>> = {}): PageOption[] {
  const out: PageOption[] = [{ value: 'all', label: 'All pages', path: 'All pages' }]
  for (const page of config.pages) {
    out.push({
      value: page.id,
      label: page.path === '/' ? page.label : page.path,
      path: page.path,
      icon: page.path === '/' ? 'house' : 'page',
      depth: 0,
    })
    if (page.article) {
      const collection = config.collections.find((c) => c.id === page.article!.collection || c.type === page.article!.collection)
      const template = config.articleSeoTemplates.find((t) => t.collection === collection?.type || t.collection === page.article!.collection)
      const articlePath = page.article.path || `${page.path.replace(/\/$/, '')}/:slug`
      out.push({
        value: `${page.id}/slug`,
        label: 'slug:',
        path: articlePath,
        icon: 'database',
        depth: 1,
        ...(collection && counts[collection.id] !== undefined ? { count: counts[collection.id] } : {}),
        article: {
          collection: collection?.id ?? page.article.collection,
          collectionLabel: collection?.label ?? page.label,
          fields: (template?.variables ?? []).map((v) => ({ token: v.token, label: v.label })),
        },
      })
    }
  }
  return out
}

/** Libellé du tableau pour une page (« All pages », « /blog/:slug »), ou la valeur brute si elle n'existe plus. */
export function pageLabel(options: readonly PageOption[], page: string): string {
  return options.find((o) => o.value === page)?.path ?? page
}

export function placementLabel(placement: string): string {
  return PLACEMENT_OPTIONS.find((o) => o.value === placement)?.label ?? placement
}

export function runLabel(run: string): string {
  return RUN_OPTIONS.find((o) => o.value === run)?.label ?? run
}

/** Colonne « Type » (B3) : déduite des balises du code — <style> = CSS, <script> = JavaScript. */
export function scriptType(code: string): 'CSS' | 'JavaScript' | 'CSS + JavaScript' | '—' {
  const { parts } = parseScriptCode(code)
  const css = parts.some((p) => p.kind === 'css')
  const js = parts.some((p) => p.kind !== 'css')
  if (css && js) return 'CSS + JavaScript'
  if (css) return 'CSS'
  if (js) return 'JavaScript'
  return '—'
}

/** Variables {{…}} du code (champs CMS utilisés, G6), sans doublon, dans l'ordre. */
export function detectedFields(code: string): string[] {
  return scriptVariables(code)
}

export type ScriptCheck = {
  /** Erreurs bloquantes, par champ (message anglais). */
  errors: Partial<Record<'name' | 'placement' | 'page' | 'run' | 'code', string>>
  /** Avertissements (n'empêchent pas d'enregistrer). */
  warnings: string[]
  /** Champs {{…}} utilisés dans le code. */
  fields: string[]
}

/**
 * Contrôle d'un script avant enregistrement (même règles côté client pour le retour immédiat et côté serveur).
 * Pas de validation du JavaScript (B3) ; avertissement si une balise <script> / <style> n'est pas fermée.
 */
export function checkScript(values: ScriptValues, options: readonly PageOption[]): ScriptCheck {
  const errors: ScriptCheck['errors'] = {}
  const warnings: string[] = []
  const name = values.name.trim()
  if (!name) errors.name = 'Name is required.'
  else if ([...name].length > NAME_MAX) errors.name = `Name must be ${NAME_MAX} characters or fewer.`
  else if (/[\r\n]/.test(name)) errors.name = 'Name must be a single line.'
  if (!PLACEMENT_OPTIONS.some((o) => o.value === values.placement)) errors.placement = 'Choose a placement.'
  if (!RUN_OPTIONS.some((o) => o.value === values.run)) errors.run = 'Choose when the script runs.'
  const page = options.find((o) => o.value === values.page)
  if (!page) errors.page = 'Choose a page.'

  const fields = detectedFields(values.code)
  if (!values.code.trim()) errors.code = 'Code is required.'
  else if (values.code.length > CODE_MAX) errors.code = `Code must be ${CODE_MAX.toLocaleString('en-US')} characters or fewer.`
  else {
    const parsed = parseScriptCode(values.code)
    if (parsed.unclosed) warnings.push('A <script> or <style> tag isn’t closed: the end of the code may be ignored.')
    if (parsed.parts.length === 0 && !parsed.unclosed) errors.code = 'Add the code inside <script> or <style> tags.'
    else if (parsed.ignored && !parsed.unclosed) warnings.push('Text outside <script> and <style> tags is ignored.')
  }

  if (page && fields.length > 0) {
    if (page.article) {
      const known = new Set(page.article.fields.map((f) => f.token))
      const unknown = fields.filter((f) => !known.has(f))
      if (unknown.length) {
        warnings.push(`${unknown.map((f) => `{{${f}}}`).join(', ')} ${unknown.length > 1 ? 'aren’t fields' : 'isn’t a field'} of ${page.article.collectionLabel}: left as written.`)
      }
    } else {
      warnings.push('{{…}} fields are only replaced on an article page (slug:). Here they stay as written.')
    }
  }
  return { errors, warnings, fields }
}

/** Le script est-il enregistrable (aucune erreur bloquante) ? */
export function isScriptValid(check: ScriptCheck): boolean {
  return Object.keys(check.errors).length === 0
}

/**
 * Lecture défensive de `siteSettings.scripts` (API Sanity sans schéma) : éléments mal formés ignorés.
 * `signed` vaut toujours `false` ici (fonction PURE, sans secret) : le serveur le calcule ensuite (signing.ts).
 */
export function normalizeScripts(raw: unknown): ScriptItem[] {
  if (!Array.isArray(raw)) return []
  const out: ScriptItem[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const s = item as Record<string, unknown>
    if (typeof s._key !== 'string' || !/^[\w-]{1,64}$/.test(s._key)) continue
    out.push({
      key: s._key,
      name: typeof s.name === 'string' ? s.name : '',
      placement: PLACEMENT_OPTIONS.some((o) => o.value === s.placement) ? (s.placement as ScriptPlacement) : 'bodyEnd',
      page: typeof s.page === 'string' ? s.page : 'all',
      run: s.run === 'everyPageVisit' ? 'everyPageVisit' : 'once',
      code: typeof s.code === 'string' ? s.code : '',
      // Schéma : initialValue true ; un champ absent vaut « actif » (comme le lit le site).
      enabled: s.enabled !== false,
      signed: false,
    })
  }
  return out
}

/**
 * Valeurs à VÉRIFIER d'un élément brut de `scripts` (SEC-04) : exactement celles du document, sans normalisation —
 * le site vérifie ce qu'il lit. Un champ signé absent ou mal typé → null (non signé : l'admin écrit toujours les six).
 */
export function signableFromRaw(raw: unknown): (SignableScript & { signature: string | null }) | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as Record<string, unknown>
  const strings = [s._key, s.placement, s.page, s.run, s.code]
  if (!strings.every((v) => typeof v === 'string') || typeof s.enabled !== 'boolean') return null
  return {
    _key: s._key as string,
    placement: s.placement as string,
    page: s.page as string,
    run: s.run as string,
    code: s.code as string,
    enabled: s.enabled,
    signature: typeof s.signature === 'string' ? s.signature : null,
  }
}

/** Valeurs signées d'un script de l'admin (SEC-04) : clé, emplacement, page, exécution, état, code — pas le nom. */
export function signableOf(item: Pick<ScriptItem, 'key' | 'placement' | 'page' | 'run' | 'code' | 'enabled'>): SignableScript {
  return { _key: item.key, placement: item.placement, page: item.page, run: item.run, code: item.code, enabled: item.enabled }
}

/** FieldDef des champs d'un script (validation serveur par core/sanity, en plus du contrôle ci-dessus). */
export function scriptFieldDefs(options: readonly PageOption[]): Record<'name' | 'placement' | 'page' | 'run' | 'code' | 'enabled', FieldDef> {
  return {
    name: { name: 'name', label: 'Name', kind: 'string', required: true, maxLength: NAME_MAX },
    placement: { name: 'placement', label: 'Placement', kind: 'select', required: true, options: PLACEMENT_OPTIONS },
    page: { name: 'page', label: 'Page', kind: 'select', required: true, options: options.map((o) => ({ value: o.value, label: o.path })) },
    run: { name: 'run', label: 'Run', kind: 'select', required: true, options: RUN_OPTIONS },
    code: { name: 'code', label: 'Code', kind: 'text', required: true, maxLength: CODE_MAX },
    enabled: { name: 'enabled', label: 'Status', kind: 'boolean' },
  }
}

/** FieldDef du tableau entier (ajout, suppression, déplacement réécrivent `scripts`). */
export function scriptsArrayFieldDef(options: readonly PageOption[]): FieldDef {
  const f = scriptFieldDefs(options)
  return { name: 'scripts', label: 'Scripts', kind: 'array', itemLabel: 'Script', max: SCRIPTS_MAX, fields: [f.name, f.placement, f.page, f.run, f.code, f.enabled] }
}

/** Nouvelle clé d'élément de tableau Sanity (12 caractères [a-z0-9]). */
export function newScriptKey(random: () => number = Math.random): string {
  let key = ''
  while (key.length < 12) key += Math.floor(random() * 36).toString(36)
  return key
}

/** Élément Sanity d'un script (`_type` du schéma : siteScript), avec sa signature (SEC-04). */
export function toSanityScript(item: Omit<ScriptItem, 'signed'>, signature: string): Record<string, unknown> {
  return {
    _key: item.key,
    _type: 'siteScript',
    name: item.name,
    placement: item.placement,
    page: item.page,
    run: item.run,
    code: item.code,
    enabled: item.enabled,
    signature,
  }
}
