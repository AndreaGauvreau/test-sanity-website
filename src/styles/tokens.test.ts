import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import type { TokensFile } from '@/admin/core/contracts'

// tokens.json (lu par l'éditeur IA) doit rester le reflet exact de tokens.css (lu par le site).
const root = path.resolve(__dirname, '../..')
const css = readFileSync(path.join(__dirname, 'tokens.css'), 'utf8')
const tokens = JSON.parse(readFileSync(path.join(__dirname, 'tokens.json'), 'utf8')) as TokensFile

const normalize = (value: string) => value.replace(/\s+/g, ' ').trim()

/** Custom properties de tokens.css → valeur (commentaires retirés). */
const declared = new Map(
  Array.from(css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/--([\w-]+)\s*:\s*([^;]+);/g), (match) => [match[1], normalize(match[2])]),
)

const BREAKPOINTS = 'breakpoint'
const PALETTE = /^color-(orange|blue|neutral|slate)-\d+$/

function cssFiles(dir: string): string[] {
  return readdirSync(path.join(root, dir)).flatMap((name) => {
    const rel = path.join(dir, name)
    if (statSync(path.join(root, rel)).isDirectory()) return cssFiles(rel)
    return rel.endsWith('.css') ? [rel] : []
  })
}

describe('src/styles/tokens.json ↔ tokens.css', () => {
  it('chaque token existe dans tokens.css avec la même valeur', () => {
    const problems: string[] = []
    for (const [group, definition] of Object.entries(tokens)) {
      if (group === BREAKPOINTS) continue
      for (const [name, token] of Object.entries(definition.tokens)) {
        if (!declared.has(name)) problems.push(`--${name} absent de tokens.css`)
        else if (declared.get(name) !== normalize(token.value)) problems.push(`--${name} : ${token.value} ≠ ${declared.get(name)}`)
      }
    }
    expect(problems).toEqual([])
  })

  it('chaque token de tokens.css (hors palette) est dans tokens.json', () => {
    const listed = new Set(Object.values(tokens).flatMap((group) => Object.keys(group.tokens)))
    const missing = [...declared.keys()].filter((name) => !PALETTE.test(name) && !listed.has(name))
    expect(missing).toEqual([])
  })

  it('les points de rupture sont ceux du CSS du site (mobile-first, min-width)', () => {
    const used = new Set(
      [...cssFiles('src/components'), ...cssFiles('src/app/(site)')].flatMap((file) =>
        Array.from(readFileSync(path.join(root, file), 'utf8').matchAll(/@media \(min-width: ([\d.]+rem)\)/g), (m) => m[1]),
      ),
    )
    const listed = Object.values(tokens[BREAKPOINTS].tokens).map((token) => token.value)
    expect([...used].sort()).toEqual([...listed].sort())
  })
})
