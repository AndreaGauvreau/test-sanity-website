import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import { PNG } from 'pngjs'
import { toZoneMeasure, type RawPaint, type RawPaints } from './measure'
import {
  compareZones,
  crop,
  FINGERPRINT_PROPERTIES,
  mergeToggles,
  pageTextsOf,
  PAINT_GROUPS,
  planStates,
  reachedTexts,
  rulesApart,
  selectorSubject,
  unmeasuredRules,
  type Capture,
  type DomNode,
  type PaintGroup,
  type RawRule,
  type StatePlan,
  type ZoneBox,
  type ZoneRelation,
} from './visual'

const WIDTH = 100
const HEIGHT = 60

function page(paint: (x: number, y: number) => [number, number, number] = () => [15, 23, 42]): PNG {
  const png = new PNG({ width: WIDTH, height: HEIGHT })
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const i = (y * WIDTH + x) * 4
      const [r, g, b] = paint(x, y)
      png.data[i] = r
      png.data[i + 1] = g
      png.data[i + 2] = b
      png.data[i + 3] = 255
    }
  }
  return png
}

/** Styles propres par défaut, un par propriété relevée. */
const OWN = FINGERPRINT_PROPERTIES.map((property) => `${property}-initial`)
/** Styles propres avec ces valeurs changées. */
const withOwn = (changes: Record<string, string>) => FINGERPRINT_PROPERTIES.map((property, i) => changes[property] ?? OWN[i])

const zone = (
  key: string,
  x: number,
  y: number,
  width: number,
  height: number,
  relation: ZoneRelation = 'other',
  fingerprint = 'base',
  own = OWN,
): ZoneBox => {
  const [id, index] = key.split('#')
  return { key, zone: id, index: Number(index), x, y, width, height, relation, own, fingerprint, text: '' }
}

const capture = (png: PNG, zones: ZoneBox[]): Capture => ({
  viewport: 375,
  status: 200,
  errors: [],
  overflow: 0,
  zones,
  png,
  measure: toZoneMeasure(375, null),
  occurrences: [toZoneMeasure(375, null)],
  painted: [toZoneMeasure(375, null)],
  rules: [],
})

// Deux zones : un bouton (sélectionné) à gauche, un titre à droite.
const zonesBefore = [zone('hero.cta#0', 0, 0, 40, 20, 'self'), zone('hero.title#0', 50, 0, 40, 20)]

describe('compareZones', () => {
  it('ne signale rien quand seule la zone sélectionnée change', () => {
    const before = capture(page(), zonesBefore)
    const after = capture(page((x, y) => (x < 40 && y < 20 ? [190, 18, 60] : [15, 23, 42])), zonesBefore)
    assert.deepEqual(compareZones(before, after), [])
  })

  it('signale une autre zone dont les pixels changent', () => {
    const before = capture(page(), zonesBefore)
    const after = capture(page((x, y) => (x >= 50 && x < 90 && y < 20 ? [255, 255, 255] : [15, 23, 42])), zonesBefore)
    assert.deepEqual(
      compareZones(before, after).map((change) => [change.zone, change.reason]),
      [['hero.title', 'pixels']],
    )
  })

  it('tolère un simple décalage de position, pas un changement de taille', () => {
    const before = capture(page(), zonesBefore)
    const moved = capture(page(), [zonesBefore[0], zone('hero.title#0', 50, 30, 40, 20)])
    assert.deepEqual(compareZones(before, moved), [])

    const resized = capture(page(), [zonesBefore[0], zone('hero.title#0', 50, 0, 48, 20)])
    assert.deepEqual(compareZones(before, resized).map((change) => change.reason), ['resized'])
  })

  it('ignore les pixels d’une zone décalée mais repère ses styles modifiés', () => {
    const before = capture(page(), zonesBefore)
    // Décalée d'une fraction de pixel : le rendu du texte change, pas la zone elle-même.
    const shifted = capture(page(() => [40, 40, 40]), [zonesBefore[0], zone('hero.title#0', 50, 1, 40, 20)])
    assert.deepEqual(compareZones(before, shifted), [])

    const restyled = capture(page(), [zonesBefore[0], zone('hero.title#0', 50, 1, 40, 20, 'other', 'font-size:40px')])
    assert.deepEqual(compareZones(before, restyled).map((change) => change.reason), ['styles'])
  })

  it('signale une zone disparue', () => {
    const before = capture(page(), zonesBefore)
    const after = capture(page(), [zonesBefore[0]])
    assert.deepEqual(compareZones(before, after).map((change) => change.reason), ['missing'])
  })
})

describe('compareZones — zones intérieures et ancêtres', () => {
  const reasons = (before: ZoneBox[], after: ZoneBox[]) =>
    compareZones(capture(page(), before), capture(page(), after)).map(({ zone: id, reason, properties }) => ({
      id,
      reason,
      properties,
    }))

  it('cible hero : la police d’une zone intérieure change → refus', () => {
    const before = [zone('hero#0', 0, 0, 100, 60, 'self'), zone('hero.title#0', 10, 10, 40, 20, 'child')]
    const after = [before[0], zone('hero.title#0', 10, 10, 40, 20, 'child', 'base', withOwn({ 'font-family': 'Montserrat' }))]
    assert.deepEqual(reasons(before, after), [{ id: 'hero.title', reason: 'styles', properties: ['font-family'] }])
  })

  it('cible hero : marges et alignement d’une zone intérieure (R08) → placement signalé', () => {
    const before = [zone('hero#0', 0, 0, 100, 60, 'self'), zone('hero.title#0', 10, 10, 40, 20, 'child')]
    const centered = withOwn({ 'text-align': 'center', 'margin-left': '30px', 'margin-right': '30px' })
    const after = [before[0], zone('hero.title#0', 30, 10, 40, 20, 'child', 'centré', centered)]
    assert.deepEqual(reasons(before, after), [
      { id: 'hero.title', reason: 'placement', properties: ['text-align', 'margin-right', 'margin-left'] },
    ])
  })

  it('cible hero : ordre et alignement propre d’une zone intérieure → placement signalé', () => {
    const before = [zone('hero#0', 0, 0, 100, 60, 'self'), zone('hero.cta#0', 10, 40, 40, 10, 'child')]
    const after = [before[0], zone('hero.cta#0', 50, 40, 40, 10, 'child', 'base', withOwn({ order: '2', 'align-self': 'end' }))]
    assert.deepEqual(reasons(before, after), [{ id: 'hero.cta', reason: 'placement', properties: ['order', 'align-self'] }])
  })

  it('cible hero : soulignement propagé ou text-wrap hérité par une zone intérieure → refus', () => {
    const before = [zone('hero#0', 0, 0, 100, 60, 'self'), zone('hero.title#0', 10, 10, 40, 20, 'child')]
    // Un soulignement du conteneur se propage au texte des zones intérieures sans changer leur text-decoration-line.
    const underlined = withOwn({ '-webkit-text-decorations-in-effect': 'underline' })
    assert.deepEqual(reasons(before, [before[0], zone('hero.title#0', 10, 10, 40, 20, 'child', 'base', underlined)]), [
      { id: 'hero.title', reason: 'styles', properties: ['-webkit-text-decorations-in-effect'] },
    ])
    const balanced = withOwn({ 'text-wrap': 'balance' })
    assert.deepEqual(reasons(before, [before[0], zone('hero.title#0', 10, 10, 40, 20, 'child', 'base', balanced)]), [
      { id: 'hero.title', reason: 'styles', properties: ['text-wrap'] },
    ])
  })

  it('cible hero.title : le fond de l’ancêtre change → refus ; sa hauteur seule → rien', () => {
    const before = [zone('hero#0', 0, 0, 100, 60, 'ancestor'), zone('hero.title#0', 10, 10, 40, 20, 'self')]
    const white = withOwn({ 'background-color': 'rgb(255, 255, 255)' })
    const restyled = [zone('hero#0', 0, 0, 100, 60, 'ancestor', 'base', white), before[1]]
    assert.deepEqual(reasons(before, restyled), [{ id: 'hero', reason: 'styles', properties: ['background-color'] }])
    const taller = [zone('hero#0', 0, 0, 100, 80, 'ancestor', 'autre'), before[1]]
    assert.deepEqual(reasons(before, taller), [])
  })

  it('cible blog.list : une carte redimensionnée sans changement de style (R05) → rien', () => {
    const before = [zone('blog.list#0', 0, 0, 100, 60, 'self'), zone('post.card#0', 0, 0, 100, 30, 'child')]
    const after = [before[0], zone('post.card#0', 0, 0, 48, 50, 'child', 'trois colonnes')]
    assert.deepEqual(reasons(before, after), [])
  })

  it('une zone intérieure disparue est signalée', () => {
    const before = [zone('hero#0', 0, 0, 100, 60, 'self'), zone('hero.subtitle#0', 10, 30, 40, 10, 'child')]
    assert.deepEqual(reasons(before, [before[0]]), [{ id: 'hero.subtitle', reason: 'missing', properties: undefined }])
  })
})

describe('crop', () => {
  it('reste dans les limites de l’image', () => {
    const cropped = crop(page(), { x: 90, y: 50, width: 40, height: 40 })
    assert.equal(cropped?.width, 10)
    assert.equal(cropped?.height, 10)
    assert.equal(crop(page(), { x: 200, y: 0, width: 10, height: 10 }), null)
  })
})

describe('planStates — états forcés de chaque occurrence, par profondeur, et leurs combinaisons (décision 16)', () => {
  const text = (nodeId: number, nodeValue = 'Texte'): DomNode => ({ nodeId, nodeType: 3, nodeName: '#text', nodeValue })
  const el = (nodeId: number, nodeName: string, attributes: Record<string, string> = {}, children: DomNode[] = []): DomNode => ({
    nodeId,
    nodeType: 1,
    nodeName: nodeName.toUpperCase(),
    attributes: Object.entries(attributes).flat(),
    children,
  })
  const card = { 'data-edit': 'post.card' }
  // Liste d’articles du blog : la 1re carte dans un lien, avec un bouton ; la 2e dans un <a> sans href ; la 3e seule, avec
  // une image et un paragraphe vide (sans texte : jamais forcés).
  const document: DomNode = {
    nodeId: 1,
    nodeType: 9,
    nodeName: '#document',
    children: [
      el(2, 'html', {}, [
        el(3, 'body', {}, [
          el(4, 'main', {}, [
            text(40),
            el(5, 'a', { href: '/blog/a' }, [
              el(6, 'article', card, [
                text(60),
                el(7, 'h3', {}, [text(70)]),
                el(8, 'p', {}, [text(80), el(9, 'em', {}, [text(90)])]),
                el(16, 'button', {}, [text(160)]),
              ]),
            ]),
            el(10, 'a', {}, [el(11, 'article', card, [el(12, 'h3', {}, [text(120)]), el(13, 'p', {}, [text(130)])])]),
            el(15, 'article', card, [el(17, 'h3', {}, [text(170)]), el(18, 'img'), el(19, 'p', {}, [text(190, ' \n ')])]),
          ]),
        ]),
      ]),
    ],
  }
  const plans = () => planStates(document, 'post.card', [0, 1, 5])
  const plan = (kind: string, hover: number | null, focus: number | null) =>
    plans().find((entry) => entry.kind === kind && entry.hover === hover && entry.focus === focus)
  const named = (entry: StatePlan) =>
    `${entry.kind}${entry.hover === null ? '' : ` h${entry.hover}`}${entry.focus === null ? '' : ` f${entry.focus}`}`
  const forced = (ids: number[], classes: string[]) => ids.map((id) => [id, classes])

  it('survole et clique à chaque profondeur, des ancêtres seuls (-1) au texte le plus profond, puis focalise', () => {
    const hovers = (kind: string, focus: string, depths: number[], ranks = '[0]') =>
      depths.map((depth) => `${kind} h${depth}${focus} ${ranks}`)
    assert.deepEqual(
      plans().map((entry) => `${named(entry)} [${entry.ranks.join(', ')}]`),
      [
        ...hovers('hover', '', [-1, 0, 1], '[0, 1]'),
        'hover h2 [0]',
        ...hovers('active', '', [-1, 0, 1], '[0, 1]'),
        'active h2 [0]',
        'focus-visible f-1 [0]',
        'focus-visible f1 [0]',
        'focus f-1 [0]',
        'focus f1 [0]',
        ...hovers('hover-focus', ' f-1', [-1, 0, 1, 2]),
        ...hovers('hover-focus', ' f1', [-1, 0, 1, 2]),
        ...hovers('hover-focus-visible', ' f-1', [-1, 0, 1, 2]),
        ...hovers('hover-focus-visible', ' f1', [-1, 0, 1, 2]),
        // Clic : le pointeur est sur l’élément focalisé ou dans lui, jamais au-dessus.
        ...hovers('active-focus', ' f-1', [-1, 0, 1, 2]),
        ...hovers('active-focus', ' f1', [1, 2]),
        ...hovers('active-focus-visible', ' f-1', [-1, 0, 1, 2]),
        ...hovers('active-focus-visible', ' f1', [1, 2]),
      ],
    )
  })

  it('force chacune des 8 combinaisons que Chrome donne : :active suppose :hover, :focus-visible suppose :focus', () => {
    // Bouton de la 1re carte (nœud 16) : il porte un texte (profondeur 1) et prend le focus.
    const seen = new Set(plans().map((entry) => (entry.forced.get(16) ?? []).filter((name) => name !== 'focus-within').join('+')))
    seen.delete('')
    const names = ['hover', 'active', 'focus', 'focus-visible']
    const coherent: string[] = []
    for (let mask = 1; mask < 16; mask++) {
      const set = names.filter((_, bit) => mask & (1 << bit))
      if (set.includes('active') && !set.includes('hover')) continue
      if (set.includes('focus-visible') && !set.includes('focus')) continue
      coherent.push(set.join('+'))
    }
    assert.equal(coherent.length, 8)
    assert.deepEqual([...seen].sort(), coherent.sort())
    // Clic avec le focus clavier (Tab, puis bouton de la souris enfoncé sur l’élément) : le pointeur sur lui ou plus bas.
    assert.deepEqual(plan('active-focus-visible', 1, 1)!.forced.get(16), ['hover', 'active', 'focus', 'focus-visible'])
    assert.equal(plan('active-focus-visible', 0, 1), undefined)
  })

  it('force à chaque profondeur les éléments qui portent un texte et leurs ancêtres jusqu’à <html>, partout', () => {
    assert.deepEqual([...plan('hover', 2, null)!.forced], forced([6, 7, 8, 9, 16, 5, 4, 3, 2], ['hover']))
    assert.deepEqual([...plan('hover', 1, null)!.forced], forced([6, 7, 8, 16, 5, 4, 3, 2, 11, 12, 13, 10], ['hover']))
    assert.deepEqual([...plan('hover', 0, null)!.forced], forced([6, 5, 4, 3, 2, 11, 10], ['hover']))
    assert.deepEqual([...plan('active', -1, null)!.forced], forced([5, 4, 3, 2, 10], ['hover', 'active']))
  })

  it('focalise ensemble les éléments d’une même profondeur qui prennent le focus, leurs ancêtres en :focus-within', () => {
    const within = (ids: number[]) => forced(ids, ['focus-within'])
    assert.deepEqual([...plan('focus-visible', null, 1)!.forced], [[16, ['focus', 'focus-visible']], ...within([6, 5, 4, 3, 2])])
    assert.deepEqual([...plan('focus', null, 1)!.forced], [[16, ['focus']], ...within([6, 5, 4, 3, 2])])
    assert.deepEqual([...plan('focus-visible', null, -1)!.forced], [[5, ['focus', 'focus-visible']], ...within([4, 3, 2])])
    // Le <a> sans href de la 2e carte ne prend pas le focus : aucun focus relevé pour elle.
    assert.deepEqual(plan('focus', null, -1)!.ranks, [0])
  })

  it('combine survol et focus : survol avec le focus, survol avec le focus clavier, clic qui donne le focus', () => {
    const hovered = (ids: number[], extra: string[]) => forced(ids, ['hover', ...extra])
    assert.deepEqual(
      [...plan('hover-focus', 2, 1)!.forced],
      [
        [6, ['hover', 'focus-within']],
        ...hovered([7, 8, 9], []),
        [16, ['hover', 'focus']],
        ...hovered([5, 4, 3, 2], ['focus-within']),
      ],
    )
    assert.deepEqual(
      [...plan('hover-focus-visible', 0, -1)!.forced],
      [[6, ['hover']], [5, ['hover', 'focus', 'focus-visible']], ...hovered([4, 3, 2], ['focus-within'])],
    )
    assert.deepEqual(
      [...plan('active-focus', 1, 1)!.forced],
      [
        [6, ['hover', 'active', 'focus-within']],
        ...hovered([7, 8], ['active']),
        [16, ['hover', 'active', 'focus']],
        ...hovered([5, 4, 3, 2], ['active', 'focus-within']),
      ],
    )
    // Survol au-dessus de l’élément focalisé : combiné au focus, jamais au clic.
    assert.ok(plan('hover-focus', 0, 1))
    assert.equal(plan('active-focus', 0, 1), undefined)
  })

  it('ignore une occurrence introuvable ou sans texte ; seuls les éléments qui portent un texte comptent', () => {
    assert.deepEqual(planStates(document, 'post.card', [5]), [])
    const html = el(2, 'html', {}, [el(3, 'body', {}, [el(4, 'article', card, [el(5, 'img')])])])
    const empty: DomNode = { nodeId: 1, nodeType: 9, nodeName: '#document', children: [html] }
    assert.deepEqual(planStates(empty, 'post.card', [0]), [])
    // 3e carte : son titre seul (l’image et le paragraphe fait de blancs ne sont jamais forcés).
    assert.deepEqual(
      planStates(document, 'post.card', [2]).map((entry) => `${named(entry)} ${[...entry.forced.keys()].join(',')}`),
      [
        'hover h-1 4,3,2',
        'hover h0 15,4,3,2',
        'hover h1 15,17,4,3,2',
        'active h-1 4,3,2',
        'active h0 15,4,3,2',
        'active h1 15,17,4,3,2',
      ],
    )
  })
})

describe('unmeasuredRules — règles de peinture ajoutées ou modifiées sans effet sur les textes relevés (décision 19)', () => {
  // Règle de la page relevée par READ_ZONE, un sélecteur et un groupe de peinture à la fois : son @media, ce sélecteur et
  // les déclarations du groupe (`rule`), le sélecteur seul, les propriétés du groupe qu’elle pose, et si la désactiver le
  // temps d’une lecture change une peinture relevée (`effect`).
  const rule = (text: string, selector: string, effect: boolean, media = '', properties = ['color']) => ({
    rule: `${media}${text}`,
    selector,
    properties,
    effect,
  })
  const content = rule('.Article-module__x1Y-zq__content { color: rgb(248, 250, 252) }', '.Article-module__x1Y-zq__content', true)

  it('nomme une règle ajoutée sans effet, au nom de classe du CSS Module, avec les propriétés en cause', () => {
    const added = rule(
      '.Article-module__x1Y-zq__content > :nth-child(n+1) { color: rgb(15, 23, 42) }',
      '.Article-module__x1Y-zq__content > :nth-child(n+1)',
      false,
    )
    assert.deepEqual(
      unmeasuredRules(
        [[content], [content]],
        [
          [content, added],
          [content, added],
        ],
      ),
      ['.content > :nth-child(n+1) { color }'],
    )
  })

  it('ignore une règle inchangée, même sans effet, et une règle ajoutée qui a un effet à une largeur au moins', () => {
    const old = rule(
      '.Article-module__x1Y-zq__content h2 { color: rgb(253, 230, 138) }',
      '.Article-module__x1Y-zq__content h2',
      false,
    )
    assert.deepEqual(unmeasuredRules([[content, old]], [[content, old]]), [])
    const wide = (effect: boolean) =>
      rule(
        '.Hero-module__ab_cd9__title { color: rgb(225, 29, 72) }',
        '.Hero-module__ab_cd9__title',
        effect,
        '@media (min-width: 48rem) ',
      )
    assert.deepEqual(unmeasuredRules([[], [], []], [[wide(false)], [wide(false)], [wide(true)]]), [])
  })

  it('juge chaque sélecteur d’une liste et chaque groupe de peinture d’une règle à part', () => {
    // `.title, .accent:hover { color: … }` : un sélecteur de la liste à la fois.
    const list = [
      rule('.Hero-module__ab_cd9__title { color: rgb(253, 230, 138) }', '.Hero-module__ab_cd9__title', true),
      rule('.Hero-module__ab_cd9__accent:hover { color: rgb(253, 230, 138) }', '.Hero-module__ab_cd9__accent:hover', false),
    ]
    assert.deepEqual(unmeasuredRules([[]], [list]), ['.accent:hover { color }'])
    // `.content { color: … ; background-color: … }` : le fond change les textes, la couleur n’en change aucun.
    const groups = [
      rule('.Article-module__x1Y-zq__content { color: rgb(15, 23, 42) }', '.Article-module__x1Y-zq__content', false),
      rule(
        '.Article-module__x1Y-zq__content { background-color: rgb(30, 41, 59) }',
        '.Article-module__x1Y-zq__content',
        true,
        '',
        ['background-color'],
      ),
    ]
    assert.deepEqual(unmeasuredRules([[]], [groups]), ['.content { color }'])
    // Taille et graisse, sans effet : nommées avec leurs propriétés.
    const font = rule(
      '.Article-module__x1Y-zq__content p { font-size: 14px; font-weight: 700 }',
      '.Article-module__x1Y-zq__content p',
      false,
      '',
      ['font-size', 'font-weight'],
    )
    assert.deepEqual(unmeasuredRules([[]], [[font]]), ['.content p { font-size, font-weight }'])
  })

  it('reconnaît une règle inchangée dont le CSS Module a été recompilé sous un autre hachage', () => {
    const before = rule(
      '.PostCard-module__aJ-wiq__card { background-color: rgb(30, 41, 59) }',
      '.PostCard-module__aJ-wiq__card',
      false,
      '',
      ['background-color'],
    )
    const after = rule(
      '.PostCard-module__Zz9_0b__card { background-color: rgb(30, 41, 59) }',
      '.PostCard-module__Zz9_0b__card',
      false,
      '',
      ['background-color'],
    )
    assert.deepEqual(unmeasuredRules([[before]], [[after]]), [])
  })

  it('rend null quand les règles de la page n’ont pas toutes été lues, après la modification', () => {
    assert.equal(unmeasuredRules([[content]], [[content], null]), null)
    // Avant, relevé en partie : chaque règle d’après sans effet compte comme ajoutée.
    const old = rule(
      '.Article-module__x1Y-zq__content h2 { color: rgb(253, 230, 138) }',
      '.Article-module__x1Y-zq__content h2',
      false,
    )
    assert.deepEqual(unmeasuredRules([null], [[content, old]]), ['.content h2 { color }'])
  })
})

describe('reachedTexts — textes dont une règle change la propriété de son groupe (décision 19, 4e relecture)', () => {
  const NUIT = [{ color: 'rgb(15, 23, 42)', image: 'none' }]
  const TEXTE = [{ color: 'rgb(248, 250, 252)', image: 'none' }]
  const paint = (key: string, partial: Partial<RawPaint> = {}): RawPaint => ({
    key,
    text: `Texte ${key}`,
    color: 'rgb(248, 250, 252)',
    fontSize: 18,
    fontWeight: '400',
    layers: NUIT,
    ...partial,
  })
  const read = (...texts: RawPaint[]): RawPaints => ({ texts, total: texts.length })

  it('ne compte que la propriété du groupe : une couleur qui ne change que le fond (currentColor) est sans effet', () => {
    // `.content { color: … ; background-color: currentColor }` : la couleur témoin de la zone change le fond des
    // paragraphes, pas leur couleur (rétablie par une règle plus précise).
    const reference = [read(paint('0'), paint('1'))]
    const toggled = [read(paint('0', { layers: TEXTE }), paint('1', { layers: TEXTE }))]
    assert.deepEqual(reachedTexts('color', reference, toggled), [])
    assert.deepEqual(reachedTexts('background', reference, toggled), [
      { index: 0, key: '0' },
      { index: 0, key: '1' },
    ])
    assert.deepEqual(reachedTexts('font', reference, toggled), [])
  })

  it('couleur, fond, taille et graisse, occurrence par occurrence ; une occurrence introuvable ne compte pas', () => {
    const reference = [read(paint('0'), paint('1')), null, read(paint('0'))]
    const toggled = [
      read(paint('0', { color: 'rgb(1, 2, 3)' }), paint('1', { fontWeight: '100' })),
      null,
      read(paint('0', { fontSize: 7 })),
    ]
    assert.deepEqual(reachedTexts('color', reference, toggled), [{ index: 0, key: '0' }])
    assert.deepEqual(reachedTexts('font', reference, toggled), [
      { index: 0, key: '1' },
      { index: 2, key: '0' },
    ])
    assert.deepEqual(reachedTexts('background', reference, toggled), [])
  })
})

describe('selectorSubject — sujet d’un sélecteur de la page, pour juger sa portée (décision 19, 4e relecture)', () => {
  it('dit si le sujet porte une classe, une balise, ou ni l’une ni l’autre', () => {
    assert.equal(selectorSubject('.Article-module__x1Y-zq__content'), 'class')
    assert.equal(selectorSubject('.Hero-module__ab_cd9__title .Hero-module__ab_cd9__accent'), 'class')
    assert.equal(selectorSubject('.card:hover .date'), 'class')
    assert.equal(selectorSubject('.cta:focus-visible'), 'class')
    assert.equal(selectorSubject('.Article-module__x1Y-zq__content h2'), 'tag')
    assert.equal(selectorSubject('.content > p:nth-child(-n+10)'), 'tag')
    assert.equal(selectorSubject('.nav a:hover'), 'tag')
    // Sujet fait de pseudo-classes seules : il vise n’importe quelle balise.
    assert.equal(selectorSubject('.content > :nth-child(n+1)'), 'none')
    assert.equal(selectorSubject('.content > :nth-child(2n + 1):hover'), 'none')
    assert.equal(selectorSubject('.meta > :last-child'), 'none')
    assert.equal(selectorSubject('.content :nth-child(n+1 of .x)'), 'none')
  })
})

describe('rulesApart — règles désactivées pour juger seule une règle d’une zone à contenu libre (5e relecture)', () => {
  const rule = (selector: string, group: PaintGroup, path = [0, 1]): RawRule => ({
    rule: `${selector} { ${group} }`,
    selector,
    group,
    properties: [...PAINT_GROUPS[group]],
    applies: true,
    at: { path, list: selector },
    effect: false,
  })

  it('désactive les autres règles de son groupe, et celles des autres groupes sauf même sélecteur ou toute la zone', () => {
    // `.content { background-color: Blanc }` + `.content p, .content h2 { color: Nuit }` (D1) : les couleurs des balises
    // sont désactivées pour juger le fond de la zone ; le fond de la zone reste pour juger ces couleurs.
    const zoneBackground = rule('.content', 'background', [0, 2])
    const zoneColor = rule('.content', 'color', [0, 2])
    const paragraphs = rule('.content p', 'color', [0, 3])
    const headings = rule('.content h2', 'color', [0, 3])
    const size = rule('.content > p', 'font', [0, 4])
    const hover = rule('.content:hover', 'background', [0, 5])
    const all = [zoneBackground, zoneColor, paragraphs, headings, size, hover]
    const wide = new Set(['.content', '.content:hover'])
    assert.deepEqual(rulesApart(zoneBackground, all, wide), [paragraphs, headings, size, hover])
    assert.deepEqual(rulesApart(paragraphs, all, wide), [zoneColor, headings, size])
    // Sans règle de toute la zone : le fond de la zone est désactivé aussi.
    assert.deepEqual(rulesApart(paragraphs, all, new Set()), [zoneBackground, zoneColor, headings, size, hover])
    // Même sélecteur, autre groupe : la couleur et le fond d’une même balise vont ensemble partout.
    const paragraphsBackground = rule('.content p', 'background', [0, 6])
    assert.deepEqual(rulesApart(paragraphs, [paragraphs, paragraphsBackground], new Set()), [])
  })
})

describe('mergeToggles — plusieurs groupes d’un même sélecteur d’une règle, désactivés ensemble (5e relecture)', () => {
  it('réunit les propriétés et les valeurs témoins d’un même sélecteur d’une même règle ; les autres restent à part', () => {
    const at = { path: [0, 3], list: '.content p, .content h2' }
    const color = { ...at, selector: '.content p', properties: ['color'], replacement: '' }
    const background = {
      ...at,
      selector: '.content p',
      properties: ['background', 'background-color', 'background-image'],
      replacement: '',
    }
    const heading = { ...at, selector: '.content h2', properties: ['color'], replacement: 'color: rgb(1, 2, 3);' }
    const other = { path: [0, 4], list: '.content p', selector: '.content p', properties: ['color'], replacement: '' }
    assert.deepEqual(mergeToggles([color, heading, background, other]), [
      { ...color, properties: ['color', 'background', 'background-color', 'background-image'] },
      heading,
      other,
    ])
    const witness = { ...background, properties: ['background-color'], replacement: 'background-color: rgb(1, 2, 3);' }
    assert.deepEqual(mergeToggles([color, witness]), [
      { ...color, properties: ['color', 'background-color'], replacement: 'background-color: rgb(1, 2, 3);' },
    ])
  })
})

describe('pageTextsOf', () => {
  it('garde le texte propre des zones affichées, hors zone sélectionnée et ses autres occurrences', () => {
    const boxes: ZoneBox[] = [
      { ...zone('header#0', 0, 0, 100, 10), relation: 'other', text: '' },
      { ...zone('hero.title#0', 0, 10, 100, 20), relation: 'self', text: 'Louez votre voiture à Lyon' },
      { ...zone('hero.cta#0', 0, 30, 30, 10), relation: 'child', text: 'Découvrir nos conseils' },
      { ...zone('features.card#0', 0, 40, 40, 10), relation: 'other', text: 'Retrait en 2 minutes' },
      { ...zone('features.card#1', 50, 40, 40, 10), relation: 'other', text: '' },
      { ...zone('hero.subtitle#0', 0, 0, 0, 0), relation: 'other', text: 'Masqué sur mobile' },
      { ...zone('post.card#0', 0, 60, 40, 30), relation: 'ancestor', text: 'Nos itinéraires préférés 12 mars 2026' },
      { ...zone('footer#0', 0, 50, 100, 10), relation: 'other', text: 'LyonDrive Part-Dieu · Perrache' },
    ]
    assert.deepEqual(pageTextsOf(boxes), [
      // Zone intérieure à la sélection : marquée, pour que le prompt ne la cite pas quand Claude en modifie le texte.
      { zone: 'hero.cta', index: 0, text: 'Découvrir nos conseils', inner: true },
      { zone: 'features.card', index: 0, text: 'Retrait en 2 minutes' },
      { zone: 'post.card', index: 0, text: 'Nos itinéraires préférés 12 mars 2026' },
      { zone: 'footer', index: 0, text: 'LyonDrive Part-Dieu · Perrache' },
    ])
  })
})
