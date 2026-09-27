import { describe, expect, it } from 'vitest'
import { computePosition } from './position'

const viewport = { width: 1000, height: 800 }

describe('computePosition', () => {
  it('place sous l\'ancre, aligné au début', () => {
    const r = computePosition({ top: 100, left: 200, width: 280, height: 34 }, { width: 280, height: 200 }, 'bottom-start', { viewport })
    expect(r).toMatchObject({ top: 138, left: 200, side: 'bottom' })
  })

  it('se retourne au-dessus quand la place manque en bas', () => {
    const r = computePosition({ top: 700, left: 200, width: 100, height: 30 }, { width: 200, height: 200 }, 'bottom-start', { viewport })
    expect(r.side).toBe('top')
    expect(r.top).toBe(700 - 4 - 200)
    expect(r.origin.endsWith('100%')).toBe(true)
  })

  it('reste dans la fenêtre (décalage latéral, marge 8)', () => {
    const r = computePosition({ top: 100, left: 950, width: 40, height: 20 }, { width: 200, height: 50 }, 'bottom-start', { viewport })
    expect(r.left).toBe(1000 - 8 - 200)
  })

  it('centre un tooltip au-dessus', () => {
    const r = computePosition({ top: 300, left: 100, width: 28, height: 28 }, { width: 40, height: 25 }, 'top', { viewport, offset: 6 })
    expect(r).toMatchObject({ side: 'top', top: 300 - 6 - 25, left: 94 })
  })

  it('côtés gauche / droite', () => {
    const r = computePosition({ top: 100, left: 100, width: 50, height: 20 }, { width: 80, height: 40 }, 'right-start', { viewport })
    expect(r).toMatchObject({ side: 'right', left: 154, top: 100 })
  })

  it('donne la place disponible sur l\'axe principal', () => {
    const r = computePosition({ top: 100, left: 0, width: 100, height: 30 }, { width: 100, height: 100 }, 'bottom', { viewport })
    expect(r.available).toBe(800 - 130 - 4 - 8)
  })
})
