import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * Plein écran (demande de l'utilisatrice, 2026-09-28) : la zone de contenu de la coque n'a plus le plafond de
 * 1 120 px utiles du Figma. jsdom ne calcule pas la mise en page : on vérifie les règles CSS.
 */
const css = readFileSync(join(__dirname, 'ContentArea.module.css'), 'utf8')

describe('ContentArea · toute la largeur', () => {
  it('aucune largeur maximale, la zone suit la place disponible', () => {
    expect(css).not.toMatch(/max-width/)
    expect(css).toMatch(/\.content\s*\{[^}]*width:\s*100%/)
  })
})
