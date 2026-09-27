import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/*
 * FOLLOWUPS #23 : `.chip:hover:not(:disabled)` (spécificité 0,3,0) l'emportait sur `.chip[data-state='on']` (0,2,0)
 * → une chip active survolée prenait le fond bg/input-hover avec le texte text/inverse (#111 sur #2b2b2b, illisible).
 * jsdom ne simule pas :hover : on contrôle les règles elles-mêmes.
 */
const css = readFileSync(fileURLToPath(new URL('./Chip.module.css', import.meta.url)), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({ selector: selector.trim(), body }))

describe('Chip.module.css — survol', () => {
  it('toute règle :hover est limitée à un état (off ou on)', () => {
    const hover = rules.filter((rule) => rule.selector.includes(':hover'))
    expect(hover.length).toBeGreaterThan(0)
    for (const rule of hover) expect(rule.selector).toMatch(/\[data-state='(off|on)'\]/)
  })

  it('le survol d’une chip « off » ne touche pas une chip « on »', () => {
    const off = rules.find((rule) => rule.selector.includes(":hover") && rule.selector.includes("[data-state='off']"))
    expect(off?.body).toContain('var(--k-bg-input-hover)')
  })

  it('une chip « on » survolée garde un fond clair et le texte inversé', () => {
    const on = rules.find((rule) => rule.selector.includes(':hover') && rule.selector.includes("[data-state='on']"))
    expect(on).toBeDefined()
    // Le fond reste dominé par bg/inverse (mélange à 88 %), jamais le bg/input-hover sombre de l'état off.
    expect(on?.body).not.toMatch(/background-color:\s*var\(--k-bg-input-hover\)/)
    expect(on?.body).toMatch(/background-color:\s*color-mix\(in srgb, var\(--k-bg-inverse\) 88%/)
    expect(on?.body).not.toMatch(/(^|[\s;])color:/) // le texte reste text/inverse (règle on)
  })
})
