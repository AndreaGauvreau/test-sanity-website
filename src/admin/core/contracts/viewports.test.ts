import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  EDITOR_VIEWPORTS,
  isViewport,
  MEASURED_VIEWPORTS,
  MEASURED_VIEWPORTS_TEXT,
  VIEWPORT_NAMES,
  VIEWPORT_WIDTHS,
  viewportOf,
  type TokensFile,
} from '@/admin/core/contracts'

/**
 * Formats de l'aperçu de l'éditeur IA (`EDITOR_VIEWPORTS`, contracts/engine.ts) confrontés aux points de rupture du
 * SITE (`src/styles/tokens.json`, groupe `breakpoint`) : le format Tablet doit montrer la vraie mise en page tablette,
 * et les garde-fous du moteur la mesurer (ils relèvent ces mêmes largeurs). Un site qui change ses points de rupture
 * fait échouer ce test.
 */

const TOKENS = 'src/styles/tokens.json'
const tokens = JSON.parse(readFileSync(path.resolve(__dirname, '../../../styles/tokens.json'), 'utf8')) as TokensFile
const FIX = 'Ajuster EDITOR_VIEWPORTS (src/admin/core/contracts/engine.ts), puis src/editor/RULES.md (engine/src/claude/rules.test.ts le vérifie).'

/** Point de rupture du site en px : une media query en rem se lit sur la taille de police initiale (16 px). */
function breakpointPx(name: 'breakpoint-tablet' | 'breakpoint-desktop'): number {
  const value = tokens.breakpoint?.tokens?.[name]?.value
  const match = /^(\d+(?:\.\d+)?)(rem|px)$/.exec(value?.trim() ?? '')
  if (!match) {
    throw new Error(`${TOKENS} : « ${name} » absent du groupe breakpoint ou illisible (${value ?? 'absent'}) ; les formats de l'éditeur IA en dépendent.`)
  }
  return Number(match[1]) * (match[2] === 'rem' ? 16 : 1)
}

describe('formats de l’aperçu (EDITOR_VIEWPORTS) ↔ points de rupture du site', () => {
  const { desktop, tablet, mobile } = EDITOR_VIEWPORTS

  it('Tablet = breakpoint-tablet du site (rem × 16) : l’aperçu Tablet montre la mise en page tablette', () => {
    const site = breakpointPx('breakpoint-tablet')
    expect(tablet, `Format Tablet (${tablet} px) ≠ breakpoint-tablet de ${TOKENS} (${site} px). ${FIX}`).toBe(site)
  })

  it('Mobile sous Tablet ; Tablet sous breakpoint-desktop ; Desktop au moins breakpoint-desktop', () => {
    const site = breakpointPx('breakpoint-desktop')
    expect(mobile < tablet, `Format Mobile (${mobile} px) pas sous Tablet (${tablet} px) : l’aperçu Mobile ne montrerait pas la mise en page mobile. ${FIX}`).toBe(true)
    expect(tablet < site, `Format Tablet (${tablet} px) pas sous breakpoint-desktop de ${TOKENS} (${site} px) : l’aperçu Tablet montrerait la mise en page desktop. ${FIX}`).toBe(true)
    expect(desktop >= site, `Format Desktop (${desktop} px) sous breakpoint-desktop de ${TOKENS} (${site} px) : l’aperçu Desktop ne montrerait pas la mise en page desktop. ${FIX}`).toBe(true)
  })
})

describe('listes dérivées de EDITOR_VIEWPORTS', () => {
  const { desktop, tablet, mobile } = EDITOR_VIEWPORTS

  it('ordre de la barre d’outils, largeurs croissantes des garde-fous, texte anglais ; tout gelé', () => {
    expect(VIEWPORT_NAMES).toEqual(['desktop', 'tablet', 'mobile'])
    expect(VIEWPORT_WIDTHS).toEqual([desktop, tablet, mobile])
    expect(MEASURED_VIEWPORTS).toEqual([mobile, tablet, desktop])
    expect(MEASURED_VIEWPORTS_TEXT).toBe(`${mobile}, ${tablet} and ${desktop}`)
    for (const list of [EDITOR_VIEWPORTS, VIEWPORT_NAMES, VIEWPORT_WIDTHS, MEASURED_VIEWPORTS]) expect(Object.isFrozen(list)).toBe(true)
  })
})

describe('viewportOf — largeur relue (état de l’éditeur, demande enregistrée, fil)', () => {
  it('un format actuel reste lui-même', () => {
    for (const width of VIEWPORT_WIDTHS) {
      expect(isViewport(width)).toBe(true)
      expect(viewportOf(width)).toBe(width)
    }
  })

  it('768, le Tablet d’avant le 2026-09-28 (demandes du magasin du moteur), s’affiche en Tablet', () => {
    expect(isViewport(768)).toBe(false)
    expect(viewportOf(768)).toBe(EDITOR_VIEWPORTS.tablet)
  })

  it('valeur absente ou illisible : Desktop, le format par défaut', () => {
    for (const value of [undefined, null, '810', Number.NaN, Number.POSITIVE_INFINITY, 0, -375]) {
      expect(isViewport(value)).toBe(false)
      expect(viewportOf(value)).toBe(EDITOR_VIEWPORTS.desktop)
    }
  })
})
