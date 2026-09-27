import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { beforeAll as before, describe, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { loadDesignSystem } from './design-system'
import { LYONDRIVE } from './fixtures/lyondrive-options'
import type { ScopeFlags as Scope, ZoneDef } from './types'
import type { Hardcoded } from './types'
import { lintTsxFiles, tsxSnapshot, tsxZone, type TsxZone } from './tsx-lint'

/**
 * Contrôle de l'arbre TSX entier : sondes de la critique (permutation, process.env, script, lien), className figée
 * (aucune ne s'ajoute, ne se retire ni ne change), reformatage, texte limité à la zone sélectionnée, et non-régression
 * sur les composants modifiés par le passage de référence.
 */

const here = path.dirname(fileURLToPath(import.meta.url))
const siteDir = path.join(here, 'fixtures/lyondrive')
const FOOTER = 'src/components/Footer/Footer.tsx'
const ARTICLE = 'src/components/Article/Article.tsx'
const HERO = 'src/components/Hero/Hero.tsx'
const HEADER = 'src/components/Header/Header.tsx'
const BLOG = 'src/app/(site)/blog/page.tsx'
const LAYOUT = 'src/app/layout.tsx'
const POST_CARD = 'src/components/PostCard/PostCard.tsx'
const FEATURES = 'src/components/Features/Features.tsx'

type Fixture = { id: string; zone: string; scope: ('style' | 'text')[]; hardcoded: Hardcoded[]; file: string; before: string; after: string }

const sources: Record<string, string> = {}
let fixtures: Fixture[]
let zones: Record<string, ZoneDef>
before(async () => {
  for (const file of [FOOTER, ARTICLE, HERO, HEADER, BLOG, LAYOUT, POST_CARD, FEATURES]) {
    // Composants du site copiés en .tsx.txt : hors de la compilation du dépôt (tsc, Next).
    sources[file] = await readFile(path.join(siteDir, `${file}.txt`), 'utf8')
  }
  fixtures = JSON.parse(await readFile(path.join(here, 'fixtures/reference-1.json'), 'utf8'))
  zones = (await loadDesignSystem(siteDir, LYONDRIVE)).zones
})

const STYLE: Scope = { style: true, text: false }
const TEXT: Scope = { style: false, text: true }
const BOTH: Scope = { style: true, text: true }

/** Le composant avec `from` remplacé par `to` (qui doit exister). */
function edited(file: string, from: string, to: string): string {
  assert.ok(sources[file].includes(from), `« ${from} » absent de ${file}`)
  return sources[file].replace(from, to)
}

/** La zone `id` de zones.json, vue par le contrôle TSX. */
function zone(id: string): TsxZone {
  const def = zones[id]
  assert.ok(def, `zone ${id} absente de zones.json`)
  return tsxZone(id, def)
}

/** Zone sélectionnée par défaut : celle qui contient ce que les cas modifient (layout.tsx n'a aucune zone). */
const DEFAULT_ZONE: Record<string, string> = {
  [FOOTER]: 'footer',
  [ARTICLE]: 'article.meta',
  [HERO]: 'hero',
  [HEADER]: 'header',
  [BLOG]: 'page.intro',
  [LAYOUT]: 'header',
  [POST_CARD]: 'post.card',
  [FEATURES]: 'features',
}

/** Règles des violations, triées. */
const rules = (file: string, after: string, scope: Scope, selected = DEFAULT_ZONE[file]) =>
  lintTsxFiles(file, sources[file], after, scope, zone(selected))
    .map((violation) => violation.rule)
    .sort()

describe('tsxSnapshot', () => {
  it('range à part les textes visibles et les className', () => {
    const snapshot = tsxSnapshot(FOOTER, sources[FOOTER])
    assert.deepEqual(snapshot.texts, ['LyonDrive', 'Part-Dieu · Perrache · Saint-Exupéry', 'Location de voiture à Lyon'])
    assert.deepEqual(
      snapshot.classNames.map((className) => className.text),
      ['{styles.footer}', '{`container ${styles.inner}`}', '{styles.brand}'],
    )
    assert.deepEqual(snapshot.dataEdit, ['footer'])
    assert.deepEqual(snapshot.parseErrors, [])
  })
})

describe('tsxZone', () => {
  it('prend les fichiers de texte d’une zone dont le texte est écrit dans le code', () => {
    assert.deepEqual(tsxZone('page.intro', zones['page.intro']), { id: 'page.intro', textFiles: [BLOG] })
    assert.deepEqual(tsxZone('footer', zones.footer), { id: 'footer', textFiles: [FOOTER] })
    assert.deepEqual(tsxZone('hero.title', zones['hero.title']), { id: 'hero.title', textFiles: [] })
    assert.deepEqual(tsxZone('header', zones.header), { id: 'header', textFiles: [] })
  })
})

describe('lintTsxFiles — structure', () => {
  it('refuse la permutation de deux éléments, dans tous les modes', () => {
    const swapped = edited(
      ARTICLE,
      '<span>Publié le {formatDate(post.createdAt)}</span>\n          <span>Mis à jour le {formatDate(post.updatedAt)}</span>',
      '<span>Mis à jour le {formatDate(post.updatedAt)}</span>\n          <span>Publié le {formatDate(post.createdAt)}</span>',
    )
    for (const scope of [STYLE, TEXT, BOTH]) assert.deepEqual(rules(ARTICLE, swapped, scope), ['structure-change'])
  })

  it('refuse une expression nouvelle, même à la place d’un texte', () => {
    const secret = edited(FOOTER, '<span>Location de voiture à Lyon</span>', '<span>{process.env.PREVIEW_SECRET}</span>')
    for (const scope of [STYLE, BOTH]) assert.deepEqual(rules(FOOTER, secret, scope), ['process-env', 'structure-change'])
    const className = edited(FOOTER, 'className={styles.brand}', 'className={process.env.PREVIEW_SECRET}')
    for (const scope of [STYLE, TEXT, BOTH]) {
      assert.deepEqual(rules(FOOTER, className, scope), ['classname-change', 'process-env'])
    }
  })

  it('refuse une balise script, du HTML brut, un lien modifié ou ajouté', () => {
    const script = edited(HERO, '<div className="container">', '<div className="container">\n        <script src="https://x.test/a.js" />')
    assert.deepEqual(rules(HERO, script, BOTH), ['script', 'structure-change'])
    const html = edited(HERO, '<p className={styles.subtitle} data-edit="hero.subtitle">', '<p className={styles.subtitle} data-edit="hero.subtitle" dangerouslySetInnerHTML={{ __html: subtitle }}>')
    assert.deepEqual(rules(HERO, html, BOTH), ['dangerous-html', 'structure-change'])
    assert.deepEqual(rules(HERO, edited(HERO, 'href="/blog"', 'href="https://evil.test"'), BOTH), ['structure-change'])
    const link = edited(HEADER, '<Link href="/blog">Blog</Link>', '<Link href="/blog">Blog</Link>\n          <Link href="/reserver">Réserver</Link>')
    assert.deepEqual(rules(HEADER, link, BOTH), ['structure-change'])
  })

  it('protège data-edit et refuse le style inline', () => {
    assert.deepEqual(rules(HERO, edited(HERO, ' data-edit="hero.cta"', ''), BOTH), ['data-edit', 'structure-change'])
    const inline = edited(HERO, 'className={styles.cta}', "className={styles.cta} style={{ color: '#fff' }}")
    assert.deepEqual(rules(HERO, inline, BOTH), ['inline-style', 'structure-change'])
  })

  it('refuse un opérateur unaire changé, un import passé en type, un let à la place d’un const', () => {
    // `+(await canViewDraft())` inverserait la garde de la preview privée : l'opérateur n'est pas un nœud de l'arbre.
    for (const operator of ['+', '-', '~']) {
      const flipped = edited(LAYOUT, '!(await canViewDraft())', `${operator}(await canViewDraft())`)
      assert.deepEqual(rules(LAYOUT, flipped, BOTH), ['structure-change'], operator)
    }
    const typeOnly = edited(POST_CARD, 'import { formatDate, type Post }', 'import { type formatDate, type Post }')
    assert.deepEqual(rules(POST_CARD, typeOnly, BOTH), ['structure-change'])
    assert.deepEqual(rules(LAYOUT, edited(LAYOUT, 'const isDraft', 'let isDraft'), BOTH), ['structure-change'])
  })

  it('refuse un commentaire ajouté (pragma @jsxImportSource, @jsx), sans confondre un texte visible avec un commentaire', () => {
    const importSource = edited(FOOTER, 'import styles from', '/** @jsxImportSource ./evil */\nimport styles from')
    assert.deepEqual(rules(FOOTER, importSource, BOTH), ['structure-change'])
    const pragma = edited(FOOTER, 'export function Footer', '/** @jsxRuntime classic @jsx eval */\nexport function Footer')
    assert.deepEqual(rules(FOOTER, pragma, BOTH), ['structure-change'])
    const text = edited(FOOTER, '<span>Location de voiture à Lyon</span>', '<span>// Location de voitures /* à Lyon */</span>')
    assert.deepEqual(rules(FOOTER, text, TEXT), [])
  })

  it('refuse un texte vidé (vide, blancs, entité ou caractère invisible), dans tous les modes', () => {
    // `{intro && <p data-edit="page.intro">…}` : un intro vide ferait disparaître la zone.
    const intro = 'intro="Itinéraires, conseils de location et actualités de nos agences lyonnaises."'
    for (const blank of ['', '   ', '&nbsp;', '&#160;', ' ', '​', '⁠', '﻿']) {
      const emptied = edited(BLOG, intro, `intro="${blank}"`)
      for (const scope of [STYLE, TEXT, BOTH]) {
        assert.deepEqual(rules(BLOG, emptied, scope), ['structure-change'], JSON.stringify(blank))
      }
    }
    const span = '<span>Location de voiture à Lyon</span>'
    for (const blank of ['&nbsp;', '&#160;', '&#xA0;', ' ', '​', '‍', '⁠', '﻿', ' &nbsp; ‌ ']) {
      const emptied = edited(FOOTER, span, `<span>${blank}</span>`)
      for (const scope of [STYLE, TEXT, BOTH]) {
        assert.deepEqual(rules(FOOTER, emptied, scope), ['structure-change'], JSON.stringify(blank))
      }
    }
    // Un texte visible qui contient une entité reste un texte.
    assert.deepEqual(rules(FOOTER, edited(FOOTER, span, '<span>Location&nbsp;de voiture à Lyon</span>'), TEXT), [])
  })

  it('refuse un composant supprimé ou créé', () => {
    assert.deepEqual(lintTsxFiles(FOOTER, sources[FOOTER], null, BOTH, zone('footer')).map((v) => v.rule), ['file-deleted'])
    assert.deepEqual(lintTsxFiles(FOOTER, null, sources[FOOTER], BOTH, zone('footer')).map((v) => v.rule), ['file-created'])
  })
})

describe('lintTsxFiles — texte et classes selon le périmètre', () => {
  it('className changée, même en styles.x : refusée dans tous les modes, 🖌 compris', () => {
    const wide = edited(FOOTER, 'className={styles.brand}', 'className={`${styles.brand} ${styles.big}`}')
    for (const scope of [STYLE, TEXT, BOTH]) assert.deepEqual(rules(FOOTER, wide, scope), ['classname-change'])
  })

  it('texte visible : permis avec T, refusé en mode Style', () => {
    const text = edited(FOOTER, '<span>Location de voiture à Lyon</span>', '<span>Location de voitures à Lyon</span>')
    assert.deepEqual(rules(FOOTER, text, TEXT), [])
    assert.deepEqual(rules(FOOTER, text, STYLE), ['text-change'])
    const intro = edited(BLOG, 'intro="Itinéraires, conseils de location', 'intro="Road trips, conseils de location')
    assert.deepEqual(rules(BLOG, intro, TEXT), [])
  })

  it('accepte un reformatage sans autre changement', () => {
    const reformatted = edited(FOOTER, '<span className={styles.brand}>LyonDrive</span>', '<span\n          className={styles.brand}\n        >\n          LyonDrive\n        </span>')
    for (const scope of [STYLE, TEXT]) assert.deepEqual(rules(FOOTER, reformatted, scope), [])
  })
})

describe('lintTsxFiles — className figée', () => {
  // Aucune className ne s'ajoute, ne se retire ni ne change, quel que soit le mode : le style passe par les règles CSS de
  // la zone. Une classe prise à une autre zone (ou libérée par sa zone, puis reprise) lierait deux zones : une demande
  // sur l'une restylerait l'autre.

  it('refuse toute className modifiée, quelle que soit sa forme, dans tous les modes et pour toute zone', () => {
    const changes: [file: string, from: string, to: string, zone: string][] = [
      // Classe nouvelle, portée par aucun élément du composant.
      [HEADER, 'className={styles.nav}', 'className={`${styles.nav} ${styles.wide}`}', 'header.nav'],
      [HERO, 'className={styles.hero}', 'className={`${styles.hero} ${styles.wide}`}', 'hero'],
      [POST_CARD, 'className={styles.title}', 'className={styles.wide}', 'post.card.title'],
      // Classe d'un autre élément de la même zone.
      [POST_CARD, 'className={styles.subtitle}', 'className={`${styles.subtitle} ${styles.date}`}', 'post.card'],
      [FOOTER, 'className={styles.brand}', 'className={`${styles.inner} ${styles.brand}`}', 'footer'],
      [HERO, 'className={styles.title}', 'className={`${styles.title} ${styles.accent}`}', 'hero.title'],
      // Classe du conteneur, d'une voisine, d'une zone intérieure ou d'un élément hors zone.
      [HERO, 'className={styles.cta}', 'className={`${styles.cta} ${styles.hero}`}', 'hero.cta'],
      [HERO, 'className={styles.subtitle}', "className={styles.hero + ' ' + styles.cta}", 'hero.subtitle'],
      [HEADER, 'className={styles.logo}', 'className={styles.nav}', 'header.logo'],
      [HEADER, 'className={styles.header}', 'className={`${styles.header} ${styles.nav}`}', 'header'],
      [FEATURES, 'className={styles.grid}', 'className={`${styles.grid} ${styles.card}`}', 'features'],
      [ARTICLE, 'className={styles.meta}', 'className={`${styles.meta} ${styles.image}`}', 'article.meta'],
      // Élément hors de la zone, chaîne littérale, accès optionnel ou calculé, expression quelconque.
      [HEADER, 'className={`container ${styles.inner}`}', 'className={styles.inner}', 'header.nav'],
      [HERO, '<div className="container">', '<div className="container wide">', 'hero'],
      [HERO, '<div className="container">', '<div className={`container ${styles.title}`}>', 'hero'],
      [HERO, 'className={styles.cta}', 'className={styles?.cta}', 'hero.cta'],
      [HERO, 'className={styles.cta}', "className={styles['cta']}", 'hero.cta'],
      [HERO, 'className={styles.cta}', "className={[styles.cta, styles.hero].join(' ')}", 'hero.cta'],
    ]
    for (const [file, from, to, id] of changes) {
      const after = edited(file, from, to)
      for (const scope of [STYLE, TEXT, BOTH]) {
        assert.deepEqual(rules(file, after, scope, id), ['classname-change'], `${id} ${to}`)
      }
    }
    // Le message cite la valeur à remettre.
    const cta = edited(HERO, 'className={styles.cta}', 'className={`${styles.cta} ${styles.hero}`}')
    const [violation] = lintTsxFiles(HERO, sources[HERO], cta, BOTH, zone('hero.cta'))
    assert.ok(violation.message.includes('`{styles.cta}`'), violation.message)
  })

  it('refuse dès la 1re étape une classe libérée par sa zone puis reprise par une autre', () => {
    // [fichier, zone qui libère sa classe, avant, après, zone qui la reprend ensuite, avant, après]
    const chains: [file: string, first: string, from1: string, to1: string, second: string, from2: string, to2: string][] = [
      [
        HERO,
        'hero',
        'className={styles.hero}',
        'className={styles.wide}',
        'hero.cta',
        'className={styles.cta}',
        'className={`${styles.cta} ${styles.hero}`}',
      ],
      [
        HERO,
        'hero.cta',
        'className={styles.cta}',
        'className={styles.wide}',
        'hero',
        'className={styles.hero}',
        'className={`${styles.hero} ${styles.cta}`}',
      ],
      [
        HEADER,
        'header.logo',
        'className={styles.logo}',
        'className={styles.wide}',
        'header.nav',
        'className={styles.nav}',
        'className={`${styles.nav} ${styles.logo}`}',
      ],
      [
        POST_CARD,
        'post.card.title',
        'className={styles.title}',
        'className={styles.wide}',
        'post.card',
        'className={styles.body}',
        'className={`${styles.body} ${styles.title}`}',
      ],
    ]
    for (const [file, first, from1, to1, second, from2, to2] of chains) {
      const released = edited(file, from1, to1)
      for (const scope of [STYLE, BOTH]) assert.deepEqual(rules(file, released, scope, first), ['classname-change'], first)
      // La reprise est refusée aussi, même partie du composant déjà modifié.
      assert.ok(released.includes(from2), from2)
      const taken = released.replace(from2, to2)
      for (const scope of [STYLE, BOTH]) {
        const violations = lintTsxFiles(file, released, taken, scope, zone(second)).map((violation) => violation.rule)
        assert.deepEqual(violations, ['classname-change'], `${first} puis ${second}`)
      }
    }
  })

  it('refuse le nom haché public d’un CSS Module écrit en littéral', () => {
    // Noms visibles dans le HTML du site : ils désignent la classe d'un autre composant ou d'une autre zone.
    const hashed: [file: string, from: string, to: string, zone: string][] = [
      [HERO, 'className={styles.cta}', 'className={`${styles.cta} Hero-module__JgYmMq__hero`}', 'hero.cta'],
      [HEADER, 'className={styles.nav}', 'className={`${styles.nav} Hero-module__JgYmMq__cta`}', 'header.nav'],
      [HEADER, 'className={styles.nav}', "className={styles.nav + ' Header-module__ldgnoG__logo'}", 'header.nav'],
      [HEADER, 'className={styles.nav}', "className={'Footer-module__Grjkva__footer'}", 'header.nav'],
      [HEADER, 'className={styles.nav}', 'className="Footer-module__Grjkva__footer"', 'header.nav'],
    ]
    for (const [file, from, to, id] of hashed) {
      const after = edited(file, from, to)
      for (const scope of [STYLE, TEXT, BOTH]) {
        assert.deepEqual(rules(file, after, scope, id), ['classname-change'], `${id} ${to}`)
      }
    }
  })

  it('refuse une className ajoutée ou retirée, et une classe passée par décomposition', () => {
    const span = '<span>Location de voiture à Lyon</span>'
    const added = edited(FOOTER, span, '<span className={styles.brand}>Location de voiture à Lyon</span>')
    const literal = edited(FOOTER, span, '<span className="Header-module__ldgnoG__logo">Location de voiture à Lyon</span>')
    const removed = edited(FOOTER, '<span className={styles.brand}>', '<span>')
    for (const after of [added, literal, removed]) {
      for (const scope of [STYLE, TEXT, BOTH]) {
        assert.deepEqual(rules(FOOTER, after, scope), ['classname-change', 'structure-change'])
      }
    }
    const spread = edited(FOOTER, span, '<span {...{ className: styles.brand }}>Location de voiture à Lyon</span>')
    for (const scope of [STYLE, TEXT, BOTH]) assert.deepEqual(rules(FOOTER, spread, scope), ['structure-change'])
  })

  it('accepte une className reformatée (blancs seuls)', () => {
    const spaced = edited(FOOTER, 'className={styles.footer}', 'className={ styles.footer }')
    const inner = 'className={`container ${styles.inner}`}'
    const wrapped = edited(FOOTER, inner, 'className={\n        `container ${styles.inner}`\n      }')
    for (const after of [spaced, wrapped]) {
      for (const scope of [STYLE, TEXT, BOTH]) assert.deepEqual(rules(FOOTER, after, scope), [])
    }
  })
})

describe('lintTsxFiles — zone sélectionnée', () => {
  it('refuse un texte changé hors du sous-arbre de la zone ou de ses fichiers de texte', () => {
    const logo = edited(HEADER, 'LyonDrive', 'LyonDrive Location')
    assert.deepEqual(rules(HEADER, logo, TEXT, 'header.nav'), ['text-zone'])
    assert.deepEqual(rules(HEADER, logo, TEXT, 'header.logo'), [])
    const blog = edited(HEADER, '<Link href="/blog">Blog</Link>', '<Link href="/blog">Le blog</Link>')
    assert.deepEqual(rules(HEADER, blog, BOTH, 'header.logo'), ['text-zone'])
    assert.deepEqual(rules(HEADER, blog, BOTH, 'header.nav'), [])
    // Un attribut de texte de l'élément data-edit est dans la zone ; hors d'elle, non, même dans un fichier de texte.
    const label = edited(HEADER, 'aria-label="Navigation principale"', 'aria-label="Menu du site"')
    assert.deepEqual(rules(HEADER, label, TEXT, 'header.nav'), [])
    assert.deepEqual(rules(HEADER, label, TEXT, 'header.logo'), ['text-zone'])
    const text = edited(FOOTER, '<span>Location de voiture à Lyon</span>', '<span>Location de voitures à Lyon</span>')
    assert.deepEqual(rules(FOOTER, text, TEXT, 'header.logo'), ['text-zone'])
    // Zone dont le texte n'est pas écrit dans ce fichier (texte du CMS, ou aucun) : même son sous-arbre reste figé.
    assert.deepEqual(rules(HEADER, logo, BOTH, 'header'), ['text-zone'])
    const meta = edited(ARTICLE, '<span>Publié le', '<span>Paru le')
    for (const id of ['article.meta', 'article.title']) assert.deepEqual(rules(ARTICLE, meta, TEXT, id), ['text-zone'], id)
  })

  it('accepte un attribut de texte d’un fichier de text.files qui ne contient pas la zone (page.title, page.intro)', () => {
    const title = edited(BLOG, 'title="Blog"', 'title="Le blog"')
    assert.deepEqual(rules(BLOG, title, TEXT, 'page.title'), [])
    const intro = edited(BLOG, 'intro="Itinéraires, conseils de location', 'intro="Road trips, conseils de location')
    assert.deepEqual(rules(BLOG, intro, TEXT, 'page.intro'), [])
    for (const id of ['footer', 'hero.title']) assert.deepEqual(rules(BLOG, intro, TEXT, id), ['text-zone'], id)
  })
})

describe('lintTsxFiles — passage de référence', () => {
  it('accepte les composants modifiés en mode Texte, avec leur zone (T06, T10)', () => {
    const tsx = fixtures.filter((entry) => entry.file.endsWith('.tsx'))
    assert.deepEqual(
      tsx.map((entry) => [entry.id, entry.zone]),
      [
        ['T06', 'footer'],
        ['T10', 'header.logo'],
      ],
    )
    for (const entry of tsx) {
      assert.deepEqual(lintTsxFiles(entry.file, entry.before, entry.after, TEXT, zone(entry.zone)), [], entry.id)
    }
  })
})
