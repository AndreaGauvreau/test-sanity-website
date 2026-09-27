import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import {
  type BackgroundLayer,
  colorTone,
  contrastRatio,
  formatRatio,
  parseColor,
  requiredContrast,
  textContrast,
  worstContrast,
} from './contrast'

/**
 * Parité avec le banc (scripts/bench/lib.test.mjs et les ratios relevés sur le passage 1-reference).
 * Couleurs : les hex de src/styles/tokens.json et leurs formes calculées par le navigateur.
 */

const NUIT = 'rgb(15, 23, 42)'
const NUIT_CLAIRE = 'rgb(30, 41, 59)'
const ARDOISE = 'rgb(100, 116, 139)'
const TEXTE = 'rgb(248, 250, 252)'

const round = (ratio: number | null) => (ratio === null ? null : Math.round(ratio * 100) / 100)

// Texte clair de 16 px en graisse normale sur les couches données.
const textOnNight = (layers: BackgroundLayer[]) => textContrast({ color: TEXTE, fontSize: 16, fontWeight: '400', layers })

describe('parseColor', () => {
  it('lit les hex des tokens et les couleurs calculées', () => {
    assert.deepEqual(parseColor('#64748b'), { r: 100, g: 116, b: 139, a: 1 })
    assert.deepEqual(parseColor('#fff'), { r: 255, g: 255, b: 255, a: 1 })
    assert.deepEqual(parseColor('rgb(225, 29, 72)'), { r: 225, g: 29, b: 72, a: 1 })
    assert.deepEqual(parseColor('rgba(0, 0, 0, 0.3)'), { r: 0, g: 0, b: 0, a: 0.3 })
    assert.deepEqual(parseColor('rgb(0 0 0 / 30%)'), { r: 0, g: 0, b: 0, a: 0.3 })
    assert.deepEqual(parseColor('transparent'), { r: 0, g: 0, b: 0, a: 0 })
  })

  it('renvoie null pour une syntaxe qu’il ne lit pas', () => {
    assert.equal(parseColor('pas une couleur'), null)
    assert.equal(parseColor('oklch(0.7 0.1 200)'), null)
  })
})

describe('contrastRatio', () => {
  it('retrouve les ratios relevés par le banc sur les tokens', () => {
    assert.equal(round(contrastRatio('#64748b', '#1e293b')), 3.07)
    assert.equal(round(contrastRatio('#fde68a', '#0f172a')), 14.33)
    assert.equal(round(contrastRatio(ARDOISE, NUIT)), 3.75)
    assert.equal(round(contrastRatio('#f8fafc', '#0f172a')), 17.06)
    assert.equal(round(contrastRatio('#94a3b8', '#1e293b')), 5.71)
    assert.equal(round(contrastRatio('#e11d48', '#0f172a')), 3.8)
    assert.equal(round(contrastRatio('#64748b', '#ffffff')), 4.76)
    assert.equal(round(contrastRatio('#94a3b8', '#0f172a')), 6.96)
    assert.equal(round(contrastRatio('#0f172a', '#ffffff')), 17.85)
  })

  it('garde les cas limites de lib.test.mjs', () => {
    assert.equal(contrastRatio('rgb(0, 0, 0)', 'rgb(255, 255, 255)'), 21)
    assert.equal(contrastRatio('rgb(225, 29, 72)', 'rgb(225, 29, 72)'), 1)
    // Noir à 50 % sur blanc = gris rgb(128, 128, 128).
    assert.equal(
      contrastRatio('rgba(0, 0, 0, 0.5)', 'rgb(255, 255, 255)'),
      contrastRatio('rgb(128, 128, 128)', 'rgb(255, 255, 255)'),
    )
    // Fond transparent composé sur du blanc.
    assert.equal(contrastRatio('rgb(0, 0, 0)', 'rgba(0, 0, 0, 0)'), 21)
    assert.equal(contrastRatio('pas une couleur', 'rgb(255, 255, 255)'), null)
    assert.equal(contrastRatio('rgb(0, 0, 0)', 'pas une couleur'), null)
  })

  it('prend le pire contraste face à un dégradé, et rien derrière une image', () => {
    const image = 'linear-gradient(rgb(15, 23, 42), rgb(120, 26, 57))'
    const worst = Math.min(contrastRatio(TEXTE, NUIT)!, contrastRatio(TEXTE, 'rgb(120, 26, 57)')!)
    assert.equal(worstContrast(TEXTE, NUIT, image), worst)
    assert.equal(worstContrast(TEXTE, NUIT, 'none'), contrastRatio(TEXTE, NUIT))
    assert.equal(worstContrast(TEXTE, NUIT, 'url("/a.png")'), null)
  })
})

describe('requiredContrast', () => {
  it('3 pour un grand texte, 4,5 sinon', () => {
    assert.equal(requiredContrast(24, '400'), 3)
    assert.equal(requiredContrast(23.9, '400'), 4.5)
    assert.equal(requiredContrast(18.66, '700'), 3)
    assert.equal(requiredContrast(18.66, 'bold'), 3)
    assert.equal(requiredContrast(18.66, 600), 4.5)
  })
})

describe('textContrast', () => {
  it('date Ardoise sur la carte Nuit claire : 3,07, sous le seuil', () => {
    const layers = [{ color: NUIT_CLAIRE, image: 'none' }]
    const result = textContrast({ color: ARDOISE, fontSize: 14, fontWeight: '400', layers })
    assert.deepEqual(result, { ratio: 3.07, required: 4.5, ok: false, background: 'rgb(30, 41, 59)' })
  })

  it('compose un fond semi-transparent sur la couche opaque suivante', () => {
    const layers = [
      { color: 'rgba(255, 255, 255, 0.5)', image: 'none' },
      { color: NUIT, image: 'none' },
    ]
    const result = textContrast({ color: 'rgb(0, 0, 0)', fontSize: 16, fontWeight: '400', layers })
    assert.equal(result.background, 'rgb(135, 139, 149)')
    assert.equal(result.ratio, round(contrastRatio('rgb(0, 0, 0)', 'rgb(135, 139, 149)')))
  })

  it('compose sur du blanc quand aucun fond opaque n’est atteint', () => {
    assert.equal(textContrast({ color: 'rgb(0, 0, 0)', fontSize: 16, fontWeight: '400', layers: [] }).ratio, 21)
  })

  it('rend tout inconnu derrière une image url() ou une couleur illisible', () => {
    const image = textOnNight([{ color: NUIT, image: 'url("/a.png")' }])
    assert.deepEqual(image, { ratio: null, required: 4.5, ok: null, background: null })
    const unreadable = textOnNight([{ color: 'oklch(0.2 0.02 260)', image: 'none' }])
    assert.equal(unreadable.ratio, null)
  })

  it('ne lit que les dégradés : toute autre image, même à côté d’un dégradé, rend le fond inconnu', () => {
    const gradient = 'linear-gradient(rgb(15, 23, 42), rgb(15, 23, 42))'
    // paint() dessine des couleurs qu’on ne lit pas : ignorer la couche donnerait le ratio du seul dégradé.
    const others = [`${gradient}, paint(motif)`, `paint(motif), ${gradient}`, `${gradient}, URL("a.png")`]
    // Parenthèses déséquilibrées, ou cachées dans une chaîne : le découpage en couches ne se fie plus au texte.
    const tricky = [
      `${gradient})`,
      `(${gradient}`,
      'linear-gradient(rgb(15, 23, 42), url("x)")',
      'linear-gradient(rgb(15, 23, 42), "("), paint(x))',
    ]
    for (const image of [...others, '-webkit-cross-fade(none, none, 50%)', ...tricky]) {
      assert.equal(worstContrast(TEXTE, NUIT, image), null, image)
      assert.equal(textOnNight([{ color: NUIT, image }]).ratio, null, image)
    }
    // Les dégradés et none restent lus, seuls ou en couches.
    const radial = 'radial-gradient(circle at 50% 50%, rgb(15, 23, 42) 0%, rgb(120, 26, 57) 100%)'
    const repeating = 'repeating-linear-gradient(90deg, rgb(15, 23, 42) 0px, rgb(120, 26, 57) 8px)'
    for (const image of [radial, `none, ${gradient}`, `${repeating}, ${gradient}`]) {
      assert.notEqual(worstContrast(TEXTE, NUIT, image), null, image)
      assert.notEqual(textOnNight([{ color: NUIT, image }]).ratio, null, image)
    }
    const worst = Math.min(contrastRatio(TEXTE, NUIT)!, contrastRatio(TEXTE, 'rgb(120, 26, 57)')!)
    assert.equal(worstContrast(TEXTE, NUIT, radial), worst)
    assert.equal(textOnNight([{ color: NUIT, image: radial }]).ratio, round(worst))
  })
})

describe('colorTone et formatRatio', () => {
  it('classe les couleurs du site en claires ou sombres', () => {
    assert.equal(colorTone('#64748b'), 'sombre')
    assert.equal(colorTone('#94a3b8'), 'clair')
    assert.equal(colorTone('#e11d48'), 'sombre')
    assert.equal(colorTone('#fde68a'), 'clair')
    assert.equal(colorTone('pas une couleur'), null)
  })

  it('écrit un ratio avec un point décimal (textes anglais), deux décimales au plus', () => {
    assert.equal(formatRatio(3.074), '3.07')
    assert.equal(formatRatio(17.0629), '17.06')
    assert.equal(formatRatio(4.5), '4.5')
    assert.equal(formatRatio(3), '3')
    assert.equal(formatRatio(1.005), '1')
  })
})
