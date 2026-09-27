import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import path from 'node:path'
import { afterAll as after, beforeAll as before, describe, it, type TestContext } from 'vitest'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { contrastCheck, coverWarning, frameCheck, reachCheck, unverifiableCheck } from './checks'
import { contrastRatio, formatRatio } from './contrast'
import type { StateMeasure, ZoneMeasure } from './measure'
import { startVisualSession, type VisualSettings } from './visual'

/**
 * Relevé de la zone (READ_ZONE) dans un vrai Chrome, sur une page statique au gabarit du hero du site, servie par un
 * serveur jetable (127.0.0.1, port libre ; aucun des serveurs de l'éditeur). Sauté si aucun navigateur ne se lance.
 */

const BASE =
  'body { margin: 0; font: 16px/1.5 sans-serif; background: #0f172a; color: #f8fafc; }\n' +
  '.hero { padding: 128px 16px; background-color: #0f172a; }\n' +
  '.title { max-width: 18ch; margin: 0; font-size: 40px; line-height: 1.05; color: #f8fafc; }\n' +
  '.accent { font-style: normal; }\n' +
  '.subtitle { max-width: 40rem; margin: 24px 0 32px; color: #94a3b8; font-size: 18px; }\n'

/** Titre du hero, le mot mis en avant (texte entre astérisques) dans un `<em class="accent">`. */
const TITLE = 'Louez une voiture récente à Lyon, *sans surprise* et sans attendre'

/**
 * Gabarit du vrai hero.title : Georgia gras, text-4xl (40 px à 375 px, 72 px à 1280 px), interligne 1.05, 18ch, et les
 * tokens de tokens.json utilisés par les essais (valeurs de tokens.json).
 */
const SITE =
  ':root { --space-2: 0.5rem; --space-4: 1rem; --space-6: 2rem; --space-9: clamp(3rem, 2rem + 5vw, 6rem); ' +
  '--color-night: #0f172a; --color-rose: #e11d48; ' +
  '--text-xs: 0.875rem; --text-lg: clamp(1.125rem, 1rem + 0.6vw, 1.375rem); ' +
  '--text-4xl: clamp(2.5rem, 1.25rem + 5vw, 4.5rem); }\n' +
  'body { margin: 0; font: 16px/1.5 sans-serif; background: #0f172a; color: #f8fafc; }\n' +
  '.hero { padding: 64px 16px; background-color: #0f172a; text-align: left; }\n' +
  ".title { max-width: 18ch; margin: 0; color: #f8fafc; font-family: Georgia, 'Times New Roman', serif; " +
  'font-size: clamp(2.5rem, 1.25rem + 5vw, 4.5rem); font-weight: 700; line-height: 1.05; }\n' +
  '.accent { font-style: normal; }\n' +
  '.subtitle { max-width: 40rem; margin: 32px 0; color: #94a3b8; font-size: 18px; }\n'

const page = (css: string) =>
  '<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>' +
  `${base}${css}</style></head><body>` +
  (body ??
    '<section class="hero" data-edit="hero">' +
      `<h1 class="title" data-edit="hero.title">${heading.replace(/\*([^*]+)\*/, '<em class="accent">$1</em>')}</h1>` +
      '<p class="subtitle" data-edit="hero.subtitle">Des voitures récentes, livrées où vous voulez, ' +
      'quand vous voulez.</p></section>') +
  '</body></html>'

let base = BASE
let heading = TITLE
/** Autre contenu de la page que le hero (cartes répétées…), sinon null. */
let body: string | null = null
let css = ''
let server: Server
let settings: VisualSettings
/** Raison de sauter les tests quand aucun navigateur ne se lance, sinon null. */
let unavailable: string | null = null

before(async () => {
  server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end(page(css))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  settings = { baseUrl: `http://127.0.0.1:${port}`, channel: 'chrome', viewports: [375, 1280] }
  // Même repli que visual.ts : Chrome installé, sinon le Chromium de Playwright.
  try {
    await (await chromium.launch({ channel: 'chrome', headless: true })).close()
  } catch {
    try {
      await (await chromium.launch({ headless: true })).close()
    } catch (error) {
      unavailable = `aucun navigateur ne se lance : ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`
    }
  }
})

after(() => new Promise<void>((resolve) => server.close(() => resolve())))

/**
 * Relevé de la zone sur la page de base, puis sur la page avec ce CSS ajouté ; null si le test est sauté. `page` : autre
 * gabarit (CSS de base), autre titre, autre contenu (`body`), autre occurrence choisie (`index`), ou CSS de la page avant
 * la modification (`initial`, remplacé alors par `added` : règle modifiée). `occurrences` : relevés de chaque occurrence
 * de la zone, avant et après ; `painted` : relevés de peinture de chaque occurrence, avant et après ; `unmeasured` : règles
 * ajoutées ou modifiées sans effet sur les textes de la zone (décision 19) ; `unreadable` : textes que ces règles peignent
 * sous le minimum, là où elles peuvent s'appliquer (décision 19, 4e relecture).
 */
async function measureAround(
  t: TestContext,
  zone: string,
  added: string,
  page: { base?: string; title?: string; body?: string; index?: number; initial?: string } = {},
) {
  if (unavailable) {
    t.skip(unavailable)
    return null
  }
  base = page.base ?? BASE
  heading = page.title ?? TITLE
  body = page.body ?? null
  css = page.initial ?? ''
  const session = await startVisualSession(settings, '/', zone, page.index ?? 0)
  try {
    css = added
    const verdict = await session.verify()
    return {
      before: session.before,
      after: verdict.after,
      occurrences: { before: session.occurrences, after: verdict.occurrences },
      painted: { before: session.painted, after: verdict.painted },
      unmeasured: verdict.unmeasured,
      unreadable: verdict.unreadable,
    }
  } finally {
    await session.close()
  }
}

/** Aucune ligne recouverte, à aucune largeur. */
const uncovered = (measures: ZoneMeasure[]) => measures.every((m) => m.texts.every((text) => !text.coveredLines.length))

/** Lignes et lignes recouvertes de chaque texte, par largeur : « 375: 7/0 1/0 ». */
const coverage = (measures: ZoneMeasure[]) =>
  measures.map((m) => `${m.viewport}: ${m.texts.map((t) => `${t.ownLines}/${t.coveredLines?.length}`).join(' ')}`)

/**
 * Texte recouvert (décision 17) : le contrôle du cadre passe, et l’étape d’avertissement est rendue (vide s’il n’y en a
 * pas).
 */
function warned(measured: { before: ZoneMeasure[]; after: ZoneMeasure[] }): string {
  assert.equal(frameCheck(measured.before, measured.after).ok, true, 'un texte recouvert ne bloque pas')
  return coverWarning(measured.before, measured.after)?.step ?? ''
}

/** État nommé par sa sorte, sa profondeur survolée et sa profondeur focalisée : « hover h1 », « hover-focus h0 f1 ». */
const named = (state: StateMeasure) =>
  `${state.kind}${state.hover === null ? '' : ` h${state.hover}`}${state.focus === null ? '' : ` f${state.focus}`}`

describe('READ_ZONE dans Chrome : lignes recouvertes, ligne par ligne (décision 15)', () => {
  it('sans changement, aucune ligne du titre ni du mot mis en avant n’est recouverte', { timeout: 60_000 }, async (t) => {
    const measured = await measureAround(t, 'hero.title', '')
    if (!measured) return
    for (const m of [...measured.before, ...measured.after]) {
      assert.deepEqual(
        m.texts.map((text) => text.key),
        ['', '0'],
      )
      for (const text of m.texts) {
        assert.ok(text.ownLines > 0, `${m.viewport} px, « ${text.text} » : aucune ligne relevée`)
        assert.deepEqual(text.coveredLines, [], `${m.viewport} px, « ${text.text} » : ${coverage([m])}`)
      }
    }
    assert.equal(frameCheck(measured.before, measured.after).ok, true)
  })

  it(
    'signale le fond du mot mis en avant étendu sur les lignes voisines (padding-block et fond)',
    { timeout: 60_000 },
    async (t) => {
      // Relecture : `.accent { font-style: normal; padding-block: var(--space-9); background-color: var(--color-night) }`
      // sur hero.title passe le contrôle CSS ; le fond du mot mis en avant peint par-dessus les lignes du titre au-dessus
      // de lui. Le titre garde des lignes visibles, et le point qui tombe sur le mot mis en avant n’est pas son texte.
      const measured = await measureAround(t, 'hero.title', '.accent { padding-block: 96px; background-color: #0f172a; }')
      if (!measured) return
      assert.match(
        warned(measured),
        /^Warning: “Louez une voiture[^”]*” partly covered at 375 px \(\d+ of \d+ lines?\)/,
        coverage(measured.after).join(' | '),
      )
      for (const m of measured.after) {
        const title = m.texts.find((text) => text.key === '')!
        assert.ok(title.coveredLines.length > 0 && title.coveredLines.length < title.ownLines, coverage([m]).join(''))
      }
    },
  )

  it(
    'signale un fond de mot mis en avant agrandi de 16 px, qui coupe la ligne du dessus sous sa mi-hauteur (Georgia 40 px)',
    { timeout: 60_000 },
    async (t) => {
      // Relecture : `.accent { padding-block: 16px }` (var(--space-4)) et un fond, sur « Lyon, » : la moitié basse de
      // « voiture » disparaît, alors qu’un relevé à mi-hauteur de chaque ligne n’en voit rien.
      const georgia = SITE.replace('clamp(2.5rem, 1.25rem + 5vw, 4.5rem)', '40px')
      const measured = await measureAround(t, 'hero.title', '.accent { padding-block: 16px; background-color: #0f172a; }', {
        base: georgia,
        title: 'Louez une voiture récente à *Lyon,* sans surprise et sans attendre',
      })
      if (!measured) return
      assert.ok(uncovered(measured.before), coverage(measured.before).join(' | '))
      assert.match(
        warned(measured),
        /^Warning: “Louez une voiture[^”]*” partly covered at 375 px \([^)]*\) and at 1280 px/,
        coverage(measured.after).join(' | '),
      )
    },
  )

  it(
    'signale var(--space-4) à 375 px et var(--space-6) à 1280 px sur le fond du mot mis en avant (text-4xl)',
    { timeout: 60_000 },
    async (t) => {
      // Relecture : sans aucun accord, la moitié haute de « récente » disparaît à 375 px, un quart de la 2e ligne à
      // 1280 px.
      const measured = await measureAround(
        t,
        'hero.title',
        '.accent { padding-block: var(--space-4); background-color: var(--color-night); }\n' +
          '@media (min-width: 64rem) { .accent { padding-block: var(--space-6); } }\n',
        { base: SITE },
      )
      if (!measured) return
      assert.ok(uncovered(measured.before), coverage(measured.before).join(' | '))
      assert.match(
        warned(measured),
        /^Warning: “Louez une voiture[^”]*” partly covered at 375 px \([^)]*\) and at 1280 px/,
        coverage(measured.after).join(' | '),
      )
    },
  )

  it(
    'sans changement, le gabarit du vrai titre (Georgia gras, text-4xl) n’a aucune ligne recouverte',
    { timeout: 60_000 },
    async (t) => {
      const measured = await measureAround(t, 'hero.title', '', { base: SITE })
      if (!measured) return
      const all = [...measured.before, ...measured.after]
      assert.ok(
        all.every((m) => m.texts.length === 2 && m.texts.every((text) => text.ownLines > 0)),
        coverage(all).join(' | '),
      )
      assert.ok(uncovered(all), coverage(all).join(' | '))
      assert.equal(frameCheck(measured.before, measured.after).ok, true)
    },
  )

  it(
    'signale le fond d’un mot mis en avant bien plus grand que le titre, qui mord sur la ligne du dessus',
    { timeout: 60_000 },
    async (t) => {
      // Le texte du mot mis en avant (72 px) déborde de sa ligne sur celle du dessus (28 px) de moins de la moitié de sa
      // hauteur : ce débordement ne doit pas être retiré de la bande de la ligne du dessus, que son fond recouvre.
      const georgia = SITE.replace('clamp(2.5rem, 1.25rem + 5vw, 4.5rem)', '40px')
      const measured = await measureAround(
        t,
        'hero.title',
        '.title { font-size: 28px; } .accent { font-size: 72px; background-color: #0f172a; }',
        {
          base: georgia,
        },
      )
      if (!measured) return
      assert.match(
        warned(measured),
        /^Warning: “Louez une voiture[^”]*” partly covered at 375 px/,
        coverage(measured.after).join(' | '),
      )
    },
  )

  it(
    'laisse passer un mot mis en avant plus grand, qui ne peint aucun fond : ses lettres laissent voir le texte dessous',
    { timeout: 60_000 },
    async (t) => {
      // Pas de faux refus pour « agrandis les mots mis en avant » : là où ses lettres débordent sur la ligne voisine, les
      // deux textes restent peints.
      const georgia = SITE.replace('clamp(2.5rem, 1.25rem + 5vw, 4.5rem)', '40px')
      const added = '.title { font-size: 28px; } .accent { font-size: 72px; }'
      const measured = await measureAround(t, 'hero.title', added, { base: georgia })
      if (!measured) return
      assert.ok(uncovered(measured.after), `${added} → ${coverage(measured.after).join(' | ')}`)
      assert.equal(warned(measured), '', added)
    },
  )

  it(
    'signale un mot mis en avant agrandi par padding, même sans fond : seules ses lettres laissent voir le texte dessous',
    { timeout: 60_000 },
    async (t) => {
      // Relecture : son padding ne peint rien au repos, mais un état peut y poser un fond que la capture ne survole jamais.
      const georgia = SITE.replace('clamp(2.5rem, 1.25rem + 5vw, 4.5rem)', '40px')
      const measured = await measureAround(t, 'hero.title', '.accent { padding-block: 96px; }', { base: georgia })
      if (!measured) return
      assert.ok(uncovered(measured.before), coverage(measured.before).join(' | '))
      assert.match(
        warned(measured),
        /^Warning: “Louez une voiture[^”]*” partly covered at 375 px/,
        coverage(measured.after).join(' | '),
      )
    },
  )

  it(
    'signale un padding réservé au repos sur le mot mis en avant, dont le fond n’est posé qu’au survol du titre',
    { timeout: 60_000 },
    async (t) => {
      // Relecture : lintCssFiles rend [] ; au survol, « récente à Lyon, » disparaît sous le fond du mot mis en avant, et la
      // capture, qui ne survole rien, n’en voit rien si le padding compte comme « ne peint rien ».
      const measured = await measureAround(
        t,
        'hero.title',
        '.accent { padding-block: var(--space-9); }\n.title:hover .accent { background-color: var(--color-night); }\n',
        { base: SITE },
      )
      if (!measured) return
      assert.ok(uncovered(measured.before), coverage(measured.before).join(' | '))
      assert.match(
        warned(measured),
        /^Warning: “Louez une voiture[^”]*” partly covered at 375 px \([^)]*\) and at 1280 px/,
        coverage(measured.after).join(' | '),
      )
    },
  )

  it(
    'signale un fond posé au survol sur un mot mis en avant dont les lettres débordent sur la ligne voisine',
    { timeout: 60_000 },
    async (t) => {
      // Au repos, les lettres du mot mis en avant (text-4xl, interligne 0.9) débordent sur la ligne du dessus sans la
      // cacher ; au survol, son fond la coupe à mi-hauteur. La capture ne survole rien : un élément qu’une règle d’état
      // peut peindre compte comme peint.
      const bigger = '.title { font-size: var(--text-xs); line-height: 0.9; }\n.accent { font-size: var(--text-4xl); }\n'
      const rest = await measureAround(t, 'hero.title', bigger, { base: SITE })
      if (!rest) return
      assert.ok(uncovered([rest.after[0]]), coverage(rest.after).join(' | '))
      const hover = '.title:hover .accent { background-color: var(--color-night); }\n'
      const measured = await measureAround(t, 'hero.title', bigger + hover, { base: SITE })
      if (!measured) return
      assert.match(
        warned(measured),
        /^Warning: “Louez une voiture[^”]*” partly covered at 375 px/,
        coverage(measured.after).join(' | '),
      )
    },
  )

  it(
    'signale le fond d’un mot mis en avant plus étroit qu’un demi-corps du titre, qui masque une lettre de la ligne voisine',
    { timeout: 90_000 },
    async (t) => {
      // Relecture : un mot court rapetissé par un token (« à » en text-lg ou text-xs), padding-block et fond : la bande
      // de son fond passe entre deux abscisses de la grille (un demi-corps : 20 px à 375 px, 36 px à 1280 px) et masque la
      // moitié du « v » de « livrée », ou le « n » de « une ».
      const cases: [string, string, RegExp][] = [
        [
          'Une voiture récente, livrée chez vous *à* Lyon et sans attendre',
          '.accent { font-size: var(--text-lg); padding-block: var(--space-9); background-color: var(--color-night); }',
          /^Warning: “Une voiture[^”]*” partly covered at 375 px \([^)]*\) and at 1280 px/,
        ],
        [
          'Une voiture récente, livrée chez vous *à* Lyon et sans attendre',
          '.accent { font-size: var(--text-xs); padding-block: var(--space-9); background-color: var(--color-night); }',
          /^Warning: “Une voiture[^”]*” partly covered at 375 px/,
        ],
        [
          'Louez une belle voiture récente *à* Lyon, sans surprise et sans attendre',
          '.accent { font-size: var(--text-xs); padding-block: var(--space-9); background-color: var(--color-night); }',
          /“Louez une belle voiture[^”]*” partly covered (at 375 px \([^)]*\) and )?at 1280 px/,
        ],
      ]
      for (const [title, added, detail] of cases) {
        const measured = await measureAround(t, 'hero.title', added, { base: SITE, title })
        if (!measured) return
        assert.ok(uncovered(measured.before), `${title} : ${coverage(measured.before).join(' | ')}`)
        assert.match(warned(measured), detail, `${title}, ${added} → ${coverage(measured.after).join(' | ')}`)
      }
    },
  )
})

describe('READ_ZONE dans Chrome : aucun faux avertissement sur le fond du mot mis en avant (décision 17)', () => {
  // Relecture : sur TITLE et le gabarit SITE, un fond sur le mot mis en avant, la demande la plus courante, était déclaré
  // recouvrant à tort : un fragment de l'accent chevauche la ligne voisine d'une fraction de pixel (interligne 1.05), ou la
  // pastille inline-block est plus basse que le rectangle de son texte (le texte ne la dépasse que de l'interligne).
  const cases: [string, string][] = [
    ['fond rose', '.accent { background-color: var(--color-rose); }'],
    ['fond rose et padding-inline', '.accent { padding-inline: var(--space-2); background-color: var(--color-rose); }'],
    [
      'pastille inline-block',
      '.accent { display: inline-block; padding-inline: var(--space-2); background-color: var(--color-rose); }',
    ],
  ]
  for (const [name, added] of cases) {
    it(`${name} : aucune ligne recouverte à 375 et 1280 px, aucun avertissement`, { timeout: 60_000 }, async (t) => {
      const measured = await measureAround(t, 'hero.title', added, { base: SITE })
      if (!measured) return
      const all = [...measured.before, ...measured.after]
      assert.deepEqual(
        all.map((m) => m.viewport),
        [375, 1280, 375, 1280],
      )
      assert.ok(
        all.every((m) => m.texts.length === 2 && m.texts.every((text) => text.ownLines > 0)),
        coverage(all).join(' | '),
      )
      assert.ok(uncovered(all), `${added} → ${coverage(measured.after).join(' | ')}`)
      assert.equal(warned(measured), '')
    })
  }
})

describe('READ_ZONE dans Chrome : un mot mis en avant sur deux lignes qui se recouvre lui-même', () => {
  it(
    'signale la 1re ligne du mot mis en avant recouverte par le fond de sa 2e ligne (padding-block et fond)',
    { timeout: 60_000 },
    async (t) => {
      // Relecture : l'accent « sans surprise » passe sur deux lignes ; le fond de son 2e fragment, agrandi par
      // padding-block, est peint après sa 1re ligne et la recouvre. elementFromPoint y renvoie l'accent lui-même : le
      // point était « vu ». Un point de ses lignes n'est vu que s'il ne tombe dans aucun fragment suivant du même élément.
      const added = '.accent { padding-block: var(--space-9); background-color: var(--color-night); }'
      const measured = await measureAround(t, 'hero.title', added, { base: SITE })
      if (!measured) return
      assert.ok(uncovered(measured.before), coverage(measured.before).join(' | '))
      for (const m of [...measured.before, ...measured.after]) {
        assert.equal(m.texts.find((text) => text.key === '0')?.ownLines, 2, `${m.viewport} px : l’accent tient sur 2 lignes`)
      }
      // À 375 px, « sans » (fin de rangée, x 176 à 269) est sous le 2e fragment agrandi (x 16 à 189) : son « s » est coupé.
      // À 1280 px, les deux fragments ne se chevauchent pas (x 600 à 767 et 16 à 327) : rien n'est caché.
      const accent = (m: ZoneMeasure) => m.texts.find((text) => text.key === '0')?.coveredLines
      assert.deepEqual(measured.after.map(accent), [[0], []], coverage(measured.after).join(' | '))
      assert.match(warned(measured), /“sans surprise” partly covered at 375 px \(1 of 2 lines\)\.$/)
    },
  )

  it('sans padding-block, le fond d’un mot mis en avant sur deux lignes ne le recouvre pas', { timeout: 60_000 }, async (t) => {
    const measured = await measureAround(t, 'hero.title', '.accent { background-color: var(--color-night); }', { base: SITE })
    if (!measured) return
    assert.ok(uncovered([...measured.before, ...measured.after]), coverage(measured.after).join(' | '))
    assert.equal(warned(measured), '')
  })
})

describe('READ_ZONE dans Chrome : chaque occurrence d’une zone répétée (décision 18)', () => {
  // Gabarit de la liste du blog : des cartes post.card dans une grille ; la 1re carte est choisie.
  const CARDS =
    '.grid { display: grid; gap: 24px; padding: 16px; }\n' +
    '.card { display: block; background-color: #1e293b; color: #f8fafc; text-decoration: none; overflow: hidden; }\n' +
    '.body { padding: 16px; }\n.cardTitle { margin: 0 0 8px; font-size: 24px; }\n' +
    '.subtitle { margin: 0 0 8px; color: #94a3b8; }\n.date { margin: 0; color: #94a3b8; font-size: 14px; }\n'
  const cards = (count: number) =>
    '<section class="grid" data-edit="blog.list">' +
    Array.from(
      { length: count },
      (_, n) =>
        `<a class="card" data-edit="post.card" href="#"><div class="body"><h2 class="cardTitle">Article ${n + 1}</h2>` +
        '<p class="subtitle">Citadine, SUV ou utilitaire : le guide</p><p class="date">24 septembre 2026</p></div></a>',
    ).join('') +
    '</section>'
  const page = { base: BASE + CARDS, body: cards(3) }

  it(
    'relève les 3 cartes à chaque largeur, la carte choisie restant celle de before et after',
    { timeout: 60_000 },
    async (t) => {
      const measured = await measureAround(t, 'post.card', '', page)
      if (!measured) return
      for (const list of [measured.occurrences.before, measured.occurrences.after]) {
        assert.deepEqual(
          list.map((m) => `${m.viewport}:${m.occurrence}/${m.occurrences}`),
          ['375:0/3', '375:1/3', '375:2/3', '1280:0/3', '1280:1/3', '1280:2/3'],
        )
        assert.ok(list.every((m) => m.found && m.texts.length === 3 && !m.partial))
      }
      assert.deepEqual(
        measured.after.map((m) => m.occurrence),
        [0, 0],
      )
    },
  )

  it(
    'refuse la dernière carte sortie de son cadre par une règle :last-child, la 1re carte étant choisie',
    { timeout: 60_000 },
    async (t) => {
      const measured = await measureAround(t, 'post.card', '.card:last-child { margin-inline: -96px; }', page)
      if (!measured) return
      // L’occurrence choisie ne bouge pas : seul le relevé de chaque occurrence voit la 3e carte.
      assert.equal(frameCheck(measured.before, measured.after).ok, true)
      const check = frameCheck(measured.occurrences.before, measured.occurrences.after)
      assert.equal(check.ok, false)
      assert.match(check.detail ?? '', /^375 px \(occurrence 3 of 3\): \+96 px on the left, \+96 px on the right, negative margin/)
      assert.match(check.detail ?? '', /; 1280 px \(occurrence 3 of 3\): \+96 px on the left, \+96 px on the right, negative margin/)
    },
  )

  it(
    'signale le sous-titre de la dernière carte recouvert par sa date à fond Nuit (règle :last-child)',
    { timeout: 60_000 },
    async (t) => {
      // Relecture (r6/card.mts) : sous-titre et date empilés dans la même cellule de grille, la date peinte par-dessus.
      const added =
        '.card:last-child .body { display: grid; }\n' +
        '.card:last-child .subtitle, .card:last-child .date { grid-row: 1; grid-column: 1; }\n' +
        '.card:last-child .date { background-color: #0f172a; }\n'
      const measured = await measureAround(t, 'post.card', added, page)
      if (!measured) return
      assert.equal(coverWarning(measured.before, measured.after), null, 'la carte choisie n’a rien de recouvert')
      const all = measured.occurrences
      assert.equal(frameCheck(all.before, all.after).ok, true)
      const step = coverWarning(all.before, all.after)?.step ?? ''
      assert.match(step, /^Warning: “Citadine, SUV ou utilitaire : le guide” \(occurrence 3 of 3\) covered/)
      assert.match(step, / at 375 px \([^)]*\) and at 1280 px \([^)]*\)\.$/)
    },
  )

  it(
    'au-delà de 12 cartes, relève les 12 premières et la carte choisie, et dit que le relevé est partiel',
    { timeout: 60_000 },
    async (t) => {
      const measured = await measureAround(t, 'post.card', '', { ...page, body: cards(15), index: 13 })
      if (!measured) return
      assert.deepEqual(
        measured.occurrences.after.filter((m) => m.viewport === 375).map((m) => m.occurrence),
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13],
      )
      assert.deepEqual(
        measured.after.map((m) => [m.occurrence, m.occurrences, m.found]),
        [
          [13, 15, true],
          [13, 15, true],
        ],
      )
      assert.deepEqual(coverWarning(measured.occurrences.before, measured.occurrences.after), {
        step: 'Warning: covered-text check incomplete (only the first 12 of 15 occurrences): check the result.',
        client: null,
      })
    },
  )
})

describe('READ_ZONE dans Chrome : plafond du relevé des lignes recouvertes (décision 17)', () => {
  it(
    'au-delà de 50 éléments peints dans la zone, le relevé est partiel et l’avertissement le dit',
    { timeout: 60_000 },
    async (t) => {
      const tags = Array.from({ length: 60 }, (_, n) => `<span class="tag">Option ${n + 1}</span>`).join(' ')
      const measured = await measureAround(t, 'tags', '', {
        base: BASE + '.tag { background-color: #1e293b; }\n',
        body: `<p class="tags" data-edit="tags">${tags}</p>`,
      })
      if (!measured) return
      assert.ok(
        [...measured.before, ...measured.after].every((m) => m.partial),
        'plafond de 50 éléments atteint',
      )
      assert.deepEqual(coverWarning(measured.before, measured.after), {
        step:
          'Warning: covered-text check incomplete (too many painted elements in the zone at 375 and 1280 px): ' +
          'check the result.',
        client: null,
      })
      const few = await measureAround(t, 'tags', '', {
        base: BASE + '.tag { background-color: #1e293b; }\n',
        body: `<p class="tags" data-edit="tags">${tags.split(' <span').slice(0, 10).join(' <span')}</p>`,
      })
      if (!few) return
      assert.ok(
        [...few.before, ...few.after].every((m) => !m.partial),
        '10 éléments peints : relevé complet',
      )
    },
  )
})

describe('états forcés dans Chrome : contraste au survol, au clic et au focus (décision 16)', () => {
  const DARK = 'body { margin: 0; font: 16px/1.5 sans-serif; background: #0f172a; color: #f8fafc; }\n'
  /** Menu du site : liens Texte sur Nuit, Rose clair au survol (comme Header.module.css). */
  const NAV = {
    base:
      DARK +
      '.nav { display: flex; gap: 24px; padding: 16px; font-size: 14px; }\n.nav a { color: inherit; }\n' +
      '.nav a:hover { color: #fb7185; }\n',
    body: '<header class="header"><nav class="nav" data-edit="header.nav"><a href="/">Accueil</a> <a href="/blog">Blog</a></nav></header>',
  }
  /** Bouton principal : Blanc sur Rose, Rose profond au survol, avec une transition de 1 s (comme Hero.module.css, plus lente). */
  const CTA = {
    base:
      DARK +
      '.hero { padding: 32px 16px; }\n' +
      '.cta { display: inline-block; padding: 12px 32px; background-color: #e11d48; color: #ffffff; font-size: 14px; ' +
      'transition: background-color 1s ease-out, color 1s ease-out; }\n.cta:hover { background-color: #be123c; }\n',
    body: '<section class="hero"><a class="cta" href="/reserver" data-edit="hero.cta">Réserver maintenant</a></section>',
  }
  /** Carte d’article dans un lien, date Brume sur Nuit claire. */
  const CARD = {
    base:
      DARK + '.card { display: block; padding: 16px; background-color: #1e293b; }\n.date { color: #94a3b8; font-size: 14px; }\n',
    body:
      '<main><a class="link" href="/blog/a"><article class="card" data-edit="post.card"><h3 class="title">Citadine, SUV ' +
      'ou utilitaire</h3><p class="date">24 septembre 2026</p></article></a></main>',
  }
  const ratio = (fg: string, bg: string) => formatRatio(contrastRatio(fg, bg)!)
  const contrast = (measured: { occurrences: { before: ZoneMeasure[]; after: ZoneMeasure[] } }) =>
    contrastCheck(measured.occurrences.before, measured.occurrences.after, false)

  it('relève chaque état sans rien changer au repos ; un état inchangé ne bloque rien', { timeout: 120_000 }, async (t) => {
    const measured = await measureAround(t, 'header.nav', '', NAV)
    if (!measured) return
    for (const m of measured.before) {
      // Profondeur 0 : le menu ; 1 : ses liens, qui prennent le focus.
      assert.deepEqual(m.states.map(named), [
        'hover h-1',
        'hover h0',
        'hover h1',
        'active h-1',
        'active h0',
        'active h1',
        'focus-visible f1',
        'focus f1',
        'hover-focus h-1 f1',
        'hover-focus h0 f1',
        'hover-focus h1 f1',
        'hover-focus-visible h-1 f1',
        'hover-focus-visible h0 f1',
        'hover-focus-visible h1 f1',
        'active-focus h1 f1',
        'active-focus-visible h1 f1',
      ])
      const hovered = m.states.find((state) => named(state) === 'hover h1')!
      const rose = Math.round(contrastRatio('#fb7185', '#0f172a')! * 100) / 100
      assert.deepEqual(
        hovered.texts.map((text) => `${text.text} ${text.ratio}`),
        [`Accueil ${rose}`, `Blog ${rose}`],
      )
      assert.deepEqual(
        m.texts.map((text) => text.ratio),
        [17.06, 17.06],
        'le repos ne voit aucun état',
      )
    }
    assert.deepEqual(measured.after, measured.before)
    const check = contrast(measured)
    assert.equal(check?.ok, true)
    assert.equal(check?.detail, undefined)
  })

  it('refuse un lien lisible au repos qui devient illisible au survol et au clic', { timeout: 120_000 }, async (t) => {
    const measured = await measureAround(t, 'header.nav', '.nav a:hover { color: #0f172a; }', NAV)
    if (!measured) return
    const check = contrast(measured)
    assert.equal(check?.ok, false)
    const from = ratio('#fb7185', '#0f172a')
    assert.equal(
      check?.detail,
      `“Accueil” on hover: ${from} → 1 at 375, 1280 px; “Accueil” while clicked: ${from} → 1 at 375, 1280 px; ` +
        `“Blog” on hover: ${from} → 1 at 375, 1280 px; “Blog” while clicked: ${from} → 1 at 375, 1280 px`,
    )
    assert.match(String(check?.problem), /The :hover, :active, :focus-visible and :focus states are measured like the resting state/)
  })

  it('mesure la valeur finale d’une transition, au survol comme au focus clavier', { timeout: 120_000 }, async (t) => {
    const hover = await measureAround(t, 'hero.cta', '.cta:hover { background-color: #ffffff; }', CTA)
    if (!hover) return
    const from = ratio('#ffffff', '#be123c')
    assert.match(String(contrast(hover)?.detail), new RegExp(`^“Réserver maintenant” on hover: ${from} → 1 at 375, 1280 px`))
    const focus = await measureAround(t, 'hero.cta', '.cta:focus-visible { color: #e11d48; }', CTA)
    if (!focus) return
    // Focus clavier sous le pointeur : Rose sur Rose profond (fond du survol), pire que Blanc sur Rose profond.
    assert.equal(
      contrast(focus)?.detail,
      `“Réserver maintenant” on keyboard focus: ${ratio('#ffffff', '#e11d48')} → 1 at 375, 1280 px; ` +
        `“Réserver maintenant” on hover, with keyboard focus: ${ratio('#ffffff', '#be123c')} → ` +
        `${ratio('#e11d48', '#be123c')} at 375, 1280 px`,
    )
  })

  it('force aussi les ancêtres : survol de la carte, focus du lien qui l’entoure', { timeout: 120_000 }, async (t) => {
    const from = ratio('#94a3b8', '#1e293b')
    const hover = await measureAround(t, 'post.card', '.card:hover .date { color: #1e293b; }', CARD)
    if (!hover) return
    // Survol de la carte (sans la date) et de la date : même baisse, une seule fois par largeur.
    assert.equal(
      contrast(hover)?.detail,
      `“24 septembre 2026” on hover: ${from} → 1 at 375, 1280 px; “24 septembre 2026” while clicked: ${from} → 1 at 375, 1280 px`,
    )
    const focus = await measureAround(t, 'post.card', '.link:focus-visible .date { color: #1e293b; }', CARD)
    if (!focus) return
    assert.equal(contrast(focus)?.detail, `“24 septembre 2026” on keyboard focus: ${from} → 1 at 375, 1280 px`)
  })

  it('refuse un survol avec le focus après un clic devenu illisible (:hover:focus)', { timeout: 120_000 }, async (t) => {
    const measured = await measureAround(t, 'hero.cta', '.cta:hover:focus { color: #be123c; }', CTA)
    if (!measured) return
    const check = contrast(measured)
    assert.equal(check?.ok, false)
    // Le focus clavier (:focus-visible) porte aussi :focus ; le clic qui donne le focus aussi, déjà nommé.
    const from = ratio('#ffffff', '#be123c')
    assert.equal(
      check?.detail,
      `“Réserver maintenant” on hover, with focus after a click: ${from} → 1 at 375, 1280 px; ` +
        `“Réserver maintenant” on hover, with keyboard focus: ${from} → 1 at 375, 1280 px`,
    )
  })

  it('refuse un clic qui donne le focus devenu illisible (:focus:active)', { timeout: 120_000 }, async (t) => {
    const measured = await measureAround(t, 'hero.cta', '.cta:focus:active { color: #e11d48; }', CTA)
    if (!measured) return
    assert.equal(
      contrast(measured)?.detail,
      `“Réserver maintenant” during a click that gives focus: ${ratio('#ffffff', '#be123c')} → ` +
        `${ratio('#e11d48', '#be123c')} at 375, 1280 px`,
    )
  })

  it('refuse un survol avec le focus clavier devenu illisible (:hover:focus-visible)', { timeout: 120_000 }, async (t) => {
    const measured = await measureAround(t, 'hero.cta', '.cta:hover:focus-visible { color: #be123c; }', CTA)
    if (!measured) return
    assert.equal(
      contrast(measured)?.detail,
      `“Réserver maintenant” on hover, with keyboard focus: ${ratio('#ffffff', '#be123c')} → 1 at 375, 1280 px`,
    )
  })

  it('refuse un clic avec le focus clavier devenu illisible (:active:focus-visible)', { timeout: 120_000 }, async (t) => {
    // Tab jusqu’au bouton, puis bouton de la souris enfoncé dessus : Chrome garde :focus-visible pendant le clic.
    const measured = await measureAround(t, 'hero.cta', '.cta:active:focus-visible { color: #be123c; }', CTA)
    if (!measured) return
    const check = contrast(measured)
    assert.equal(check?.ok, false)
    assert.equal(
      check?.detail,
      `“Réserver maintenant” during a click, with keyboard focus: ${ratio('#ffffff', '#be123c')} → 1 at 375, 1280 px`,
    )
  })

  it('refuse deux règles lisibles seules, illisibles ensemble (focus et survol)', { timeout: 120_000 }, async (t) => {
    // Bouton Blanc sur Nuit claire : Brume au focus (5,71), Ardoise au survol (4,76) ; Brume sur Ardoise : illisible.
    const BUTTON = {
      base:
        DARK +
        '.hero { padding: 32px 16px; }\n' +
        '.cta { display: inline-block; padding: 12px 32px; background-color: #1e293b; color: #ffffff; font-size: 14px; }\n',
      body: CTA.body,
    }
    const color = '.cta:focus { color: #94a3b8; }\n'
    const background = '.cta:hover { background-color: #64748b; }\n'
    for (const alone of [color, background]) {
      const measured = await measureAround(t, 'hero.cta', alone, BUTTON)
      if (!measured) return
      assert.equal(contrast(measured)?.ok, true, alone)
    }
    const both = await measureAround(t, 'hero.cta', color + background, BUTTON)
    if (!both) return
    const change = `${ratio('#ffffff', '#1e293b')} → ${ratio('#94a3b8', '#64748b')} at 375, 1280 px`
    assert.equal(
      contrast(both)?.detail,
      `“Réserver maintenant” on hover, with focus after a click: ${change}; ` +
        `“Réserver maintenant” on hover, with keyboard focus: ${change}`,
    )
  })
})

describe('peinture de tous les textes visibles dans Chrome : au-delà des 10 relevés en entier', () => {
  const DARK = 'body { margin: 0; font: 16px/1.5 sans-serif; background: #0f172a; color: #f8fafc; }\n'
  /** Corps d’article de `count` paragraphes, Texte sur Nuit. */
  const article = (count: number) => ({
    base: DARK + '.content { color: #f8fafc; }\n',
    body:
      '<article><div class="content" data-edit="article.content">' +
      Array.from({ length: count }, (_, n) => `<p>Paragraphe ${n + 1}</p>`).join('') +
      '</div></article>',
  })
  const contrast = (measured: { occurrences: { before: ZoneMeasure[]; after: ZoneMeasure[] } }) =>
    contrastCheck(measured.occurrences.before, measured.occurrences.after, false)

  it('refuse les paragraphes 11 à 13 rendus illisibles, au repos comme au survol', { timeout: 120_000 }, async (t) => {
    const rest = await measureAround(t, 'article.content', '.content > :nth-child(n+11) { color: #0f172a; }', article(13))
    if (!rest) return
    assert.ok(rest.after.every((m) => m.texts.length === 10 && m.paints.texts.length === 13 && m.paints.total === 13))
    assert.equal(contrast(rest)?.detail, [11, 12, 13].map((n) => `“Paragraphe ${n}”: 17.06 → 1 at 375, 1280 px`).join('; '))
    const hover = await measureAround(t, 'article.content', '.content > :nth-child(n+11):hover { color: #0f172a; }', article(13))
    if (!hover) return
    const check = contrast(hover)
    assert.equal(check?.ok, false)
    assert.match(String(check?.detail), /^“Paragraphe 11” on hover: 17.06 → 1 at 375, 1280 px; /)
  })

  it('refuse un relevé partiel : plus de 400 textes visibles (décision 19)', { timeout: 120_000 }, async (t) => {
    const long = await measureAround(t, 'article.content', '', article(401))
    if (!long) return
    const check = contrast(long)
    assert.equal(check?.ok, false)
    assert.equal(check?.detail, 'Partial reading: 401 visible texts, only the first 400 are measured at 375, 1280 px')
    const full = await measureAround(t, 'article.content', '', article(400))
    if (!full) return
    assert.equal(contrast(full)?.ok, true)
  })

  it(
    'sans règle d’état, chaque état rend les mêmes textes que le repos, et le repos les mêmes que le relevé en entier',
    { timeout: 120_000 },
    async (t) => {
      // Deux cartes dans un lien, un mot mis en avant, un fond semi-transparent sur Nuit claire.
      const CARDS = {
        base:
          DARK +
          '.card { display: block; padding: 16px; background-color: #1e293b; color: #f8fafc; text-decoration: none; }\n' +
          '.body { padding: 8px; background-color: rgba(255, 255, 255, 0.1); }\n' +
          '.title { margin: 0; font-size: 24px; font-weight: 700; }\n.accent { color: #fb7185; font-style: normal; }\n' +
          '.date { margin: 0; color: #94a3b8; font-size: 14px; }\n',
        body:
          '<main>' +
          [1, 2]
            .map(
              (n) =>
                `<a class="card" href="/blog/${n}" data-edit="post.card"><div class="body"><h2 class="title">Article ${n}, ` +
                '<em class="accent">sans surprise</em></h2><p class="date">24 septembre 2026</p></div></a>',
            )
            .join('') +
          '</main>',
      }
      const measured = await measureAround(t, 'post.card', '', CARDS)
      if (!measured) return
      for (const m of measured.occurrences.before) {
        assert.deepEqual(
          m.paints.texts.map((text) => text.key),
          ['0.0', '0.0.0', '0.1'],
        )
        // Le fond semi-transparent est composé sur Nuit claire : ni Nuit claire, ni blanc.
        const plain = ['rgb(30, 41, 59)', 'rgb(255, 255, 255)']
        assert.ok(m.paints.texts.every((text) => text.background !== null && !plain.includes(text.background)))
        assert.deepEqual(
          m.texts.map(({ key, text, color, fontSize, fontWeight, background, ratio, required }) => ({
            key,
            text,
            color,
            fontSize,
            fontWeight,
            background,
            ratio,
            required,
          })),
          m.paints.texts,
        )
        assert.ok(m.states.length > 20)
        for (const state of m.states) assert.deepEqual(state.texts, m.paints.texts, named(state))
      }
    },
  )
})

describe('peinture de chaque occurrence dans Chrome : au-delà des 12 relevées en entier', () => {
  const DARK = 'body { margin: 0; font: 16px/1.5 sans-serif; background: #0f172a; color: #f8fafc; }\n'
  /** Liste du blog de `count` cartes post.card, date Brume sur Nuit claire. */
  const list = (count: number) => ({
    base:
      DARK +
      '.grid { display: grid; gap: 8px; padding: 8px; }\n' +
      '.card { display: block; padding: 8px; background-color: #1e293b; color: #f8fafc; text-decoration: none; }\n' +
      '.date { color: #94a3b8; font-size: 14px; }\n',
    body:
      '<div class="grid" data-edit="blog.list">' +
      Array.from(
        { length: count },
        (_, n) =>
          `<a class="card" href="/blog/${n}" data-edit="post.card"><div class="body"><h2 class="title">Article ${n + 1}</h2>` +
          '<p class="date">24 septembre 2026</p></div></a>',
      ).join('') +
      '</div>',
  })

  it('refuse la date des cartes 13 et 14 rendue illisible (.card:nth-child(n+13) .date)', { timeout: 180_000 }, async (t) => {
    const measured = await measureAround(t, 'post.card', '.card:nth-child(n+13) .date { color: #1e293b; }', list(14))
    if (!measured) return
    // 12 cartes relevées en entier (cadre, texte recouvert), les 14 pour leur peinture, au repos et dans les états.
    assert.deepEqual(
      measured.occurrences.after.filter((m) => m.viewport === 375).map((m) => m.occurrence),
      Array.from({ length: 12 }, (_, rank) => rank),
    )
    for (const painted of [measured.painted.before, measured.painted.after]) {
      assert.deepEqual(
        painted.filter((m) => m.viewport === 375).map((m) => `${m.occurrence}/${m.occurrences}`),
        Array.from({ length: 14 }, (_, rank) => `${rank}/14`),
      )
      assert.ok(painted.every((m) => m.found && m.paints.texts.length === 2 && m.states.length > 10))
    }
    assert.deepEqual(measured.unmeasured, [])
    const check = contrastCheck(measured.painted.before, measured.painted.after, false)
    assert.equal(check?.ok, false)
    assert.match(
      String(check?.detail),
      new RegExp(
        `^“24 septembre 2026” \\(occurrences 13 and 14 of 14\\): ` +
          `${formatRatio(contrastRatio('#94a3b8', '#1e293b')!)} → 1 at 375, 1280 px`,
      ),
    )
    // Sans règle : rien à refuser.
    const none = await measureAround(t, 'post.card', '', list(14))
    if (!none) return
    assert.equal(contrastCheck(none.painted.before, none.painted.after, false)?.ok, true)
  })

  it('au-delà de 100 cartes, relève les 100 premières et refuse le relevé partiel', { timeout: 240_000 }, async (t) => {
    const measured = await measureAround(t, 'post.card', '', list(101))
    if (!measured) return
    assert.deepEqual(
      measured.painted.after.filter((m) => m.viewport === 375).map((m) => m.occurrence),
      Array.from({ length: 100 }, (_, rank) => rank),
    )
    const check = contrastCheck(measured.painted.before, measured.painted.after, false)
    assert.equal(check?.ok, false)
    assert.equal(check?.detail, 'Partial reading: 101 occurrences of the zone, only 100 are measured at 375, 1280 px')
  })
})

describe('règles de couleur jugées sur leur effet, dans Chrome (décision 19)', () => {
  const DARK = 'body { margin: 0; font: 16px/1.5 sans-serif; background: #0f172a; color: #f8fafc; }\n'
  /** Article publié de 3 blocs, Texte sur Nuit. */
  const ARTICLE = {
    base: DARK + '.content { color: #f8fafc; }\n',
    body:
      '<article><div class="content" data-edit="article.content"><p>Paragraphe 1</p><h2>Intertitre</h2>' +
      '<p>Paragraphe 3</p></div></article>',
  }
  /** Bouton principal : Blanc sur Rose, Rose profond au survol, transitions de 1 s (comme Hero.module.css, plus lentes). */
  const CTA = {
    base:
      DARK +
      '.hero { padding: 32px 16px; }\n' +
      '.cta { display: inline-block; padding: 12px 32px; background-color: #e11d48; color: #ffffff; font-size: 14px; ' +
      'transition: background-color 1s ease-out, color 1s ease-out; }\n.cta:hover { background-color: #be123c; }\n',
    body: '<section class="hero"><a class="cta" href="/reserver" data-edit="hero.cta">Réserver maintenant</a></section>',
  }
  type Measured = NonNullable<Awaited<ReturnType<typeof measureAround>>>
  const contrast = (measured: Measured) => contrastCheck(measured.painted.before, measured.painted.after, false)
  const unverifiable = (measured: Measured) => unverifiableCheck(measured.unmeasured, false)
  /** Peinture des textes de chaque occurrence, au repos et dans chaque état : ce que le contraste compare. */
  const paints = (list: Measured['painted']['before']) =>
    list.map((measure) => ({ paints: measure.paints, states: measure.states }))

  it(
    'refuse les deux paires « règle large sombre + règle plus précise qui rétablit les textes mesurés »',
    { timeout: 120_000 },
    async (t) => {
      const pairs = [
        {
          added:
            '.content > :nth-child(n+1) { color: #0f172a; }\n' +
            '.content > :nth-child(-n+10):nth-child(n+1) { color: #f8fafc; }\n',
          unmeasured: '.content > :nth-child(n+1) { color }',
        },
        {
          added: '.content p { color: #0f172a; }\n.content > p:nth-child(-n+10) { color: #f8fafc; }\n',
          unmeasured: '.content p { color }',
        },
      ]
      for (const pair of pairs) {
        const measured = await measureAround(t, 'article.content', pair.added, ARTICLE)
        if (!measured) return
        // Les textes mesurés ne changent pas : le contraste seul ne voit rien.
        assert.deepEqual(paints(measured.painted.after), paints(measured.painted.before), pair.added)
        assert.equal(contrast(measured)?.ok, true, pair.added)
        assert.deepEqual(measured.unmeasured, [pair.unmeasured], pair.added)
        const result = unverifiable(measured)
        assert.equal(result?.ok, false)
        assert.equal(result?.detail, `No effect on the visible texts of the zone: \`${pair.unmeasured}\``)
        // Message du 2e essai (décision 19).
        assert.ok(
          String(result?.problem).endsWith(
            'Your color rule changes no visible text of the zone: write it on the selector of the zone or of its ' +
              'texts.',
          ),
        )
      }
    },
  )

  it(
    'refuse l’attaque par l’ancêtre : couleur de la zone assombrie, rétablie sur chacun de ses textes',
    { timeout: 120_000 },
    async (t) => {
      const restored = '.content p, .content h2 { color: #f8fafc; }\n'
      // Règle ajoutée…
      const added = await measureAround(t, 'article.content', `.content { color: #0f172a; }\n${restored}`, ARTICLE)
      if (!added) return
      assert.deepEqual(paints(added.painted.after), paints(added.painted.before))
      assert.deepEqual(added.unmeasured, ['.content { color }'])
      assert.equal(unverifiable(added)?.ok, false)
      // … ou règle modifiée : seule sa couleur change (sa marge ne compte pas).
      const modified = await measureAround(t, 'article.content', `.content { margin-top: 8px; color: #0f172a; }\n${restored}`, {
        ...ARTICLE,
        initial: '.content { margin-top: 8px; color: #f8fafc; }\n',
      })
      if (!modified) return
      assert.deepEqual(modified.unmeasured, ['.content { color }'])
      // Même règle avec un fond, qui change les textes : la couleur reste sans effet, et refusée.
      const background = await measureAround(
        t,
        'article.content',
        `.content { color: #0f172a; background-color: #1e293b; }\n${restored}`,
        ARTICLE,
      )
      if (!background) return
      assert.equal(contrast(background)?.ok, true, 'Texte sur Nuit claire reste lisible')
      assert.deepEqual(background.unmeasured, ['.content { color }'])
      // Même règle avec un fond qui suit sa couleur (currentColor, 4e relecture) : Nuit sur la zone, identique au fond de la
      // page. La couleur ne change que ce fond, pas la couleur des textes : seule la propriété de son groupe compte.
      const current = await measureAround(
        t,
        'article.content',
        `.content { color: #0f172a; background-color: currentColor; }\n${restored}`,
        ARTICLE,
      )
      if (!current) return
      assert.equal(contrast(current)?.ok, true, 'Texte sur Nuit : aucun texte mesuré ne change de contraste')
      assert.deepEqual(current.unmeasured, ['.content { color }'])
      assert.equal(unverifiable(current)?.ok, false)
      // Témoin : la couleur de la zone seule change ses textes ; elle est mesurée, et refusée par le contraste.
      const alone = await measureAround(t, 'article.content', '.content { color: #0f172a; }\n', ARTICLE)
      if (!alone) return
      assert.deepEqual(alone.unmeasured, [])
      assert.equal(unverifiable(alone), null)
      assert.equal(contrast(alone)?.ok, false)
    },
  )

  it(
    'juge chaque sélecteur d’une liste à part : celui que masque une règle plus précise est refusé',
    { timeout: 120_000 },
    async (t) => {
      // Rose sur Nuit (3,8) : lisible pour l’intertitre (grand texte, seuil 3), pas pour un paragraphe (seuil 4,5).
      const measured = await measureAround(
        t,
        'article.content',
        '.content h2, .content p { color: #e11d48; }\n.content > p { color: #f8fafc; }\n',
        ARTICLE,
      )
      if (!measured) return
      assert.equal(contrast(measured)?.ok, true)
      assert.deepEqual(measured.unmeasured, ['.content p { color }'])
    },
  )

  it(
    'relève l’effet dans les états forcés et après les transitions ; une règle d’état sans effet est refusée',
    { timeout: 180_000 },
    async (t) => {
      // Fond au focus clavier : sans effet au repos ni au survol (déjà Rose profond), effet au focus clavier seul, après la
      // transition de 1 s.
      const focus = await measureAround(t, 'hero.cta', '.cta:focus-visible { background-color: #be123c; }\n', CTA)
      if (!focus) return
      assert.deepEqual(focus.unmeasured, [])
      // Fond au repos : l’effet se lit à la fin de la transition de 1 s, pas à son début.
      const rest = await measureAround(t, 'hero.cta', '.cta { background-color: #be123c; }\n', CTA)
      if (!rest) return
      assert.deepEqual(rest.unmeasured, [])
      // Couleur au focus clavier des enfants du bouton, qui n'en a aucun : sans effet, dans aucun état.
      const none = await measureAround(t, 'hero.cta', '.cta:focus-visible :nth-child(n+1) { color: #0f172a; }\n', CTA)
      if (!none) return
      assert.deepEqual(none.unmeasured, ['.cta:focus-visible :nth-child(n+1) { color }'])
      assert.equal(unverifiable(none)?.ok, false)
    },
  )

  it('refuse une couleur posée sur les blocs 11 et suivants d’un article de 3 blocs', { timeout: 120_000 }, async (t) => {
    const measured = await measureAround(t, 'article.content', '.content > :nth-child(n+11) { color: #0f172a; }', ARTICLE)
    if (!measured) return
    // Aucun élément visé : le rendu ne change pas, seule la lecture de la règle désactivée le voit.
    assert.deepEqual(measured.painted.after, measured.painted.before)
    assert.deepEqual(measured.unmeasured, ['.content > :nth-child(n+11) { color }'])
    const result = unverifiable(measured)
    assert.equal(result?.ok, false)
    assert.equal(result?.detail, 'No effect on the visible texts of the zone: `.content > :nth-child(n+11) { color }`')
  })

  it('refuse une balise absente de l’article (:global(h3)) et un état d’un bloc absent', { timeout: 120_000 }, async (t) => {
    const tag = await measureAround(t, 'article.content', '.content h3, .content p { color: #0f172a; }', ARTICLE)
    if (!tag) return
    // Chaque sélecteur de la liste est jugé à part : les paragraphes sont mesurés (et refusés), h3 est sans effet.
    assert.deepEqual(tag.unmeasured, ['.content h3 { color }'])
    assert.equal(unverifiable(tag)?.detail, 'No effect on the visible texts of the zone: `.content h3 { color }`')
    assert.equal(contrast(tag)?.ok, false)
    const hover = await measureAround(
      t,
      'article.content',
      '.content > :nth-child(n+4):hover { background-color: #f8fafc; }',
      ARTICLE,
    )
    if (!hover) return
    assert.deepEqual(hover.unmeasured, ['.content > :nth-child(n+4):hover { background-color }'])
  })

  it(
    'ne juge que la peinture : d’autres propriétés changées ne comptent pas, une couleur nouvelle si',
    { timeout: 120_000 },
    async (t) => {
      // Règle existante sur une balise absente de l’article : `.content h3 { color: … ; margin: 0 }`.
      const withH3 = { ...ARTICLE, base: ARTICLE.base + '.content h3 { color: #f8fafc; margin: 0; }\n' }
      for (const added of ['.content h3 { color: #f8fafc; margin: 8px; }', '.content h3 { margin: 8px; }']) {
        const same = await measureAround(t, 'article.content', added, withH3)
        if (!same) return
        assert.deepEqual(same.unmeasured, [], added)
      }
      const night = await measureAround(t, 'article.content', '.content h3 { color: #0f172a; }', withH3)
      if (!night) return
      assert.deepEqual(night.unmeasured, ['.content h3 { color }'])
    },
  )

  it('accepte une règle qui change un texte de la page, et une page inchangée', { timeout: 120_000 }, async (t) => {
    const same = await measureAround(t, 'article.content', '', ARTICLE)
    if (!same) return
    assert.deepEqual(same.unmeasured, [])
    assert.equal(unverifiable(same), null)
    assert.equal(contrast(same)?.ok, true)
    const intertitle = await measureAround(t, 'article.content', '.content > :nth-child(2) { color: #94a3b8; }', ARTICLE)
    if (!intertitle) return
    assert.deepEqual(intertitle.unmeasured, [])
    assert.equal(contrast(intertitle)?.ok, true)
  })

  it(
    'accepte une règle modifiée dont la valeur égale celle qui s’appliquerait sans elle (C01 : la couleur du body)',
    { timeout: 120_000 },
    async (t) => {
      // Brume → Texte sur la zone, Texte étant aussi la couleur du body : désactivée, la règle ne change rien ; une valeur
      // témoin montre qu'elle peint bien les textes de la zone.
      const measured = await measureAround(t, 'article.content', '.content { color: #f8fafc; }\n', {
        base: DARK,
        body: ARTICLE.body,
        initial: '.content { color: #94a3b8; }\n',
      })
      if (!measured) return
      assert.deepEqual(measured.unmeasured, [])
      assert.equal(contrast(measured)?.ok, true)
    },
  )
})

describe('règles de couleur jugées sur les textes qu’elles peuvent peindre, dans Chrome (décision 19, 4e relecture)', () => {
  const DARK = 'body { margin: 0; font: 16px/1.5 sans-serif; background: #0f172a; color: #f8fafc; }\n'
  /** Gabarit du corps d’un article du site : paragraphes de 18 px (seuil 4,5), intertitres de 28 px (grand texte, seuil 3). */
  const ARTICLE = {
    base: DARK + '.content { color: #f8fafc; font-size: 18px; }\n.content h2 { font-size: 28px; }\n',
    body:
      '<article><div class="content" data-edit="article.content"><p>Paragraphe 1</p><h2>Intertitre</h2>' +
      '<p>Paragraphe 3</p></div></article>',
  }
  type Measured = NonNullable<Awaited<ReturnType<typeof measureAround>>>
  const contrast = (measured: Measured) => contrastCheck(measured.painted.before, measured.painted.after, false)
  const reach = (measured: Measured) => reachCheck(measured.unreadable, false)
  /** Aucun contrôle ne refuse : règles avec effet, contraste bon, aucun texte sous le minimum là où elles s’appliquent. */
  const accepted = (measured: Measured, label: string) => {
    assert.deepEqual(measured.unmeasured, [], label)
    assert.equal(contrast(measured)?.ok, true, label)
    assert.equal(reach(measured), null, label)
  }

  it(
    'refuse une règle large prouvée sur un grand texte et rattrapée sur les paragraphes (V1, V2)',
    { timeout: 180_000 },
    async (t) => {
      const pairs = [
        { added: '.content { color: #e11d48; }\n.content p { color: #f8fafc; }\n', rule: '.content { color }', ratio: '3.8' },
        {
          added: '.content > :nth-child(n+1) { color: #64748b; }\n.content > p:nth-child(-n+10) { color: #f8fafc; }\n',
          rule: '.content > :nth-child(n+1) { color }',
          ratio: '3.75',
        },
      ]
      for (const { added, rule, ratio } of pairs) {
        const measured = await measureAround(t, 'article.content', added, ARTICLE)
        if (!measured) return
        // Ce que voyait le contrôle jusqu’ici : la règle large agit sur l’intertitre (seuil 3), les textes sont lisibles.
        assert.deepEqual(measured.unmeasured, [], added)
        assert.equal(contrast(measured)?.ok, true, added)
        const result = reach(measured)
        assert.equal(result?.ok, false, added)
        assert.equal(
          result?.detail,
          [
            `\`${rule}\` broad: “Intertitre” ${ratio} (minimum 4.5) at 375, 1280 px`,
            `\`${rule}\` overridden: “Paragraphe 1” ${ratio} (minimum 4.5) at 375, 1280 px`,
            `\`${rule}\` overridden: “Paragraphe 3” ${ratio} (minimum 4.5) at 375, 1280 px`,
          ].join('; '),
          added,
        )
      }
      // Témoin : l’écriture précise, sur la balise des intertitres, reste acceptée (Rose sur Nuit, 3,8 : grand texte).
      const precise = await measureAround(t, 'article.content', '.content h2 { color: #e11d48; }\n', ARTICLE)
      if (!precise) return
      accepted(precise, 'intertitres en Rose')
    },
  )

  it(
    'refuse une règle large sous 4,5, même sans règle qui la rattrape : sujet sans balise, balise en ligne',
    { timeout: 180_000 },
    async (t) => {
      const nth = await measureAround(t, 'article.content', '.content > :nth-child(2) { color: #e11d48; }\n', ARTICLE)
      if (!nth) return
      assert.deepEqual(nth.unmeasured, [])
      assert.equal(contrast(nth)?.ok, true)
      assert.equal(
        reach(nth)?.detail,
        '`.content > :nth-child(2) { color }` broad: “Intertitre” 3.8 (minimum 4.5) at 375, 1280 px',
      )
      // Une balise en ligne (<strong>) prend la taille de son bloc : grand texte ici, paragraphe ailleurs.
      const strong = {
        ...ARTICLE,
        body:
          '<article><div class="content" data-edit="article.content"><p>Paragraphe 1</p><h2>Intertitre <strong>fort</strong>' +
          '</h2><p>Paragraphe 3</p></div></article>',
      }
      const inline = await measureAround(t, 'article.content', '.content strong { color: #e11d48; }\n', strong)
      if (!inline) return
      assert.equal(contrast(inline)?.ok, true)
      assert.equal(reach(inline)?.detail, '`.content strong { color }` broad: “fort” 3.8 (minimum 4.5) at 375, 1280 px')
      // Témoin : la couleur de l’intertitre peint aussi son mot en <strong>, qui en fait partie.
      const block = await measureAround(t, 'article.content', '.content h2 { color: #e11d48; }\n', strong)
      if (!block) return
      accepted(block, 'intertitre et son mot en <strong>')
      // Témoin : une règle large lisible partout (Brume, 6,96) reste acceptée.
      const mist = await measureAround(t, 'article.content', '.content > :nth-child(2) { color: #94a3b8; }\n', ARTICLE)
      if (!mist) return
      accepted(mist, 'Brume')
    },
  )

  it(
    'refuse une règle large rendue lisible par un fond clair sur le seul texte qu’elle atteint (3e constat)',
    { timeout: 180_000 },
    async (t) => {
      const added =
        '.content > :nth-child(n+1) { color: #0f172a; }\n.content > p:nth-child(n+1) { color: #f8fafc; }\n' +
        '.content h2 { background-color: #ffffff; }\n'
      const measured = await measureAround(t, 'article.content', added, ARTICLE)
      if (!measured) return
      assert.deepEqual(measured.unmeasured, [])
      assert.equal(contrast(measured)?.ok, true, 'Nuit sur Blanc : 17,85')
      // 5e relecture : le corps d’un article est une zone à contenu libre ; chaque règle y est aussi jugée seule, sans les
      // règles de l’autre groupe : la règle large sur l’intertitre sans son fond, et ce fond sans la couleur qu’il reçoit.
      assert.equal(
        reach(measured)?.detail,
        '`.content > :nth-child(n+1) { color }` overridden: “Paragraphe 1” 1 (minimum 4.5) at 375, 1280 px; ' +
          '`.content > :nth-child(n+1) { color }` overridden: “Paragraphe 3” 1 (minimum 4.5) at 375, 1280 px; ' +
          '`.content > :nth-child(n+1) { color }` alone: “Intertitre” 1 (minimum 4.5) at 375, 1280 px; ' +
          '`.content h2 { background-color }` alone: “Intertitre” 1.05 (minimum 3) at 375, 1280 px',
      )
      // Témoin : texte en Brume et intertitres en Blanc, la règle de la zone rattrapée sur les intertitres, lisible sans.
      const legit = await measureAround(
        t,
        'article.content',
        '.content { color: #94a3b8; }\n.content h2 { color: #ffffff; }\n',
        ARTICLE,
      )
      if (!legit) return
      accepted(legit, 'Brume et intertitres Blanc')
    },
  )
})

describe('zone à contenu libre (corps d’article) : chaque couleur ou fond jugé seul, dans Chrome (5e relecture)', () => {
  const DARK = 'body { margin: 0; font: 16px/1.5 sans-serif; background: #0f172a; color: #f8fafc; }\n'
  /** Corps d’un article du site (HTML venu du CMS, balises sans classe) : paragraphes de 18 px, intertitres de 28 px. */
  const article = (blocks: string) => ({
    base: DARK + '.content { color: #f8fafc; font-size: 18px; }\n.content h2 { font-size: 28px; }\n',
    body: `<article><div class="content" data-edit="article.content">${blocks}</div></article>`,
  })
  const BLOCKS = '<p>Paragraphe 1</p><h2>Intertitre</h2><p>Paragraphe 3</p>'
  const THREE = article(BLOCKS)
  /** Autre article : les mêmes blocs, puis une liste, un sous-titre et une citation, absents du premier. */
  const OTHER = article(`${BLOCKS}<ul><li>Élément de liste</li></ul><h3>Sous-titre</h3><blockquote>Citation</blockquote>`)
  const LONG = article(`${BLOCKS}<p>Paragraphe 4</p><p>Paragraphe 5</p>`)
  type Measured = NonNullable<Awaited<ReturnType<typeof measureAround>>>
  const contrast = (measured: Measured) => contrastCheck(measured.painted.before, measured.painted.after, false)
  const reach = (measured: Measured) => reachCheck(measured.unreadable, false)
  /** Aucun contrôle ne refuse : règles avec effet, contraste bon, aucun texte sous le minimum là où elles s’appliquent. */
  const accepted = (measured: Measured, label: string) => {
    assert.deepEqual(measured.unmeasured, [], label)
    assert.equal(contrast(measured)?.ok, true, label)
    assert.equal(reach(measured), null, label)
  }
  /** Détail de reachCheck pour une règle jugée seule : texte, contraste et minimum, à 375 et 1280 px. */
  const alone = (rule: string, texts: [string, string, string][]) =>
    texts.map(([text, ratio, minimum]) => `\`${rule}\` alone: “${text}” ${ratio} (minimum ${minimum}) at 375, 1280 px`)
  const ALL = (ratio: string): [string, string, string][] => [
    ['Paragraphe 1', ratio, '4.5'],
    ['Intertitre', ratio, '4.5'],
    ['Paragraphe 3', ratio, '4.5'],
  ]

  it(
    'refuse un fond ou une couleur de la zone rendus lisibles par une règle de l’autre groupe sur les balises (D1, C2)',
    { timeout: 240_000 },
    async (t) => {
      const cases = [
        {
          // D1 : « mets le corps de l’article sur fond blanc », la couleur posée sur les seules balises de la page.
          added: '.content { background-color: #ffffff; }\n.content p, .content h2 { color: #0f172a; }\n',
          detail: alone('.content { background-color }', ALL('1.05')),
          elsewhere: /“Élément de liste”: 17.06 → 1.05 at 375, 1280 px/,
        },
        {
          // C2 : couleur de la zone en Nuit, fond Blanc sur les seules balises de la page.
          added: '.content { color: #0f172a; }\n.content p, .content h2 { background-color: #ffffff; }\n',
          detail: alone('.content { color }', ALL('1')),
          elsewhere: /“Élément de liste”: 17.06 → 1 at 375, 1280 px/,
        },
      ]
      for (const { added, detail, elsewhere } of cases) {
        const measured = await measureAround(t, 'article.content', added, THREE)
        if (!measured) return
        // Ce que voyait le contrôle jusqu’ici : toutes les règles agissent, les textes de la page sont lisibles.
        assert.deepEqual(measured.unmeasured, [], added)
        assert.equal(contrast(measured)?.ok, true, added)
        const result = reach(measured)
        assert.equal(result?.ok, false, added)
        assert.equal(result?.detail, detail.join('; '), added)
        assert.match(String(result?.problem), /Set the background and the text color together/, added)
        // Le même CSS sur un autre article : la liste, le sous-titre et la citation deviennent illisibles.
        const other = await measureAround(t, 'article.content', added, OTHER)
        if (!other) return
        assert.equal(contrast(other)?.ok, false, added)
        assert.match(String(contrast(other)?.detail), elsewhere, added)
      }
    },
  )

  it(
    'refuse une couleur de blocs rendue lisible par un fond de balise (C1, P3), même dans la règle qui en rétablit la couleur',
    { timeout: 240_000 },
    async (t) => {
      const nth = '.content > :nth-child(n+1) { color: #0f172a; }\n'
      const cases = [
        {
          added: `${nth}.content p, .content h2 { background-color: #ffffff; }\n`,
          detail: [
            ...alone('.content > :nth-child(n+1) { color }', ALL('1')),
            ...alone('.content p { background-color }', [
              ['Paragraphe 1', '1.05', '4.5'],
              ['Paragraphe 3', '1.05', '4.5'],
            ]),
            ...alone('.content h2 { background-color }', [['Intertitre', '1.05', '3']]),
          ],
        },
        {
          added: `${nth}.content > p, .content > h2 { background-color: #ffffff; }\n`,
          detail: [
            ...alone('.content > :nth-child(n+1) { color }', ALL('1')),
            ...alone('.content > p { background-color }', [
              ['Paragraphe 1', '1.05', '4.5'],
              ['Paragraphe 3', '1.05', '4.5'],
            ]),
            ...alone('.content > h2 { background-color }', [['Intertitre', '1.05', '3']]),
          ],
        },
        {
          // La couleur et le fond des paragraphes dans une même règle (plus précise que la règle large, qui peint
          // l’intertitre) : jugée seule, la règle large perd les deux à la fois (mergeToggles).
          added:
            `${nth}.content > p:nth-child(n+1) { color: #0f172a; background-color: #ffffff; }\n` +
            '.content h2 { background-color: #ffffff; }\n',
          detail: [
            ...alone('.content > :nth-child(n+1) { color }', ALL('1')),
            ...alone('.content h2 { background-color }', [['Intertitre', '1.05', '3']]),
          ],
        },
      ]
      for (const { added, detail } of cases) {
        const measured = await measureAround(t, 'article.content', added, THREE)
        if (!measured) return
        assert.deepEqual(measured.unmeasured, [], added)
        assert.equal(contrast(measured)?.ok, true, added)
        assert.equal(reach(measured)?.detail, detail.join('; '), added)
      }
    },
  )

  it(
    'refuse deux règles précises de portées différentes : couleur des paragraphes, fond des trois premiers blocs (P4)',
    { timeout: 240_000 },
    async (t) => {
      const added = '.content p { color: #0f172a; }\n.content > p:nth-child(-n+3) { background-color: #ffffff; }\n'
      const measured = await measureAround(t, 'article.content', added, THREE)
      if (!measured) return
      assert.deepEqual(measured.unmeasured, [])
      assert.equal(contrast(measured)?.ok, true)
      assert.equal(
        reach(measured)?.detail,
        [
          ...alone('.content p { color }', [
            ['Paragraphe 1', '1', '4.5'],
            ['Paragraphe 3', '1', '4.5'],
          ]),
          ...alone('.content > p:nth-child(-n+3) { background-color }', [
            ['Paragraphe 1', '1.05', '4.5'],
            ['Paragraphe 3', '1.05', '4.5'],
          ]),
        ].join('; '),
      )
      // Le même CSS sur un article de 5 blocs : les paragraphes 4 et 5 deviennent illisibles.
      const long = await measureAround(t, 'article.content', added, LONG)
      if (!long) return
      assert.match(
        String(contrast(long)?.detail),
        /“Paragraphe 4”: 17.06 → 1 at 375, 1280 px; “Paragraphe 5”: 17.06 → 1 at 375, 1280 px/,
      )
    },
  )

  it(
    'accepte le fond et la couleur posés ensemble, sur toute la zone ou sur une même balise, sur tout article (témoins)',
    { timeout: 240_000 },
    async (t) => {
      const cases = [
        { added: '.content { background-color: #ffffff; color: #0f172a; }\n', pages: [THREE, OTHER] },
        { added: '.content p, .content h2 { background-color: #ffffff; color: #0f172a; }\n', pages: [THREE, OTHER] },
        // Fond et couleur de toute la zone, paragraphes en Ardoise (4,76 sur Blanc) : le fond de la zone reste pour les juger.
        { added: '.content { background-color: #ffffff; color: #0f172a; }\n.content p { color: #64748b; }\n', pages: [THREE] },
      ]
      for (const { added, pages } of cases) {
        for (const page of pages) {
          const measured = await measureAround(t, 'article.content', added, page)
          if (!measured) return
          accepted(measured, added)
        }
      }
    },
  )

  it(
    'ne juge pas ainsi une zone à structure fixe : carte blanche au survol et ses textes en Nuit, pied de page sur fond blanc',
    { timeout: 240_000 },
    async (t) => {
      const CARD = {
        base:
          DARK +
          '.card { display: block; padding: 16px; background-color: #1e293b; }\n.title { font-size: 18px; }\n' +
          '.date { color: #94a3b8; font-size: 14px; }\n',
        body:
          '<main><a class="link" href="/blog/a"><article class="card" data-edit="post.card"><h3 class="title">Citadine, SUV ' +
          'ou utilitaire</h3><p class="date">24 septembre 2026</p></article></a></main>',
      }
      const card = await measureAround(
        t,
        'post.card',
        '.card:hover { background-color: #ffffff; }\n.card:hover .title, .card:hover .date { color: #0f172a; }\n',
        CARD,
      )
      if (!card) return
      accepted(card, 'carte blanche au survol')
      // Les textes du pied de page (<span> sans classe) viennent du composant : sa structure est fixe.
      const FOOTER = {
        base: DARK + '.footer { padding: 16px; color: #94a3b8; }\n.brand { color: #f8fafc; }\n',
        body:
          '<footer class="footer" data-edit="footer"><div class="inner"><span class="brand">LyonDrive</span> ' +
          '<span>Part-Dieu · Perrache · Saint-Exupéry</span> <span>Location de voiture à Lyon</span></div></footer>',
      }
      const footer = await measureAround(
        t,
        'footer',
        '.footer { background-color: #ffffff; }\n.inner, .brand { color: #0f172a; }\n',
        FOOTER,
      )
      if (!footer) return
      accepted(footer, 'pied de page sur fond blanc')
    },
  )
})

describe('passage de référence dans Chrome : chaque règle de couleur réussie agit sur un texte (décision 19)', () => {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const site = path.join(here, 'fixtures/lyondrive')
  /** CSS Modules d’avant et d’après des cas du passage de référence (fixtures/reference-1.json). */
  const fixtures = JSON.parse(readFileSync(path.join(here, 'fixtures/reference-1.json'), 'utf8')) as {
    id: string
    file: string
    before: string
    after: string
  }[]
  const tokens = JSON.parse(readFileSync(path.join(site, 'src/styles/tokens.json'), 'utf8')) as Record<
    string,
    { tokens: Record<string, { value: string }> }
  >
  // Hors d’un CSS Module, `.content :global(p)` s’écrit `.content p`.
  const plain = (css: string) => css.replace(/:global\(([^)]*)\)/g, '$1')
  /** Tokens en variables CSS (comme src/styles/tokens.ts), puis le socle global du site. */
  const SOCLE =
    `:root { ${Object.entries(tokens)
      .flatMap(([group, entry]) => Object.entries(entry.tokens).map(([name, { value }]) => `--${group}-${name}: ${value};`))
      .join(' ')} }\n` + readFileSync(path.join(site, 'src/app/globals.css'), 'utf8')
  const moduleOf = (id: string) => {
    const entry = fixtures.find((candidate) => candidate.id === id && candidate.file.endsWith('.css'))!
    return { before: plain(entry.before), after: plain(entry.after) }
  }
  /** Gabarits HTML des composants du site (classes du CSS Module sans hachage). */
  const card = (n: number) =>
    `<a href="/blog/article-${n}" class="card" data-edit="post.card"><img class="image" alt="" width="1200" height="630">` +
    `<div class="body"><h2 class="title" data-edit="post.card.title">Citadine, SUV ou utilitaire : bien choisir ${n}</h2>` +
    '<p class="subtitle">Nos conseils pour louer la bonne voiture à Lyon.</p>' +
    '<time class="date" datetime="2026-09-24">24 septembre 2026</time></div></a>'
  const BLOG = '<main><div class="container grid" data-edit="blog.list">' + [1, 2, 3].map(card).join('') + '</div></main>'
  const GRID =
    '.grid { display: grid; gap: var(--space-7); padding-bottom: var(--layout-section); }\n' +
    '@media (min-width: 48rem) { .grid { grid-template-columns: repeat(2, 1fr); } }\n'
  const FOOTER =
    '<footer class="footer" data-edit="footer"><div class="container inner"><span class="brand">LyonDrive</span>' +
    '<span>Part-Dieu · Perrache · Saint-Exupéry</span><span>Location de voiture à Lyon</span></div></footer>'
  const HERO =
    '<section class="hero" data-edit="hero"><div class="container"><h1 class="title" data-edit="hero.title">Louez une ' +
    'voiture récente à Lyon, <em class="accent">sans surprise</em></h1><p class="subtitle" data-edit="hero.subtitle">Des ' +
    'voitures récentes, livrées où vous voulez.</p><a href="/blog" class="cta" data-edit="hero.cta">Réserver maintenant</a>' +
    '</div></section>'
  const FEATURES =
    '<section class="features" data-edit="features"><div class="container"><h2 class="title" data-edit="features.title">' +
    'Pourquoi LyonDrive</h2><div class="grid">' +
    ['Voitures récentes', 'Livraison à Lyon', 'Prix clairs']
      .map(
        (title) =>
          `<article class="card" data-edit="features.card"><h3 class="cardTitle">${title}</h3>` +
          '<p class="cardText">Un service pensé pour vous, sans frais cachés.</p></article>',
      )
      .join('') +
    '</div></div></section>'
  const ARTICLE =
    '<main><article class="article"><header><h1 class="title" data-edit="article.title">Bien choisir sa voiture</h1>' +
    '<p class="subtitle" data-edit="article.subtitle">Nos conseils pour louer à Lyon.</p>' +
    '<div class="meta" data-edit="article.meta"><span>Publié le 24 septembre 2026</span>' +
    '<span>Mis à jour le 25 septembre 2026</span></div></header><img class="image" alt="" width="1200" height="630">' +
    '<div class="content" data-edit="article.content"><p>Paragraphe 1</p><h2>Intertitre</h2><p>Paragraphe 3</p></div>' +
    '</article></main>'
  const PAGE_TITLE =
    '<main><header class="container pageTitle"><h1 class="title" data-edit="page.title">Le blog LyonDrive</h1>' +
    '<p class="intro" data-edit="page.intro">Conseils et nouvelles pour louer une voiture à Lyon.</p></header></main>'

  const cases: { id: string; zone: string; body: string; extra?: string; drop?: RegExp; wide?: string }[] = [
    { id: 'C01', zone: 'footer', body: FOOTER },
    // C02 : la date passe de 3,75 à 3,07, seul texte du passage de référence qui perd du contraste (refus attendu).
    {
      id: 'C02',
      zone: 'post.card',
      body: BLOG,
      extra: GRID,
      drop: /^“24 septembre 2026” \(occurrences 1, 2 and 3 of 3\): 3.75 → 3.07 at 375, 1280 px$/,
      // Le fond de la carte atteint la date par héritage : sous 4,5, il est aussi refusé comme règle large (4e relecture).
      wide:
        '`.card { background-color }` broad: “24 septembre 2026” (occurrences 1, 2 and 3 of 3) 3.07 (minimum 4.5) ' +
        'at 375, 1280 px',
    },
    { id: 'C03', zone: 'hero.cta', body: HERO },
    { id: 'C04', zone: 'hero.subtitle', body: HERO },
    { id: 'C06', zone: 'features.card', body: FEATURES },
    { id: 'L08', zone: 'post.card.title', body: BLOG, extra: GRID },
    { id: 'R07', zone: 'article.title', body: ARTICLE },
    { id: 'S02', zone: 'article.meta', body: ARTICLE },
    { id: 'S03', zone: 'footer', body: FOOTER },
    { id: 'S07', zone: 'features', body: FEATURES },
    { id: 'S08', zone: 'post.card.title', body: BLOG, extra: GRID },
    { id: 'S09', zone: 'page.title', body: PAGE_TITLE },
    { id: 'S10', zone: 'hero.title', body: HERO },
  ]
  for (const { id, zone, body, extra, drop, wide } of cases) {
    it(`${id} (${zone}) : aucune règle sans effet ; contraste comme au passage de référence`, { timeout: 120_000 }, async (t) => {
      const css = moduleOf(id)
      const measured = await measureAround(t, zone, css.after, { base: SOCLE + (extra ?? ''), initial: css.before, body })
      if (!measured) return
      assert.deepEqual(measured.unmeasured, [])
      assert.equal(unverifiableCheck(measured.unmeasured, false), null)
      // 4e relecture : aucune règle réussie ne peint un texte sous le minimum là où elle peut s’appliquer.
      if (wide) assert.equal(reachCheck(measured.unreadable, false)?.detail, wide)
      else {
        assert.deepEqual(measured.unreadable, [])
        assert.equal(reachCheck(measured.unreadable, false), null)
      }
      const result = contrastCheck(measured.painted.before, measured.painted.after, false)
      if (drop) {
        assert.equal(result?.ok, false)
        assert.match(String(result?.detail), drop)
      } else {
        assert.equal(result?.ok, true, result?.detail)
      }
    })
  }
})

describe('textes de la page et mots mis en avant relevés dans Chrome (tâche 21, décision 20)', () => {
  // Une page au gabarit du site : en-tête (logo et menu), hero, liste d'articles (une carte et son titre), pied de page. La
  // liste reprend le titre de sa carte dans son propre texte : il n'est retiré qu'une fois, avec la carte.
  const PAGE =
    '<header data-edit="header"><a data-edit="header.logo" href="#">LyonDrive</a> ' +
    '<nav data-edit="header.nav"><a href="#">Accueil</a> <a href="#">Blog</a></nav></header>' +
    '<section class="hero" data-edit="hero">' +
    '<h1 class="title" data-edit="hero.title">Louez une voiture <em class="accent">sans surprise</em> à Lyon' +
    '<em style="display: none">mot caché</em> <em>visible<span style="display: none"> et caché</span></em></h1>' +
    '<p class="subtitle" data-edit="hero.subtitle">Citadines et SUV à Part-Dieu.</p></section>' +
    '<section data-edit="blog.list"><p>Week-end à Annecy</p>' +
    '<article data-edit="post.card"><h2 data-edit="post.card.title">Week-end à Annecy</h2>' +
    '<p>Nos itinéraires préférés.</p><p style="display: none">Brouillon caché</p><time>12 mars 2026</time>' +
    '</article></section>' +
    '<footer data-edit="footer"><p>LyonDrive</p><p>Part-Dieu · Perrache</p></footer>'

  async function session(t: TestContext, content = PAGE) {
    if (unavailable) {
      t.skip(unavailable)
      return null
    }
    base = BASE
    heading = TITLE
    body = content
    css = ''
    return startVisualSession(settings, '/', 'hero.title', 0)
  }

  it(
    'relève le texte propre de chaque autre zone affichée, hors zones intérieures et textes masqués',
    { timeout: 60_000 },
    async (t) => {
      const visual = await session(t)
      if (!visual) return
      try {
        assert.deepEqual(visual.pageTexts, [
          { zone: 'header.logo', index: 0, text: 'LyonDrive' },
          { zone: 'header.nav', index: 0, text: 'Accueil Blog' },
          { zone: 'hero.subtitle', index: 0, text: 'Citadines et SUV à Part-Dieu.' },
          { zone: 'blog.list', index: 0, text: 'Week-end à Annecy' },
          { zone: 'post.card', index: 0, text: 'Nos itinéraires préférés. 12 mars 2026' },
          { zone: 'post.card.title', index: 0, text: 'Week-end à Annecy' },
          { zone: 'footer', index: 0, text: 'LyonDrive Part-Dieu · Perrache' },
        ])
      } finally {
        await visual.close()
      }
    },
  )

  it(
    'une zone SVG ou MathML (sans innerText) ne fait pas échouer la capture : son texte vient de textContent',
    { timeout: 60_000 },
    async (t) => {
      // Logo en SVG dans l'en-tête, formule MathML dans un paragraphe, icône SVG sans texte dans le pied de page.
      const visual = await session(
        t,
        '<header data-edit="header"><svg data-edit="header.logo" width="120" height="24" viewBox="0 0 120 24">' +
          '<text x="0" y="18">LyonDrive</text></svg> <nav data-edit="header.nav"><a href="#">Accueil</a></nav></header>' +
          '<section class="hero" data-edit="hero"><h1 class="title" data-edit="hero.title">Louez une voiture</h1></section>' +
          '<p data-edit="page.intro">Tarif <math data-edit="price"><mn>2</mn></math> fois moins cher</p>' +
          '<footer data-edit="footer"><p>Part-Dieu</p><svg data-edit="footer.icon" width="16" height="16">' +
          '<circle cx="8" cy="8" r="8" /></svg></footer>',
      )
      if (!visual) return
      try {
        assert.deepEqual(visual.pageTexts, [
          { zone: 'header.logo', index: 0, text: 'LyonDrive' },
          { zone: 'header.nav', index: 0, text: 'Accueil' },
          { zone: 'page.intro', index: 0, text: 'Tarif fois moins cher' },
          { zone: 'price', index: 0, text: '2' },
          { zone: 'footer', index: 0, text: 'Part-Dieu' },
        ])
      } finally {
        await visual.close()
      }
    },
  )

  it('ne relève que les mots mis en avant rendus, et leur texte rendu', { timeout: 60_000 }, async (t) => {
    const visual = await session(t)
    if (!visual) return
    try {
      for (const m of visual.before) {
        assert.deepEqual(
          m.accents.map((accent) => accent.text),
          ['sans surprise', 'visible'],
          `${m.viewport} px`,
        )
      }
    } finally {
      await visual.close()
    }
  })
})
