import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import type { SanityTextBinding, TokensFile, ZonesFile } from '@/admin/core/contracts'
import { recordRules, resolvePath, typeIndex } from '@/sanity/lib/schema-inspect'
import { schemaTypes } from '@/sanity/schemaTypes'

// Moteur (engine-guards) : même validation que celle du chargement du design system à chaque demande.
import { buildDesignSystem, declaredProperties } from '../../engine/src/guards/design-system'

const root = path.resolve(__dirname, '../..')
const read = (file: string) => readFileSync(path.join(root, file), 'utf8')
const zonesFile = JSON.parse(read('src/editor/zones.json')) as ZonesFile
const tokens = JSON.parse(read('src/styles/tokens.json')) as TokensFile
const zones = Object.entries(zonesFile.zones)
const index = typeIndex(schemaTypes)

/** Fichiers .tsx du site (composants et pages). */
function siteSources(dir: string): string[] {
  return readdirSync(path.join(root, dir)).flatMap((name) => {
    const rel = path.join(dir, name)
    if (statSync(path.join(root, rel)).isDirectory()) return siteSources(rel)
    return rel.endsWith('.tsx') ? [rel] : []
  })
}

/** Zones marquées dans le code : editAttrs('<zone>' …) et edit={editAttrs('<zone>')}. */
function markedZones(): Map<string, string[]> {
  const found = new Map<string, string[]>()
  for (const file of [...siteSources('src/components'), ...siteSources('src/app/(site)')]) {
    for (const match of read(file).matchAll(/editAttrs\('([^']+)'/g)) {
      found.set(match[1], [...(found.get(match[1]) ?? []), file])
    }
  }
  return found
}

describe('src/editor/zones.json', () => {
  it('est accepté par le chargement du design system du moteur, sans avertissement', () => {
    const ds = buildDesignSystem({
      tokens,
      zones: zonesFile,
      declared: declaredProperties(read('src/styles/tokens.css')),
    })
    expect(ds.warnings).toEqual([])
    expect(Object.keys(ds.zones)).toHaveLength(zones.length)
  })

  it('chaque zone déclarée est marquée dans son composant, et chaque marquage est déclaré', () => {
    const marked = markedZones()
    const problems: string[] = []
    for (const [id, zone] of zones) {
      const files = marked.get(id)
      if (!files) problems.push(`${id} : aucun editAttrs('${id}') dans le code`)
      else if (!files.some((file) => zone.files.includes(file))) problems.push(`${id} : marqué hors de ses fichiers (${files})`)
    }
    for (const id of marked.keys()) if (!Object.hasOwn(zonesFile.zones, id)) problems.push(`${id} : marqué mais non déclaré`)
    expect(problems).toEqual([])
  })

  it('chaque sélecteur est une classe de son CSS Module ; la première porte le data-edit', () => {
    const problems: string[] = []
    for (const [id, zone] of zones) {
      const css = zone.files.find((file) => file.endsWith('.module.css'))
      const tsx = zone.files.find((file) => file.endsWith('.tsx'))
      if (!css || !tsx) {
        problems.push(`${id} : un CSS Module et un composant attendus`)
        continue
      }
      const source = read(css)
      for (const selector of zone.selectors) {
        if (!new RegExp(`\\${selector}(?![\\w-])`).test(source)) problems.push(`${id} : ${selector} absent de ${css}`)
      }
      // Élément marqué : sa classe (className={styles.x}) apparaît avec editAttrs('<id>') sur la même balise.
      const cls = zone.selectors[0].slice(1)
      const component = read(tsx)
      const tag = new RegExp(`styles\\.${cls}\\b[^>]*?editAttrs\\('${id.replace(/\./g, '\\.')}'|editAttrs\\('${id.replace(/\./g, '\\.')}'[^>]*?styles\\.${cls}\\b`, 's')
      const viaProp = new RegExp(`className=\\{styles\\.${cls}\\}\\s*edit=\\{editAttrs\\('${id.replace(/\./g, '\\.')}'`)
      if (!tag.test(component) && !viaProp.test(component)) problems.push(`${id} : ${zone.selectors[0]} ne porte pas editAttrs('${id}') dans ${tsx}`)
    }
    expect(problems).toEqual([])
  })

  it('les textes Sanity visent des champs existants, avec les limites du schéma', () => {
    const problems: string[] = []
    for (const [id, zone] of zones) {
      if (zone.text?.source !== 'sanity') continue
      const text = zone.text as SanityTextBinding
      const type = index.get(text.document.type)
      if (!type) {
        problems.push(`${id} : type ${text.document.type} inconnu`)
        continue
      }
      for (const [fieldPath, max] of Object.entries(text.fields)) {
        const field = resolvePath(type, fieldPath, index)
        if (!field) {
          problems.push(`${id} : ${fieldPath} absent de ${text.document.type}`)
          continue
        }
        const closed = text.closed?.includes(fieldPath)
        if (closed) {
          if (!field.options?.list) problems.push(`${id} : ${fieldPath} déclaré fermé mais sans liste`)
          continue
        }
        const schemaMax = recordRules(field.validation).max
        if (schemaMax !== max) problems.push(`${id} : ${fieldPath} max ${max} ≠ schéma ${schemaMax}`)
      }
    }
    expect(problems).toEqual([])
  })

  it('les zones d’un élément de tableau marquent aussi la clé (data-edit-key)', () => {
    const problems: string[] = []
    for (const [id, zone] of zones) {
      if (zone.text?.source !== 'sanity' || !Object.keys(zone.text.fields).some((field) => field.includes('$key'))) continue
      const tsx = read(zone.files.find((file) => file.endsWith('.tsx'))!)
      if (!new RegExp(`editAttrs\\('${id.replace(/\./g, '\\.')}', \\{ key:`).test(tsx)) problems.push(`${id} : pas de { key } dans editAttrs`)
    }
    expect(problems).toEqual([])
  })
})
