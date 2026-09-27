/**
 * Comparaison au pixel de deux séries de captures (pixelmatch, seuil 0).
 *
 *   npx tsx scripts/site-baseline/compare.ts <référence> <candidat> [--diff <dossier>]
 *
 * Pour chaque PNG de la référence : même taille exigée, puis nombre de pixels différents (seuil 0,
 * anticrénelage compté comme différence). Écrit une image de différence par capture qui diffère
 * (dans --diff, par défaut <candidat>/diff). Compare aussi les .txt (texte visible).
 * Code de sortie 1 si au moins une différence.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i > -1 ? process.argv[i + 1] : undefined
}

const [refArg, candArg] = process.argv.slice(2)
if (!refArg || !candArg) {
  console.error('Usage : npx tsx scripts/site-baseline/compare.ts <référence> <candidat> [--diff dossier]')
  process.exit(1)
}
const ref = resolve(refArg)
const cand = resolve(candArg)
const diffDir = resolve(arg('--diff') ?? join(cand, 'diff'))

let failures = 0
const report: string[] = []

for (const file of readdirSync(ref).filter((f) => f.endsWith('.png')).sort()) {
  const other = join(cand, file)
  if (!existsSync(other)) {
    report.push(`✗ ${file} : absente du candidat`)
    failures++
    continue
  }
  const a = PNG.sync.read(readFileSync(join(ref, file)))
  const b = PNG.sync.read(readFileSync(other))
  if (a.width !== b.width || a.height !== b.height) {
    report.push(`✗ ${file} : taille ${a.width}×${a.height} → ${b.width}×${b.height}`)
    failures++
    continue
  }
  const diff = new PNG({ width: a.width, height: a.height })
  const n = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0, includeAA: true })
  if (n > 0) {
    mkdirSync(diffDir, { recursive: true })
    writeFileSync(join(diffDir, file), PNG.sync.write(diff))
    report.push(`✗ ${file} : ${n} pixels différents`)
    failures++
  } else {
    report.push(`✓ ${file}`)
  }
}

for (const file of readdirSync(ref).filter((f) => f.endsWith('.txt')).sort()) {
  const other = join(cand, file)
  if (!existsSync(other)) continue
  const same = readFileSync(join(ref, file), 'utf8') === readFileSync(other, 'utf8')
  report.push(`${same ? '✓' : '✗'} ${file} (texte visible)`)
  if (!same) failures++
}

console.log(report.join('\n'))
console.log(failures ? `\n${failures} différence(s).` : '\nAucune différence.')
process.exit(failures ? 1 : 0)
