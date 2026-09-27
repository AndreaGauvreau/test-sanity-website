import assert from 'node:assert/strict'
import path from 'node:path'
import { beforeAll as before, describe, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import {
  checkValue,
  EXTERNAL_RESOURCE,
  isExemptable,
  isGrantableValue,
  MAX_VALUE_LENGTH,
  NEGATIVE_OR_CALC,
  normalizeValue,
  tokenSets,
  type TokenSets,
} from './css-policy'
import { loadDesignSystem } from './design-system'
import { LYONDRIVE } from './fixtures/lyondrive-options'

/**
 * Valeurs CSS permises : sondes de la critique (refusées) et valeurs écrites par les cas réussis
 * du passage de référence (acceptées), sur les vrais tokens du site.
 */

const siteDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/lyondrive')

let sets: TokenSets
before(async () => {
  sets = (await loadDesignSystem(siteDir, LYONDRIVE)).policy
})

const rule = (property: string, value: string, hover = false) => checkValue(property, value, sets, { hover })?.rule ?? null

const each = (property: string, values: string[]) => values.map((value): [string, string] => [property, value])

/** Blancs pour JavaScript (`\s`, `trim()`), jamais pour CSS : U+00A0, U+FEFF (invisible), U+2003, U+2028, \v. */
const NOT_BLANKS = ['\u00a0', '\ufeff', '\u2003', '\u2028', '\v']
const code = (char: string) => `U+${(char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`

describe('checkValue', () => {
  it('accepte les valeurs écrites par les cas réussis du passage de référence', () => {
    const accepted: [string, string][] = [
      ...each('color', ['ink', 'white', 'sand', 'mist', 'slate', 'rose', 'night'].map((name) => `var(--color-${name})`)),
      ...each('background-color', ['night-soft', 'white', 'rose-deep'].map((name) => `var(--color-${name})`)),
      ...each('gap', ['var(--space-3)', 'var(--space-5)', 'var(--space-2) var(--space-5)']),
      ['padding', 'var(--space-3) var(--space-3) var(--space-6)'],
      ...each('padding-block', ['3', '4', '6', '7', '8'].map((n) => `var(--space-${n})`)),
      ['padding-inline', 'var(--space-7)'],
      ['border', '1px solid var(--color-night-soft)'],
      ['border-top', '1px solid var(--color-rose)'],
      ['border-radius', 'var(--radius-lg)'],
      ...each('box-shadow', ['sm', 'md', 'lg', 'glow'].map((name) => `var(--shadow-${name})`)),
      ['text-decoration', 'none'],
      ...each('transition', ['box-shadow 200ms ease, transform 200ms ease', 'background-color 0.2s ease-out, box-shadow 0.2s ease-out']),
      ['outline', '1px solid var(--color-rose)'],
      ['outline-offset', 'var(--space-1)'],
      ['line-height', '1.5'],
      ...each('font-size', ['sm', 'md', 'xl', '2xl', '3xl'].map((name) => `var(--text-${name})`)),
      ...each('font-weight', ['var(--weight-semibold)', 'var(--weight-bold)']),
      ['font-family', 'var(--font-sans)'],
      ...each('display', ['block', 'inline-block', 'none']),
      ...each('text-align', ['center', 'left']),
      ['grid-template-columns', 'repeat(3, 1fr)'],
      ['max-width', 'none'],
      ...each('margin-inline', ['auto', '0']),
      ['order', '-1'],
      ['width', '100%'],
      ['margin', '0'],
    ]
    for (const [property, value] of accepted) assert.equal(rule(property, value), null, `${property}: ${value}`)
  })

  it('n’accepte le soulèvement au survol que dans :hover ou :focus-visible', () => {
    assert.equal(rule('transform', 'translateY(calc(var(--space-1) * -1))', true), null)
    assert.equal(rule('transform', 'translateY(calc(var(--space-1) * -1))'), 'hover-only')
    assert.equal(rule('transform', 'translateY(calc(var(--space-6) * -1))', true), 'value')
  })

  it('refuse les valeurs hors liste, même construites avec des tokens', () => {
    const refused: [string, string][] = [
      ...each('color', ['red', 'crimson', 'color-mix(in srgb, var(--color-ink) 60%, transparent)']),
      ...each('font-family', ['Arial', "'Montserrat', sans-serif"]),
      ['font-weight', '800'],
      ['font-size', 'calc(var(--text-lg) * 1.13)'],
      ['margin-left', 'calc(var(--space-1) - var(--space-9))'],
      ['margin-inline', 'calc(-1 * var(--space-9))'],
      ['position', 'fixed'],
      ['opacity', '0.7'],
      ['padding', '18px 36px'],
      ['width', '720px'],
    ]
    for (const [property, value] of refused) assert.equal(rule(property, value), 'value', `${property}: ${value}`)
  })

  it('refuse toute ressource externe, propriété inconnue, nouveau token ou token inexistant', () => {
    assert.equal(rule('background-image', 'url(https://x.test/a.jpg)'), 'external')
    assert.equal(rule('background', 'url(a.png)'), 'external')
    assert.equal(rule('background', '\\75 rl(h\\74tps:\\2f\\2f x.test/a.png)'), 'external')
    for (const property of ['filter', 'backdrop-filter', 'mix-blend-mode', 'content', 'visibility', 'overflow']) {
      assert.equal(rule(property, 'none'), 'property', property)
    }
    assert.equal(rule('--brand', 'red'), 'custom-property')
    assert.equal(rule('padding', 'var(--space-10)'), 'unknown-token')
    // Le nom d’une variable CSS est sensible à la casse : --LAYOUT-SECTION n’est pas un token.
    assert.equal(rule('margin', 'VAR(--LAYOUT-SECTION)'), 'unknown-token')
  })

  it('dit ce qui est refusé et ce qui est permis', () => {
    assert.equal(
      checkValue('font-size', 'calc(var(--text-lg) * 1.13)', sets, { hover: false })?.message,
      'Value not allowed for `font-size`: `calc(var(--text-lg) * 1.13)`. Allowed: a size token (var(--text-…)) or inherit.',
    )
    assert.equal(checkValue('filter', 'blur(2px)', sets, { hover: false })?.message, 'Property not allowed in the editor: `filter`.')
  })

  it('refuse un mot-clé CSS qui n’est pas en minuscules, sauf currentColor (règle case)', () => {
    const refused: [string, string][] = [
      ...each('display', ['NONE', 'None', 'Block']),
      ['position', 'RELATIVE'],
      ['text-align', 'Center'],
      ['flex-direction', 'ROW'],
      ['justify-content', 'Space-Between'],
      ['font-style', 'Italic'],
      ['text-transform', 'UPPERCASE'],
      ['width', 'AUTO'],
      ['margin-inline', 'Auto'],
      ['color', 'Transparent'],
      ['border', '1px SOLID var(--color-rose)'],
      ['transition', 'color 200ms EASE'],
      ['flex', '0 0 AUTO'],
    ]
    for (const [property, value] of refused) assert.equal(rule(property, value), 'case', `${property}: ${value}`)
    // `fixed` est refusé pour lui-même, pas seulement pour sa casse.
    assert.equal(rule('position', 'Fixed'), 'value')
    for (const value of ['currentcolor', 'currentColor', 'CURRENTCOLOR']) assert.equal(rule('color', value), null, value)
    assert.equal(rule('border', '1px solid currentColor'), null)
    assert.equal(
      checkValue('display', 'None', sets, { hover: false })?.message,
      'Value not allowed for `display`: `None`. Write CSS keywords in lowercase: `none`.',
    )
  })

  it('refuse toute fonction d’image comme ressource externe', () => {
    for (const value of [
      'image("a.png")',
      'image-set("a.png" 1x)',
      '-webkit-image-set("a.png" 1x)',
      'src("a.png")',
      'element(#hero)',
      '-moz-element(#hero)',
      'IMAGE("a.png")',
    ]) {
      assert.ok(EXTERNAL_RESOURCE.test(value), value)
      assert.equal(rule('background-image', value), 'external', value)
    }
  })

  it('refuse une valeur de plus de 200 caractères avant toute expression régulière, en moins de 50 ms', () => {
    const transition = Array(11).fill('color 200ms ease').join(', ')
    assert.equal(transition.length, 196)
    assert.equal(rule('transition', transition), null)
    assert.equal(MAX_VALUE_LENGTH, 200)
    assert.equal(rule('transition', `${transition}, color 1s`), 'value')
    // Valeurs de 100 000 caractères qui font reculer les expressions régulières (\d*\.?\d+, sous-chaînes répétées).
    for (const [property, value] of [
      ['transition-duration', `${'1'.repeat(100_000)}x`],
      ['line-height', `${'1'.repeat(100_000)}x`],
      ['color', 'a-'.repeat(50_000)],
    ]) {
      const start = performance.now()
      const problem = checkValue(property, value, sets, { hover: false })
      const elapsed = performance.now() - start
      assert.equal(problem?.rule, 'value', property)
      assert.equal(problem?.message, `Value too long for \`${property}\`: ${value.length} characters (200 at most).`)
      assert.ok(elapsed < 50, `${property} : ${elapsed.toFixed(1)} ms`)
    }
  })

  it('vérifie le nom de toute référence var(), même suivie d’une valeur de repli', () => {
    assert.equal(rule('color', 'var(--nope, red)'), 'unknown-token')
    assert.equal(rule('color', 'var(--nope,red)'), 'unknown-token')
    assert.equal(rule('color', 'var(--color-ink, var(--nope))'), 'unknown-token')
    assert.equal(checkValue('color', 'var(--nope, red)', sets, { hover: false })?.message, 'Unknown token: `var(--nope)`.')
    // Token existant avec une valeur de repli : jamais dans la liste permise.
    assert.equal(rule('color', 'var(--color-ink, red)'), 'value')
  })

  it('refuse tout caractère invisible ou non ASCII dans une valeur ou un nom de propriété', () => {
    for (const char of NOT_BLANKS) {
      const label = code(char)
      for (const [property, value] of [
        ['display', `block${char}`],
        ['display', `${char}block`],
        ['color', `var(--color-ink)${char}`],
        ['gap', `var(--space-1)${char}var(--space-2)`],
      ]) {
        const problem = checkValue(property, value, sets, { hover: false })
        assert.equal(problem?.rule, 'value', `${label} ${property}`)
        assert.equal(
          problem?.message,
          `Invisible or non-ASCII character (${label}) in the value of \`${property}\`: ` +
            'only printable ASCII characters are allowed.',
        )
      }
      assert.equal(checkValue(`display${char}`, 'block', sets, { hover: false })?.rule, 'property', label)
    }
    // KELVIN SIGN (U+212A) : toLowerCase() de JavaScript en fait un k ; pour le navigateur, une propriété inconnue.
    const kelvin = checkValue('bac\u212Aground-color', 'var(--color-ink)', sets, { hover: false })
    assert.equal(kelvin?.rule, 'property')
    assert.equal(
      kelvin?.message,
      'Invisible or non-ASCII character (U+212A) in a property name: only printable ASCII characters are allowed.',
    )
    assert.equal(rule('COLOR', 'var(--color-ink)'), null)
  })
})

describe('isGrantableValue', () => {
  it('n’accorde en dur qu’une valeur courte, sans calcul ni négatif, dont chaque var() nomme un token sans repli', () => {
    for (const value of ['40px', '#1b3a6b', 'rgb(248 250 252 / 0.6)', 'var(--color-ink)', '1px solid var(--color-rose)']) {
      assert.equal(isGrantableValue(value, sets), true, value)
    }
    for (const value of [
      'var(--color-ink, red)',
      'var(--nope)',
      'var(--nope, 10px)',
      'VAR(--color-ink)',
      'var(--color-ink',
      'calc(1px + 2px)',
      '0 -5px',
      `${'1'.repeat(201)}px`,
    ]) {
      assert.equal(isGrantableValue(value, sets), false, value)
    }
    const start = performance.now()
    assert.equal(isGrantableValue('a-'.repeat(50_000), sets), false)
    const elapsed = performance.now() - start
    assert.ok(elapsed < 50, `${elapsed.toFixed(1)} ms`)
  })

  it('n’accorde une couleur que numérique et mesurable : ni couleur relative, ni none, ni var() dedans (relecture tâche 26)', () => {
    // Chrome calcule `rgb(from var(--color-night) r g b)` en `color(srgb 0.0588 0.0902 0.1647)`, que le contrôle du
    // contraste ne lit pas : accordée, elle rendait le logo de la couleur de son fond, ou invisible (alpha 0), sans refus.
    for (const value of [
      'rgb(from var(--color-night) r g b)',
      'rgb(from var(--color-rose) r g b / 0)',
      'hsla(from var(--color-night) h s l / 1)',
      'rgb(none 0 0)',
      'rgb(0 0 0 / none)',
      'rgb(var(--color-night))',
      'rgb(1 2 3',
      '#0000',
      '#e11d4880',
      '1px solid #12345',
    ]) {
      assert.equal(isGrantableValue(value, sets), false, value)
    }
    // Valeurs en dur du passage de référence (1-reference), et les écritures numériques courantes.
    for (const value of [
      '#ff5f00',
      '#1B3A6B',
      '#D4A017',
      '#fff',
      'rgb(255 255 255 / 0.7)',
      'rgb(255 255 255/0.7)',
      'rgba(1, 2, 3, 0.5)',
      'rgb(10% 20% 30%)',
      'hsl(210 40% 98%)',
      'hsl(210deg 40% 98% / 0.5)',
      'hsla(0.5turn, 40%, 98%, 50%)',
      '1px solid rgb(0 0 0 / 0.3)',
    ]) {
      assert.equal(isGrantableValue(value, sets), true, value)
    }
  })

  it('n’accorde jamais une valeur qui contient un caractère invisible ou non ASCII', () => {
    for (const char of [...NOT_BLANKS, 'é']) {
      for (const value of [`40px${char}`, `${char}#1b3a6b`, `1px solid${char}var(--color-rose)`]) {
        assert.equal(isGrantableValue(value, sets), false, `${code(char)} ${value}`)
      }
    }
  })
})

describe('normalizeValue', () => {
  it('réunit une valeur écrite sur plusieurs lignes', () => {
    assert.equal(normalizeValue('\n    box-shadow 200ms ease,\n    transform 200ms ease'), 'box-shadow 200ms ease, transform 200ms ease')
    assert.equal(normalizeValue('repeat( 3 ,1fr )'), 'repeat(3, 1fr)')
  })

  it('ne réduit que les blancs CSS (espace, tabulation, LF, CR, FF), jamais U+00A0, U+FEFF, U+2003, U+2028 ni \\v', () => {
    assert.equal(normalizeValue(' \t\f\r\nrepeat(\f3\t,\r\n1fr\f)\t'), 'repeat(3, 1fr)')
    assert.equal(normalizeValue('a,'), 'a,')
    for (const char of NOT_BLANKS) {
      for (const value of [`block${char}`, `${char}block`, `var(--space-1)${char}var(--space-2)`, `repeat(${char}3, 1fr)`]) {
        assert.equal(normalizeValue(value), value, `${code(char)} ${value}`)
      }
    }
  })
})

describe('NEGATIVE_OR_CALC', () => {
  it('repère un nombre négatif, un calc(), un min(), un max() ou un clamp(), où qu’il soit dans la valeur', () => {
    for (const value of ['-2rem', '0 -5px', 'calc(1px + 2px)', 'translateY(-.5rem)', 'min(0px, 1px - 9rem)', 'max(-1rem, 0px)', 'clamp(1rem, 2vw, 3rem)']) {
      assert.ok(NEGATIVE_OR_CALC.test(value), value)
    }
    for (const value of ['40px', 'var(--space-1)', 'background-color 0.2s ease-in-out', 'rgb(248 250 252 / 0.6)']) {
      assert.ok(!NEGATIVE_OR_CALC.test(value), value)
    }
  })

  it('en dur, n’accepte que des nombres positifs et les fonctions rgb(), rgba(), hsl(), hsla() et var()', () => {
    const refused = [
      // Toute autre fonction peut calculer un négatif, charger une image ou lire autre chose que les tokens.
      'round(1px - 9rem, 1px)',
      'round(0rem - var(--space-9), 1px)',
      'round(2*-1rem, 1px)',
      'round(up, 999px * cos(180deg), 1px)',
      'round(up,1px*-99,1px)',
      'mod(1px - 9rem, 100rem)',
      'rem(1px, 9rem)',
      'translateX(round(0px - 9rem, 1px))',
      'abs(1rem)',
      'sign(1rem)',
      'sin(1deg)',
      'tan(1deg)',
      'asin(1)',
      'acos(1)',
      'atan(1)',
      'atan2(1, 1)',
      'pow(2, 3)',
      'sqrt(4)',
      'hypot(1px)',
      'log(2)',
      'exp(1)',
      'calc-size(auto, size)',
      'url(a.png)',
      'image("a.png")',
      'src("a.png")',
      'element(#hero)',
      '-moz-element(#hero)',
      'env(safe-area-inset-left)',
      'attr(data-x)',
      'fonction-inconnue(1px)',
      'ROUND(1px, 1px)',
      '(1px)',
      'repeat(3, minmax(0, 1fr))',
      'translateY(calc(var(--space-1) * -1))',
      // Un échappement CSS peut masquer le nom d’une fonction : c\61lc( vaut calc(.
      'c\\61lc(1px)',
      // Nombre négatif collé à un opérateur, à une parenthèse, à une virgule, à un nombre ou en début de valeur.
      '-1px',
      '1px*-1',
      '1px/-1',
      '0+-1px',
      '0 (-1px)',
      '1px,-1px',
      'var(--space-1,-1px)',
      '0-5px',
      '0e0-5px',
      '50%-5px',
      '.5-3px',
    ]
    for (const value of refused) assert.ok(NEGATIVE_OR_CALC.test(value), value)
    const accepted = [
      '40px',
      '#1b3a6b',
      'rgb(0 0 0 / 0.7)',
      'rgba(0, 0, 0, 0.7)',
      'hsl(210 40% 98%)',
      'hsla(210, 40%, 98%, 0.5)',
      'var(--color-rose)',
      '1px solid var(--color-night-soft)',
      // Un tiret dans un identifiant n’est pas un signe moins.
      'var(--space-1) var(--space-2)',
      'ease-out',
      'box-shadow 0.2s ease-in-out',
    ]
    for (const value of accepted) assert.ok(!NEGATIVE_OR_CALC.test(value), value)
  })
})

describe('isExemptable', () => {
  it('une valeur en dur accordée peut remplacer un token, jamais pour la police, l’opacité ou la mise en page', () => {
    for (const property of ['font-size', 'color', 'max-width']) assert.equal(isExemptable(property), true, property)
    for (const property of ['font-family', 'opacity', 'display', 'position', 'transform', 'filter', 'constructor']) {
      assert.equal(isExemptable(property), false, property)
    }
  })

  it('une image ne s’écrit jamais en dur, même accordée', () => {
    assert.equal(isExemptable('background-image'), false)
    assert.equal(isExemptable('Background-Image'), false)
  })

  it('un contour ou une ombre ne s’écrit jamais en dur, même accordé : tokens et 1px solid seulement', () => {
    // Relecture : `outline: 40px solid #0f172a` ou `box-shadow: 0 0 0 30px #0f172a`, accordés, masquent le texte voisin ;
    // ni le relevé des lignes recouvertes (elementFromPoint ignore contour et ombre) ni un état ne le verraient.
    for (const property of ['outline', 'outline-offset', 'box-shadow', 'Box-Shadow', 'OUTLINE']) {
      assert.equal(isExemptable(property), false, property)
    }
    assert.equal(rule('outline', '1px solid var(--color-rose)'), null)
    assert.equal(rule('outline-offset', 'var(--space-1)'), null)
    assert.equal(rule('box-shadow', 'var(--shadow-glow)'), null)
    assert.equal(rule('outline', '40px solid #0f172a'), 'value')
    assert.equal(rule('box-shadow', '0 0 0 30px #0f172a'), 'value')
  })

  it('un décalage ne s’écrit jamais en dur, même accordé, ni en token : 0 ou auto seulement', () => {
    const offsets = ['top', 'right', 'bottom', 'left', 'inset', 'Top', 'inset-block', 'inset-inline']
    for (const property of [...offsets, 'inset-block-start', 'inset-block-end', 'inset-inline-start', 'inset-inline-end']) {
      assert.equal(isExemptable(property), false, property)
    }
    assert.equal(rule('top', '0'), null)
    assert.equal(rule('left', 'auto'), null)
    assert.equal(rule('inset', '0 auto'), null)
    // Un token déplacerait la zone ou un élément : la capture ne le verrait pas dans :hover ou :focus-visible.
    assert.equal(rule('top', 'var(--space-3)'), 'value')
    assert.equal(rule('bottom', 'var(--space-9)', true), 'value')
    assert.equal(rule('inset', 'var(--space-1) auto'), 'value')
    const message = checkValue('right', 'var(--space-1)', sets, { hover: false })?.message ?? ''
    assert.match(message, /Allowed: 0 or auto \(.*to add space, use margin or padding\)\.$/)
  })
})
