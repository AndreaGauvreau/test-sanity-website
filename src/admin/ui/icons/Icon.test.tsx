/** @vitest-environment jsdom */
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Icon } from './Icon'
import { ICON_NAMES, ICONS } from './icons.generated'

afterEach(cleanup)

const SOURCE = join(process.cwd(), 'docs/admin/figma/design-system/icons')

describe('icônes générées', () => {
  it('reprend les 75 SVG du Figma, chacun en 18 et 12 px', () => {
    const files = readdirSync(SOURCE).filter((f) => f.endsWith('.svg')).map((f) => f.slice(0, -4)).sort()
    expect(ICON_NAMES.length).toBe(75)
    expect([...ICON_NAMES]).toEqual(files)
    for (const name of ICON_NAMES) {
      expect(ICONS[name][18].length).toBeGreaterThan(0)
      expect(ICONS[name][12].length).toBeGreaterThan(0)
    }
  })

  it('duotone : fond à 30 %, trait seul et logos pleins selon icons/README.md', () => {
    expect(ICONS.house[18].some((p) => p.opacity === 0.3 && p.fill)).toBe(true)
    expect(ICONS.house[18].some((p) => p.stroke === 1.5)).toBe(true)
    expect(ICONS.house[12].some((p) => p.stroke === 1.25)).toBe(true)
    for (const name of ['plus', 'close', 'check', 'chevron-down'] as const) {
      expect(ICONS[name][18].every((p) => p.opacity === undefined)).toBe(true)
    }
    for (const name of ['vercel', 'sanity', 'github', 'claude'] as const) {
      expect(ICONS[name][18].every((p) => p.fill && !p.stroke)).toBe(true)
    }
    expect(ICONS.loader[18].map((p) => p.opacity ?? 1)).toEqual([1, 0.88, 0.75, 0.63, 0.5, 0.38, 0.25, 0.13])
    expect(ICONS.download[18].some((p) => p.evenodd)).toBe(true)
  })
})

describe('<Icon>', () => {
  it('décorative par défaut, en currentColor', () => {
    const { container } = render(<Icon name="house" />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.getAttribute('focusable')).toBe('false')
    expect(svg.getAttribute('viewBox')).toBe('0 0 18 18')
    expect(svg.getAttribute('width')).toBe('18')
    const colors = [...svg.querySelectorAll('path')].flatMap((p) => [p.getAttribute('fill'), p.getAttribute('stroke')]).filter(Boolean)
    expect(new Set(colors)).toEqual(new Set(['currentColor']))
  })

  it('choisit le jeu 12 px sous 13 px, le jeu 18 sinon, ou celui demandé', () => {
    const { container, rerender } = render(<Icon name="search" size={12} />)
    expect(container.querySelector('svg')!.getAttribute('viewBox')).toBe('0 0 12 12')
    rerender(<Icon name="search" size={16} />)
    expect(container.querySelector('svg')!.getAttribute('viewBox')).toBe('0 0 18 18')
    expect(container.querySelector('svg')!.getAttribute('width')).toBe('16')
    rerender(<Icon name="search" size={12} set={18} />)
    expect(container.querySelector('svg')!.getAttribute('viewBox')).toBe('0 0 18 18')
  })

  it('avec un titre : role="img" et <title>', () => {
    const { container } = render(<Icon name="warning" title="Warning" />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('role')).toBe('img')
    expect(svg.getAttribute('aria-hidden')).toBeNull()
    expect(svg.querySelector('title')?.textContent).toBe('Warning')
  })
})
