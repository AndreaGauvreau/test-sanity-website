/**
 * Captures de référence du site public (preuve de rendu identique).
 *
 *   npx tsx scripts/site-baseline/capture.ts <dossier> [--base http://127.0.0.1:4040] [--post <slug>]
 *
 * Pour chaque page (/, /blog, /blog/<slug>) et chaque largeur (375, 768, 1280, 1440) :
 * - capture pleine page PNG, animations et transitions coupées, indicateur de dev de Next masqué,
 *   heure de génération (RenderStamp, change à chaque requête en dev) masquée par un aplat ;
 * - texte visible (`innerText` du body) dans un .txt ;
 * - HTML servi (sans JavaScript) dans un .html, pour vérifier l'absence de data-edit et de stega.
 *
 * Chrome installé (/Applications/Google Chrome.app, channel « chrome ») via playwright-core.
 * Lecture seule : ce script n'écrit que dans <dossier>.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { chromium, type Page } from 'playwright-core'

export const WIDTHS = [375, 768, 1280, 1440] as const

// Rendu déterministe : sans eux, deux captures successives des images du CDN diffèrent de quelques
// niveaux (rastérisation GPU et décodage par tuiles). Vérifié : 194 185 px d'écart sans, 0 avec.
const CHROME_ARGS = [
  '--disable-gpu',
  '--force-color-profile=srgb',
  '--disable-lcd-text',
  '--font-render-hinting=none',
  '--disable-partial-raster',
  '--disable-skia-runtime-opts',
  '--disable-threaded-animation',
  '--disable-threaded-scrolling',
  '--disable-checker-imaging',
  '--disable-image-animation-resync',
  '--run-all-compositor-stages-before-draw',
  '--deterministic-mode',
]

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i > -1 ? process.argv[i + 1] : undefined
}

// Neutralise tout ce qui bouge : animations, transitions, curseur, défilement doux, indicateur de dev.
const FREEZE_CSS = `
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
    caret-color: transparent !important;
    scroll-behavior: auto !important;
  }
  nextjs-portal { display: none !important; }
`

async function settle(page: Page) {
  await page.addStyleTag({ content: FREEZE_CSS })
  await page.evaluate(() => document.fonts.ready)
  // Fait défiler la page pour déclencher les images en lazy loading, puis revient en haut.
  await page.evaluate(async () => {
    const step = Math.max(200, Math.floor(window.innerHeight * 0.8))
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y)
      await new Promise((r) => setTimeout(r, 60))
    }
    window.scrollTo(0, 0)
  })
  await page.waitForLoadState('networkidle')
  await page.evaluate(async () => {
    const imgs = Array.from(document.images)
    await Promise.all(
      imgs.map((img) =>
        img.complete ? Promise.resolve() : new Promise((r) => { img.onload = r; img.onerror = r }),
      ),
    )
    // Décodage complet avant la capture (sinon un décodage progressif peut être photographié).
    await Promise.all(imgs.map((img) => img.decode().catch(() => undefined)))
    // Ruban Insights : défilement horizontal remis à zéro.
    document.querySelectorAll<HTMLElement>('[role="group"]').forEach((el) => { el.scrollLeft = 0 })
  })
  await page.waitForTimeout(300)
}

async function main() {
  const out = process.argv[2]
  if (!out || out.startsWith('--')) {
    console.error('Usage : npx tsx scripts/site-baseline/capture.ts <dossier> [--base URL] [--post slug]')
    process.exit(1)
  }
  const base = arg('--base') ?? 'http://127.0.0.1:4040'
  const dir = resolve(out)
  mkdirSync(dir, { recursive: true })

  // Slug d'article : celui donné, sinon le premier lien trouvé sur /blog.
  let slug = arg('--post')
  if (!slug) {
    const html = await (await fetch(`${base}/blog`)).text()
    slug = html.match(/href="\/blog\/([^"/?#]+)"/)?.[1]
  }
  if (!slug) throw new Error('Aucun article trouvé sur /blog : passez --post <slug>')

  const pages: { name: string; path: string }[] = [
    { name: 'home', path: '/' },
    { name: 'blog', path: '/blog' },
    { name: 'post', path: `/blog/${slug}` },
  ]

  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: CHROME_ARGS })
  try {
    for (const p of pages) {
      // HTML servi, tel que le reçoit un robot (sans JS).
      const res = await fetch(`${base}${p.path}`)
      writeFileSync(join(dir, `${p.name}.html`), await res.text())

      for (const width of WIDTHS) {
        const context = await browser.newContext({
          viewport: { width, height: 900 },
          deviceScaleFactor: 1,
          reducedMotion: 'reduce',
          colorScheme: 'light',
        })
        const page = await context.newPage()
        await page.goto(`${base}${p.path}`, { waitUntil: 'networkidle' })
        await settle(page)
        await page.screenshot({
          path: join(dir, `${p.name}-${width}.png`),
          fullPage: true,
          animations: 'disabled',
          mask: [page.locator('[class*="RenderStamp"]')],
          maskColor: '#ff00ff',
        })
        if (width === 1280) {
          // L'heure de génération (RenderStamp) change à chaque requête : remplacée par un repère fixe.
          const text = (await page.evaluate(() => document.body.innerText))
            .replace(/(HTML généré par le serveur à ).*$/gm, '$1<heure>')
          writeFileSync(join(dir, `${p.name}.txt`), text)
        }
        await context.close()
        console.log(`✓ ${p.path} @ ${width}`)
      }
    }
    writeFileSync(join(dir, 'meta.json'), JSON.stringify({ base, slug, widths: WIDTHS, at: new Date().toISOString() }, null, 2))
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
