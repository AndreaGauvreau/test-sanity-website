import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { beforeAll as before, describe, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import {
  checkCssFiles,
  compoundsOf,
  lintCssFiles,
  parseCss,
  selectorProblem,
  zoneSelectors,
  type CssLintContext,
} from './css-lint'
import { loadDesignSystem, type DesignSystem } from './design-system'
import { LYONDRIVE } from './fixtures/lyondrive-options'
import type { ScopeFlags as Scope } from './types'
import type { Hardcoded } from './types'

/**
 * Contrôle du CSS entier : sondes de la critique, cas limites, et non-régression sur tous les fichiers CSS
 * modifiés par le passage de référence (fixtures/reference-1.json, extraites par scripts/bench/extract-lint-fixtures.mjs).
 */

const here = path.dirname(fileURLToPath(import.meta.url))
const siteDir = path.join(here, 'fixtures/lyondrive')
const HERO = 'src/components/Hero/Hero.module.css'
const ARTICLE = 'src/components/Article/Article.module.css'
const HEADER = 'src/components/Header/Header.module.css'
const GRID = 'src/components/PostGrid/PostGrid.module.css'
const FEATURES = 'src/components/Features/Features.module.css'

type Fixture = {
  id: string
  zone: string
  scope: ('style' | 'text')[]
  hardcoded: Hardcoded[]
  file: string
  before: string
  after: string
}

let ds: DesignSystem
let hero: string
let article: string
let header: string
let grid: string
let fixtures: Fixture[]
before(async () => {
  ds = await loadDesignSystem(siteDir, LYONDRIVE)
  hero = await readFile(path.join(siteDir, HERO), 'utf8')
  article = await readFile(path.join(siteDir, ARTICLE), 'utf8')
  header = await readFile(path.join(siteDir, HEADER), 'utf8')
  grid = await readFile(path.join(siteDir, GRID), 'utf8')
  fixtures = JSON.parse(await readFile(path.join(here, 'fixtures/reference-1.json'), 'utf8'))
})

const STYLE: Scope = { style: true, text: false }
const TEXT: Scope = { style: false, text: true }

/** Contexte d'une demande sur la zone `zone` (par défaut le bouton principal, dont la règle est .cta). */
const context = (options: { hardcoded?: Hardcoded[]; scope?: Scope; zone?: string } = {}): CssLintContext => ({
  scope: options.scope ?? STYLE,
  policy: ds.policy,
  hardcoded: options.hardcoded ?? [],
  zone: options.zone ?? 'hero.cta',
  zones: ds.zones,
})
/** Demande sur le sous-titre, zone masquable : sa règle est .subtitle. */
const subtitle = () => context({ zone: 'hero.subtitle' })

/** Règles des violations, triées. */
const rules = (before: string, after: string, ctx = context(), file = HERO) =>
  lintCssFiles(file, before, after, ctx)
    .map((violation) => violation.rule)
    .sort()

/** Hero.module.css avec ces lignes ajoutées en tête de la règle .cta. */
const inCta = (lines: string) => hero.replace('.cta {\n', `.cta {\n${lines}\n`)
/** Hero.module.css avec ce CSS ajouté à la fin. */
const appended = (css: string) => `${hero}\n${css}\n`

describe('parseCss et sélecteurs', () => {
  it('lit une déclaration par sélecteur, sans les commentaires, valeurs et @media normalisés', () => {
    const { declarations } = parseCss(
      '/* ok */\n.a:hover,\n.b > .c { color:\n  var(--color-ink) }\n@media (min-width:48rem) { .a { gap: 0 } }',
    )
    assert.deepEqual(
      declarations.map((d) => `${d.media}|${d.selector}|${d.property}|${d.value}`),
      ['|.a:hover|color|var(--color-ink)', '|.b > .c|color|var(--color-ink)', '(min-width: 48rem)|.a|gap|0'],
    )
  })

  it('découpe un sélecteur en morceaux', () => {
    const [content, global] = compoundsOf('.content :global(h2)')
    assert.deepEqual(content.classes, ['content'])
    assert.equal(global.global, 'h2')
    const [meta, last] = compoundsOf('.meta > :last-child')
    assert.deepEqual([meta.classes, last.pseudoClasses], [['meta'], ['last-child']])
    assert.equal(selectorProblem('.nav a:hover'), null)
    assert.match(selectorProblem('.cta::after') ?? '', /Pseudo-element forbidden/)
    assert.match(selectorProblem('.a:not(.b)') ?? '', /Pseudo-class `:not` forbidden/)
    assert.match(selectorProblem('h1') ?? '', /must start with a class/)
  })
})

describe('lintCssFiles — sondes de la critique', () => {
  it('juge chaque déclaration, commentaires retirés', () => {
    assert.deepEqual(rules(hero, inCta('  /* ok */ color: red; position: fixed !important;')), ['important', 'value', 'value'])
  })

  it('refuse un sélecteur global', () => {
    assert.deepEqual(rules(hero, appended('* { color: red }')), ['selector', 'value'])
    assert.deepEqual(rules(hero, appended(':global(body) { display: none; }')), ['display-none', 'selector'])
  })

  it('lit une déclaration écrite sur deux lignes en entier', () => {
    assert.deepEqual(rules(hero, inCta('  color:\n red;')), ['value'])
  })

  it('refuse calc(), même autour de tokens', () => {
    for (const line of [
      'font-size: calc(var(--text-lg) * 1.13);',
      'margin-left: calc(var(--space-1) - var(--space-9));',
      'margin-inline: calc(-1 * var(--space-9));',
    ]) {
      assert.deepEqual(rules(hero, inCta(`  ${line}`)), ['value'], line)
    }
  })

  it('refuse @import et une police hors design system, même accordés par le client', () => {
    const montserrat = context({ hardcoded: [{ property: 'font-family', value: "'Montserrat', sans-serif" }] })
    assert.deepEqual(rules(hero, `@import url('https://fonts.googleapis.com/css2?family=Montserrat');\n${hero}`, montserrat), ['at-rule'])
    assert.deepEqual(rules(hero, inCta("  font-family: 'Montserrat', sans-serif;"), montserrat), ['value'])
  })

  it('refuse les ressources externes, @font-face, les valeurs hors liste et les propriétés inconnues', () => {
    assert.deepEqual(rules(hero, inCta('  background-image: url(https://x.test/a.jpg);')), ['external'])
    assert.ok(rules(hero, appended("@font-face { font-family: X; src: url('https://x.test/x.woff2'); }")).includes('at-rule'))
    for (const line of ['font-family: Arial;', 'color: crimson;', 'font-weight: 800;']) {
      assert.deepEqual(rules(hero, inCta(`  ${line}`)), ['value'], line)
    }
    assert.deepEqual(rules(hero, inCta('  filter: brightness(0.5);')), ['property'])
    assert.deepEqual(rules(hero, appended(".cta::after { content: 'depuis 2012'; }")), ['property', 'selector'])
  })

  it('une valeur en dur accordée n’exempte que sa propriété et sa valeur exactes, jamais l’opacité', () => {
    assert.deepEqual(rules(hero, inCta('  opacity: 0.7;'), context({ hardcoded: [{ property: 'opacity', value: '0.7' }] })), ['value'])
    const forty = context({ hardcoded: [{ property: 'font-size', value: '40px' }] })
    assert.deepEqual(rules(hero, inCta('  font-size: 40px;'), forty), [])
    assert.deepEqual(rules(hero, inCta('  padding: 18px;'), forty), ['value'])
    assert.deepEqual(rules(hero, inCta('  margin: 0 -5px;'), context({ hardcoded: [{ property: 'margin', value: '0 -5px' }] })), ['value'])
    const hidden = 'min(0px, 1px - 9rem)'
    const minGranted = context({ hardcoded: [{ property: 'margin-left', value: hidden }] })
    assert.deepEqual(rules(hero, inCta(`  margin-left: ${hidden};`), minGranted), ['value'])
    const escaped = '\\75 rl(h\\74tps:\\2f\\2f x.test/a.png)'
    const escapedGranted = context({ hardcoded: [{ property: 'background', value: escaped }] })
    assert.deepEqual(rules(hero, inCta(`  background: ${escaped};`), escapedGranted), ['external'])
    const white60 = context({ hardcoded: [{ property: 'color', value: 'rgb(248 250 252 / 0.6)' }] })
    assert.deepEqual(rules(hero, inCta('  color: rgb(248 250 252 / 0.6);'), white60), [])
    const [misplaced] = lintCssFiles(HERO, hero, inCta('  background-color: rgb(248 250 252 / 0.6);'), white60)
    assert.match(misplaced.message, /The hard-coded value granted by the client is `color: rgb\(248 250 252 \/ 0\.6\)`/)
  })
})

describe('lintCssFiles — cas limites', () => {
  it('n’accepte le soulèvement que dans :hover ou :focus-visible', () => {
    const lift = 'transform: translateY(calc(var(--space-1) * -1));'
    assert.deepEqual(rules(hero, inCta(`  ${lift}`)), ['hover-only'])
    assert.deepEqual(rules(hero, hero.replace('.cta:hover {\n', `.cta:hover {\n  ${lift}\n`)), [])
  })

  it('masquage mobile-first : display: none rétabli dans un point de rupture permis', () => {
    const hidden = hero.replace('.subtitle {\n', '.subtitle {\n  display: none;\n')
    const restore = '@media (min-width: 48rem) {\n  .subtitle {\n    display: block;\n  }\n}'
    assert.deepEqual(rules(hero, hidden, subtitle()), ['display-none'])
    assert.deepEqual(rules(hero, `${hidden}\n${restore}\n`, subtitle()), [])
    const inMedia = appended('@media (min-width: 48rem) {\n  .subtitle {\n    display: none;\n  }\n}')
    assert.deepEqual(rules(hero, inMedia, subtitle()), ['display-none'])
    // Rétablissement écrit avant la règle de base : celle-ci, plus loin dans le fichier, l’emporte à toutes les largeurs.
    assert.deepEqual(rules(hero, `${restore}\n${hidden}`, subtitle()), ['display-none'])
    // Masquage déjà accepté : retirer son rétablissement, ou le recouvrir plus loin, le rend définitif.
    assert.deepEqual(rules(`${hidden}\n${restore}\n`, hidden, subtitle()), ['display-none'])
    const covered = `${hidden}\n${restore}\n.subtitle {\n  display: none;\n}\n`
    assert.deepEqual(rules(`${hidden}\n${restore}\n`, covered, subtitle()), ['display-none'])
  })

  it('n’accepte que les points de rupture 48rem et 64rem', () => {
    assert.deepEqual(rules(hero, appended('@media (max-width: 600px) {\n  .cta { color: var(--color-ink); }\n}')), ['at-rule'])
    assert.deepEqual(rules(hero, appended('@media (min-width:64rem) {\n  .cta { color: var(--color-ink); }\n}')), [])
  })

  it('refuse un CSS illisible ; un commentaire seul ne change rien', () => {
    const [broken] = lintCssFiles(HERO, hero, `${hero}\n.cta { color: red`, context())
    assert.equal(broken.rule, 'css-parse')
    assert.match(broken.message, /The CSS no longer parses: .+ \(line \d+\)\./)
    assert.deepEqual(rules(hero, `/* Bouton principal */\n${hero}`), [])
  })

  it('ne rejuge pas un :global(h2) existant, refuse un :global nouveau', () => {
    const edited = article.replace('font-size: var(--text-2xl);\n}', 'font-size: var(--text-xl);\n}')
    assert.notEqual(edited, article)
    assert.deepEqual(rules(article, edited, context({ zone: 'article.content' }), ARTICLE), [])
    const global = appended(':global(article h2) { color: var(--color-ink); }')
    assert.deepEqual(rules(hero, global, context({ zone: 'hero' })), ['selector'])
  })

  it('mode Texte : un seul refus pour tout changement du CSS', () => {
    assert.deepEqual(rules(hero, inCta('  color: var(--color-ink);'), context({ scope: TEXT })), ['style-change'])
    assert.deepEqual(rules(hero, hero, context({ scope: TEXT })), [])
  })

  it('refuse la suppression du fichier', () => {
    assert.deepEqual(
      lintCssFiles(HERO, hero, null, context()).map((v) => v.rule),
      ['file-deleted'],
    )
  })
})

describe('lintCssFiles — sélecteurs bien formés', () => {
  const hidden = () => hero.replace('.subtitle {\n', '.subtitle {\n  display: none;\n')
  const restoreAs = (selector: string) => `@media (min-width: 48rem) {\n  ${selector} {\n    display: block;\n  }\n}`

  it('refuse un combinateur au début, à la fin ou doublé, sans jamais le lire comme le sélecteur seul', () => {
    for (const selector of ['> .subtitle', '.subtitle >', '+ .x', '.subtitle ~', '.a > > .b', '.a >> .b', '.a > + .b']) {
      assert.match(selectorProblem(selector) ?? '', /Malformed selector/, selector)
    }
    // Clé injective : `.subtitle >` et `> .subtitle` ne sont jamais `.subtitle`.
    const { declarations } = parseCss('.subtitle > { gap: 0 }\n> .subtitle { gap: 0 }\n.subtitle { gap: 0 }\n.a >> .b { gap: 0 }')
    assert.deepEqual(declarations.map((d) => d.selector), ['.subtitle >', '> .subtitle', '.subtitle', '.a >  > .b'])
    // Masquage nouveau, « rétabli » par un sélecteur invalide : la règle est ignorée par le navigateur.
    assert.deepEqual(rules(hero, `${hidden()}\n${restoreAs('.subtitle >')}\n`, subtitle()), ['display-none', 'selector'])
    assert.deepEqual(rules(hero, `${hidden()}\n${restoreAs('> .subtitle')}\n`, subtitle()), ['display-none', 'selector'])
    // Masquage existant : son rétablissement réécrit en `> .subtitle` ne rétablit plus rien.
    const accepted = `${hidden()}\n${restoreAs('.subtitle')}\n`
    assert.deepEqual(rules(hero, accepted, subtitle()), [])
    assert.deepEqual(rules(accepted, `${hidden()}\n${restoreAs('> .subtitle')}\n`, subtitle()), ['display-none', 'selector'])
  })

  it('refuse tout échappement, nom invalide ou caractère inattendu (une liste qui en contient un est ignorée)', () => {
    const malformed = ['.cta\\:hover', '.1x', '.x .', '.cta%', '.cta&', '.x |a', '.x a.b.c"d"', '.a) > .b', '.a(']
    for (const selector of malformed) {
      assert.match(selectorProblem(selector) ?? '', /Malformed selector|Escape forbidden/, selector)
    }
    assert.match(selectorProblem('.c\\74 a') ?? '', /Escape forbidden in a selector/)
    assert.equal(selectorProblem('.cardTitle a:hover'), null)
    assert.equal(selectorProblem('.-x ._y .--z'), null)
    // `.subtitle, .x%` : le navigateur ignore toute la règle, rétablissement compris.
    assert.deepEqual(rules(hero, `${hidden()}\n${restoreAs('.subtitle, .x%')}\n`, subtitle()), ['selector'])
  })

  it('refuse les combinateurs + et ~ (ils visent un élément voisin, hors de la zone)', () => {
    for (const selector of ['.cta + p', '.cta ~ p', '.a+.b', '.a~.b']) {
      assert.match(selectorProblem(selector) ?? '', /Combinator `[+~]` forbidden/, selector)
    }
    assert.deepEqual(rules(hero, appended('.cta + p { color: var(--color-ink); }')), ['selector'])
    assert.deepEqual(rules(hero, appended('.cta ~ p { color: var(--color-ink); }')), ['selector'])
    assert.equal(selectorProblem('.meta > :last-child'), null)
  })

  it('pseudo-classes à argument : An+B seulement pour :nth-…, :global(balise) seulement, aucune autre parenthèse', () => {
    for (const selector of ['.cta :nth-child(n of *)', '.cta :nth-child(n of :global(.x))', '.cta :nth-of-type(n of #id)']) {
      assert.deepEqual(rules(hero, appended(`${selector} { color: var(--color-ink); }`)), ['selector'], selector)
    }
    for (const selector of [
      '.cta:nth-child(2n+1 of .x)',
      '.cta :nth-child([href^="javascript:"])',
      '.cta:nth-child',
      '.cta:nth-child()',
      '.cta:nth-child(2n+-1)',
      '.cta:hover(.x)',
      '.cta:first-child()',
      '.content :global(h2):global(.x)',
      '.content :global(h2):global(h3)',
      '.content :GLOBAL(p)',
      '.content :global',
    ]) {
      assert.ok(selectorProblem(selector), selector)
    }
    for (const selector of [
      '.cta:nth-child(2n+1)',
      '.cta:nth-of-type(odd)',
      '.card:nth-child(even)',
      '.card:nth-child(3)',
      '.card :nth-child(-n+3)',
      '.card:nth-child( 2n + 1 )',
      '.content :global(h2)',
    ]) {
      assert.equal(selectorProblem(selector), null, selector)
    }
  })
})

describe('lintCssFiles — blancs CSS et listes de sélecteurs', () => {
  const hidden = () => hero.replace('.subtitle {\n', '.subtitle {\n  display: none;\n')
  const restore = (selector = '.subtitle', media = '(min-width: 48rem)', value = 'block') =>
    `@media ${media} {\n  ${selector} {\n    display: ${value};\n  }\n}`
  /** Masquage existant, déjà rétabli (accepté). */
  const accepted = () => `${hidden()}\n${restore()}\n`
  /** Blancs pour JavaScript (`\s`, `trim()`), jamais pour CSS : U+00A0, U+FEFF (invisible), U+2003, U+2028, \v. */
  const NOT_BLANKS = ['\u00a0', '\ufeff', '\u2003', '\u2028', '\v']
  const code = (char: string) => `U+${(char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`

  it('ne réduit que les blancs CSS : un caractère que JavaScript tient pour un blanc reste dans la clé', () => {
    for (const char of NOT_BLANKS) {
      const { declarations } = parseCss(
        `.subtitle${char} { gap: 0 }\n@media (min-width:${char}48rem) { .a { gap: 0 } }\n.b { display: block${char} }`,
      )
      assert.deepEqual(
        declarations.map((d) => `${d.media}|${d.selector}|${d.value}`),
        [`|.subtitle${char}|0`, `(min-width: ${char}48rem)|.a|0`, `|.b|block${char}`],
        code(char),
      )
    }
    // Les blancs CSS (espace, tabulation, LF, CR, FF) restent réduits.
    const { declarations } = parseCss('.a\t>\f.b\r\n.c { gap:\t0\f }\n@media\n(min-width:\t48rem) { .d { gap: 0 } }')
    assert.deepEqual(
      declarations.map((d) => `${d.media}|${d.selector}|${d.value}`),
      ['|.a > .b .c|0', '(min-width: 48rem)|.d|0'],
    )
  })

  it('refuse un caractère invisible ou non ASCII dans le sélecteur, le @media ou la valeur d’un rétablissement', () => {
    for (const char of NOT_BLANKS) {
      const label = code(char)
      assert.ok((selectorProblem(`.subtitle${char}`) ?? '').includes(`Invisible or non-ASCII character (${label})`), label)
      // Masquage nouveau : le navigateur ne rétablit rien (autre classe, requête média ou valeur invalide).
      for (const selector of [`.subtitle${char}`, `${char}.subtitle`, `.subtitle${char}.x`]) {
        const found = rules(hero, `${hidden()}\n${restore(selector)}\n`, subtitle())
        assert.deepEqual(found, ['display-none', 'selector'], `${label} ${selector}`)
      }
      for (const media of [
        `(min-width:${char}48rem)`,
        `(min-width: 48rem)${char}`,
        `${char}(min-width: 48rem)`,
        `(min-width: 48rem${char})`,
      ]) {
        const found = rules(hero, `${hidden()}\n${restore('.subtitle', media)}\n`, subtitle())
        assert.deepEqual(found, ['at-rule', 'display-none'], `${label} ${media}`)
      }
      const block = `${hidden()}\n${restore('.subtitle', undefined, `block${char}`)}\n`
      assert.deepEqual(rules(hero, block, subtitle()), ['value'], label)
      // Masquage existant : son rétablissement réécrit ne rétablit plus rien, et il est jugé.
      const renamed = `${hidden()}\n${restore(`.subtitle${char}`)}\n`
      assert.deepEqual(rules(accepted(), renamed, subtitle()), ['display-none', 'selector'], label)
      const media = `(min-width:${char}48rem)`
      const moved = `${hidden()}\n${restore('.subtitle', media)}\n`
      assert.deepEqual(rules(accepted(), moved, subtitle()), ['at-rule', 'display-none'], label)
      assert.deepEqual(rules(accepted(), block, subtitle()), ['value'], label)
    }
    // La ligne citée montre le caractère invisible.
    const [found] = lintCssFiles(HERO, hero, appended('.subtitle\u00a0 { color: var(--color-ink); }'), context())
    assert.equal(found.line, '.subtitle<U+00A0> { color: var(--color-ink) }')
  })

  it('An+B : seuls les blancs CSS séparent les termes', () => {
    assert.equal(selectorProblem('.card:nth-child(2n\t+\n1)'), null)
    for (const char of NOT_BLANKS) {
      assert.ok(selectorProblem(`.card:nth-child(2n${char}+1)`), code(char))
      const list = `.subtitle, .subtitle:nth-child(2n${char}+1)`
      assert.deepEqual(rules(hero, `${hidden()}\n${restore(list)}\n`, subtitle()), ['selector'], code(char))
    }
  })

  it('un nom de propriété n’est ramené en minuscules que pour les lettres ASCII', () => {
    assert.deepEqual(rules(hero, inCta('  COLOR: var(--color-ink);')), [])
    // KELVIN SIGN (U+212A) : toLowerCase() de JavaScript en fait un k ; pour le navigateur, une propriété inconnue.
    assert.deepEqual(rules(hero, inCta('  bac\u212Aground-color: var(--color-ink);')), ['property'])
    for (const char of NOT_BLANKS) {
      assert.deepEqual(rules(hero, inCta(`  color${char}: var(--color-ink);`)), ['property'], code(char))
    }
  })

  it('une virgule en tête, en queue ou doublée rend toute la liste invalide : l’élément vide n’est jamais retiré', () => {
    const { declarations } = parseCss(', .subtitle { gap: 0 }\n.a,, .b { gap: 0 }\n.c,.d:nth-child(1, 2) { gap: 0 }')
    assert.deepEqual(
      declarations.map((d) => d.selector),
      ['', '.subtitle', '.a', '', '.b', '.c', '.d:nth-child(1, 2)'],
    )
    assert.match(selectorProblem('') ?? '', /Empty selector in a list/)
    const lists = [', .subtitle', ',.subtitle', '.subtitle,, .subtitle', '.subtitle,,.subtitle', '.subtitle,', '.subtitle ,']
    for (const list of [...lists, '.subtitle, , .subtitle', `.subtitle,\u00a0,.subtitle`]) {
      // Masquage nouveau, puis masquage existant dont le rétablissement est réécrit.
      assert.deepEqual(rules(hero, `${hidden()}\n${restore(list)}\n`, subtitle()), ['selector'], list)
      assert.deepEqual(rules(accepted(), `${hidden()}\n${restore(list)}\n`, subtitle()), ['selector'], list)
    }
    assert.deepEqual(rules(hero, `${hidden()}\n${restore(',')}\n`, subtitle()), ['display-none', 'selector'])
  })
})

describe('lintCssFiles — ce que postcss range dans raws, et que le navigateur ignore', () => {
  const hidden = () => hero.replace('.subtitle {\n', '.subtitle {\n  display: none;\n')
  const restore = (inner = '.subtitle {\n    display: block;\n  }') => `@media (min-width: 48rem) {\n  ${inner}\n}`
  /** Masquage existant, déjà rétabli (accepté). */
  const accepted = () => `${hidden()}\n${restore()}\n`

  it('refuse un point-virgule entre deux règles : le navigateur ignore la règle qui le suit', () => {
    // postcss le range dans raws (ownSemicolon de la règle d’avant, before du nœud suivant, after du bloc) et lit la
    // règle suivante normalement. Chaque point-virgule est cité par la règle qu’il fait ignorer.
    const { semicolons } = parseCss(
      '.a { gap: 0 };\n.b { gap: 0 }\n@media (min-width: 48rem) { ; .c { gap: 0 } .d { gap: 0 } ; }\n/* x */ ;\n' +
        '.e { gap: 0 };\n@media (min-width: 64rem) { .f { gap: 0 } ;; }\n;',
    )
    assert.deepEqual(semicolons, [
      '; .b',
      '@media (min-width: 48rem) › ; .c',
      '@media (min-width: 48rem) › ; (end of block)',
      '; .e',
      '; @media (min-width: 64rem)',
      '@media (min-width: 64rem) › ; (end of block)',
      '@media (min-width: 64rem) › ; (end of block)',
      '; (end of file)',
    ])
    const mask = '.subtitle {\n  display: none;\n}'
    const colored = '.subtitle {\n    color: var(--color-ink);\n  }'
    const wide = `@media (min-width: 64rem) {\n  ${colored}\n}`
    /** Masquage existant, en fin de fichier, déjà rétabli (accepté). */
    const existing = `${hero}\n${mask}\n${restore()}\n`
    const versions: Record<string, string> = {
      // A : sur sa ligne, devant le @media ; tout le @media est ignoré.
      A: `${hero}\n${mask}\n;${restore()}\n`,
      // E : collé à la règle de base ; le @media qui suit est ignoré.
      E: `${hero}\n${mask};\n${restore()}\n`,
      // B : en tête du bloc @media ; la règle .subtitle du @media est ignorée.
      B: `${hero}\n${mask}\n${restore(`;\n  .subtitle {\n    display: block;\n  }`)}\n`,
      // Entre deux règles du @media.
      F: `${hero}\n${mask}\n${restore(`${colored}\n  ;\n  .subtitle {\n    display: block;\n  }`)}\n`,
      // Après une règle @ (raws.before du @media).
      G: `${hero}\n${mask}\n${wide}\n;${restore()}\n`,
      // Après un commentaire, ou avant lui.
      H: `${hero}\n${mask}\n/* rétablissement */ ;\n${restore()}\n`,
      I: `${hero}\n${mask}\n; /* rétablissement */\n${restore()}\n`,
      // En fin de fichier : sans effet pour le navigateur, refusé quand même.
      J: `${existing};\n`,
    }
    for (const [id, after] of Object.entries(versions)) {
      assert.deepEqual(rules(hero, after, subtitle()), ['css-parse'], `${id} : masquage nouveau`)
      // C : masquage existant, déjà rétabli ; le point-virgule inséré rend le masquage définitif.
      assert.deepEqual(rules(existing, after, subtitle()), ['css-parse'], `${id} : masquage existant`)
    }
    const [found] = lintCssFiles(HERO, hero, versions.A, subtitle())
    assert.equal(found.message, 'Semicolon between two rules: the browser ignores the rule that follows it.')
    assert.equal(found.line, '; @media (min-width: 48rem)')
    assert.equal(lintCssFiles(HERO, hero, versions.B, subtitle())[0].line, '@media (min-width: 48rem) › ; .subtitle')
    // Dans un bloc de déclarations, un point-virgule en trop est sans effet : permis.
    assert.deepEqual(rules(hero, inCta('  ;color: var(--color-ink);;')), [])
    // Un point-virgule déjà présent n’est pas rejugé.
    assert.deepEqual(rules(versions.A, versions.A.replace('max-width: var(--layout-measure);', ''), subtitle()), [])
  })

  it('lit un nom de propriété tel qu’il est écrit : un caractère autour du nom fait ignorer la déclaration', () => {
    // postcss range `*`, `_`, une chaîne, des parenthèses ou `:` avant le nom dans raws.before, et `!`, une chaîne ou
    // des parenthèses avant les deux-points dans raws.between : decl.prop reste `display`.
    const written = ['*display', '_display', '"x"display', "'x' display", '(x)display', '(x) display', ':display']
    written.push('display ! ', 'display !', 'display "x"', 'display (x)')
    const { declarations } = parseCss(`.a { ${written.map((name) => `${name}: block`).join('; ')} }`)
    assert.deepEqual(
      declarations.map((d) => d.property),
      written.map((name) => name.trim()),
    )
    // Les commentaires, eux, ne comptent pas, comme pour le navigateur.
    const valid = ['display/**/: block', 'display /* c */ : block', 'display: /* c */ block', '/* c */display: block']
    valid.push('display\t:\fblock')
    assert.deepEqual(
      parseCss(`.a { ${valid.join('; ')} }`).declarations.map((d) => d.property),
      valid.map(() => 'display'),
    )
    for (const name of written) {
      const after = `${hidden()}\n${restore(`.subtitle {\n    ${name}: block;\n  }`)}\n`
      assert.deepEqual(rules(hero, after, subtitle()), ['display-none', 'property'], `${name} : masquage nouveau`)
      assert.deepEqual(rules(accepted(), after, subtitle()), ['display-none', 'property'], `${name} : masquage existant`)
    }
    const commented = `${hidden()}\n${restore('.subtitle {\n    display /* rétabli */ : block;\n  }')}\n`
    assert.deepEqual(rules(hero, commented, subtitle()), [])
    assert.deepEqual(rules(accepted(), commented, subtitle()), [])
    for (const name of ['_color', '*color']) {
      assert.deepEqual(rules(hero, inCta(`  ${name}: var(--color-ink);`)), ['property'], name)
    }
    const [found] = lintCssFiles(HERO, hero, inCta('  _color: var(--color-ink);'), context())
    assert.equal(found.line, '.cta { _color: var(--color-ink) }')
  })
})

describe('lintCssFiles — valeurs en dur bornées', () => {
  it('un accord 🔴 n’exempte jamais un décalage, une valeur trop longue, un var() avec repli ni une casse', () => {
    for (const [property, value] of [
      ['top', '40px'],
      ['left', '9999px'],
      ['inset', '0 0 0 40px'],
    ]) {
      const granted = context({ hardcoded: [{ property, value }] })
      assert.deepEqual(rules(hero, inCta(`  ${property}: ${value};`), granted), ['value'], property)
    }
    const fallback = context({ hardcoded: [{ property: 'color', value: 'var(--color-ink, red)' }] })
    assert.deepEqual(rules(hero, inCta('  color: var(--color-ink, red);'), fallback), ['value'])
    const unknown = context({ hardcoded: [{ property: 'color', value: 'var(--nope, red)' }] })
    assert.deepEqual(rules(hero, inCta('  color: var(--nope, red);'), unknown), ['unknown-token'])
    const upper = context({ hardcoded: [{ property: 'text-align', value: 'CENTER' }] })
    assert.deepEqual(rules(hero, inCta('  text-align: CENTER;'), upper), ['case'])
    const longValue = `${'1'.repeat(201)}px`
    const long = context({ hardcoded: [{ property: 'font-size', value: longValue }] })
    assert.deepEqual(rules(hero, inCta(`  font-size: ${longValue};`), long), ['value'])
  })

  it('un accord 🔴 n’exempte jamais un contour ni une ombre, au repos comme dans un état : ils masquent du texte', () => {
    // Relecture : accordés, ces contours et ces ombres passaient ; dans Chrome, « récente à Lyon », « et sa » et
    // « attendre » disparaissent à 375 px, et au survol ou au focus d’un lien, toute la page. Le relevé des lignes
    // recouvertes ne voit ni contour ni ombre (elementFromPoint), et la capture ne survole rien.
    /** Règles des violations de `sujet { propriété: valeur }` ajouté au CSS de la zone, cette valeur accordée en dur. */
    const granted = (zone: string, file: string, css: string, subject: string, property: string, value: string) =>
      rules(css, `${css}\n${subject} {\n  ${property}: ${value};\n}\n`, context({ zone, hardcoded: [{ property, value }] }), file)
    for (const [property, value] of [
      ['outline', '40px solid #0f172a'],
      ['box-shadow', '0 0 0 30px #0f172a'],
      ['outline-offset', '40px'],
    ]) {
      assert.deepEqual(granted('hero.title', HERO, hero, '.accent', property, value), ['value'], property)
    }
    assert.deepEqual(granted('header.nav', HEADER, header, '.nav a:hover', 'outline', '999px solid #0f172a'), ['value'])
    const shadow = granted('header.nav', HEADER, header, '.nav a:focus-visible', 'box-shadow', '0 0 0 999px #0f172a')
    assert.deepEqual(shadow, ['value'])
    // Les tokens et le contour d’un pixel restent permis, au repos comme au focus (C02, C03, L10).
    const focus =
      '.cta:focus-visible {\n  outline: 1px solid var(--color-rose);\n  outline-offset: var(--space-1);\n' +
      '  box-shadow: var(--shadow-glow);\n}'
    assert.deepEqual(rules(hero, appended(focus)), [])
  })

  it('un accord 🔴 n’exempte jamais une couleur relative ou non numérique : le logo de la couleur de son fond (relecture tâche 26)', () => {
    // Accordée, `rgb(from var(--color-night) r g b)` passait sur le logo (granted: color) ; Chrome la calcule en
    // `color(srgb …)`, que le contrôle du contraste ne lit pas : le plancher du logotype ne la voyait pas.
    const logo = (value: string) =>
      checkCssFiles(
        HEADER,
        header,
        `${header}\n.logo {\n  color: ${value};\n}\n`,
        context({ zone: 'header.logo', hardcoded: [{ property: 'color', value }] }),
      )
    for (const value of ['rgb(from var(--color-night) r g b)', 'rgb(from var(--color-rose) r g b / 0)', 'rgb(0 0 0 / none)']) {
      const found = logo(value)
      assert.deepEqual(found.violations.map((violation) => violation.rule), ['value'], value)
      assert.deepEqual(found.granted, [], value)
    }
    // Une couleur en dur numérique reste accordée (S09 de 1-reference : `color: #D4A017`).
    assert.deepEqual(logo('#D4A017'), { violations: [], granted: [{ property: 'color', value: '#D4A017' }] })
  })

  it('une valeur de 100 000 caractères est jugée en moins de 50 ms, et n’est pas recopiée entière', () => {
    for (const [property, value] of [
      ['color', 'a-'.repeat(50_000)],
      ['transition-duration', `${'1'.repeat(100_000)}x`],
    ]) {
      const granted = context({ hardcoded: [{ property, value }] })
      const after = inCta(`  ${property}: ${value};`)
      const start = performance.now()
      const found = lintCssFiles(HERO, hero, after, granted)
      const elapsed = performance.now() - start
      assert.deepEqual(found.map((v) => v.rule), ['value'], property)
      assert.ok(elapsed < 50, `${property} : ${elapsed.toFixed(1)} ms`)
      assert.ok(found[0].message.length < 300 && (found[0].line ?? '').length < 300, property)
    }
  })
})

describe('lintCssFiles — aucun décalage (top, right, bottom, left, inset)', () => {
  it('refuse un décalage en token dès le contrôle CSS, même quand la zone resterait dans son parent', () => {
    const [found, ...others] = lintCssFiles(HERO, hero, inCta('  position: relative;\n  top: var(--space-1);'), context())
    assert.deepEqual(others, [])
    assert.equal(found.rule, 'value')
    assert.match(found.message, /^Value not allowed for `top`: `var\(--space-1\)`\. Allowed: 0 or auto/)
    assert.match(found.message, /to add space, use margin or padding/)
  })

  it('refuse un décalage dans un état que la capture ne survole pas (:hover, :focus-visible, :active)', () => {
    // Le décalage (`value`), et, dans un état, position et le décalage eux-mêmes (`state`, peinture seulement).
    const refused = ['state', 'state', 'value']
    assert.deepEqual(rules(hero, appended('.cta:hover {\n  position: relative;\n  bottom: var(--space-9);\n}')), refused)
    assert.deepEqual(rules(hero, appended('.cta:focus-visible {\n  position: relative;\n  left: var(--space-9);\n}')), refused)
    const links = `${header}\n.nav a:focus-visible {\n  position: relative;\n  top: var(--space-9);\n}\n`
    assert.deepEqual(rules(header, links, context({ zone: 'header.nav' }), HEADER), refused)
    const inset = appended('.cta:active {\n  position: relative;\n  inset: var(--space-2) auto auto var(--space-2);\n}')
    assert.deepEqual(rules(hero, inset), refused)
  })

  it('laisse passer 0 et auto, qui ne déplacent rien', () => {
    assert.deepEqual(rules(hero, inCta('  position: relative;\n  top: 0;\n  left: auto;\n  inset: 0 auto;')), [])
  })
})

describe('lintCssFiles — un état (:hover, :focus-visible, :focus, :active) ne change que la peinture', () => {
  // flex: 1 1 0, flex-grow: 0 et min-width: 0 écrasent l’élément ; justify-content: flex-end pousse son texte hors de la
  // page (logo : de [16, 113] à [-81, 16] au focus clavier, mesuré dans Chrome). La capture ne survole ni ne focalise rien.
  const COLLAPSE = '  display: flex;\n  justify-content: flex-end;\n  flex: 1 1 0;\n  flex-grow: 0;\n  min-width: 0;'
  const LOGO = () => context({ zone: 'header.logo' })
  const NAV = () => context({ zone: 'header.nav' })
  /** Header.module.css avec ce CSS ajouté à la fin. */
  const inHeader = (css: string) => `${header}\n${css}\n`
  /** Propriétés refusées pour l’état, dans l’ordre du fichier. */
  const stateRefusals = (css: string, ctx: CssLintContext) =>
    lintCssFiles(HEADER, header, inHeader(css), ctx)
      .filter((violation) => violation.rule === 'state')
      .map((violation) => /\{ ([\w-]+):/.exec(violation.line ?? '')?.[1])

  it('refuse l’écrasement du logo dans :focus-visible, dans :hover, et dans les deux à la fois', () => {
    const all = ['display', 'justify-content', 'flex', 'flex-grow', 'min-width']
    assert.deepEqual(stateRefusals(`.logo:focus-visible {\n${COLLAPSE}\n}`, LOGO()), all)
    assert.deepEqual(stateRefusals(`.logo:hover {\n${COLLAPSE}\n}`, LOGO()), all)
    const both = lintCssFiles(HEADER, header, inHeader(`.logo:hover, .logo:focus-visible {\n${COLLAPSE}\n}`), LOGO())
    assert.equal(both.filter((violation) => violation.rule === 'state').length, 10)
    const [first] = both
    assert.equal(first.rule, 'state')
    assert.match(first.message, /^`display` is not allowed in a state \(`:hover`\)/)
    assert.match(first.message, /the render check neither hovers nor selects anything/)
    assert.match(first.message, /color, background-color, .*box-shadow.*transform/)
  })

  it('refuse l’écrasement de la navigation ou d’un de ses liens dans un état', () => {
    assert.deepEqual(stateRefusals('.nav:hover {\n  flex: 1 1 0;\n  flex-grow: 0;\n  min-width: 0;\n}', NAV()), [
      'flex',
      'flex-grow',
      'min-width',
    ])
    const link = `.nav a:focus-visible {\n${COLLAPSE}\n}`
    assert.deepEqual(stateRefusals(link, NAV()), ['display', 'justify-content', 'flex', 'flex-grow', 'min-width'])
    assert.deepEqual(rules(header, inHeader('.nav a:focus-visible {\n  min-width: 0;\n}'), NAV(), HEADER), ['state'])
  })

  it('vaut pour :focus et :active, et pour un état porté par un ancêtre dans le sélecteur', () => {
    assert.deepEqual(rules(hero, appended('.cta:active {\n  padding-inline: var(--space-9);\n}')), ['state'])
    assert.deepEqual(rules(hero, appended('.cta:focus {\n  margin-top: var(--space-2);\n}')), ['state'])
    assert.deepEqual(rules(hero, appended('.cta:hover {\n  font-size: var(--text-4xl);\n}')), ['state'])
    assert.deepEqual(stateRefusals('.nav:hover a {\n  order: 1;\n  gap: 0;\n}', NAV()), ['order', 'gap'])
  })

  it('laisse passer la peinture : couleurs, contour, ombre, soulignement, transition et soulèvement (C02, C03)', () => {
    const paint = appended(
      '.cta:focus-visible {\n  background-color: var(--color-rose-deep);\n  color: var(--color-white);\n' +
        '  border-color: transparent;\n  outline: 1px solid var(--color-rose);\n  outline-offset: var(--space-1);\n' +
        '  box-shadow: var(--shadow-lg);\n  text-decoration: underline;\n  transition: box-shadow 0.2s ease-out;\n' +
        '  transform: translateY(calc(var(--space-1) * -1));\n}\n.cta:active {\n  background: var(--color-rose);\n}',
    )
    assert.deepEqual(rules(hero, paint), [])
    const hover = hero.replace('background-color: var(--color-rose-deep);', 'background-color: var(--color-rose-light);')
    assert.notEqual(hover, hero)
    assert.deepEqual(rules(hero, hover), [])
    assert.deepEqual(rules(header, inHeader('.nav a:focus-visible {\n  color: var(--color-rose);\n}'), NAV(), HEADER), [])
  })
})

describe('lintCssFiles — dans un état, ni texte ni fond transparents ou repris d’ailleurs (décision 16)', () => {
  // La capture ne survole ni ne focalise rien : un texte rendu invisible au survol ou au focus clavier ne serait jamais vu.
  const LOGO = () => context({ zone: 'header.logo' })
  const NAV = () => context({ zone: 'header.nav' })
  const inHeader = (css: string) => `${header}\n${css}\n`
  const KEYWORDS = ['transparent', 'inherit', 'currentColor', 'currentcolor', 'initial', 'unset', 'revert', 'revert-layer']

  it('refuse les essais de la relecture : texte transparent au focus, fond transparent au focus', () => {
    assert.deepEqual(rules(header, inHeader('.nav a:focus-visible {\n  color: transparent;\n}'), NAV(), HEADER), ['state'])
    assert.deepEqual(rules(header, inHeader('.logo:focus-visible {\n  color: transparent;\n}'), LOGO(), HEADER), ['state'])
    const cta = lintCssFiles(
      HERO,
      hero,
      appended('.cta:focus-visible {\n  background-color: transparent;\n  color: var(--color-night);\n}'),
      context(),
    )
    assert.deepEqual(
      cta.map((violation) => [violation.rule, violation.line]),
      [['state', '.cta:focus-visible { background-color: transparent }']],
    )
    assert.match(cta[0].message, /^`background-color: transparent` is not allowed in a state \(`:focus-visible`\)/)
    assert.match(cta[0].message, /the render check neither hovers nor selects anything/)
    assert.match(cta[0].message, /a color token \(var\(--color-…\)\)/)
  })

  it('refuse chaque mot-clé pour color, background-color et background, dans chaque état et sous un ancêtre en état', () => {
    for (const property of ['color', 'background-color', 'background']) {
      for (const keyword of KEYWORDS) {
        for (const selector of ['.cta:hover', '.cta:focus-visible', '.cta:focus', '.cta:active']) {
          const found = rules(hero, appended(`${selector} {\n  ${property}: ${keyword};\n}`))
          assert.ok(found.includes('state'), `${selector} { ${property}: ${keyword} } → ${JSON.stringify(found)}`)
        }
      }
    }
    assert.deepEqual(rules(header, inHeader('.nav:hover a {\n  color: inherit;\n}'), NAV(), HEADER), ['state'])
    assert.deepEqual(rules(header, inHeader('.nav a:active {\n  color: unset;\n}'), NAV(), HEADER), ['state', 'value'])
  })

  it('jamais exempté par un accord 🔴, ni sous une autre écriture de transparent (alpha nul, background: none)', () => {
    const granted = (property: string, value: string) => context({ hardcoded: [{ property, value }] })
    assert.deepEqual(rules(hero, appended('.cta:hover {\n  color: initial;\n}'), granted('color', 'initial')), ['state'])
    for (const value of ['rgb(0 0 0 / 0)', 'rgba(255, 255, 255, 0)', 'hsl(0 0% 0% / 0%)', '#0000', '#ffffff00']) {
      const css = appended(`.cta:focus-visible {\n  background-color: ${value};\n}`)
      // Un alpha en hexadécimal n’est plus accordable (relecture tâche 26 : #rgb et #rrggbb seulement) : refus de la valeur
      // en plus de celui de l’état.
      const expected = value.startsWith('#') ? ['state', 'value'] : ['state']
      assert.deepEqual(rules(hero, css, granted('background-color', value)), expected, value)
    }
    assert.deepEqual(rules(hero, appended('.cta:active {\n  background: none;\n}'), granted('background', 'none')), ['state'])
    // Une couleur en dur opaque accordée reste permise dans un état.
    const opaque = appended('.cta:hover {\n  background-color: rgb(190 18 60 / 1);\n}')
    assert.deepEqual(rules(hero, opaque, granted('background-color', 'rgb(190 18 60 / 1)')), [])
  })

  it('hors d’un état, et pour les autres couleurs d’un état, rien ne change (C02, C03)', () => {
    assert.deepEqual(rules(hero, inCta('  color: inherit;\n  background-color: transparent;')), [])
    const outline = appended(
      '.cta:focus-visible {\n  border-color: transparent;\n  outline-color: currentColor;\n' +
        '  text-decoration-color: currentColor;\n  color: var(--color-white);\n}',
    )
    assert.deepEqual(rules(hero, outline), [])
    assert.deepEqual(rules(header, inHeader('.nav a:hover {\n  color: var(--color-sand);\n}'), NAV(), HEADER), [])
  })
})

describe('lintCssFiles — min-width sur un élément intérieur', () => {
  const NAV = () => context({ zone: 'header.nav' })
  const inHeader = (css: string) => `${header}\n${css}\n`

  it('refuse min-width: 0 sous la classe de la zone : flex réduirait un lien à rien, recouvert par le suivant', () => {
    // Relecture : « Accueil » passe à 0 px de large, son texte déborde sous « Blog », qui peint son fond par-dessus.
    const covering =
      '.nav {\n  gap: 0;\n}\n.nav a:first-child {\n  flex: 1 1 0;\n  flex-grow: 0;\n  min-width: 0;\n}\n' +
      '.nav a:last-child {\n  background-color: var(--color-night);\n  padding-inline: var(--space-7);\n}'
    const [found, ...others] = lintCssFiles(HEADER, header, inHeader(covering), NAV())
    assert.deepEqual(others, [])
    assert.equal(found.rule, 'min-width')
    assert.equal(found.line, '.nav a:first-child { min-width: 0 }')
    assert.match(found.message, /^`min-width` is only set on the zone’s class \(`\.nav`\)/)
    assert.match(found.message, /shrink it to a zero width/)
    assert.deepEqual(rules(header, inHeader('.nav a {\n  min-width: 0;\n}'), NAV(), HEADER), ['min-width'])
  })

  it('même accordé en dur ; auto partout, et la classe de la zone, restent permis', () => {
    const granted = context({ zone: 'header.nav', hardcoded: [{ property: 'min-width', value: '1px' }] })
    assert.deepEqual(rules(header, inHeader('.nav a {\n  min-width: 1px;\n}'), granted, HEADER), ['min-width'])
    assert.deepEqual(rules(header, inHeader('.nav a {\n  min-width: auto;\n}'), NAV(), HEADER), [])
    assert.deepEqual(rules(header, inHeader('.nav {\n  min-width: 0;\n}'), NAV(), HEADER), [])
    const media = '@media (min-width: 64rem) {\n  .nav {\n    min-width: 0;\n  }\n}'
    assert.deepEqual(rules(header, inHeader(media), NAV(), HEADER), [])
  })
})

describe('lintCssFiles — règles de la zone choisie', () => {
  it('relève les classes de la zone et celles de ses zones intérieures du même fichier', () => {
    const owner = zoneSelectors('hero', ds.zones, HERO)
    assert.deepEqual([...owner.own], ['hero'])
    assert.equal(owner.root, 'hero')
    assert.deepEqual(Object.fromEntries(owner.childClasses), {
      title: 'Titre principal',
      accent: 'Titre principal',
      subtitle: 'Sous-titre',
      cta: 'Bouton principal',
    })
    assert.equal(owner.hasChildren, true)
    assert.equal(zoneSelectors('blog.list', ds.zones, GRID).childClasses.size, 0, 'post.card est dans un autre CSS Module')
  })

  it('un conteneur ne place ses zones intérieures que par un sélecteur descendant', () => {
    const heroZone = context({ zone: 'hero' })
    assert.deepEqual(rules(hero, appended('.hero .title {\n  margin-inline: auto;\n}'), heroZone), [])
    const [font] = lintCssFiles(HERO, hero, appended('.hero .title {\n  font-family: var(--font-sans);\n}'), heroZone)
    assert.equal(font.rule, 'selector')
    assert.match(font.message, /Inner zone “Titre principal”: from the container, only placement .*/)
    assert.match(font.message, /not `font-family`\.$/)
    assert.deepEqual(rules(hero, appended('.hero h1 {\n  margin-inline: auto;\n}'), heroZone), ['selector'])
    const [own] = lintCssFiles(HERO, hero, hero.replace('line-height: 1.05;', 'line-height: 1.1;'), heroZone)
    assert.match(own.message, /`\.title` is the own rule of the zone “Titre principal”/)
  })

  it('refuse une balise nue dans un conteneur, l’accepte dans une zone sans zone intérieure', () => {
    const blogList = context({ zone: 'blog.list' })
    assert.deepEqual(rules(grid, `${grid}\n.grid > a {\n  order: 1;\n}\n`, blogList, GRID), ['selector'])
    const nav = header.replace('color: var(--color-rose-light);', 'color: var(--color-rose);')
    assert.notEqual(nav, header)
    assert.deepEqual(rules(header, nav, context({ zone: 'header.nav' }), HEADER), [])
  })

  it('retirer une déclaration d’une autre zone est refusé', () => {
    const removed = hero.replace('  line-height: 1.05;\n', '')
    assert.deepEqual(rules(hero, removed, context({ zone: 'hero' })), ['selector'])
  })

  it('masquer : seulement une zone déclarée masquable, sur sa propre classe', () => {
    const restoreAt48 = (css: string, selector: string, declarations: string) =>
      `${css.replace(`${selector} {\n`, `${selector} {\n  display: none;\n`)}\n` +
      `@media (min-width: 48rem) {\n  ${selector} {\n    ${declarations}\n  }\n}\n`
    assert.deepEqual(rules(hero, restoreAt48(hero, '.subtitle', 'display: block;'), context({ zone: 'hero.subtitle' })), [])
    const cta = restoreAt48(hero, '.cta', 'display: inline-block;')
    assert.deepEqual(rules(hero, cta, context({ zone: 'hero.cta' })), ['display-none'])
    const lastLink =
      `${header}\n.nav a:last-child {\n  display: none;\n}\n\n` +
      '@media (min-width: 48rem) {\n  .nav a:last-child {\n    display: inline;\n  }\n}\n'
    assert.deepEqual(rules(header, lastLink, context({ zone: 'header.nav' }), HEADER), ['display-none'])
  })

  it('refuse les détours : morceau intermédiaire, règle d’une autre zone, masquage d’un descendant', () => {
    const heroZone = context({ zone: 'hero' })
    // `.title` au milieu du sélecteur : la règle viserait l’intérieur d’une autre zone.
    const [middle, ...others] = lintCssFiles(HERO, hero, appended('.hero .title .accent {\n  margin-inline: auto;\n}'), heroZone)
    assert.equal(middle.rule, 'selector')
    assert.match(middle.message, /`\.title` is the own rule of the zone “Titre principal”/)
    assert.deepEqual(others, [])
    // Règle propre d’une zone intérieure, seule ou dans une liste.
    assert.deepEqual(rules(hero, appended('.title {\n  margin-inline: auto;\n}'), heroZone), ['selector'])
    assert.deepEqual(rules(hero, appended('.hero, .cta {\n  color: var(--color-ink);\n}'), heroZone), ['selector'])
    // Une zone voisine ne touche ni au conteneur, ni à une zone sœur, même par un sélecteur descendant.
    const [parent] = lintCssFiles(HERO, hero, appended('.hero .cta {\n  color: var(--color-ink);\n}'), context())
    assert.match(parent.message, /`\.hero` does not belong to this zone \(allowed classes: \.cta\)/)
    assert.deepEqual(rules(hero, appended('.subtitle {\n  color: var(--color-ink);\n}'), context()), ['selector'])
    // Modifier une déclaration d’une autre zone : une seule violation (ajout et retrait portent le même message).
    assert.deepEqual(rules(hero, hero.replace('line-height: 1.05;', 'line-height: 1.1;'), heroZone), ['selector'])
    // Masquer un descendant ou un état de la zone masquable : jamais, même rétabli (un état ne change que la peinture).
    for (const [selector, refused] of [
      ['.subtitle span', ['display-none']],
      ['.subtitle:hover', ['display-none', 'state']],
    ] as const) {
      const css = appended(
        `${selector} {\n  display: none;\n}\n@media (min-width: 48rem) {\n  ${selector} {\n    display: block;\n  }\n}`,
      )
      assert.deepEqual(rules(hero, css, subtitle()), refused, selector)
    }
    // Depuis le conteneur, masquer une zone intérieure n’est pas du placement.
    const inner = appended(
      '.hero .subtitle {\n  display: none;\n}\n@media (min-width: 48rem) {\n  .hero .subtitle {\n    display: block;\n  }\n}',
    )
    assert.deepEqual(rules(hero, inner, heroZone), ['display-none', 'selector'])
  })

  it('une règle retirée sans classe de la zone, ou dans un fichier d’une autre zone, est refusée', () => {
    // Règle sans classe déjà présente (écrite par un développeur) : la retirer touche au-delà de la zone.
    const global = `${hero}\n.cta :global(span) {\n  color: var(--color-ink);\n}\np {\n  color: var(--color-ink);\n}\n`
    assert.deepEqual(rules(global, `${hero}\n.cta :global(span) {\n  color: var(--color-ink);\n}\n`), ['selector'])
    // Retirer une règle de la zone reste permis, même avec une balise.
    assert.deepEqual(rules(global, `${hero}\np {\n  color: var(--color-ink);\n}\n`), [])
    // Les classes d’une zone n’existent que dans son CSS Module : ailleurs, `.cta` est une autre classe.
    const features = '.cta {\n  color: var(--color-ink);\n}\n'
    const [foreign] = lintCssFiles(FEATURES, features, features.replace('--color-ink', '--color-rose'), context())
    assert.equal(foreign?.rule, 'selector')
    assert.match(foreign.message, /`\.cta` does not belong to this zone \(none of its classes in this file\)/)
    // Zone inconnue, ou nom d’une propriété d’objet : aucune classe, rien n’est permis.
    for (const zone of ['nope', 'constructor', '__proto__']) {
      const owner = zoneSelectors(zone, ds.zones, HERO)
      assert.deepEqual([owner.own.size, owner.childClasses.size, owner.hasChildren, owner.hideable], [0, 0, false, false], zone)
      assert.deepEqual(rules(hero, inCta('  color: var(--color-ink);'), context({ zone })), ['selector'], zone)
    }
  })

  it('une règle d’une autre zone ne change pas de place ; une zone déplace les siennes', () => {
    const logo = context({ zone: 'header.logo' })
    const moveToEnd = (css: string, rule: string) => `${css.replace(rule, '').trimEnd()}\n\n${rule}`
    // Règle de base de .nav (zone Menu) placée après son @media : l’écart sur ordinateur redevient celui du mobile.
    const navBase = /\.nav \{\n {2}display: flex;[^}]*\}\n/.exec(header)![0]
    const moved = moveToEnd(header, navBase)
    const [found, ...others] = lintCssFiles(HEADER, header, moved, logo)
    assert.equal(found?.rule, 'selector')
    assert.match(found.message, /^Rule of another zone moved: the order of the other zones’ rules does not change/)
    assert.equal(found.line, '.nav { display: flex }')
    assert.deepEqual(others, [])
    // Même avec un vrai changement de .logo en plus.
    const resized = moved.replace('font-size: var(--text-xl);', 'font-size: var(--text-2xl);')
    assert.notEqual(resized, moved)
    assert.deepEqual(rules(header, resized, logo, HEADER), ['selector'])
    // Deux déclarations d’une autre zone échangées dans leur règle : refusé aussi.
    const swapped = header.replace('  display: flex;\n  gap: var(--space-5);\n', '  gap: var(--space-5);\n  display: flex;\n')
    assert.notEqual(swapped, header)
    assert.deepEqual(rules(header, swapped, logo, HEADER), ['selector'])
    // Déplacer ses propres règles reste permis : .nav pour le Menu, .logo pour le Logo.
    assert.deepEqual(rules(header, moved, context({ zone: 'header.nav' }), HEADER), [])
    const logoRule = /\.logo \{[^}]*\}\n/.exec(header)![0]
    assert.deepEqual(rules(header, moveToEnd(header, logoRule), logo, HEADER), [])
  })
})

describe('lintCssFiles — passage de référence', () => {
  it('accepte les CSS écrits par Claude dans leur zone, sauf L05 (@import, police, zones intérieures) et R09', () => {
    const css = fixtures.filter((entry) => entry.file.endsWith('.css'))
    assert.equal(css.length, 29)
    const refused: Record<string, string[]> = {}
    for (const entry of css) {
      const scope = { style: entry.scope.includes('style'), text: entry.scope.includes('text') }
      const ctx = context({ scope, hardcoded: entry.hardcoded, zone: entry.zone })
      const found = lintCssFiles(entry.file, entry.before, entry.after, ctx)
      if (found.length) refused[entry.id] = [...new Set(found.map((v) => v.rule))].sort()
    }
    assert.deepEqual(refused, { L05: ['at-rule', 'selector', 'value'], R09: ['value'] })
    // Placement (R08), masquage (R03), soulèvement au survol (C02), 40px accordé (S05)… : bien jugés, et acceptés.
    for (const id of ['R08', 'S10', 'C01', 'S03', 'C06', 'R04', 'R10', 'R03', 'C02', 'S05']) {
      assert.ok(css.some((entry) => entry.id === id), `${id} absent des fixtures`)
    }

    const l05 = fixtures.find((entry) => entry.id === 'L05')!
    const selectors = lintCssFiles(l05.file, l05.before, l05.after, context({ zone: 'hero', hardcoded: l05.hardcoded }))
      .filter((v) => v.rule === 'selector')
      .map((v) => /^`(\.\w+)`/.exec(v.message)?.[1])
    assert.deepEqual(selectors.sort(), ['.cta', '.subtitle', '.title'])
    const r09 = fixtures.find((entry) => entry.id === 'R09')!
    const [r09Found] = lintCssFiles(r09.file, r09.before, r09.after, context({ zone: 'article.content' }))
    assert.match(r09Found.message, /`margin-inline`/)
  })
})
