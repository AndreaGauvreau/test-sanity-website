import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, it } from 'vitest'
import { cssCustomValues, resolveCssValue } from '../claude/palette'
import { ALLOWED_TOOLS as CLAUDE_ALLOWED_TOOLS, ASK_TOOL as CLAUDE_ASK, MEASURE_TOOL as CLAUDE_MEASURE, TEXT_TOOL as CLAUDE_TEXT } from '../claude/names'
import { isExemptable, PLACEMENT_PROPERTIES, tokenSets } from './css-policy'
import { lintCssFiles } from './css-lint'
import {
  buildDesignSystem,
  customPropertyValues,
  declaredProperties,
  DesignSystemError,
  loadDesignSystem,
  TOKENS_CSS_FILE,
  TOKENS_FILE,
  ZONES_FILE,
  type DesignSystem,
} from './design-system'
import {
  ALLOWED_TOOLS,
  ASK_TOOL,
  checkToolUse,
  isReadable,
  lintChanges,
  MCP_SERVER,
  MEASURE_TOOL,
  TEXT_TOOL,
} from './guards'
import { lintTsxFiles, tsxZone } from './tsx-lint'
import type { Hardcoded, ScopeFlags, ZoneDef } from './types'
import { MODULE_HASH, previewUrl, withoutHash } from './visual'

/**
 * Portage Sanity/Conduit, sur le VRAI site du dépôt (AI-09) : `src/styles/tokens.json`, `src/editor/zones.json`,
 * `src/styles/tokens.css`, RULES.md et les CSS Modules réels, lus à la racine du dépôt (comme jobs/conduit.test.ts).
 * Politique paramétrée (styles de texte en raccourci font + tracking, tokens d'espacement `--space-*`, points de rupture
 * déclarés par le groupe `breakpoint` de tokens.json), lecture limitée aux dossiers du site, demandes à plusieurs
 * éléments, mineurs #74 et #83 du POC. Les fixtures `fixtures/conduit` ne servent plus qu'au banc d'engine-core.
 */

const here = path.dirname(fileURLToPath(import.meta.url))
const siteDir = path.resolve(here, '../../..')
const HERO = 'src/components/sections/Hero/Hero.module.css'
const GET_STARTED = 'src/components/sections/GetStarted/GetStarted.module.css'
const STYLE: ScopeFlags = { style: true, text: false }
const TEXT: ScopeFlags = { style: false, text: true }

let ds: DesignSystem
let hero: string
let getStarted: string
beforeAll(async () => {
  ds = await loadDesignSystem(siteDir)
  hero = await readFile(path.join(siteDir, HERO), 'utf8')
  getStarted = await readFile(path.join(siteDir, GET_STARTED), 'utf8')
})

/** Règles des refus du CSS de `file` modifié, pour la ou les zones visées, triées. */
const rules = (after: string, zone: string | string[], options: { hardcoded?: Hardcoded[]; file?: string } = {}) => {
  const file = options.file ?? HERO
  const before = file === HERO ? hero : getStarted
  return lintCssFiles(file, before, after, {
    scope: STYLE,
    policy: ds.policy,
    hardcoded: options.hardcoded ?? [],
    zone,
    zones: ds.zones,
  })
    .map((violation) => violation.rule)
    .sort()
}
/** Hero.module.css avec ces lignes ajoutées en tête de la règle .title (ou d'une autre classe). */
const inRule = (css: string, selector: string, lines: string) => {
  assert.ok(css.includes(`${selector} {\n`), `${selector} absent`)
  return css.replace(`${selector} {\n`, `${selector} {\n${lines}\n`)
}
const appended = (css: string, extra: string) => `${css}\n${extra}\n`

describe('design system de Conduit', () => {
  it('lit les tokens du contrat (clé = nom de la custom property) et les range par rôle', () => {
    const { roles } = ds.policy
    assert.ok(roles.color.has('var(--color-text-muted)'))
    assert.ok(!roles.color.has('var(--color-orange-500)'), 'la palette n’est pas dans tokens.json : jamais permise')
    assert.ok(roles.textStyle.has('var(--text-title-xl)'))
    assert.ok(roles.tracking.has('var(--text-title-xl-tracking)'))
    assert.ok(!roles.textStyle.has('var(--text-title-xl-tracking)'))
    assert.equal(ds.policy.trackingOf.get('var(--text-body-strong)'), 'var(--text-body-tracking)')
    assert.deepEqual([...roles.spaceWide].sort(), ['var(--gutter)', 'var(--page-inset)', 'var(--section-space)', 'var(--section-space-lg)'])
    assert.deepEqual([...roles.measure], ['var(--page-max)'])
    // Espacement (groupe space de tokens.json) : --space-8 à --space-64, jamais les tokens de mise en page.
    assert.deepEqual(
      [...roles.space],
      ['8', '12', '16', '20', '24', '32', '40', '48', '64'].map((step) => `var(--space-${step})`),
    )
    // Pas d'arrondi, d'ombre, de graisse ni de taille seule : rôles vides.
    for (const role of ['radius', 'shadow', 'weight', 'fontSize'] as const) assert.equal(roles[role].size, 0, role)
    assert.equal(ds.policy.lift.size, 0, 'aucun soulèvement sans --space-1 / --space-2')
    assert.deepEqual(ds.warnings, [])
  })

  it('prend les points de rupture du groupe breakpoint de tokens.json (min-width seulement)', () => {
    assert.deepEqual(ds.breakpoints, ['50.625rem', '64rem', '80rem', '90rem'])
    assert.equal(ds.breakpointSource, 'tokens')
    assert.deepEqual([...ds.policy.media], ['50.625rem', '64rem', '80rem', '90rem'].map((width) => `(min-width: ${width})`))
    assert.ok(!ds.policy.media.has('(min-width: 48rem)'))
  })

  it('les fichiers ouverts par les zones existent dans le dépôt', async () => {
    for (const [id, zone] of Object.entries(ds.zones)) {
      for (const file of [...zone.files, ...(zone.text?.source === 'code' ? zone.text.files : [])]) {
        await readFile(path.join(siteDir, file), 'utf8').catch(() => assert.fail(`${id} : ${file} absent`))
      }
    }
  })

  it('préfère les points de rupture déclarés : option du moteur, puis groupe breakpoint de tokens.json', () => {
    const tokens = { ...ds.tokens, breakpoint: { label: 'Breakpoints', tokens: { md: { label: 'MD', value: '50.625rem' } } } }
    const zones = { controls: ds.controls, zones: ds.zones }
    const fromTokens = buildDesignSystem({ tokens, zones, cssBreakpoints: ['64rem'] })
    assert.deepEqual([fromTokens.breakpoints, fromTokens.breakpointSource], [['50.625rem'], 'tokens'])
    const fromOption = buildDesignSystem({ tokens, zones }, { breakpoints: ['90rem', '64rem'] })
    assert.deepEqual([fromOption.breakpoints, fromOption.breakpointSource], [['64rem', '90rem'], 'option'])
    const { breakpoint: _declared, ...undeclared } = ds.tokens
    const none = buildDesignSystem({ tokens: undeclared, zones })
    assert.deepEqual([none.breakpoints, [...none.policy.media]], [[], []])
    assert.throws(() => buildDesignSystem({ tokens, zones }, { breakpoints: ['calc(1px)'] }), DesignSystemError)
  })

  it('refuse un zones.json qui ouvrirait à Claude un fichier hors du site, ou une zone mal décrite', () => {
    const zone = ds.zones['hero.title']
    const broken = (zones: Record<string, unknown>) => () =>
      buildDesignSystem({ tokens: ds.tokens, zones: { controls: ds.controls, zones } })
    for (const file of ['src/admin/ui/tokens.css', 'engine/src/guards/guards.ts', '.env.local', 'src/sanity/lib/token.ts']) {
      assert.throws(broken({ x: { ...zone, files: [file] } }), DesignSystemError, file)
    }
    assert.throws(broken({ x: { ...zone, selectors: ['h1'] } }), DesignSystemError)
    assert.throws(broken({ x: { ...zone, controls: ['nope'] } }), DesignSystemError)
    assert.throws(broken({ x: { ...zone, children: ['nope'] } }), DesignSystemError)
    // Clé propre `__proto__` (JSON.parse, comme zones.json lu du disque), pas le prototype d'un littéral.
    assert.throws(broken(JSON.parse(`{"__proto__": ${JSON.stringify(zone)}}`)), DesignSystemError)
    const indexed = { ...zone, text: { source: 'sanity', document: zone.text && 'document' in zone.text ? zone.text.document : {}, fields: { 'items[0].title': 40 } } }
    assert.throws(broken({ x: indexed }), DesignSystemError, 'jamais d’index numérique')
    const drafts = { ...zone, text: { source: 'sanity', document: { type: 't', id: 'drafts.x' }, fields: { title: 40 } } }
    assert.throws(broken({ x: drafts }), DesignSystemError, 'id publié seulement')
  })

  it('un contrôle n’élargit jamais un groupe reconnu ; il le signale', () => {
    const controls = { ...ds.controls, pad: { label: 'Padding', property: 'padding', group: 'layout' } }
    const built = buildDesignSystem({ tokens: ds.tokens, zones: { controls, zones: ds.zones } })
    assert.ok(!built.policy.roles.spaceWide.has('var(--page-max)'))
    assert.ok(built.warnings.some((warning) => /pad/.test(warning) && /--page-max/.test(warning)), built.warnings.join('\n'))
    // Un groupe au nom inconnu prend le rôle de la propriété de son contrôle.
    const tokens = { ...ds.tokens, spacing2: { label: 'Gaps', tokens: { 'gap-sm': { label: 'S', value: '0.5rem' } } } }
    const custom = buildDesignSystem({
      tokens,
      zones: { controls: { ...ds.controls, gap: { label: 'Gap', property: 'gap', group: 'spacing2' } }, zones: ds.zones },
    })
    assert.ok(custom.policy.roles.space.has('var(--gap-sm)'))
  })
})

describe('ds.cssValues : valeurs de tokens.css (FOLLOWUPS #37, AI-03)', () => {
  it('loadDesignSystem remplit cssValues depuis le vrai tokens.css, var() non résolus', () => {
    assert.equal(ds.cssValues.get('--color-neutral-900'), '#232325')
    assert.equal(ds.cssValues.get('--color-orange-500'), '#ff5100')
    // Un rôle garde sa référence brute : la résolution est l'affaire d'engine-claude (resolveCssValue).
    assert.equal(ds.cssValues.get('--color-text'), 'var(--color-neutral-900)')
    assert.equal(resolveCssValue('var(--color-text)', ds.cssValues), '#232325')
    // Seulement des custom properties (jamais color-scheme ni une propriété ordinaire).
    assert.ok([...ds.cssValues.keys()].every((name) => name.startsWith('--')))
    assert.ok(!ds.cssValues.has('color-scheme'))
  })

  it('mêmes clés que declaredProperties et mêmes valeurs que cssCustomValues d’engine-claude', async () => {
    const css = await readFile(path.join(siteDir, TOKENS_CSS_FILE), 'utf8')
    assert.deepEqual([...ds.cssValues.keys()].sort(), [...declaredProperties(css)].sort())
    assert.deepEqual([...ds.cssValues], [...cssCustomValues(css)])
    assert.ok(ds.cssValues.size > 0)
    // Toutes les couleurs de tokens.json se résolvent (catalogue du prompt avec ton et ratio).
    for (const [key, token] of Object.entries(ds.tokens.color?.tokens ?? {})) {
      assert.ok(resolveCssValue(token.value, ds.cssValues)?.startsWith('#'), key)
    }
  })

  it('dernière déclaration gagnante, !important retiré, feuille illisible = aucune valeur', () => {
    const values = customPropertyValues(
      ':root { --a: #111; --b: var(--a); }\n@media (prefers-color-scheme: dark) { :root { --a:  #eee !important ; } }',
    )
    assert.deepEqual([...values], [['--a', '#eee'], ['--b', 'var(--a)']])
    assert.equal(customPropertyValues(':root { --a: #111').size, 0)
    assert.equal(customPropertyValues('').size, 0)
  })

  it('buildDesignSystem : champ additif, vide par défaut, copié (jamais la Map de l’appelant)', () => {
    const zones = { controls: ds.controls, zones: ds.zones }
    assert.equal(buildDesignSystem({ tokens: ds.tokens, zones }).cssValues.size, 0)
    const given = new Map([['--x', '#000']])
    const built = buildDesignSystem({ tokens: ds.tokens, zones, cssValues: given })
    assert.deepEqual([...built.cssValues], [['--x', '#000']])
    given.set('--y', '#fff')
    assert.ok(!built.cssValues.has('--y'))
  })

  it('loadDesignSystem sans tokens.css : cssValues vide, le reste inchangé', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'kz-ds-'))
    try {
      for (const file of [TOKENS_FILE, ZONES_FILE]) {
        await mkdir(path.dirname(path.join(dir, file)), { recursive: true })
        await writeFile(path.join(dir, file), await readFile(path.join(siteDir, file), 'utf8'))
      }
      const bare = await loadDesignSystem(dir)
      assert.equal(bare.cssValues.size, 0)
      assert.deepEqual(bare.breakpoints, ds.breakpoints)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('lintCssFiles sur Conduit', () => {
  it('accepte un style de texte avec son tracking, dans la même règle', () => {
    const after = hero.replace(
      'font: var(--text-display);\n  letter-spacing: var(--text-display-tracking);',
      'font: var(--text-title-xl);\n  letter-spacing: var(--text-title-xl-tracking);',
    )
    assert.notEqual(after, hero)
    assert.deepEqual(rules(after, 'hero.title'), [])
  })

  it('refuse un style de texte sans son tracking, ou avec celui d’un autre style', () => {
    const alone = hero.replace('font: var(--text-display);', 'font: var(--text-title-xl);')
    assert.deepEqual(rules(alone, 'hero.title'), ['font-pair'])
    const wrong = hero.replace('letter-spacing: var(--text-display-tracking);', 'letter-spacing: var(--text-body-tracking);')
    assert.deepEqual(rules(wrong, 'hero.title'), ['font-pair'])
    assert.deepEqual(rules(inRule(hero, '.lede', '  font: var(--text-body);'), 'hero.lede'), ['font-pair'])
  })

  it('refuse une police, un style de texte ou une taille en dur dans le raccourci font, même accordés', () => {
    const value = "500 1rem / 1.2 'Montserrat', sans-serif"
    const granted = [{ property: 'font', value }]
    assert.ok(!isExemptable('font'))
    assert.deepEqual(rules(inRule(hero, '.lede', `  font: ${value};`), 'hero.lede', { hardcoded: granted }), ['value'])
  })

  it('n’accepte que les points de rupture du site, jamais @container', () => {
    const at = (media: string) => appended(hero, `${media} {\n  .title {\n    text-align: center;\n  }\n}`)
    for (const width of ['50.625rem', '64rem', '80rem', '90rem']) assert.deepEqual(rules(at(`@media (min-width: ${width})`), 'hero.title'), [], width)
    assert.deepEqual(rules(at('@media (min-width: 48rem)'), 'hero.title'), ['at-rule'])
    assert.deepEqual(rules(at('@media (max-width: 50.625rem)'), 'hero.title'), ['at-rule'])
    assert.deepEqual(rules(at('@container (min-width: 25rem)'), 'hero.title'), ['at-rule'])
  })

  it('espacement : tokens --space-*, 0 et les tokens de mise en page ; une valeur accordée (🔴) sinon', () => {
    assert.deepEqual(rules(inRule(hero, '.title', '  padding-block: var(--section-space) 0;'), 'hero.title'), [])
    assert.deepEqual(rules(inRule(hero, '.title', '  padding: var(--space-16);'), 'hero.title'), [])
    assert.deepEqual(rules(inRule(hero, '.title', '  gap: var(--space-8) var(--space-24);'), 'hero.title'), [])
    assert.deepEqual(rules(inRule(hero, '.title', '  padding: 1rem;'), 'hero.title'), ['value'])
    assert.deepEqual(rules(inRule(hero, '.title', '  padding: 1rem;'), 'hero.title', { hardcoded: [{ property: 'padding', value: '1rem' }] }), [])
    assert.deepEqual(rules(inRule(hero, '.title', '  gap: var(--page-inset);'), 'hero.title'), ['value'])
    assert.deepEqual(rules(inRule(hero, '.title', '  gap: var(--space-10);'), 'hero.title'), ['unknown-token'])
    assert.deepEqual(rules(inRule(hero, '.title', '  margin: calc(-1 * 1rem);'), 'hero.title', { hardcoded: [{ property: 'margin', value: 'calc(-1 * 1rem)' }] }), ['value'])
  })

  it('traite max-inline-size et inline-size comme max-width et width', () => {
    assert.deepEqual(rules(inRule(hero, '.title', '  max-inline-size: none;'), 'hero.title'), [])
    assert.deepEqual(rules(inRule(hero, '.title', '  max-inline-size: var(--page-max);'), 'hero.title'), [])
    assert.deepEqual(rules(inRule(hero, '.title', '  max-inline-size: 40rem;'), 'hero.title'), ['value'])
    assert.deepEqual(rules(inRule(hero, '.title', '  inline-size: 100%;'), 'hero.title'), [])
    assert.deepEqual(rules(inRule(hero, '.title', '  inline-size: 30rem;'), 'hero.title'), ['value'])
  })

  it('masque une zone masquable en mobile-first, rétablie à un point de rupture du site', () => {
    const hidden = (width: string) =>
      appended(inRule(hero, '.lede', '  display: none;'), `@media (min-width: ${width}) {\n  .lede {\n    display: block;\n  }\n}`)
    assert.deepEqual(rules(hidden('50.625rem'), 'hero.lede'), [])
    assert.deepEqual(rules(hidden('48rem'), 'hero.lede'), ['at-rule', 'display-none'])
    assert.deepEqual(rules(inRule(hero, '.title', '  display: none;'), 'hero.title'), ['display-none'])
  })

  it('refuse une règle d’un autre élément, sauf s’il est visé lui aussi (demande à plusieurs éléments)', () => {
    const both = inRule(inRule(hero, '.title', '  color: var(--color-text-accent);'), '.lede', '  color: var(--color-text);')
    assert.deepEqual(rules(both, 'hero.title'), ['selector'])
    assert.deepEqual(rules(both, ['hero.title', 'hero.lede']), [])
    assert.deepEqual(rules(both, ['hero.lede', 'hero.title']), [])
  })

  it('un conteneur visé avec sa zone intérieure : la règle propre de l’intérieure devient permise', () => {
    const title = inRule(hero, '.title', '  color: var(--color-text-accent);')
    assert.deepEqual(rules(title, 'hero'), ['selector'])
    assert.deepEqual(rules(title, ['hero', 'hero.title']), [])
    // Sans la zone intérieure : seulement du placement, par un sélecteur descendant.
    assert.deepEqual(rules(appended(hero, '.hero .title {\n  text-align: center;\n}'), 'hero'), [])
    assert.deepEqual(rules(appended(hero, '.hero .title {\n  color: var(--color-text);\n}'), 'hero'), ['selector'])
    // min-width sur la racine de chaque zone visée, jamais sur un élément intérieur.
    assert.deepEqual(rules(inRule(hero, '.title', '  min-width: 0;'), ['hero', 'hero.title']), [])
    assert.deepEqual(rules(inRule(hero, '.title', '  min-width: 0;'), 'hero'), ['min-width', 'selector'])
  })

  it('juge la règle d’une zone intérieure (getStarted.title.muted : .muted, dans getStarted.title)', () => {
    const muted = getStarted.replace('.muted {\n', '.muted {\n  text-align: center;\n')
    assert.notEqual(muted, getStarted)
    assert.deepEqual(rules(muted, 'getStarted.title.muted', { file: GET_STARTED }), [])
    assert.deepEqual(rules(muted, 'getStarted.text', { file: GET_STARTED }), ['selector'])
  })
})

describe('lintChanges : demandes à plusieurs éléments et zones inconnues', () => {
  const CARD = 'src/components/Card/Card.tsx'
  const source =
    "import styles from './Card.module.css'\n\nexport function Card() {\n  return (\n" +
    '    <div className={styles.card} data-edit="card">\n' +
    '      <h2 className={styles.title} data-edit="card.title">Hello</h2>\n' +
    '      <p className={styles.text} data-edit="card.text">World</p>\n' +
    '    </div>\n  )\n}\n'
  const def = (selector: string): ZoneDef => ({
    label: selector,
    section: 'Card',
    files: [CARD],
    selectors: [selector],
    controls: [],
    text: { source: 'code', files: [CARD] },
  })
  const zones: Record<string, ZoneDef> = { 'card.title': def('.title'), 'card.text': def('.text') }
  const both = source.replace('>Hello<', '>Bonjour<').replace('>World<', '>Monde<')

  it('un texte change dans l’une des zones visées ; hors de toutes, il est refusé', () => {
    const lint = (zone: string | string[]) =>
      lintTsxFiles(CARD, source, both, TEXT, typeof zone === 'string' ? tsxZone(zone, zones[zone]) : zone.map((id) => tsxZone(id, zones[id])))
        .map((violation) => violation.rule)
    assert.deepEqual(lint('card.title'), ['text-zone'])
    assert.deepEqual(lint(['card.title', 'card.text']), [])
    assert.deepEqual(lint([]), ['text-zone', 'text-zone'])
  })

  it('lintChanges passe toutes les zones de la demande aux deux contrôles', () => {
    const context = { scope: TEXT, policy: ds.policy, hardcoded: [], zones }
    const change = [{ file: CARD, before: source, after: both }]
    assert.deepEqual(lintChanges(change, { ...context, zone: ['card.title', 'card.text'] }).violations, [])
    assert.equal(lintChanges(change, { ...context, zone: 'card.title' }).violations.length, 1)
  })

  it('une zone qui porte le nom d’une propriété d’objet n’existe pas (mineur #74)', () => {
    for (const zone of ['constructor', 'toString', '__proto__']) {
      const css = lintChanges([{ file: HERO, before: hero, after: inRule(hero, '.title', '  color: var(--color-text);') }], {
        scope: STYLE,
        policy: ds.policy,
        hardcoded: [],
        zone,
        zones: ds.zones,
      })
      assert.deepEqual(css.violations.map((violation) => violation.rule), ['selector'], zone)
      const tsx = lintChanges([{ file: CARD, before: source, after: both }], { scope: TEXT, policy: ds.policy, hardcoded: [], zone, zones })
      assert.deepEqual(tsx.violations.map((violation) => violation.rule), ['text-zone', 'text-zone'], zone)
    }
  })
})

describe('checkToolUse sur le dépôt Conduit', () => {
  const root = '/work/sanity-test-engine/repo'
  const access = { files: [HERO], textTool: false }
  const read = (file: string) => checkToolUse(root, access, 'Read', { file_path: `${root}/${file}` }).allow

  it('lit les dossiers du site et trois fichiers de configuration, rien d’autre', () => {
    for (const file of [
      HERO,
      'src/components/ui/Button/Button.tsx',
      'src/styles/tokens.css',
      'src/app/(site)/page.tsx',
      'src/lib/utils.ts',
      'package.json',
      'tsconfig.json',
      'next.config.ts',
    ]) {
      assert.equal(read(file), true, file)
    }
    for (const file of [
      'src/admin/core/auth/session.ts',
      'src/app/admin/layout.tsx',
      'src/app/studio/[[...tool]]/page.tsx',
      'src/sanity/lib/token.ts',
      'src/sanity/lib/client.ts',
      'src/editor/zones.json',
      'src/proxy.ts',
      'src/admin.config.ts',
      'engine/src/guards/guards.ts',
      'engine/.env.local',
      '.env.local',
      'src/components/.env',
      'src/components/.env.local',
      'node_modules/next/package.json',
      '.git/config',
      '.next/server/app.js',
      'src/components/../admin/x.ts',
      'SRC/admin/x.ts',
      'src/Components/Hero.tsx',
      'src/app/(site)/../admin/page.tsx',
      'next.config.mjs',
      'package-lock.json',
    ]) {
      assert.equal(read(file), false, file)
    }
    assert.equal(checkToolUse(root, access, 'Read', { file_path: '/etc/passwd' }).allow, false)
    assert.equal(checkToolUse(root, access, 'Read', {}).allow, false)
  })

  it('isReadable refuse toute écriture ambiguë (segment vide, point, casse)', () => {
    for (const relative of ['src/components//x.tsx', 'src/components/./x.tsx', 'src/admin', 'SRC/COMPONENTS/x.tsx', 'src/app/Admin/x.tsx']) {
      assert.equal(isReadable(relative), false, relative)
    }
  })

  it('cherche dans un dossier du site seulement, jamais dans src entier ni à la racine', () => {
    const search = (tool: string, input: Record<string, unknown>) => checkToolUse(root, access, tool, input).allow
    assert.equal(search('Grep', { pattern: 'data-edit', path: `${root}/src/components` }), true)
    assert.equal(search('Glob', { pattern: '**/*.css', path: 'src/styles' }), true)
    assert.equal(search('Grep', { pattern: 'token', path: 'src/sanity' }), false)
    assert.equal(search('Grep', { pattern: 'token', path: 'src' }), false)
    assert.equal(search('Grep', { pattern: 'token' }), false)
    assert.equal(search('Glob', { pattern: '../../admin/**', path: 'src/components' }), false)
    assert.equal(search('Grep', { pattern: 'x', glob: '/etc/*', path: 'src/components' }), false)
  })

  it('n’édite que les fichiers du périmètre, et seulement s’ils sont du site', () => {
    assert.equal(checkToolUse(root, access, 'Edit', { file_path: `${root}/${HERO}` }).allow, true)
    assert.equal(checkToolUse(root, access, 'Edit', { file_path: `${root}/${GET_STARTED}` }).allow, false)
    const broken = { files: ['src/admin/ui/tokens.css', '.env.local'], textTool: false }
    assert.equal(checkToolUse(root, broken, 'Edit', { file_path: `${root}/src/admin/ui/tokens.css` }).allow, false)
    assert.equal(checkToolUse(root, broken, 'Edit', { file_path: `${root}/.env.local` }).allow, false)
  })

  it('nomme les outils du serveur MCP kuartz comme engine-claude, dans le même ordre, en listes gelées (mineur #83)', () => {
    assert.equal(MCP_SERVER, 'kuartz')
    assert.deepEqual([TEXT_TOOL, MEASURE_TOOL, ASK_TOOL], [CLAUDE_TEXT, CLAUDE_MEASURE, CLAUDE_ASK])
    assert.deepEqual(ALLOWED_TOOLS, CLAUDE_ALLOWED_TOOLS)
    assert.ok(Object.isFrozen(ALLOWED_TOOLS))
    assert.throws(() => (PLACEMENT_PROPERTIES as Set<string>).add('display'), TypeError)
    assert.equal(PLACEMENT_PROPERTIES.has('display'), false)
    for (const tool of ['Bash', 'Write', 'WebFetch', 'mcp__kuartz__other', 'mcp__lyondrive__set_text']) {
      assert.equal(checkToolUse(root, access, tool, {}).allow, false, tool)
    }
  })
})

describe('CSS Modules de Next 16.3.6 (Turbopack)', () => {
  it('retire le hachage des noms de classes relevés sur 127.0.0.1:4040', () => {
    // Relevés le 2026-09-27 sur la page / de Conduit (next dev, Turbopack) : 6 caractères, `-` compris.
    const seen = [
      'Hero-module__Vtspxq__title',
      'Section-module__d2c-Xa__title',
      'ConduitSystem-module__A51BTW__moduleTitle',
      'CustomerStory-module__2crola__stat',
      'geist_9c6cb61b-module__8NX9hq__variable',
    ]
    assert.deepEqual(seen.map(withoutHash), [
      'Hero-module__title',
      'Section-module__title',
      'ConduitSystem-module__moduleTitle',
      'CustomerStory-module__stat',
      'geist_9c6cb61b-module__variable',
    ])
    // Une règle garde son nom d'une capture à l'autre, même si le hachage change (HMR) : `.a .b` reste comparable.
    assert.equal(withoutHash('.Hero-module__Vtspxq__hero .Hero-module__Vtspxq__title'), withoutHash('.Hero-module__zzzzzz__hero .Hero-module__zzzzzz__title'))
    assert.ok(MODULE_HASH.global)
  })
})

describe('previewUrl : la page reste sur l’origine de l’aperçu', () => {
  const settings = { baseUrl: 'http://127.0.0.1:4042' }
  it('accepte un chemin absolu du site', () => {
    assert.equal(previewUrl(settings, '/'), 'http://127.0.0.1:4042/')
    assert.equal(previewUrl(settings, '/blog/a-post?x=1'), 'http://127.0.0.1:4042/blog/a-post?x=1')
  })
  it('refuse une autre origine, un chemin relatif ou une barre oblique inverse', () => {
    for (const page of ['//evil.test/x', 'https://evil.test/', 'blog', '/\\evil.test', 'javascript:alert(1)', '']) {
      assert.throws(() => previewUrl(settings, page), /Page path refused/, page)
    }
  })
})

describe('tokenSets sans design system chargé', () => {
  it('reste strict : aucun token, aucun point de rupture, aucun soulèvement', () => {
    const empty = tokenSets({})
    assert.deepEqual([empty.all.size, empty.media.size, empty.lift.size], [0, 0, 0])
  })
})
