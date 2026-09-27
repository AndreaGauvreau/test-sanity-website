import postcss, { type AtRule, type Declaration, type Rule } from 'postcss'
import type { ChangeSummaryItem, TextChange } from '../../../src/admin/core/contracts'
import type { DesignSystem } from '../guards/design-system'
import type { ChangedFile } from '../guards/types'
import { zoneLabel } from './request'

/**
 * Résumé d'une modification pour le client (« Title: font → Display (token) », « Title: text → “…” (Sanity draft) »),
 * calculé par le moteur d'après ce qui a VRAIMENT changé (fichiers entiers, textes écrits), jamais d'après Claude.
 * En anglais, sans nom de fichier ni de classe.
 */

const MAX_ITEMS = 8

type DeclarationMap = Map<string, { selector: string; property: string; value: string }>

function declarations(css: string | null): DeclarationMap {
  const map: DeclarationMap = new Map()
  if (!css) return map
  let root: postcss.Root
  try {
    root = postcss.parse(css)
  } catch {
    return map
  }
  root.walkDecls((decl: Declaration) => {
    const rule = decl.parent as Rule | undefined
    if (!rule || rule.type !== 'rule') return
    const media = rule.parent && rule.parent.type === 'atrule' ? `@${(rule.parent as AtRule).name} ${(rule.parent as AtRule).params} ` : ''
    const property = decl.prop.toLowerCase()
    map.set(`${media}${rule.selector}|${property}`, { selector: rule.selector, property, value: decl.value.trim() })
  })
  return map
}

/** Libellé d'un token pour `var(--x)` (tokens.json : clé = nom sans « -- », ou groupe-clé). */
function tokenLabels(ds: Pick<DesignSystem, 'tokens'>): Map<string, string> {
  const labels = new Map<string, string>()
  for (const [group, definition] of Object.entries(ds.tokens)) {
    for (const [key, token] of Object.entries(definition.tokens)) {
      labels.set(`--${key}`, token.label)
      if (!labels.has(`--${group}-${key}`)) labels.set(`--${group}-${key}`, token.label)
    }
  }
  return labels
}

function describeValue(value: string, labels: Map<string, string>): string {
  const match = /^var\((--[\w-]+)\)$/.exec(value)
  if (match && labels.has(match[1])) return `${labels.get(match[1])} (token)`
  return value.length > 60 ? `${value.slice(0, 59)}…` : value
}

/** Zone visée à laquelle appartient un sélecteur (première classe dans les sélecteurs de la zone), sinon la première visée du fichier. */
function ownerOf(ds: Pick<DesignSystem, 'zones'>, zones: readonly string[], file: string, selector: string): string | null {
  const classes = selector.match(/\.[A-Za-z_][\w-]*/g) ?? []
  for (const cls of classes) {
    const owner = zones.find((id) => Object.hasOwn(ds.zones, id) && ds.zones[id].selectors.includes(cls))
    if (owner) return owner
  }
  return zones.find((id) => Object.hasOwn(ds.zones, id) && ds.zones[id].files.includes(file)) ?? null
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

export function describeChanges(input: {
  ds: Pick<DesignSystem, 'zones' | 'tokens'>
  zones: readonly string[]
  files: readonly ChangedFile[]
  texts: readonly TextChange[]
  /** Champ Sanity (`<document>:<chemin>`) → zone qui l'affiche. */
  textZones: ReadonlyMap<string, string>
}): ChangeSummaryItem[] {
  const { ds, zones } = input
  const labels = tokenLabels(ds)
  const items: ChangeSummaryItem[] = []
  const fallback = zones[0] ?? ''

  for (const file of input.files) {
    if (file.file.endsWith('.css')) {
      const before = declarations(file.before)
      const after = declarations(file.after)
      for (const [key, now] of after) {
        const was = before.get(key)
        if (was?.value === now.value) continue
        const owner = ownerOf(ds, zones, file.file, now.selector) ?? fallback
        const state = /:(hover|focus-visible|focus|active)\b/.exec(now.selector)?.[1]
        items.push({
          target: zoneLabel(ds, owner),
          description: `${now.property}${state ? ` (${state})` : ''} → ${describeValue(now.value, labels)}`,
          kind: 'style',
          where: 'code',
        })
      }
      for (const [key, was] of before) {
        if (after.has(key)) continue
        const owner = ownerOf(ds, zones, file.file, was.selector) ?? fallback
        items.push({ target: zoneLabel(ds, owner), description: `${was.property} → default`, kind: 'style', where: 'code' })
      }
    } else {
      const owner = zones.find((id) => Object.hasOwn(ds.zones, id) && ds.zones[id].text?.source === 'code' && ds.zones[id].text.files.includes(file.file))
      items.push({ target: zoneLabel(ds, owner ?? fallback), description: 'Text updated', kind: 'text', where: 'code' })
    }
  }
  for (const text of input.texts) {
    const owner = input.textZones.get(`${text.document}:${text.path}`) ?? fallback
    items.push({ target: zoneLabel(ds, owner), description: `Text → “${clip(text.after.replace(/\s+/g, ' '), 80)}”`, kind: 'text', where: 'sanity-draft' })
  }
  // Doublons (même élément, même description) retirés ; au plus MAX_ITEMS lignes.
  const seen = new Set<string>()
  return items.filter((item) => !seen.has(`${item.target}|${item.description}`) && seen.add(`${item.target}|${item.description}`)).slice(0, MAX_ITEMS)
}

/** Clé d'une ligne de résumé : élément, nature, lieu et propriété (« color (hover) », « Text »…), sans la valeur. */
const summaryKey = (item: ChangeSummaryItem) => `${item.target}|${item.kind}|${item.where}|${item.description.split(' → ')[0]}`

/**
 * Résumé cumulé d'une modification : les lignes d'un ajustement REMPLACENT (à leur place) celles de la même propriété du
 * même élément ; les autres s'ajoutent. Le résumé montre donc l'état FINAL (« color → Accent », pas « color → Text » puis
 * « color → Accent »). Sert aussi à relire un résumé ancien enregistré bout à bout (`mergeSummary([], ancien)`).
 */
export function mergeSummary(previous: readonly ChangeSummaryItem[], next: readonly ChangeSummaryItem[]): ChangeSummaryItem[] {
  const merged: ChangeSummaryItem[] = []
  const at = new Map<string, number>()
  for (const item of [...previous, ...next]) {
    const key = summaryKey(item)
    const index = at.get(key)
    if (index === undefined) {
      at.set(key, merged.length)
      merged.push(item)
    } else merged[index] = item
  }
  return merged
}
