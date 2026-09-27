/**
 * Contrôle du HTML public servi (fichiers .html d'une série de captures, ou pages en direct).
 *
 *   npx tsx scripts/site-baseline/check-html.ts <dossier>             les .html de capture.ts
 *   npx tsx scripts/site-baseline/check-html.ts --live [--base URL]   /, /blog et le 1er article
 *
 * Refuse (code 1) : un attribut data-edit* (réservé à l'aperçu de l'éditeur, KZ_EDITOR_PREVIEW=1) ou
 * des caractères d'encodage stega (réservés au Draft Mode). Affiche aussi les balises du <head> qui
 * comptent pour le SEO (title, description, robots, og:*, icônes) pour comparer deux séries.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

// Caractères invisibles utilisés par @vercel/stega (largeur nulle, marques de format).
const STEGA = /[​-‍⁠-⁤﻿]{4,}/

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i > -1 ? process.argv[i + 1] : undefined
}

async function pages(): Promise<{ name: string; html: string }[]> {
  if (process.argv.includes('--live')) {
    const base = arg('--base') ?? 'http://127.0.0.1:4040'
    const blog = await (await fetch(`${base}/blog`)).text()
    const slug = blog.match(/href="\/blog\/([^"/?#]+)"/)?.[1]
    const paths = ['/', '/blog', ...(slug ? [`/blog/${slug}`] : [])]
    return Promise.all(paths.map(async (path) => ({ name: path, html: await (await fetch(`${base}${path}`)).text() })))
  }
  const dir = resolve(process.argv[2] ?? '.')
  return readdirSync(dir)
    .filter((file) => file.endsWith('.html'))
    .map((file) => ({ name: file, html: readFileSync(join(dir, file), 'utf8') }))
}

// Tout le document : Next 16 peut diffuser les métadonnées après le <head> (streaming metadata, pour
// les navigateurs ; les robots les reçoivent dans le <head>).
function seoHead(html: string): string[] {
  return Array.from(
    html.matchAll(/<title>[^<]*<\/title>|<meta (?:name|property)="(?:description|robots|og:[^"]+|twitter:[^"]+)"[^>]*>|<link rel="(?:icon|shortcut icon|apple-touch-icon)"[^>]*>/g),
    (match) => match[0],
  )
}

async function main() {
  let failures = 0
  for (const { name, html } of await pages()) {
    const dataEdit = html.match(/data-edit(?:-doc|-key)?=/g)?.length ?? 0
    const stega = STEGA.test(html)
    const ok = dataEdit === 0 && !stega
    if (!ok) failures++
    console.log(`${ok ? '✓' : '✗'} ${name} : data-edit ${dataEdit}, stega ${stega ? 'OUI' : 'non'}`)
    for (const tag of seoHead(html)) console.log(`    ${tag}`)
  }
  process.exit(failures ? 1 : 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
