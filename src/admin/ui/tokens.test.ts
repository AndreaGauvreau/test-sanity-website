import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Ordre des couches du kit (FOLLOWUPS #10 et #23) : lu directement dans tokens.css.
const css = readFileSync(fileURLToPath(new URL('./tokens.css', import.meta.url)), 'utf8')

function zToken(name: string): number {
  const match = css.match(new RegExp(`--k-z-${name}:\\s*(\\d+)\\s*;`))
  if (!match) throw new Error(`--k-z-${name} absent de tokens.css`)
  return Number(match[1])
}

describe('tokens.css — couches (--k-z-*)', () => {
  it('--k-z-overlay vaut 900 (Modal, Drawer : repli codé par ui-composites)', () => {
    expect(zToken('overlay')).toBe(900)
  })

  it('ordre : panel < overlay < popover < toast', () => {
    const panel = zToken('panel')
    const overlay = zToken('overlay')
    const popover = zToken('popover')
    const toast = zToken('toast')
    expect(panel).toBeLessThan(overlay)
    expect(overlay).toBeLessThan(popover)
    expect(popover).toBeLessThan(toast)
  })

  it('--k-z-panel vaut 800 (panneau Ask AI : calc(popover - 200) aujourd’hui)', () => {
    expect(zToken('panel')).toBe(800)
  })
})
