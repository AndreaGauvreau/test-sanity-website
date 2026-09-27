#!/usr/bin/env node
/**
 * Génère `icons.generated.ts` depuis les SVG exportés du Figma
 * (docs/admin/figma/design-system/icons/*.svg en 18 px et icons/12/*.svg en 12 px).
 *
 * Usage : node src/admin/ui/icons/generate.mjs   (depuis la racine du dépôt)
 *
 * Les SVG ne contiennent que des <path>, tous en #888888 (couleur « Icon color / current » résolue) :
 * chaque tracé devient une entrée de données { d, fill|stroke, opacity, evenodd } rendue en currentColor
 * par <Icon>. Le jeu 12 px est gardé à part (tracés redessinés, trait 1,25) : jamais un simple redimensionnement.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../../../..')
const src18 = join(root, 'docs/admin/figma/design-system/icons')
const src12 = join(src18, '12')
const out = join(here, 'icons.generated.ts')

const COLOR = '#888888'

/** Lit les attributs d'une balise (les exports Figma sont réguliers : attr="valeur"). */
function attrs(tag) {
  const result = {}
  for (const m of tag.matchAll(/([a-zA-Z-]+)="([^"]*)"/g)) result[m[1]] = m[2]
  return result
}

function parse(file, expectedSize) {
  const svg = readFileSync(file, 'utf8')
  const root = svg.match(/<svg\b[^>]*>/)
  if (!root) throw new Error(`${file} : pas de <svg>`)
  const rootAttrs = attrs(root[0])
  // Quelques exports 12 px ont un viewBox de 13 (trait qui déborde du cadre) : l'origine reste 0 0,
  // on garde donc le cadre nominal et l'icône est rendue avec overflow: visible, comme dans Figma.
  const [x, y, w, h] = (rootAttrs.viewBox ?? '').split(' ').map(Number)
  if (x !== 0 || y !== 0 || w < expectedSize || h < expectedSize || w > expectedSize + 1 || h > expectedSize + 1) {
    throw new Error(`${file} : viewBox inattendu ${rootAttrs.viewBox}`)
  }
  const others = [...svg.matchAll(/<([a-zA-Z]+)\b/g)].map((m) => m[1]).filter((t) => t !== 'svg' && t !== 'path')
  if (others.length) throw new Error(`${file} : balises non prises en charge (${others.join(', ')})`)

  return [...svg.matchAll(/<path\b[^>]*\/?>/g)].map((m) => {
    const a = attrs(m[0])
    const path = { d: a.d }
    if (a.fill && a.fill !== 'none') {
      if (a.fill !== COLOR) throw new Error(`${file} : couleur de remplissage inattendue ${a.fill}`)
      path.fill = true
    }
    if (a.stroke) {
      if (a.stroke !== COLOR) throw new Error(`${file} : couleur de trait inattendue ${a.stroke}`)
      path.stroke = Number(a['stroke-width'] ?? 1)
      if (a['stroke-linecap'] && a['stroke-linecap'] !== 'round') throw new Error(`${file} : linecap ${a['stroke-linecap']}`)
      if (a['stroke-linejoin'] && a['stroke-linejoin'] !== 'round') throw new Error(`${file} : linejoin ${a['stroke-linejoin']}`)
    }
    if (a.opacity) path.opacity = Number(a.opacity)
    if (a['fill-rule'] === 'evenodd' || a['clip-rule'] === 'evenodd') path.evenodd = true
    return path
  })
}

const names = readdirSync(src18)
  .filter((f) => f.endsWith('.svg'))
  .map((f) => f.slice(0, -4))
  .sort()

const missing12 = names.filter((n) => !readdirSync(src12).includes(`${n}.svg`))
if (missing12.length) throw new Error(`Variantes 12 px manquantes : ${missing12.join(', ')}`)

const data = {}
for (const name of names) {
  data[name] = { 18: parse(join(src18, `${name}.svg`), 18), 12: parse(join(src12, `${name}.svg`), 12) }
}

const lines = [
  '// FICHIER GÉNÉRÉ par src/admin/ui/icons/generate.mjs — ne pas modifier à la main.',
  `// Source : docs/admin/figma/design-system/icons (${names.length} icônes, 18 px et 12 px).`,
  '',
  "import type { IconPath } from './types'",
  '',
  `export const ICON_NAMES = ${JSON.stringify(names)} as const`,
  '',
  'export type IconName = (typeof ICON_NAMES)[number]',
  '',
  'export const ICONS: Record<IconName, { 18: readonly IconPath[]; 12: readonly IconPath[] }> = {',
  ...names.map((n) => `  ${JSON.stringify(n)}: ${JSON.stringify(data[n])},`),
  '}',
  '',
]
writeFileSync(out, lines.join('\n'))
console.log(`${names.length} icônes → ${out}`)
