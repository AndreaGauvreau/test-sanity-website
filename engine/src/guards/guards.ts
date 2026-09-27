import path from 'node:path'
import { checkCssFiles, type CssCheck, type CssLintContext } from './css-lint'
import { lintTsxFiles, tsxZone } from './tsx-lint'
import type { ChangedFile, Hardcoded, ToolAccess, Violation, ZoneDef } from './types'

/**
 * Garde-fous du moteur : ce que Claude peut lire et modifier (hook PreToolUse), et le contrôle de ce qu'il a modifié.
 * Tout est pur (pas d'I/O) pour être testé sans lancer Claude.
 *
 * Portage Conduit : la lecture est limitée aux dossiers du SITE (jamais l'admin, le Studio, le moteur, le jeton Sanity) ;
 * le serveur MCP s'appelle `kuartz`.
 */

export type Verdict = { allow: true } | { allow: false; reason: string }

export type { ToolAccess, Violation }

/** Nom du serveur MCP du moteur : les outils s'appellent `mcp__kuartz__<outil>`. */
export const MCP_SERVER = 'kuartz'
/** Écrit un texte dans le brouillon Sanity (seulement si la demande a une cible texte). */
export const TEXT_TOOL = 'mcp__kuartz__set_text'
/** Rendu réel de l'élément dans l'aperçu : en lecture seule, toujours permis. */
export const MEASURE_TOOL = 'mcp__kuartz__measure'
/** Question au client (écart au design system, information manquante…) : toujours permise. */
export const ASK_TOOL = 'mcp__kuartz__ask_client'

/** Outils intégrés de Claude Code permis (`tools` de query()) : ni shell, ni création de fichier, ni web. Gelée. */
export const BUILTIN_TOOLS: readonly string[] = Object.freeze(['Read', 'Edit', 'Glob', 'Grep'])
/** Outils du serveur MCP, toujours déclarés dans cet ordre (cache du préfixe). Gelée (mineur #83 du POC). */
export const MCP_TOOLS: readonly string[] = Object.freeze([TEXT_TOOL, MEASURE_TOOL, ASK_TOOL])
/** `allowedTools` de query() : fixe d'une demande à l'autre ; le droit se décide à l'appel (checkToolUse). Gelée. */
export const ALLOWED_TOOLS: readonly string[] = Object.freeze([...BUILTIN_TOOLS, ...MCP_TOOLS])

const ALLOW: Verdict = { allow: true }
const deny = (reason: string): Verdict => ({ allow: false, reason })

/** Chemin relatif au repo (séparateurs « / »), '' pour la racine, null s'il sort du repo. */
export function repoPath(root: string, target: string): string | null {
  const relative = path.relative(root, path.resolve(root, target))
  if (relative === '') return ''
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null
  return relative.split(path.sep).join('/')
}

/**
 * Dossiers du site que Claude peut lire et fouiller : composants, styles, pages publiques, utilitaires. Jamais
 * src/admin (l'admin), src/app/admin, src/app/studio, src/sanity (clients et jeton), src/editor (règles et zones : Claude
 * les reçoit dans son prompt), engine/, scripts/. Gelée.
 */
export const SITE_DIRS: readonly string[] = Object.freeze(['src/components', 'src/styles', 'src/app/(site)', 'src/lib'])
/** Fichiers de configuration lisibles à la racine. Gelée. */
export const READABLE_ROOT_FILES: readonly string[] = Object.freeze(['package.json', 'tsconfig.json', 'next.config.ts'])

/** Segments jamais lus, où qu'ils soient (comparés en minuscules : le disque du Mac ignore la casse). */
const BLOCKED_SEGMENTS: ReadonlySet<string> = new Set(['node_modules', '.git', '.next', 'engine'])
/** Chemins jamais lus, même sous un dossier du site (défense en profondeur ; comparés en minuscules). */
const BLOCKED_PATHS: readonly string[] = Object.freeze(['src/admin', 'src/app/admin', 'src/app/studio', 'src/sanity/lib/token.ts'])

const within = (relative: string, dir: string) => relative === dir || relative.startsWith(`${dir}/`)

/** Chemin relatif au repo que Claude peut lire (fichier ou dossier). */
export function isReadable(relative: string): boolean {
  const lower = relative.toLowerCase()
  const segments = lower.split('/')
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) return false
  if (segments.some((segment) => BLOCKED_SEGMENTS.has(segment) || segment.startsWith('.env'))) return false
  if (BLOCKED_PATHS.some((blocked) => within(lower, blocked))) return false
  // Comparaison exacte (casse comprise) avec la liste blanche : `src/Components` n'est pas un dossier du site.
  return SITE_DIRS.some((dir) => within(relative, dir)) || READABLE_ROOT_FILES.includes(relative)
}

/** Dossier où une recherche (Glob, Grep) est permise : un dossier du site ou l'un de ses sous-dossiers. */
const isSearchable = (relative: string) => isReadable(relative) && SITE_DIRS.some((dir) => within(relative, dir))

const str = (value: unknown) => (typeof value === 'string' ? value : null)

const READ_HINT = `only ${SITE_DIRS.join(', ')} and ${READABLE_ROOT_FILES.join(', ')} can be read`

/** Décision prise avant chaque appel d'outil de Claude (hook PreToolUse). */
export function checkToolUse(root: string, access: ToolAccess, tool: string, input: Record<string, unknown>): Verdict {
  switch (tool) {
    case 'Read': {
      const file = str(input.file_path)
      const relative = file ? repoPath(root, file) : null
      if (relative && isReadable(relative)) return ALLOW
      return deny(`Read refused (${file ?? '?'}): ${READ_HINT}.`)
    }
    case 'Glob':
    case 'Grep': {
      const target = str(input.path)
      const relative = target ? repoPath(root, target) : ''
      if (relative === null || !isSearchable(relative)) {
        return deny(`Search is limited to the site folders: pass path: "src/components" (or ${SITE_DIRS.slice(1).join(', ')}).`)
      }
      const patterns = [input.pattern, input.glob].map(str).filter((p): p is string => p !== null)
      if (patterns.some((p) => p.includes('..') || p.startsWith('/'))) {
        return deny('Search pattern refused: stay within the site folders.')
      }
      return ALLOW
    }
    case 'Edit': {
      const file = str(input.file_path)
      const relative = file ? repoPath(root, file) : null
      // Défense en profondeur : un fichier autorisé doit aussi être un fichier du site (un zones.json fautif n'ouvre rien d'autre).
      if (relative && access.files.includes(relative) && isReadable(relative)) return ALLOW
      if (!access.files.length) {
        return deny('No file can be edited for this request: text is changed with the set_text tool.')
      }
      return deny(
        `Edit refused (${relative ?? file ?? '?'}): outside the scope allowed by the client. ` +
          `Allowed files: ${access.files.join(', ')}.`,
      )
    }
    case TEXT_TOOL:
      return access.textTool ? ALLOW : deny('The client did not allow text changes (T).')
    case MEASURE_TOOL:
    case ASK_TOOL:
      return ALLOW
    default:
      return deny(`Tool not allowed in the visual editor: ${tool}.`)
  }
}

// ───────────── Contrôle des fichiers modifiés ─────────────

/**
 * Contexte du contrôle : périmètre, politique du design system, valeurs en dur accordées, la zone choisie (ou les zones
 * choisies, demande à plusieurs éléments) et toutes les zones de zones.json.
 */
export type LintContext = CssLintContext & { zone: string | readonly string[]; zones: Record<string, ZoneDef> }

/**
 * Contrôle des fichiers modifiés, entiers (dernier commit contre copie de travail) : le CSS par postcss, les composants
 * par leur arbre TypeScript, pour la zone choisie ; tout autre type de fichier est refusé.
 * `granted` : les valeurs en dur accordées (entrées de `context.hardcoded`, dans leur ordre) qui ont laissé passer une
 * déclaration ajoutée, quelle que soit leur écriture ; ce sont celles que l'admin signale aux développeurs.
 */
export function lintChanges(changes: ChangedFile[], context: LintContext): { violations: Violation[]; granted: Hardcoded[] } {
  // Object.hasOwn : `constructor` ou `toString` ne sont pas des zones (mineur #74 du POC).
  const defOf = (id: string) => (Object.hasOwn(context.zones, id) ? context.zones[id] : undefined)
  const zone = typeof context.zone === 'string' ? tsxZone(context.zone, defOf(context.zone)) : context.zone.map((id) => tsxZone(id, defOf(id)))
  const checks = changes.map(({ file, before, after }): CssCheck => {
    if (file.endsWith('.css')) return checkCssFiles(file, before, after, context)
    const violations = /\.(tsx|ts|jsx|js)$/.test(file)
      ? lintTsxFiles(file, before, after, context.scope, zone)
      : [{ file, rule: 'file-type', message: `File type cannot be edited in the editor: ${file}.` }]
    return { violations, granted: [] }
  })
  const used = new Set(checks.flatMap((check) => check.granted))
  return {
    violations: checks.flatMap((check) => check.violations),
    granted: context.hardcoded.filter((entry) => used.has(entry)),
  }
}

/** Fichiers modifiés hors des fichiers autorisés par le périmètre. */
export function outOfScope(files: string[], allowed: string[]): string[] {
  return files.filter((file) => !allowed.includes(file))
}
