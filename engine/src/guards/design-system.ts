import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import postcss from 'postcss'
import {
  ALLOWED_PROPERTIES,
  checkValue,
  collapseBlanks,
  tokenSets,
  tokenVarName,
  type PolicyOptions,
  type TokenSets,
} from './css-policy'
import { isReadable } from './guards'
import type { ControlDef, TokensFile, ZoneDef, ZonesFile } from './types'

/**
 * Design system du site, relu dans le clone de travail (branche draft) à chaque demande : tokens (tokens.json, format
 * TokensFile du contrat), contrôles et zones (zones.json, ZonesFile), règles données à Claude (RULES.md, facultatif ici),
 * points de rupture, et la politique CSS qui en découle (tokenSets). Validé avant usage : un zones.json fautif ne doit
 * jamais ouvrir à Claude un fichier hors du site, ni proposer un réglage que les contrôles refuseraient.
 */

export const TOKENS_FILE = 'src/styles/tokens.json'
/** Feuille de tokens du site : les custom properties déclarées résolvent les noms des tokens (tokenVarName). */
export const TOKENS_CSS_FILE = 'src/styles/tokens.css'
export const ZONES_FILE = 'src/editor/zones.json'
export const RULES_FILE = 'src/editor/RULES.md'
/** Dossiers relus pour trouver les points de rupture en service quand rien ne les déclare. Gelée. */
export const BREAKPOINT_SCAN_DIRS: readonly string[] = Object.freeze(['src/components', 'src/app/(site)'])

export type DesignSystem = {
  tokens: TokensFile
  controls: Record<string, ControlDef>
  zones: Record<string, ZoneDef>
  /** Points de rupture mobile-first permis (« 50.625rem »), du plus petit au plus grand. */
  breakpoints: string[]
  /** D'où viennent les points de rupture : option du moteur, groupe de tokens.json, CSS du site, ou aucun. */
  breakpointSource: 'option' | 'tokens' | 'css' | 'none'
  /** Politique CSS construite pour ce design system (à passer aux contrôles : lintChanges, runStaticChecks). */
  policy: TokenSets
  /** Contenu de RULES.md, ou null s'il n'existe pas (le prompt est l'affaire d'engine-claude). */
  rules: string | null
  /** Incohérences non bloquantes (réglage que la politique refuserait, token absent de tokens.css…). */
  warnings: string[]
}

/** Réglages du chargement : ce qui paramètre la politique en plus des fichiers du site. */
export type DesignSystemOptions = Pick<PolicyOptions, 'roles' | 'lift' | 'naming'> & {
  /** Points de rupture imposés (« 50.625rem ») : l'emportent sur tokens.json et sur le CSS du site. */
  breakpoints?: readonly string[]
}

export class DesignSystemError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid design system: ${problems.slice(0, 5).join('; ')}${problems.length > 5 ? ` (+${problems.length - 5})` : ''}`)
    this.name = 'DesignSystemError'
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string')
const own = <T>(record: Record<string, T>, key: string): T | undefined => (Object.hasOwn(record, key) ? record[key] : undefined)

/** Identifiant de zone, de contrôle ou de groupe : lettres, chiffres, point, tiret, soulignement ; jamais `__proto__`. */
const ID = /^[A-Za-z0-9][\w.-]{0,79}$/
/** Classe d'un CSS Module telle que zones.json l'écrit : `.title`. */
const CLASS = /^\.[A-Za-z_][\w-]*$/
/** Largeur d'un point de rupture : `50.625rem`, `768px`, `48em`. */
const WIDTH = /^\d+(?:\.\d+)?(?:rem|px|em)$/

/** Groupes de tokens.json qui portent les points de rupture (leurs valeurs ne s'écrivent pas en var() dans @media). */
const BREAKPOINT_GROUPS = ['breakpoint', 'breakpoints']

/** Largeur en px, pour trier (1rem = 1em = 16px). */
const pixels = (width: string) => parseFloat(width) * (width.endsWith('px') ? 1 : 16)

const sortWidths = (widths: Iterable<string>) => [...new Set(widths)].sort((a, b) => pixels(a) - pixels(b))

/** Custom properties déclarées dans une feuille (`--color-text`…), toutes règles confondues. CSS illisible : aucune. */
export function declaredProperties(css: string): Set<string> {
  const found = new Set<string>()
  try {
    postcss.parse(css).walkDecls((decl) => {
      if (decl.prop.startsWith('--')) found.add(decl.prop)
    })
  } catch {
    // Feuille illisible : les noms de tokens suivent alors la convention (tokenVarName).
  }
  return found
}

/** Largeurs des `@media (min-width: …)` simples d'une feuille (« 50.625rem ») ; ni @container, ni requête composée. */
export function mediaBreakpoints(css: string): string[] {
  const found: string[] = []
  try {
    postcss.parse(css).walkAtRules('media', (at) => {
      const params = collapseBlanks(at.params).replace(/\( /g, '(').replace(/ \)/g, ')').replace(/ ?: ?/g, ': ')
      const width = /^\(min-width: ([^()]+)\)$/.exec(params)?.[1]
      if (width && WIDTH.test(width)) found.push(width)
    })
  } catch {
    // Feuille illisible : elle ne déclare aucun point de rupture.
  }
  return found
}

/** Problèmes d'un chemin de champ Sanity : jamais d'index numérique, `$key` seulement dans `[_key=="$key"]`. */
function fieldPathProblem(field: string): string | null {
  if (!/^[A-Za-z_][\w]*(?:\[_key=="\$key"\])?(?:\.[A-Za-z_][\w]*(?:\[_key=="\$key"\])?)*$/.test(field)) {
    return `invalid field path “${field}” (expected: a.b or a.items[_key=="$key"].title, never a numeric index)`
  }
  return null
}

/**
 * Problèmes bloquants (structure, sécurité) et avertissements (cohérence avec la politique) d'un design system. Pur.
 * Bloquant : fichier de zone hors des dossiers du site (Claude pourrait l'éditer), contrôle, zone intérieure ou groupe
 * inconnus, sélecteur qui n'est pas une classe, texte Sanity mal décrit. Avertissement : réglage dont une valeur serait
 * refusée par la politique (l'inspecteur la proposerait pour rien).
 */
export function validateDesignSystem(
  tokens: unknown,
  zonesFile: unknown,
  policy?: TokenSets,
): { problems: string[]; warnings: string[] } {
  const problems: string[] = []
  const warnings: string[] = []
  if (!isRecord(tokens)) return { problems: ['tokens.json: an object of groups is expected'], warnings }
  for (const [group, definition] of Object.entries(tokens)) {
    if (!ID.test(group)) problems.push(`tokens.json: invalid group name “${group}”`)
    if (!isRecord(definition) || typeof definition.label !== 'string' || !isRecord(definition.tokens)) {
      problems.push(`tokens.json: the group “${group}” must have a label and tokens`)
      continue
    }
    for (const [key, token] of Object.entries(definition.tokens)) {
      if (!/^[\w-]+$/.test(key)) problems.push(`tokens.json: invalid token name “${group}.${key}”`)
      if (!isRecord(token) || typeof token.label !== 'string' || typeof token.value !== 'string') {
        problems.push(`tokens.json: the token “${group}.${key}” must have a label and a value (strings)`)
      }
    }
  }
  if (!isRecord(zonesFile) || !isRecord(zonesFile.controls) || !isRecord(zonesFile.zones)) {
    problems.push('zones.json: { controls, zones } expected')
    return { problems, warnings }
  }
  const controls = zonesFile.controls
  const zones = zonesFile.zones
  for (const [id, control] of Object.entries(controls)) {
    if (!ID.test(id)) problems.push(`zones.json: invalid control id “${id}”`)
    if (!isRecord(control) || typeof control.label !== 'string' || typeof control.property !== 'string') {
      problems.push(`zones.json: the control “${id}” must have a label and a property`)
      continue
    }
    const property = control.property.toLowerCase()
    if (!ALLOWED_PROPERTIES.has(property)) problems.push(`zones.json: the control “${id}” sets a property that is not allowed (${property})`)
    const hasGroup = control.group !== undefined
    const hasOptions = control.options !== undefined
    if (hasGroup === hasOptions) problems.push(`zones.json: the control “${id}” must have either a group or options`)
    if (hasGroup && (typeof control.group !== 'string' || !Object.hasOwn(tokens, control.group))) {
      problems.push(`zones.json: the control “${id}” targets an unknown token group (${String(control.group)})`)
    }
    if (hasOptions && (!isRecord(control.options) || !Object.values(control.options).every((label) => typeof label === 'string'))) {
      problems.push(`zones.json: the options of the control “${id}” must be labels`)
    }
    // Cohérence avec la politique : chaque valeur proposée doit passer le contrôle CSS.
    if (!policy || !ALLOWED_PROPERTIES.has(property)) continue
    const values =
      hasGroup && typeof control.group === 'string' && Object.hasOwn(policy.byGroup, control.group)
        ? [...policy.byGroup[control.group]].filter((reference) => !/-tracking\)$/.test(reference))
        : isRecord(control.options)
          ? Object.keys(control.options)
          : []
    const refused = values.filter((value) => checkValue(property, value, policy, { hover: false }) !== null)
    if (refused.length) {
      warnings.push(`zones.json: the control “${id}” offers values the policy refuses for ${property}: ${refused.join(', ')}`)
    }
  }
  for (const [id, zone] of Object.entries(zones)) {
    if (!ID.test(id)) problems.push(`zones.json: invalid zone id “${id}”`)
    if (!isRecord(zone)) {
      problems.push(`zones.json: the zone “${id}” must be an object`)
      continue
    }
    if (typeof zone.label !== 'string' || typeof zone.section !== 'string') {
      problems.push(`zones.json: the zone “${id}” must have a label and a section`)
    }
    if (!isStringArray(zone.files) || !zone.files.length) {
      problems.push(`zones.json: the zone “${id}” must list its files`)
    } else {
      for (const file of zone.files) {
        if (!isReadable(file) || !/\.(css|tsx?|jsx?)$/.test(file)) {
          problems.push(`zones.json: the file “${file}” of the zone “${id}” is not a site file`)
        }
      }
    }
    if (!isStringArray(zone.selectors) || !zone.selectors.length || !zone.selectors.every((selector) => CLASS.test(selector))) {
      problems.push(`zones.json: the selectors of the zone “${id}” must be classes (.title)`)
    }
    if (!isStringArray(zone.controls)) problems.push(`zones.json: the zone “${id}” must list its controls`)
    else {
      for (const control of zone.controls) {
        if (!Object.hasOwn(controls, control)) problems.push(`zones.json: unknown control “${control}” in the zone “${id}”`)
      }
    }
    if (zone.children !== undefined) {
      if (!isStringArray(zone.children)) problems.push(`zones.json: invalid children of the zone “${id}”`)
      else {
        for (const child of zone.children) {
          if (!Object.hasOwn(zones, child) || child === id) problems.push(`zones.json: unknown inner zone “${child}” in “${id}”`)
        }
      }
    }
    for (const flag of ['hideable', 'logotype'] as const) {
      if (zone[flag] !== undefined && zone[flag] !== true) problems.push(`zones.json: ${flag} of the zone “${id}” is true or absent`)
    }
    const text = zone.text
    if (text === undefined) continue
    if (!isRecord(text)) {
      problems.push(`zones.json: invalid text of the zone “${id}”`)
    } else if (text.source === 'code') {
      // Un texte peut s'écrire hors des fichiers de la zone (`<PageTitle title="Blog" />` dans la page) : il suffit que
      // ce soit un composant du site, que Claude a le droit de lire (il pourra l'éditer en mode T).
      if (!isStringArray(text.files) || !text.files.length || !text.files.every((file) => isReadable(file) && /\.(tsx?|jsx?)$/.test(file))) {
        problems.push(`zones.json: the text files of the zone “${id}” must be site components`)
      }
    } else if (text.source === 'sanity') {
      const document = text.document
      const documentOk =
        isRecord(document) &&
        typeof document.type === 'string' &&
        ((typeof document.id === 'string' && document.id !== '' && !document.id.startsWith('drafts.')) ||
          document.from === 'data-edit-doc')
      if (!documentOk) problems.push(`zones.json: invalid Sanity document of the zone “${id}” (type + published id, or from: data-edit-doc)`)
      if (!isRecord(text.fields) || !Object.keys(text.fields).length) {
        problems.push(`zones.json: the zone “${id}” must list its Sanity fields`)
      } else {
        for (const [field, max] of Object.entries(text.fields)) {
          const problem = fieldPathProblem(field)
          if (problem) problems.push(`zones.json: zone “${id}”: ${problem}`)
          if (!Number.isInteger(max) || (max as number) < 1) problems.push(`zones.json: invalid maximum length for “${field}” (zone “${id}”)`)
        }
      }
      for (const key of ['lines', 'closed'] as const) {
        const value = text[key]
        if (value === undefined) continue
        const names = key === 'lines' && isRecord(value) ? Object.keys(value) : isStringArray(value) ? value : null
        if (!names || !names.every((field) => isRecord(text.fields) && Object.hasOwn(text.fields, field))) {
          problems.push(`zones.json: ${key} of the zone “${id}” must name its fields`)
        }
      }
    } else {
      problems.push(`zones.json: unknown text source in the zone “${id}” (sanity or code)`)
    }
  }
  return { problems, warnings }
}

/**
 * Design system construit depuis des données déjà lues (pur) : validation, politique, points de rupture. Lève
 * DesignSystemError sur un problème bloquant. `declared` : custom properties de tokens.css ; `cssBreakpoints` : largeurs
 * des @media en service dans le CSS du site (repli quand ni l'option ni tokens.json n'en déclarent).
 */
export function buildDesignSystem(
  input: { tokens: unknown; zones: unknown; rules?: string | null; declared?: ReadonlySet<string>; cssBreakpoints?: readonly string[] },
  options: DesignSystemOptions = {},
): DesignSystem {
  const structure = validateDesignSystem(input.tokens, input.zones)
  if (structure.problems.length) throw new DesignSystemError(structure.problems)
  const tokens = input.tokens as TokensFile
  const zonesFile = input.zones as ZonesFile

  const invalid = (widths: readonly string[]) => widths.filter((width) => !WIDTH.test(width.trim()))
  let breakpoints: string[] = []
  let breakpointSource: DesignSystem['breakpointSource'] = 'none'
  const group = BREAKPOINT_GROUPS.map((name) => own(tokens, name)).find((entry) => entry !== undefined)
  if (options.breakpoints) {
    const wrong = invalid(options.breakpoints)
    if (wrong.length) throw new DesignSystemError([`invalid breakpoint: ${wrong.join(', ')}`])
    breakpoints = sortWidths(options.breakpoints.map((width) => width.trim()))
    breakpointSource = 'option'
  } else if (group) {
    const values = Object.values(group.tokens).map((token) => token.value.trim())
    const wrong = invalid(values)
    if (wrong.length) throw new DesignSystemError([`tokens.json: invalid breakpoint: ${wrong.join(', ')}`])
    breakpoints = sortWidths(values)
    breakpointSource = 'tokens'
  } else if (input.cssBreakpoints?.length) {
    breakpoints = sortWidths(input.cssBreakpoints.filter((width) => WIDTH.test(width)))
    breakpointSource = 'css'
  }

  const policy = tokenSets(tokens, {
    declared: input.declared,
    controls: zonesFile.controls,
    roles: options.roles,
    lift: options.lift,
    naming: options.naming,
    breakpoints,
  })
  const { warnings } = validateDesignSystem(tokens, zonesFile, policy)
  if (input.declared?.size) {
    for (const [name, definition] of Object.entries(tokens)) {
      if (BREAKPOINT_GROUPS.includes(name)) continue
      for (const key of Object.keys(definition.tokens)) {
        const variable = tokenVarName(name, key, input.declared, options.naming)
        if (!input.declared.has(variable)) warnings.push(`tokens.json: ${variable} is not declared in ${TOKENS_CSS_FILE}`)
      }
    }
  }
  return {
    tokens,
    controls: zonesFile.controls,
    zones: zonesFile.zones,
    breakpoints,
    breakpointSource,
    policy,
    rules: input.rules ?? null,
    warnings,
  }
}

/** Fichiers `.css` d'un dossier, récursivement (dossier absent : aucun). */
async function cssFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  const found: string[] = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) found.push(...(await cssFiles(full)))
    else if (entry.isFile() && entry.name.endsWith('.css')) found.push(full)
  }
  return found
}

/**
 * Lit le design system dans un dossier de site (le clone de travail du moteur, jamais le dépôt du développeur) :
 * tokens.json et zones.json obligatoires, tokens.css et RULES.md facultatifs, points de rupture relus dans le CSS du
 * site quand rien ne les déclare. Lève DesignSystemError (ou l'erreur de lecture / de JSON) sur un design system
 * inutilisable.
 */
export async function loadDesignSystem(siteDir: string, options: DesignSystemOptions = {}): Promise<DesignSystem> {
  const read = (file: string) => readFile(path.join(siteDir, file), 'utf8')
  const optional = (file: string) => read(file).catch(() => null)
  const [tokensText, zonesText, rules, tokensCss] = await Promise.all([
    read(TOKENS_FILE),
    read(ZONES_FILE),
    optional(RULES_FILE),
    optional(TOKENS_CSS_FILE),
  ])
  let cssBreakpoints: string[] = []
  if (!options.breakpoints) {
    const files = (await Promise.all(BREAKPOINT_SCAN_DIRS.map((dir) => cssFiles(path.join(siteDir, dir))))).flat()
    for (const file of files) cssBreakpoints.push(...mediaBreakpoints(await readFile(file, 'utf8')))
    cssBreakpoints = sortWidths(cssBreakpoints)
  }
  return buildDesignSystem(
    {
      tokens: JSON.parse(tokensText),
      zones: JSON.parse(zonesText),
      rules,
      declared: tokensCss === null ? undefined : declaredProperties(tokensCss),
      cssBreakpoints,
    },
    options,
  )
}
