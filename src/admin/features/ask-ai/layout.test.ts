import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// FOLLOWUPS #41 (ask-ai) : le panneau lit la couche et la géométrie de la coque dans les tokens, sans valeurs recopiées.
const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

function hostRule(): string {
  const css = read('src/admin/features/ask-ai/AskAiProvider.module.css')
  const start = css.indexOf('.host {')
  if (start < 0) throw new Error('.host absent de AskAiProvider.module.css')
  return css.slice(start, css.indexOf('}', start))
}

describe('Ask AI — position et couche du panneau (#41)', () => {
  it('couche : var(--k-z-panel), défini dans tokens.css sous --k-z-overlay', () => {
    const rule = hostRule()
    expect(rule).toMatch(/z-index:\s*var\(--k-z-panel\);/)
    expect(rule).not.toMatch(/--k-z-popover/)
    const tokens = read('src/admin/ui/tokens.css')
    const z = (name: string) => Number(tokens.match(new RegExp(`--k-z-${name}:\\s*(\\d+)\\s*;`))?.[1])
    expect(z('panel')).toBeLessThan(z('overlay'))
  })

  it('position : var(--kz-sidebar-width) / var(--kz-topbar-height), exposées sur la racine de l’admin', () => {
    const rule = hostRule()
    expect(rule).toMatch(/top:\s*calc\(var\(--kz-topbar-height\) \+ var\(--k-space-8\)\);/)
    expect(rule).toMatch(/left:\s*calc\(var\(--kz-sidebar-width\) \+ var\(--k-space-8\)\);/)
    // Plus aucune valeur de la coque recopiée en dur.
    expect(rule).not.toMatch(/\b(240|48)px\b/)
    const root = read('src/admin/shell/AdminRoot.module.css')
    expect(root).toMatch(/--kz-sidebar-width:\s*\d+px;/)
    expect(root).toMatch(/--kz-topbar-height:\s*\d+px;/)
  })
})
