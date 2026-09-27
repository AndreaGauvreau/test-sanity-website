import { describe, expect, it } from 'vitest'

import { analyzeHeadings, decodeEntities, extractHeadings, extractJsonLd } from './html'

const HTML = `<!DOCTYPE html><html><head>
<title>Dock — Conduit</title>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebPage","name":"Dock"}</script>
<script>window.__x = "<h1>not a heading</h1>"</script>
<style>h2 { color: red }</style>
</head><body>
<header><h1 class="t">Dock scheduling, <em>solved</em>.</h1></header>
<!-- <h2>commented</h2> -->
<section><h2>Everything your docks need</h2><h3>Book&nbsp;in seconds</h3><h3>Confirm &amp; track</h3></section>
<h2 class="kz-visually-hidden">The Conduit System</h2>
<h4>160+ integrations</h4>
<h2>  </h2>
<noscript><h2>No JS</h2></noscript>
<script type='application/ld+json'>
{"@type":"FAQPage","mainEntity":[]}
</script>
<script type=application/ld+json>{"headline":"{{title}}"}</script>
<script type="text/javascript">{"@type":"Nope"}</script>
</body></html>`

describe('extractJsonLd', () => {
  it('blocs application/ld+json dans l’ordre, mis en forme, sans les autres scripts', () => {
    const blocks = extractJsonLd(HTML)
    expect(blocks).toHaveLength(3)
    expect(blocks[0]).toBe('{\n  "@context": "https://schema.org",\n  "@type": "WebPage",\n  "name": "Dock"\n}')
    expect(JSON.parse(blocks[1])).toEqual({ '@type': 'FAQPage', mainEntity: [] })
    expect(blocks[2]).toContain('{{title}}')
  })

  it('contenu non JSON gardé tel quel, blocs vides ignorés', () => {
    expect(extractJsonLd('<script type="application/ld+json">{ "a": {{b}} }</script><script type="application/ld+json"> </script>')).toEqual([
      '{ "a": {{b}} }',
    ])
    expect(extractJsonLd('<p>nothing</p>')).toEqual([])
  })
})

describe('extractHeadings', () => {
  it('titres du body, texte visible, entités décodées ; ignore head, scripts, commentaires, noscript', () => {
    expect(extractHeadings(HTML)).toEqual([
      { level: 1, text: 'Dock scheduling, solved.' },
      { level: 2, text: 'Everything your docks need' },
      { level: 3, text: 'Book in seconds' },
      { level: 3, text: 'Confirm & track' },
      { level: 2, text: 'The Conduit System' },
      { level: 4, text: '160+ integrations' },
      { level: 2, text: '' },
    ])
  })

  it('décode les entités numériques', () => {
    expect(decodeEntities('It&#39;s &#x2014; &rsquo;ok&unknown;')).toBe("It's — ’ok&unknown;")
  })
})

describe('analyzeHeadings (alertes de C2)', () => {
  it('niveau sauté, titre vide et résumé', () => {
    const { rows, summary } = analyzeHeadings(extractHeadings(HTML))
    expect(rows[5]).toMatchObject({ level: 4, issue: 'skip', note: 'H4 after an H2' })
    expect(rows[6]).toMatchObject({ issue: 'empty', note: 'Empty heading' })
    expect(rows.filter((r) => r.issue)).toHaveLength(2)
    expect(summary).toEqual([
      { ok: true, text: 'One H1' },
      { ok: false, text: 'A level is skipped' },
      { ok: false, text: 'An empty heading' },
    ])
  })

  it('aucun H1, plusieurs H1', () => {
    expect(analyzeHeadings([{ level: 2, text: 'a' }]).summary[0]).toEqual({ ok: false, text: 'No H1' })
    const two = analyzeHeadings([
      { level: 1, text: 'a' },
      { level: 1, text: 'b' },
    ])
    expect(two.summary[0]).toEqual({ ok: false, text: '2 H1s' })
    expect(two.rows[1]).toMatchObject({ issue: 'extra-h1' })
    expect(analyzeHeadings([{ level: 1, text: 'a' }, { level: 2, text: 'b' }]).summary.every((s) => s.ok)).toBe(true)
  })
})
