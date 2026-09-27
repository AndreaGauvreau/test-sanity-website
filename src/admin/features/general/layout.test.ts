import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * FOLLOWUPS #26 : à 1 024 px, B2 débordait (colonne des aperçus fixe 440 à côté d'un formulaire écrasé, libellé
 * « Favicon » en colonne d'une lettre). jsdom ne calcule pas la mise en page : on vérifie les règles CSS et
 * l'arithmétique des largeurs (sidebar 240, pad 40 + 40, gap 32) aux largeurs d'écran visées.
 */

const css = readFileSync(join(__dirname, 'general.module.css'), 'utf8')

function rule(selector: string): string {
  const match = css.match(new RegExp(`(^|\\n)\\.${selector}\\s*\\{([^}]*)\\}`))
  if (!match) throw new Error(`règle .${selector} introuvable`)
  return match[2]
}

function px(body: string, prop: string): number {
  const m = body.match(new RegExp(`${prop}:\\s*([^;]+);`))
  if (!m) throw new Error(`${prop} absent`)
  const n = m[1].match(/(\d+)px/)
  if (!n) throw new Error(`${prop} sans px : ${m[1]}`)
  return Number(n[1])
}

const SIDEBAR = 240
const PAD_X = 2 * 40
const GAP = 32
const IMAGE_GAP = 16
const PREVIEWS = 440
const FAVICONS = 2 * 180 + 16

/** Largeur utile de .layout pour une largeur d'écran (plafonnée à 1 120 comme ContentArea). */
const inner = (viewport: number) => Math.min(viewport - SIDEBAR - PAD_X, 1120)

describe('B2 · mise en page étroite (FOLLOWUPS #26)', () => {
  it('les deux rangées passent à la ligne au lieu de déborder', () => {
    expect(rule('layout')).toMatch(/flex-wrap:\s*wrap/)
    expect(rule('imageRow')).toMatch(/flex-wrap:\s*wrap/)
  })

  it('à 1 024 px : aperçus sous le formulaire, favicons à côté d’une colonne de libellés lisible', () => {
    const formBasis = px(rule('form'), 'flex')
    const metaBasis = px(rule('meta'), 'flex')
    const width = inner(1024)
    expect(formBasis + GAP + PREVIEWS).toBeGreaterThan(width)
    expect(width - IMAGE_GAP - FAVICONS).toBeGreaterThanOrEqual(metaBasis)
    expect(metaBasis).toBeGreaterThanOrEqual(120)
  })

  it('à 1 440 px (Figma) : aperçus à droite, libellés à côté des favicons', () => {
    const formBasis = px(rule('form'), 'flex')
    const metaBasis = px(rule('meta'), 'flex')
    const form = inner(1440) - GAP - PREVIEWS
    expect(form).toBeGreaterThanOrEqual(formBasis)
    expect(form - IMAGE_GAP - FAVICONS).toBeGreaterThanOrEqual(metaBasis)
  })
})
