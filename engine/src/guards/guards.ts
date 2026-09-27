import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { Scope } from '../../../src/admin/core/contracts/engine'
import { checkCssFiles, type CssCheck, type CssLintContext } from './css-lint'
import type { DesignSystem } from './design-system'
import { lintTsxFiles, tsxZone } from './tsx-lint'
import { scopeFlags, type ChangedFile, type Hardcoded, type ScopeFlags, type ToolAccess, type Violation, type ZoneDef } from './types'

/**
 * Garde-fous du moteur : ce que Claude peut lire et modifier (hook PreToolUse), et le contrôle de ce qu'il a modifié.
 * Seules I/O, injectables (`GuardIO`) : lire le fichier visé par un Edit et sa version du dernier commit (SEC-07 : le
 * fichier futur est jugé AVANT l'écriture), lister un dossier fouillé par Grep (fichiers illisibles, AI-08).
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

/**
 * Segments jamais lus, où qu'ils soient (comparés en minuscules : le disque du Mac ignore la casse). S'y ajoutent tout
 * segment caché (`.git`, `.next`, `.env*`, `.claude`…) et tout document Markdown (`CLAUDE.md`, `AGENTS.md`… : notes
 * écrites pour un développeur, AI-08 ; les consignes de Claude viennent du système, de RULES.md et du message).
 */
const BLOCKED_SEGMENTS: ReadonlySet<string> = new Set(['node_modules', '.git', '.next', 'engine'])
const MARKDOWN = /\.(md|mdx|markdown)$/
/** Chemins jamais lus, même sous un dossier du site (défense en profondeur ; comparés en minuscules). */
const BLOCKED_PATHS: readonly string[] = Object.freeze(['src/admin', 'src/app/admin', 'src/app/studio', 'src/sanity/lib/token.ts'])

const within = (relative: string, dir: string) => relative === dir || relative.startsWith(`${dir}/`)

/** Chemin relatif au repo que Claude peut lire (fichier ou dossier). */
export function isReadable(relative: string): boolean {
  const lower = relative.toLowerCase()
  const segments = lower.split('/')
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) return false
  if (segments.some((segment) => BLOCKED_SEGMENTS.has(segment) || segment.startsWith('.') || MARKDOWN.test(segment))) return false
  if (BLOCKED_PATHS.some((blocked) => within(lower, blocked))) return false
  // Comparaison exacte (casse comprise) avec la liste blanche : `src/Components` n'est pas un dossier du site.
  return SITE_DIRS.some((dir) => within(relative, dir)) || READABLE_ROOT_FILES.includes(relative)
}

/** Dossier où une recherche (Glob, Grep) est permise : un dossier du site ou l'un de ses sous-dossiers. */
const isSearchable = (relative: string) => isReadable(relative) && SITE_DIRS.some((dir) => within(relative, dir))

const str = (value: unknown) => (typeof value === 'string' ? value : null)

const READ_HINT = `only ${SITE_DIRS.join(', ')} and ${READABLE_ROOT_FILES.join(', ')} can be read`

// ───────────── I/O du hook (injectables) ─────────────

/**
 * Lectures du hook, injectables pour les tests. Chemins relatifs au dépôt (déjà validés par isReadable et le périmètre).
 * - `read` : contenu actuel du fichier dans le clone (null s'il n'existe pas) ;
 * - `head` : contenu au dernier commit (null s'il n'y est pas, ou si le dépôt ne se lit pas : le fichier est alors jugé
 *   comme nouveau, donc refusé) ;
 * - `list` : fichiers sous un dossier, récursivement, en chemins relatifs au dépôt ; null s'il ne se lit pas ou s'il en
 *   contient trop (la recherche est alors traitée comme si le dossier contenait un fichier illisible).
 */
export type GuardIO = {
  read(root: string, relative: string): string | null
  head(root: string, relative: string): string | null
  list(root: string, relative: string): string[] | null
}

/** Au-delà, un dossier n'est pas listé (recherche restreinte au code, par prudence). */
const MAX_LISTED = 5000

export const DISK_IO: GuardIO = Object.freeze({
  read(root: string, relative: string) {
    try {
      return readFileSync(path.join(root, relative), 'utf8')
    } catch {
      return null
    }
  },
  head(root: string, relative: string) {
    try {
      // execFile sans shell ; `HEAD:<chemin>` est relatif à la racine du dépôt (le clone).
      return execFileSync('git', ['cat-file', 'blob', `HEAD:${relative}`], {
        cwd: root,
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'ignore'],
      })
    } catch {
      return null
    }
  },
  list(root: string, relative: string) {
    const dir = path.join(root, relative)
    try {
      const entries = readdirSync(dir, { recursive: true, withFileTypes: true })
      if (entries.length > MAX_LISTED) return null
      return entries
        .filter((entry) => !entry.isDirectory())
        .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
    } catch (error) {
      // Un fichier (et non un dossier) : rien en dessous, isReadable l'a déjà jugé ; un chemin absent : rien à lire.
      const code = (error as NodeJS.ErrnoException).code
      return code === 'ENOTDIR' || code === 'ENOENT' ? [] : null
    }
  },
})

// ───────────── Recherche (Grep) ─────────────

/** Extensions qu'une recherche restreinte peut viser : jamais un document Markdown ni un fichier caché. */
const CODE_EXTENSIONS: ReadonlySet<string> = new Set(['ts', 'tsx', 'js', 'jsx', 'css', 'json', 'svg'])
/** `*.tsx`, `**\/*.css`, `*.{tsx,css}` : seulement des extensions, jamais un nom de fichier. */
const CODE_GLOB = /^(?:\*\*\/)?\*\.(?:([a-z]+)|\{([a-z]+(?:,[a-z]+)*)\})$/
/** Types de ripgrep permis pour une recherche restreinte (ts : .ts/.tsx, js : .js/.jsx…, css). */
const CODE_TYPES: ReadonlySet<string> = new Set(['ts', 'js', 'css'])

/** La recherche ne lit que du code ou du CSS : `type` de code, ou `glob` fait seulement d'extensions de code. */
function codeOnlySearch(input: Record<string, unknown>): boolean {
  const type = str(input.type)
  if (type !== null && CODE_TYPES.has(type)) return true
  const match = CODE_GLOB.exec(str(input.glob) ?? '')
  if (!match) return false
  const extensions = match[1] ? [match[1]] : match[2].split(',')
  return extensions.every((extension) => CODE_EXTENSIONS.has(extension))
}

const SEARCH_HINT = 'pass glob: "*.{tsx,ts,css}" (or type: "ts" or "css")'

// ───────────── Edit : le fichier futur jugé avant l'écriture (SEC-07) ─────────────

/** Comme l'outil Edit de Claude Code : chaque ligne de new_string sans ses blancs de fin. */
const stripTrailingBlanks = (text: string) =>
  text
    .split(/(\r\n|\n|\r)/)
    .map((part, i) => (i % 2 === 0 ? part.replace(/\s+$/, '') : part))
    .join('')

/** Remplacement littéral (jamais les motifs `$&` de String.replace) : la première occurrence, ou toutes. */
function replaceLiteral(content: string, search: string, replacement: string, all: boolean): string {
  if (all) return content.split(search).join(replacement)
  const index = content.indexOf(search)
  return index < 0 ? content : content.slice(0, index) + replacement + content.slice(index + search.length)
}

/**
 * Contenus possibles du fichier après l'Edit, reconstruits comme l'outil Edit de Claude Code : remplacement exact de
 * old_string (première occurrence, ou toutes avec replace_all) ; new_string avec ou sans ses blancs de fin de ligne ;
 * suppression (new_string vide) qui emporte aussi le saut de ligne qui suit old_string. Toutes ces variantes sont
 * jugées : l'Edit ne passe que si chacune est conforme. Un old_string absent, ambigu ou vide sur un fichier non vide :
 * l'outil échouerait, le hook refuse (message en anglais, lu par Claude).
 */
export function editedContents(
  current: string | null,
  oldString: string,
  newString: string,
  replaceAll: boolean,
): { contents: string[] } | { error: string } {
  const replacements = [...new Set([newString, stripTrailingBlanks(newString)])]
  if (current === null) {
    if (oldString !== '') return { error: 'the file does not exist.' }
    return { contents: replacements }
  }
  if (oldString === '') {
    if (current !== '') return { error: 'old_string is empty: copy the exact text to replace from the file.' }
    return { contents: replacements }
  }
  const count = current.split(oldString).length - 1
  if (count === 0) {
    return { error: 'old_string was not found exactly in the file: copy it character for character (quotes and apostrophes included).' }
  }
  if (count > 1 && !replaceAll) {
    return { error: `old_string appears ${count} times: add the surrounding lines to make it unique, or set replace_all.` }
  }
  const contents = new Set<string>()
  for (const replacement of replacements) {
    contents.add(replaceLiteral(current, oldString, replacement, replaceAll))
    if (replacement === '' && !oldString.endsWith('\n') && current.includes(`${oldString}\n`)) {
      contents.add(replaceLiteral(current, `${oldString}\n`, replacement, replaceAll))
    }
  }
  return { contents: [...contents] }
}

/** Nombre de refus du lint cités dans la raison d'un Edit refusé. */
const MAX_CITED = 3

/**
 * Edit d'un fichier du périmètre : le fichier FUTUR (actuel + old_string → new_string) est jugé par `lintChanges`
 * contre le dernier commit, avec le contexte de la demande (`access.lint`), AVANT que l'outil n'écrive. L'aperçu (next
 * dev) exécute un composant dès qu'il est écrit : un import, `process.env`, un appel réseau ne doit jamais l'atteindre.
 */
function checkEdit(root: string, access: ToolAccess, relative: string, input: Record<string, unknown>, io: GuardIO): Verdict {
  const refused = (why: string) => deny(`Edit refused (${relative}): ${why}`)
  if (!access.lint) {
    // Sans contexte (moteur pas encore câblé) : un CSS est jugé après l'essai, comme avant ; un composant, jamais écrit.
    if (relative.endsWith('.css')) return ALLOW
    return refused('a component can only be changed when each edit is checked before it is written. Tell the client this change needs a developer.')
  }
  const oldString = input.old_string
  const newString = input.new_string
  if (typeof oldString !== 'string' || typeof newString !== 'string') return refused('old_string and new_string are required.')
  if (input.replace_all !== undefined && typeof input.replace_all !== 'boolean') return refused('replace_all must be true or false.')
  const edited = editedContents(io.read(root, relative), oldString, newString, input.replace_all === true)
  if ('error' in edited) return refused(edited.error)
  const before = io.head(root, relative)
  for (const after of edited.contents) {
    const { violations } = lintChanges([{ file: relative, before, after }], access.lint)
    if (!violations.length) continue
    const cited = violations.slice(0, MAX_CITED).map((violation) => violation.message).join(' ')
    return refused(
      `the file after this edit breaks the rules checked after each attempt, so it was not written. ${cited} ` +
        'Each edit must leave the file compliant on its own.',
    )
  }
  return ALLOW
}

/**
 * Décision prise avant chaque appel d'outil de Claude (hook PreToolUse). `io` : lectures du disque (tests : faux).
 */
export function checkToolUse(
  root: string,
  access: ToolAccess,
  tool: string,
  input: Record<string, unknown>,
  io: GuardIO = DISK_IO,
): Verdict {
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
      // Grep affiche le CONTENU des fichiers : un dossier qui contient un fichier illisible (CLAUDE.md, .env…) ne se
      // fouille que restreint au code. Glob ne rend que des noms.
      if (tool === 'Grep' && !codeOnlySearch(input)) {
        const files = io.list(root, relative)
        if (files === null || files.some((file) => !isReadable(file))) {
          return deny(`Search refused in ${relative}: it holds files that cannot be read; ${SEARCH_HINT}.`)
        }
      }
      return ALLOW
    }
    case 'Edit': {
      const file = str(input.file_path)
      const relative = file ? repoPath(root, file) : null
      // Défense en profondeur : un fichier autorisé doit aussi être un fichier du site (un zones.json fautif n'ouvre rien d'autre).
      if (relative && access.files.includes(relative) && isReadable(relative)) return checkEdit(root, access, relative, input, io)
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
 * Contexte du contrôle d'une demande, le même pour le hook (`ToolAccess.lint`, chaque Edit) et pour `runStaticChecks`
 * (après l'essai). `hardcoded` est gardé tel quel (référence) : passer le tableau VIVANT de la demande, auquel s'ajoutent
 * les valeurs accordées par le client pendant l'essai. Une seule zone : son id ; plusieurs : la liste (union).
 */
export function lintContextFor(input: {
  ds: Pick<DesignSystem, 'policy' | 'zones'>
  scope: readonly Scope[] | ScopeFlags
  zones: readonly string[]
  hardcoded: Hardcoded[]
}): LintContext {
  const scope = Array.isArray(input.scope) ? scopeFlags(input.scope as readonly Scope[]) : (input.scope as ScopeFlags)
  return {
    scope,
    policy: input.ds.policy,
    hardcoded: input.hardcoded,
    zone: input.zones.length === 1 ? input.zones[0] : [...input.zones],
    zones: input.ds.zones,
  }
}

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
