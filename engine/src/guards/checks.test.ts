import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import { contrastCheck, coverWarning, frameCheck, linesCheck, reachCheck, unverifiableCheck } from './checks'
import { MAX_PAINTS, MAX_RULES, type RuleExposure, type StateKind } from './measure'
import { lineRects, measuresOf, occurrencesOf, paintOf, rawState, rawText, rawZone } from './measure-fixtures'

/** Contrôles du rendu : seuils et messages, sur des relevés fabriqués. */

// À 1280 px, le corps d'un article remplit son parent de 760 px ; R09 l'élargit de 96 px de chaque côté.
const PARENT = { left: 260, width: 760 }
const fitted = rawZone({ box: { left: 260, top: 0, width: 760, height: 400 }, parent: PARENT })
const widened = rawZone({
  box: { left: 164, top: 0, width: 952, height: 400 },
  parent: PARENT,
  margins: { top: 0, right: -96, bottom: 0, left: -96 },
})

describe('frameCheck', () => {
  it('passe quand la zone reste dans son cadre', () => {
    const check = frameCheck(measuresOf({ 1280: fitted }), measuresOf({ 1280: fitted }))
    assert.equal(check.ok, true)
    assert.equal(check.label, 'The zone stays within the frame of its parent')
  })

  it('refuse une zone qui sort de son parent là où elle n’en sortait pas (R09)', () => {
    const check = frameCheck(measuresOf({ 1280: fitted }), measuresOf({ 1280: widened }))
    assert.equal(check.ok, false)
    assert.equal(check.detail, '1280 px: +96 px on the left, +96 px on the right, negative margin (left, right)')
    assert.match(check.problem, /goes out of the frame of its parent at 1280 px/)
    assert.match(check.problem, /change nothing and explain it/)
  })

  it('laisse passer un dépassement qui existait déjà', () => {
    const check = frameCheck(measuresOf({ 1280: widened }), measuresOf({ 1280: widened }))
    assert.equal(check.ok, true)
  })

  it('refuse un dépassement qui existait déjà et qui grandit', () => {
    const wider = rawZone({ ...widened, box: { left: 164, top: 0, width: 1000, height: 400 } })
    const check = frameCheck(measuresOf({ 1280: widened }), measuresOf({ 1280: wider }))
    assert.equal(check.ok, false)
    assert.equal(check.detail, '1280 px: +144 px on the right')
  })

  it('refuse une marge négative nouvelle, même sans dépassement', () => {
    const lifted = rawZone({ ...fitted, margins: { top: -16, right: 0, bottom: 0, left: 0 } })
    const check = frameCheck(measuresOf({ 1280: fitted }), measuresOf({ 1280: lifted }))
    assert.equal(check.ok, false)
    assert.equal(check.detail, '1280 px: negative margin (top)')
  })

  it('une zone masquée avant compte comme dans son cadre', () => {
    const check = frameCheck(measuresOf({ 1280: null }), measuresOf({ 1280: widened }))
    assert.equal(check.ok, false)
  })
})

describe('frameCheck — décalages relatifs (position: relative avec top, right, bottom, left)', () => {
  // À 375 px, le logo (en haut de la page) dans l'en-tête, et le bouton principal centré, plus étroit que son parent.
  const logo = rawZone({ box: { left: 16, top: 16, width: 120, height: 32 } })
  const cta = rawZone({ box: { left: 88, top: 400, width: 200, height: 44 } })

  it('refuse la zone sortie de la page par un décalage vers le haut (bottom), sans dépassement ni marge négative', () => {
    const hidden = rawZone({ ...logo, box: { ...logo.box, top: -80 }, offsets: [{ key: '', top: -96, left: 0 }] })
    const check = frameCheck(measuresOf({ 375: logo }), measuresOf({ 375: hidden }))
    assert.equal(check.ok, false)
    assert.equal(check.detail, '375 px: relative offset (the zone 96 px up)')
    // Seul un décalage est en cause : le message le dit, sans prétendre que la zone sort du cadre de son parent.
    assert.match(check.problem, /^The zone or one of its elements is moved by an offset at 375 px \(/)
    assert.match(check.problem, /top, right, bottom and left properties must move neither the zone nor its elements/)
    assert.doesNotMatch(check.problem, /goes out of the frame/)
  })

  it('refuse un décalage horizontal (right), même quand la zone reste dans son parent', () => {
    const moved = rawZone({ ...cta, box: { ...cta.box, left: 72 }, offsets: [{ key: '', top: 0, left: -16 }] })
    const check = frameCheck(measuresOf({ 375: cta }), measuresOf({ 375: moved }))
    assert.equal(check.ok, false)
    assert.equal(check.detail, '375 px: relative offset (the zone 16 px to the left)')
  })

  it('refuse un élément intérieur décalé (une date poussée hors d’une carte qui masque ce qui dépasse)', () => {
    const pushed = rawZone({ offsets: [{ key: '1.2', top: 96, left: 8 }] })
    const check = frameCheck(measuresOf({}), measuresOf({ 810: pushed }))
    assert.equal(check.ok, false)
    assert.equal(check.detail, '810 px: relative offset (an inner element 96 px down and 8 px to the right)')
  })

  it('laisse passer un décalage qui existait déjà, refuse celui qui change', () => {
    const shifted = rawZone({ offsets: [{ key: '0', top: 4, left: 0 }] })
    assert.equal(frameCheck(measuresOf({}, shifted), measuresOf({}, shifted)).ok, true)
    const further = rawZone({ offsets: [{ key: '0', top: 8, left: 0 }] })
    const check = frameCheck(measuresOf({}, shifted), measuresOf({}, further))
    assert.equal(check.ok, false)
    assert.match(String(check.detail), /^375 px: relative offset \(an inner element 8 px down\); 810 px: /)
  })
})

describe('frameCheck — le message ne parle que de ce qui est en cause', () => {
  it('cadre seul (R09) : aucun conseil sur les décalages ; cadre et décalage : les deux', () => {
    const escape = frameCheck(measuresOf({ 1280: fitted }), measuresOf({ 1280: widened }))
    assert.doesNotMatch(escape.problem, /top, right, bottom|shrunk to nothing/)
    const both = rawZone({ ...widened, offsets: [{ key: '', top: 8, left: 0 }] })
    const mixed = frameCheck(measuresOf({ 1280: fitted }), measuresOf({ 1280: both }))
    assert.match(mixed.problem, /^The zone goes out of the frame of its parent at 1280 px/)
    assert.match(mixed.problem, /change nothing and explain it to the client/)
    assert.match(mixed.problem, /top, right, bottom and left properties must move neither the zone nor its elements/)
  })
})

describe('frameCheck — zone réduite à rien (taille nulle sans display: none)', () => {
  // À 375 px, la navigation à droite de l'en-tête ; flex: 1 1 0, flex-grow: 0 et min-width: 0 la ramènent à 0 px de
  // large, ses liens débordent de sa boîte.
  const nav = rawZone({ box: { left: 200, top: 16, width: 159, height: 24 } })
  const squashed = rawZone({ ...nav, box: { left: 359, top: 16, width: 0, height: 24 } })

  it('refuse une zone ramenée à une largeur nulle sans display: none, même sans décalage', () => {
    const check = frameCheck(measuresOf({ 375: nav }), measuresOf({ 375: squashed }))
    assert.equal(check.ok, false)
    assert.equal(check.detail, '375 px: zone shrunk to nothing (0 × 24 px)')
    assert.match(check.problem, /^The zone is shrunk to nothing at 375 px \(/)
    assert.match(check.problem, /is never hidden by a zero width or height/)
    assert.doesNotMatch(check.problem, /goes out of the frame/)
  })

  it('refuse une zone de largeur nulle dont le contenu est poussé hors de la page par un décalage', () => {
    const lifted = rawZone({
      ...squashed,
      box: { ...squashed.box, top: -80 },
      offsets: [{ key: '', top: -96, left: 0 }],
      content: { left: 255, top: -73, right: 359 },
    })
    const check = frameCheck(measuresOf({ 375: nav, 1280: nav }), measuresOf({ 375: lifted, 1280: lifted }))
    assert.equal(check.ok, false)
    const at = (viewport: number) =>
      `${viewport} px: zone shrunk to nothing (0 × 24 px), content outside the page (top), relative offset (the zone 96 px up)`
    assert.equal(check.detail, `${at(375)}; ${at(1280)}`)
    assert.match(check.problem, /^The zone is shrunk to nothing at 375 px, 1280 px \(/)
    assert.match(check.problem, /must never go out of the page/)
  })

  it('laisse passer une zone déjà de taille nulle avant, et un masquage par display: none (R03)', () => {
    assert.equal(frameCheck(measuresOf({ 375: squashed }), measuresOf({ 375: squashed })).ok, true)
    const masked = rawZone({ box: { left: 0, top: 0, width: 0, height: 0 }, boxes: 0, style: { ...nav.style, display: 'none' } })
    assert.equal(frameCheck(measuresOf({ 375: nav }), measuresOf({ 375: masked })).ok, true)
  })
})

describe('frameCheck — contenu sorti de la page', () => {
  // À 375 px, le logo à gauche de l'en-tête ; flex: 1 1 0, flex-grow: 0, min-width: 0 et padding-inline: var(--space-1)
  // le ramènent à 8 px, justify-content: flex-end pousse son texte vers la gauche, hors de la page (mesuré dans Chrome).
  const logo = rawZone({ box: { left: 16, top: 20, width: 97, height: 30 }, content: { left: 16, top: 22, right: 113 } })
  const pushed = rawZone({ ...logo, box: { ...logo.box, width: 8 }, content: { left: -77, top: 22, right: 20 } })

  it('refuse un contenu poussé hors de la page, sans taille nulle, dépassement du parent ni décalage', () => {
    const check = frameCheck(measuresOf({ 375: logo }), measuresOf({ 375: pushed }))
    assert.equal(check.ok, false)
    assert.equal(check.detail, '375 px: content outside the page (left)')
    assert.match(check.problem, /^The content of the zone goes out of the page at 375 px \(/)
    assert.match(check.problem, /give the zone back its width and its alignment/)
    assert.doesNotMatch(check.problem, /goes out of the frame|top, right, bottom/)
  })

  it('laisse passer un contenu qui sortait déjà de la page du même côté', () => {
    assert.equal(frameCheck(measuresOf({ 375: pushed }), measuresOf({ 375: pushed })).ok, true)
  })
})

describe('frameCheck — un texte visible avant ne disparaît pas', () => {
  // header.nav à 375 px : deux liens. Relecture : `.nav { gap: 0 }`, `.nav a:first-child { flex: 1 1 0; flex-grow: 0;
  // min-width: 0 }` et `.nav a:last-child { background-color: var(--color-night); padding-inline: var(--space-7) }` ;
  // « Accueil » passe à 0 px, son texte déborde sous « Blog » qui peint son fond par-dessus. La navigation garde sa
  // taille (128 × 24), rien ne sort de la page : seul le relevé de chaque texte le voit.
  const accueil = rawText({ key: '0', text: 'Accueil' })
  const blog = rawText({ key: '1', text: 'Blog' })
  const nav = rawZone({ box: { left: 231, top: 20, width: 128, height: 24 }, texts: [accueil, blog] })
  const withTexts = (...texts: ReturnType<typeof rawText>[]) => rawZone({ ...nav, texts })

  it('refuse un lien réduit à rien et recouvert par son voisin, la navigation gardant sa taille', () => {
    const squashed = withTexts({ ...accueil, collapsed: true, coveredLines: [0] }, blog)
    const check = frameCheck(measuresOf({ 375: nav, 1280: nav }), measuresOf({ 375: squashed, 1280: squashed }))
    assert.equal(check.ok, false)
    const at = (viewport: number) => `${viewport} px: invisible text (“Accueil” shrunk to nothing)`
    assert.equal(check.detail, `${at(375)}; ${at(1280)}`)
    assert.match(check.problem, /^A text of the zone is no longer visible at 375 px, 1280 px \(/)
    assert.match(check.problem, /a text is never hidden/)
    assert.doesNotMatch(check.problem, /goes out of the frame|top, right, bottom/)
  })

  it('un texte recouvert par un autre élément, sans taille nulle, donne un avertissement, pas un refus (décision 17)', () => {
    const before = measuresOf({ 375: nav })
    const after = measuresOf({ 375: withTexts(accueil, { ...blog, coveredLines: [0] }) })
    assert.equal(frameCheck(before, after).ok, true)
    assert.equal(coverWarning(before, after)?.step, 'Warning: “Blog” covered at 375 px (1 of 1 line).')
  })

  it('refuse un texte masqué (display: none, visibility: hidden) dans une zone restée affichée', () => {
    const masked = rawZone({ ...nav, texts: [blog], hiddenTexts: ['0'] })
    const check = frameCheck(measuresOf({ 810: nav }), measuresOf({ 810: masked }))
    assert.equal(check.ok, false)
    assert.equal(check.detail, '810 px: invisible text (“Accueil” hidden)')
  })

  it('laisse passer un texte déjà invisible avant, un texte retiré par set_text, et la zone masquée (R03)', () => {
    const hiddenBefore = withTexts({ ...accueil, coveredLines: [0] }, blog)
    const collapsedAfter = withTexts({ ...accueil, collapsed: true }, blog)
    assert.equal(frameCheck(measuresOf({ 375: hiddenBefore }), measuresOf({ 375: collapsedAfter })).ok, true)
    // Mots mis en avant retirés par set_text : leur <em> n’existe plus, ce n’est pas un masquage.
    assert.equal(frameCheck(measuresOf({ 375: nav }), measuresOf({ 375: withTexts(blog) })).ok, true)
    const masked = rawZone({ ...nav, box: { left: 0, top: 0, width: 0, height: 0 }, style: { ...nav.style, display: 'none' } })
    assert.equal(frameCheck(measuresOf({ 375: nav }), measuresOf({ 375: masked })).ok, true)
  })
})

describe('coverWarning — une ligne visible avant, recouverte après : avertissement, pas refus (décisions 15 et 17)', () => {
  // hero.title à 375 px, 7 lignes : relecture, `.accent { font-style: normal; padding-block: var(--space-9);
  // background-color: var(--color-night) }` ; le fond du mot mis en avant peint sur les lignes au-dessus de lui. Le titre
  // garde des lignes visibles : le seul drapeau « tout le texte recouvert » ne le voyait pas.
  const TITLE = 'Louez une voiture récente à Lyon, sans surprise et sans attendre'
  const SHORT = `${TITLE.slice(0, 39)}…`
  const title = (coveredLines: number[], ownLines = 7) =>
    rawZone({ texts: [rawText({ text: TITLE, rects: lineRects(ownLines), ownLines, coveredLines })] })

  it('avertit d’un texte dont une ligne visible avant est recouverte après, sans refus ni consigne à Claude', () => {
    const before = measuresOf({ 375: title([]) })
    const after = measuresOf({ 375: title([1, 2]) })
    const check = frameCheck(before, after)
    assert.equal(check.ok, true)
    assert.equal(check.detail, undefined)
    assert.deepEqual(coverWarning(before, after), {
      step: `Warning: “${SHORT}” partly covered at 375 px (2 of 7 lines).`,
      client:
        `Warning: part of the text “${SHORT}” is covered by another element at 375 px. ` +
        'Check the result before publishing.',
    })
  })

  it('regroupe les largeurs d’un même texte, et nomme chaque texte recouvert', () => {
    const before = measuresOf({}, title([]))
    const after = measuresOf({ 375: title([1, 2]), 1280: title([0, 1, 2, 3, 4, 5, 6]) }, title([]))
    // Entièrement caché à 1280 px : ni « en partie » dans l’étape, ni « une partie » au client (tâche 26).
    assert.deepEqual(coverWarning(before, after), {
      step: `Warning: “${SHORT}” covered at 375 px (2 of 7 lines) and at 1280 px (7 of 7 lines).`,
      client:
        `Warning: the text “${SHORT}” is fully hidden by another element at 1280 px; ` +
        `part of the text “${SHORT}” is covered at 375 px. Check the result before publishing.`,
    })
    const two = rawZone({
      texts: [rawText({ text: 'Accueil', coveredLines: [0] }), rawText({ key: '1', text: 'Blog', coveredLines: [0] })],
    })
    assert.deepEqual(coverWarning(measuresOf({}), measuresOf({ 810: two })), {
      step: 'Warning: “Accueil” covered at 810 px (1 of 1 line); “Blog” covered at 810 px (1 of 1 line).',
      client:
        'Warning: the texts “Accueil” and “Blog” are fully hidden by another element at 810 px. ' +
        'Check the result before publishing.',
    })
  })

  it('dit « une partie du texte » tant qu’une ligne reste visible, et accorde les textes au pluriel (tâche 26)', () => {
    const five = (text: string, key: string) =>
      rawText({ key, text, rects: lineRects(5), ownLines: 5, coveredLines: [4] })
    assert.equal(
      coverWarning(measuresOf({}), measuresOf({ 375: rawZone({ texts: [five('Accueil', '0')] }) }))?.client,
      'Warning: part of the text “Accueil” is covered by another element at 375 px. ' +
        'Check the result before publishing.',
    )
    assert.equal(
      coverWarning(measuresOf({}), measuresOf({ 375: rawZone({ texts: [five('Accueil', '0'), five('Blog', '1')] }) }))?.client,
      'Warning: part of the texts “Accueil” and “Blog” are covered by another element at 375 px. ' +
        'Check the result before publishing.',
    )
  })

  it('avertit d’une ligne de plus que celles déjà recouvertes, et d’une ligne nouvelle recouverte ; pas de l’existant', () => {
    assert.equal(coverWarning(measuresOf({ 375: title([6]) }), measuresOf({ 375: title([6]) })), null)
    assert.notEqual(coverWarning(measuresOf({ 375: title([6]) }), measuresOf({ 375: title([5, 6]) })), null)
    // Même nombre de lignes recouvertes, mais pas les mêmes : la 1re ligne se voyait, elle est recouverte.
    assert.notEqual(coverWarning(measuresOf({ 375: title([6]) }), measuresOf({ 375: title([0]) })), null)
    // Le texte s’allonge d’une ligne, et c’est elle qui passe sous un autre élément.
    const longer = coverWarning(measuresOf({ 375: title([]) }), measuresOf({ 375: title([7], 8) }))
    assert.match(longer?.step ?? '', /partly covered at 375 px \(1 of 8 lines\)\.$/)
    // Aucune ligne ne se voyait avant : rien à signaler.
    const unseen = coverWarning(
      measuresOf({ 375: title([0, 1, 2, 3, 4, 5, 6]) }),
      measuresOf({ 375: title([0, 1, 2, 3, 4, 5, 6, 7], 8) }),
    )
    assert.equal(unseen, null)
  })

  it('avertit aussi d’un texte nouveau recouvert (mot mis en avant ajouté par set_text), et d’une zone masquée avant', () => {
    const accent = rawText({ key: '0', text: 'sans surprise', ownLines: 2, rects: lineRects(2), coveredLines: [0] })
    const added = rawZone({ texts: [rawText({ text: TITLE, rects: lineRects(7), ownLines: 7 }), accent] })
    assert.equal(
      coverWarning(measuresOf({ 375: title([]) }), measuresOf({ 375: added }))?.step,
      'Warning: “sans surprise” partly covered at 375 px (1 of 2 lines).',
    )
    const masked = rawZone({ style: { ...rawZone().style, display: 'none' } })
    assert.notEqual(coverWarning(measuresOf({ 375: masked }), measuresOf({ 375: title([1]) })), null)
  })

  it('reste bloquant pour un texte dont plus aucune ligne n’est rendue (réduit à rien), sans avertissement en double', () => {
    const before = measuresOf({ 1280: title([]) })
    const after = measuresOf({ 1280: title([], 0) })
    const gone = frameCheck(before, after)
    assert.equal(gone.ok, false)
    assert.match(gone.detail ?? '', /shrunk to nothing/)
    assert.equal(coverWarning(before, after), null)
    const collapsed = rawZone({ texts: [rawText({ text: TITLE, collapsed: true, coveredLines: [0] })] })
    assert.equal(coverWarning(measuresOf({ 375: title([]) }), measuresOf({ 375: collapsed })), null)
  })

  it('la consigne du cadre ne parle plus que des textes réduits à rien ou masqués', () => {
    const squashed = rawZone({ texts: [rawText({ text: 'Accueil', collapsed: true })] })
    const check = frameCheck(measuresOf({}), measuresOf({ 375: squashed }))
    assert.equal(check.ok, false)
    assert.match(check.problem, /a text is never hidden: neither by a zero width or height/)
    assert.doesNotMatch(check.problem, /recouvr|padding/)
  })
})

describe('frameCheck et coverWarning — chaque occurrence d’une zone répétée (décision 18)', () => {
  // post.card#0 choisie sur /blog, trois cartes. Relecture : `.card:last-child { … }` ne touche que la 3e carte ; seule
  // l’occurrence choisie était relevée, et la 3e changeait sans être vue.
  const card = rawZone({ box: { left: 16, top: 0, width: 343, height: 300 } })
  const wide = rawZone({
    box: { left: -80, top: 0, width: 535, height: 300 },
    margins: { top: 0, right: -96, bottom: 0, left: -96 },
  })
  const subtitle = rawText({ key: '0.1', text: 'Citadine, SUV ou utilitaire' })
  const plain = rawZone({ texts: [subtitle] })
  const covered = rawZone({ texts: [{ ...subtitle, coveredLines: [0] }] })

  it('refuse une autre occurrence qui sort de son cadre, et la nomme', () => {
    const check = frameCheck(occurrencesOf([card, card, card]), occurrencesOf([card, card, wide]))
    assert.equal(check.ok, false)
    const at = (viewport: number) =>
      `${viewport} px (occurrence 3 of 3): +96 px on the left, +96 px on the right, negative margin (left, right)`
    assert.equal(check.detail, [375, 810, 1280].map(at).join('; '))
    assert.match(check.problem, /^The zone goes out of the frame of its parent at 375 px \(occurrence 3 of 3\), 810 px \(occurrence 3/)
    assert.match(check.problem, /The zone repeats on the page: each of its occurrences is checked/)
    // Une seule occurrence : ni numéro ni consigne sur la répétition (R09).
    const single = frameCheck(measuresOf({ 1280: fitted }), measuresOf({ 1280: widened }))
    assert.doesNotMatch(single.problem, /occurrence|repeats/)
  })

  it('compare chaque occurrence à elle-même, pas à l’occurrence choisie', () => {
    // La 2e carte dépassait déjà avant, sans grandir : rien de nouveau.
    assert.equal(frameCheck(occurrencesOf([card, wide, card]), occurrencesOf([card, wide, card])).ok, true)
    const check = frameCheck(occurrencesOf([card, wide, card]), occurrencesOf([card, card, wide]))
    assert.equal(check.ok, false)
    assert.match(check.detail ?? '', /^375 px \(occurrence 3 of 3\): /)
  })

  it('avertit d’un texte recouvert dans une autre occurrence, et la nomme', () => {
    assert.deepEqual(coverWarning(occurrencesOf([plain, plain, plain]), occurrencesOf([plain, plain, covered])), {
      step:
        'Warning: “Citadine, SUV ou utilitaire” (occurrence 3 of 3) covered at 375 px (1 of 1 line), ' +
        'at 810 px (1 of 1 line) and at 1280 px (1 of 1 line).',
      client:
        'Warning: the text “Citadine, SUV ou utilitaire” (occurrence 3 of 3) is fully hidden by another ' +
        'element at 375, 810 and 1280 px. Check the result before publishing.',
    })
  })

  it('dit que le relevé est partiel au-delà de 12 occurrences, ou quand un plafond du relevé est atteint', () => {
    const many = coverWarning(occurrencesOf([plain], 15), occurrencesOf([covered], 15))
    assert.match(many?.step ?? '', / Incomplete check \(only the first 12 of 15 occurrences\): other texts may be covered too\.$/)
    assert.match(many?.client ?? '', /at 375, 810 and 1280 px \(incomplete check\)\. Check the result before publishing\.$/)
    // Sans texte recouvert, l’étape dit seulement que le relevé est partiel ; pas de phrase au client.
    assert.deepEqual(coverWarning(occurrencesOf([plain], 15), occurrencesOf([plain], 15)), {
      step: 'Warning: covered-text check incomplete (only the first 12 of 15 occurrences): check the result.',
      client: null,
    })
    const capped = rawZone({ partial: true })
    assert.deepEqual(coverWarning(measuresOf({}), measuresOf({ 1280: capped })), {
      step: 'Warning: covered-text check incomplete (too many painted elements in the zone at 1280 px): check the result.',
      client: null,
    })
    assert.equal(coverWarning(occurrencesOf([plain], 12), occurrencesOf([plain], 12)), null)
  })
})

describe('linesCheck', () => {
  // Le même texte à 810 et 1280 px : seules les lignes à 375 px comptent.
  const at375 = (text: string, lines: number) =>
    measuresOf({ 375: rawZone({ texts: [rawText({ text, rects: lineRects(lines) })] }) })

  it('ne dit rien sans mesure à 375 px ni texte réécrit', () => {
    assert.equal(linesCheck([], [], false), null)
    assert.equal(linesCheck(measuresOf({ 375: null }), at375('Nouveau texte', 3), false), null)
    // Style seul : le texte ne change pas, sa nouvelle taille lui fait gagner une ligne.
    assert.equal(linesCheck(at375('Louez votre voiture à Lyon', 2), at375('Louez votre voiture à Lyon', 3), false), null)
    // Style seul : text-transform change la casse du texte relevé (innerText), pas ses mots.
    assert.equal(linesCheck(at375('Louez votre voiture à Lyon', 2), at375('LOUEZ VOTRE VOITURE À LYON', 3), false), null)
  })

  it('refuse un texte réécrit qui passe de 2 à 3 lignes à 375 px', () => {
    const result = linesCheck(at375('Ancien texte', 2), at375('Nouveau texte plus long', 3), false)
    assert.equal(result?.id, 'lines')
    assert.equal(result?.label, 'No line gained on mobile without the client’s agreement')
    assert.equal(result?.ok, false)
    assert.equal(result?.detail, 'Lines: 2 → 3 at 375 px (“Nouveau texte plus long”)')
    assert.match(
      String(result?.problem),
      /goes from 2 to 3 lines at 375 px: shorten it, or ask the client with ask_client whether they accept this longer text/,
    )
  })

  it('accepte la ligne gagnée quand le client l’a choisie', () => {
    const result = linesCheck(at375('Ancien texte', 2), at375('Nouveau texte plus long', 3), true)
    assert.equal(result?.ok, true)
    assert.match(String(result?.detail), /^Lines: 2 → 3 at 375 px .*, accepted by the client$/)
  })

  it('ne compte pas les caractères : une réécriture bien plus longue au même nombre de lignes passe', () => {
    const before = 'Louez votre voiture à Lyon'
    const after = 'Louez votre voiture à Lyon, prête en deux minutes'
    assert.ok(after.length > before.length * 1.8)
    assert.equal(linesCheck(at375(before, 2), at375(after, 2), false), null)
  })

  it('note une ligne perdue sans refuser', () => {
    const result = linesCheck(at375('Un texte long', 3), at375('Plus court', 2), false)
    assert.equal(result?.ok, true)
    assert.match(String(result?.detail), /^Lines: 3 → 2 at 375 px/)
  })
})

describe('contrastCheck', () => {
  const NUIT = 'rgb(15, 23, 42)'
  const NUIT_CLAIRE = 'rgb(30, 41, 59)'
  const ARDOISE = 'rgb(100, 116, 139)'
  const BRUME = 'rgb(148, 163, 184)'
  const TEXTE = 'rgb(248, 250, 252)'
  const ROSE = 'rgb(225, 29, 72)'
  const text = (color: string, background: string, fontSize = 14, image = 'none') =>
    measuresOf(
      {},
      rawZone({ texts: [rawText({ text: '24 septembre 2026', color, fontSize, layers: [{ color: background, image }] })] }),
    )

  it('refuse un texte qui devient moins lisible (C02 : 3,75 → 3,07)', () => {
    const result = contrastCheck(text(ARDOISE, NUIT), text(ARDOISE, NUIT_CLAIRE), false)
    assert.equal(result?.id, 'contrast')
    assert.equal(result?.label, 'Texts always legible (WCAG contrast)')
    assert.equal(result?.ok, false)
    assert.equal(result?.detail, '“24 septembre 2026”: 3.75 → 3.07 at 375, 810, 1280 px')
    assert.equal(
      result?.problem,
      'The text “24 septembre 2026” becomes less legible: contrast 3.75 → 3.07 at 375, 810, 1280 px (minimum 4.5). Choose design system colors that keep the contrast, or do not change this point and tell the client.',
    )
  })

  it('accepte un grand titre qui reste au-dessus de son seuil (L08 : 17,06 → 3,8, seuil 3)', () => {
    assert.equal(contrastCheck(text(TEXTE, NUIT, 40), text(ROSE, NUIT, 40), false)?.ok, true)
  })

  it('ne bloque pas un texte déjà sous le seuil et inchangé', () => {
    const result = contrastCheck(text(ARDOISE, NUIT), text(ARDOISE, NUIT), false)
    assert.equal(result?.ok, true)
    assert.equal(result?.detail, undefined)
  })

  it('refuse un texte lisible qui passe sous le seuil (6,96 → 4,4)', () => {
    const result = contrastCheck(text(BRUME, NUIT, 16), text('rgb(126, 126, 126)', NUIT, 16), false)
    assert.equal(result?.ok, false)
    assert.equal(result?.detail, '“24 septembre 2026”: 6.96 → 4.4 at 375, 810, 1280 px')
  })

  it('ignore un fond inconnu avant comme après, et ne contrôle pas un logotype sous le seuil WCAG', () => {
    const photo = 'url("/voiture.jpg")'
    assert.equal(contrastCheck(text(ARDOISE, NUIT, 14, photo), text(ARDOISE, NUIT, 14, photo), false), null)
    assert.equal(contrastCheck(text(ARDOISE, NUIT), text(ARDOISE, NUIT_CLAIRE), true), null)
  })

  it('refuse un texte mesuré avant dont la couleur n’est plus mesurable après, logotype compris (relecture tâche 26)', () => {
    // Chrome calcule `rgb(from var(--color-night) r g b)` et `rgb(from var(--color-rose) r g b / 0)` ainsi ; parseColor ne
    // lit pas color() : le ratio d’après est inconnu. Le texte était sauté, et le logo pouvait prendre la couleur de son fond.
    const relative = ['color(srgb 0.0588235 0.0901961 0.164706)', 'color(srgb 0.882353 0.113725 0.282353 / 0)']
    for (const exempt of [true, false]) {
      for (const color of relative) {
        const result = contrastCheck(text(ROSE, NUIT), text(color, NUIT), exempt)
        const label = `${exempt ? 'logotype' : 'zone'} ${color}`
        assert.equal(result?.id, 'contrast', label)
        assert.equal(result?.ok, false, label)
        assert.equal(result?.label, exempt ? 'Logo always visible on its background' : 'Texts always legible (WCAG contrast)')
        assert.equal(
          result?.detail,
          '“24 septembre 2026”: color not measurable after the change (contrast 3.8 before) at 375, 810, 1280 px',
          label,
        )
        assert.match(
          result?.problem ?? '',
          /^The color of the text “24 septembre 2026” is no longer measurable after the change \(contrast 3.8 before, at 375, 810, 1280 px\): /,
          label,
        )
        assert.match(result?.problem ?? '', /relative color with from/, label)
        assert.equal(/minimum 1.5 for a logotype/.test(result?.problem ?? ''), exempt, label)
      }
    }
    // Un fond devenu inconnu (la zone rend son fond transparent sur une photo) : le contraste n’est plus garanti.
    const photo = contrastCheck(text(ARDOISE, NUIT), text(ARDOISE, NUIT, 14, 'url("/voiture.jpg")'), false)
    assert.equal(photo?.ok, false)
    assert.equal(
      photo?.detail,
      '“24 septembre 2026”: color not measurable after the change (contrast 3.75 before) at 375, 810, 1280 px',
    )
    // Inconnu avant : rien à comparer, comme avant.
    assert.equal(contrastCheck(text(relative[0], NUIT), text(relative[0], NUIT), true), null)
  })

  it('logotype : exempté du seuil WCAG, mais refusé sous le plancher de 1,5:1 (tâche 26)', () => {
    // Rose, puis Rose profond (2,84) : sous 4,5, un choix de marque légitime pour un logotype.
    assert.equal(contrastCheck(text(ROSE, NUIT), text('rgb(190, 18, 60)', NUIT), true), null)
    // Nuit sur l’en-tête Nuit (1:1) : le logo se confond avec son fond, masqué par la couleur (règle 5).
    const hidden = contrastCheck(text(ROSE, NUIT), text(NUIT, NUIT), true)
    assert.equal(hidden?.id, 'contrast')
    assert.equal(hidden?.ok, false)
    assert.equal(hidden?.label, 'Logo always visible on its background')
    assert.equal(hidden?.detail, '“24 septembre 2026”: 3.8 → 1 at 375, 810, 1280 px')
    assert.match(
      hidden?.problem ?? '',
      /^The text “24 septembre 2026” blends into its background: contrast 3.8 → 1 at 375, 810, 1280 px \(minimum 1.5 for a logotype/,
    )
    // Déjà sous le plancher et inchangé : rien de nouveau.
    assert.equal(contrastCheck(text(NUIT, NUIT), text(NUIT, NUIT), true), null)
  })
})

describe('contrastCheck — occurrences, mots mis en avant ajoutés, couleur transparente (durcissement)', () => {
  const NUIT = 'rgb(15, 23, 42)'
  const NUIT_CLAIRE = 'rgb(30, 41, 59)'
  const ARDOISE = 'rgb(100, 116, 139)'
  const TEXTE = 'rgb(248, 250, 252)'
  const ROSE = 'rgb(225, 29, 72)'
  const card = (background: string) =>
    rawZone({
      texts: [
        rawText({ text: '24 septembre 2026', color: ARDOISE, fontSize: 14, layers: [{ color: background, image: 'none' }] }),
      ],
    })

  it('refuse la date d’une autre occurrence devenue moins lisible, et la nomme (décision 18)', () => {
    const result = contrastCheck(
      occurrencesOf([card(NUIT), card(NUIT), card(NUIT)]),
      occurrencesOf([card(NUIT), card(NUIT), card(NUIT_CLAIRE)]),
      false,
    )
    assert.equal(result?.ok, false)
    assert.equal(result?.detail, '“24 septembre 2026” (occurrence 3 of 3): 3.75 → 3.07 at 375, 810, 1280 px')
    assert.match(
      String(result?.problem),
      /^The text “24 septembre 2026” \(occurrence 3 of 3\) becomes less legible: contrast 3.75 → 3.07/,
    )
  })

  it('réunit la même baisse dans plusieurs occurrences (C02 : toutes les cartes)', () => {
    const result = contrastCheck(
      occurrencesOf([card(NUIT), card(NUIT), card(NUIT)]),
      occurrencesOf([card(NUIT_CLAIRE), card(NUIT_CLAIRE), card(NUIT_CLAIRE)]),
      false,
    )
    assert.equal(result?.detail, '“24 septembre 2026” (occurrences 1, 2 and 3 of 3): 3.75 → 3.07 at 375, 810, 1280 px')
  })

  it('compare chaque occurrence à elle-même, pas à l’occurrence choisie', () => {
    const cards = occurrencesOf([card(NUIT), card(NUIT_CLAIRE)])
    assert.equal(contrastCheck(cards, cards, false)?.ok, true)
  })

  it('compare un mot mis en avant ajouté au texte qui le contenait avant', () => {
    const title = rawText({ key: '', text: 'Louez une voiture sans surprise', color: TEXTE, fontSize: 16 })
    const accent = (color: string, fontSize = 16) => rawText({ key: '0', text: 'sans surprise', color, fontSize })
    const before = measuresOf({}, rawZone({ texts: [title] }))
    const night = contrastCheck(before, measuresOf({}, rawZone({ texts: [title, accent(NUIT)] })), false)
    assert.equal(night?.ok, false)
    assert.equal(night?.detail, '“sans surprise”: 17.06 → 1 at 375, 810, 1280 px')
    // Rose sur Nuit (3,8) : sous le seuil d’un texte de 16 px, au-dessus de celui d’un grand titre.
    assert.equal(contrastCheck(before, measuresOf({}, rawZone({ texts: [title, accent(ROSE)] })), false)?.ok, false)
    const large = measuresOf({}, rawZone({ texts: [{ ...title, fontSize: 40 }] }))
    assert.equal(
      contrastCheck(large, measuresOf({}, rawZone({ texts: [{ ...title, fontSize: 40 }, accent(ROSE, 40)] })), false)?.ok,
      true,
    )
  })

  it('refuse un texte devenu transparent (contraste 1)', () => {
    const result = contrastCheck(
      measuresOf({}),
      measuresOf({}, rawZone({ texts: [rawText({ color: 'rgba(0, 0, 0, 0)' })] })),
      false,
    )
    assert.equal(result?.ok, false)
    assert.equal(result?.detail, '“Texte”: 17.06 → 1 at 375, 810, 1280 px')
  })
})

describe('contrastCheck — états forcés : survol, clic, focus, et leurs combinaisons (décision 16)', () => {
  const NUIT = 'rgb(15, 23, 42)'
  const TEXTE = 'rgb(248, 250, 252)'
  const ROSE = 'rgb(225, 29, 72)'
  /** État : sa sorte, la profondeur survolée et la profondeur focalisée (null : aucune), la couleur de « Accueil ». */
  type State = { kind: StateKind; hover?: number | null; focus?: number | null; color: string; image?: string }
  /** Lien « Accueil » (16 px) sur Nuit, Texte au repos, dans les états donnés. */
  const link = (states: State[], rest = TEXTE) =>
    measuresOf(
      {},
      rawZone({
        texts: [rawText({ key: '0', text: 'Accueil', color: rest })],
        states: states.map(({ kind, hover = null, focus = null, color, image = 'none' }) =>
          rawState({
            kind,
            hover,
            focus,
            texts: [rawText({ key: '0', text: 'Accueil', color, layers: [{ color: NUIT, image }] })],
          }),
        ),
      }),
    )

  it('refuse un texte lisible au repos qui devient illisible au survol', () => {
    const result = contrastCheck(
      link([{ kind: 'hover', hover: 1, color: TEXTE }]),
      link([{ kind: 'hover', hover: 1, color: NUIT }]),
      false,
    )
    assert.equal(result?.ok, false)
    assert.equal(result?.detail, '“Accueil” on hover: 17.06 → 1 at 375, 810, 1280 px')
    assert.equal(
      result?.problem,
      'The text “Accueil” becomes less legible on hover: contrast 17.06 → 1 at 375, 810, 1280 px (minimum 4.5). ' +
        'Choose design system colors that keep the contrast, or do not change this point and tell the client. ' +
        'The :hover, :active, :focus-visible and :focus states are measured like the resting state, alone and combined: each ' +
        'text must stay legible on its background in them.',
    )
  })

  it('ne répète pas dans un état la baisse déjà vue au repos (l’état ne change rien au texte)', () => {
    const same = contrastCheck(
      link([{ kind: 'hover', hover: 1, color: TEXTE }]),
      link([{ kind: 'hover', hover: 1, color: ROSE }], ROSE),
      false,
    )
    assert.equal(same?.detail, '“Accueil”: 17.06 → 3.8 at 375, 810, 1280 px')
    assert.doesNotMatch(String(same?.problem), /states/)
    const worse = contrastCheck(
      link([{ kind: 'hover', hover: 1, color: TEXTE }]),
      link([{ kind: 'hover', hover: 1, color: NUIT }], ROSE),
      false,
    )
    assert.equal(
      worse?.detail,
      '“Accueil”: 17.06 → 3.8 at 375, 810, 1280 px; “Accueil” on hover: 17.06 → 1 at 375, 810, 1280 px',
    )
  })

  it('nomme chaque état : clic, focus clavier, focus après un clic, et leurs combinaisons', () => {
    const kinds: [StateKind, string, number | null, number | null][] = [
      ['active', 'while clicked', 1, null],
      ['focus-visible', 'on keyboard focus', null, 1],
      ['focus', 'on focus after a click', null, 1],
      ['hover-focus', 'on hover, with focus after a click', 0, 1],
      ['hover-focus-visible', 'on hover, with keyboard focus', 1, 1],
      ['active-focus', 'during a click that gives focus', 1, -1],
    ]
    for (const [kind, words, hover, focus] of kinds) {
      const result = contrastCheck(
        link([{ kind, hover, focus, color: TEXTE }]),
        link([{ kind, hover, focus, color: NUIT }]),
        false,
      )
      assert.equal(result?.detail, `“Accueil” ${words}: 17.06 → 1 at 375, 810, 1280 px`, kind)
    }
  })

  it('nomme le clic avec le focus clavier, sans y répéter la baisse vue dans l’une de ses composantes', () => {
    const alone = contrastCheck(
      link([{ kind: 'active-focus-visible', hover: 1, focus: 1, color: TEXTE }]),
      link([{ kind: 'active-focus-visible', hover: 1, focus: 1, color: NUIT }]),
      false,
    )
    assert.equal(alone?.detail, '“Accueil” during a click, with keyboard focus: 17.06 → 1 at 375, 810, 1280 px')
    const components: [StateKind, number | null, number | null, string][] = [
      ['active', 1, null, 'while clicked'],
      ['focus-visible', null, 1, 'on keyboard focus'],
      ['active-focus', 1, 1, 'during a click that gives focus'],
      ['hover-focus-visible', 1, 1, 'on hover, with keyboard focus'],
    ]
    for (const [kind, hover, focus, words] of components) {
      const states = (color: string): State[] => [
        { kind, hover, focus, color },
        { kind: 'active-focus-visible', hover: 1, focus: 1, color },
      ]
      const result = contrastCheck(link(states(TEXTE)), link(states(NUIT)), false)
      assert.equal(result?.detail, `“Accueil” ${words}: 17.06 → 1 at 375, 810, 1280 px`, kind)
    }
  })

  it('ne répète pas dans une combinaison la baisse déjà vue dans l’un de ses états simples', () => {
    const states = (color: string): State[] => [
      { kind: 'hover', hover: 1, color },
      { kind: 'active', hover: 1, color },
      { kind: 'focus', focus: 1, color: TEXTE },
      { kind: 'hover-focus', hover: 1, focus: 1, color },
      { kind: 'hover-focus-visible', hover: 1, focus: 1, color },
      { kind: 'active-focus', hover: 1, focus: 1, color },
    ]
    const result = contrastCheck(link(states(TEXTE)), link(states(NUIT)), false)
    assert.equal(
      result?.detail,
      '“Accueil” on hover: 17.06 → 1 at 375, 810, 1280 px; “Accueil” while clicked: 17.06 → 1 at 375, 810, 1280 px',
    )
    // Une combinaison pire que ses états simples est nommée.
    const worse = contrastCheck(
      link(states(TEXTE)),
      link([
        { kind: 'hover', hover: 1, color: ROSE },
        { kind: 'focus', focus: 1, color: TEXTE },
        { kind: 'hover-focus', hover: 1, focus: 1, color: NUIT },
      ]),
      false,
    )
    assert.equal(
      worse?.detail,
      '“Accueil” on hover: 17.06 → 3.8 at 375, 810, 1280 px; ' +
        '“Accueil” on hover, with focus after a click: 17.06 → 1 at 375, 810, 1280 px',
    )
  })

  it('range les baisses par texte, puis par état', () => {
    const two = (color: string, kind: StateKind) =>
      rawState({
        kind,
        hover: 1,
        texts: ['Accueil', 'Blog'].map((text, n) => rawText({ key: String(n), text, color })),
      })
    const nav = (color: string) =>
      measuresOf(
        {},
        rawZone({
          texts: ['Accueil', 'Blog'].map((text, n) => rawText({ key: String(n), text })),
          states: [two(color, 'hover'), two(color, 'active')],
        }),
      )
    assert.equal(
      contrastCheck(nav(TEXTE), nav(NUIT), false)?.detail,
      ['“Accueil” on hover', '“Accueil” while clicked', '“Blog” on hover', '“Blog” while clicked']
        .map((name) => `${name}: 17.06 → 1 at 375, 810, 1280 px`)
        .join('; '),
    )
  })

  it('ne bloque pas un état déjà sous le seuil et inchangé, ni un état qui s’améliore', () => {
    const before = link([{ kind: 'hover', hover: 1, color: ROSE }])
    assert.equal(contrastCheck(before, before, false)?.ok, true)
    assert.equal(contrastCheck(before, link([{ kind: 'hover', hover: 1, color: TEXTE }]), false)?.ok, true)
  })

  it('compare un état au même état d’avant : même sorte, même survol, même focus', () => {
    // Même sorte et même survol, mais focus sur un autre élément : comparé au repos, pas à ce focus-là.
    const other = contrastCheck(
      link([{ kind: 'hover-focus', hover: 1, focus: -1, color: ROSE }]),
      link([{ kind: 'hover-focus', hover: 1, focus: 1, color: ROSE }]),
      false,
    )
    assert.equal(other?.detail, '“Accueil” on hover, with focus after a click: 17.06 → 3.8 at 375, 810, 1280 px')
    const same = contrastCheck(
      link([{ kind: 'hover-focus', hover: 1, focus: 1, color: ROSE }]),
      link([{ kind: 'hover-focus', hover: 1, focus: 1, color: ROSE }]),
      false,
    )
    assert.equal(same?.ok, true)
  })

  it('sans survol aussi profond avant (mot mis en avant ajouté), compare au plus profond d’avant, sinon au repos', () => {
    // Survol à la profondeur 2 absent avant : comparé au survol à la profondeur 1 (Rose, déjà sous le seuil), pas au repos.
    const rose = contrastCheck(
      link([
        { kind: 'hover', hover: 0, color: TEXTE },
        { kind: 'hover', hover: 1, color: ROSE },
      ]),
      link([{ kind: 'hover', hover: 2, color: ROSE }]),
      false,
    )
    assert.equal(rose?.ok, true)
    // Focus clavier absent avant : comparé au repos.
    const focus = contrastCheck(link([]), link([{ kind: 'focus-visible', focus: 1, color: NUIT }]), false)
    assert.equal(focus?.detail, '“Accueil” on keyboard focus: 17.06 → 1 at 375, 810, 1280 px')
  })

  it('un fond inconnu dans un état, avant comme après, n’est pas compté ; les autres textes restent contrôlés', () => {
    const unknown = link([{ kind: 'hover', hover: 1, color: NUIT, image: 'url("/voiture.jpg")' }])
    const photo = link([{ kind: 'hover', hover: 1, color: TEXTE, image: 'url("/voiture.jpg")' }])
    assert.equal(contrastCheck(photo, unknown, false)?.ok, true)
    assert.equal(contrastCheck(photo, link([{ kind: 'hover', hover: 1, color: TEXTE }], NUIT), false)?.ok, false)
  })

  it('refuse un état mesuré avant dont la couleur n’est plus mesurable après, logotype compris (relecture tâche 26)', () => {
    // `.logo:hover { color: rgb(from var(--color-night) r g b) }` accordé en 🔴 : Chrome calcule color(srgb …).
    const relative = 'color(srgb 0.0588235 0.0901961 0.164706)'
    for (const exempt of [true, false]) {
      const result = contrastCheck(
        link([{ kind: 'hover', hover: 1, color: TEXTE }]),
        link([{ kind: 'hover', hover: 1, color: relative }]),
        exempt,
      )
      assert.equal(result?.ok, false, String(exempt))
      assert.equal(
        result?.detail,
        '“Accueil” on hover: color not measurable after the change (contrast 17.06 before) at 375, 810, 1280 px',
      )
      assert.match(result?.problem ?? '', /^The color of the text “Accueil” on hover is no longer measurable after the change/)
    }
    // Non mesurable au repos : l’état qui en hérite n’est pas répété.
    const rest = contrastCheck(
      link([{ kind: 'hover', hover: 1, color: TEXTE }]),
      measuresOf(
        {},
        rawZone({
          texts: [rawText({ key: '0', text: 'Accueil', color: relative })],
          states: [rawState({ kind: 'hover', hover: 1, texts: [rawText({ key: '0', text: 'Accueil', color: relative })] })],
        }),
      ),
      true,
    )
    assert.equal(
      rest?.detail,
      '“Accueil”: color not measurable after the change (contrast 17.06 before) at 375, 810, 1280 px',
    )
  })

  it('le logotype est exempté du seuil WCAG, états compris, pas du plancher de 1,5:1 (tâche 26)', () => {
    // Rose au survol (3,8, sous 4,5) : exempté.
    const rose = contrastCheck(
      link([{ kind: 'hover', hover: 1, color: TEXTE }]),
      link([{ kind: 'hover', hover: 1, color: ROSE }]),
      true,
    )
    assert.equal(rose, null)
    // Nuit au survol sur un fond Nuit (1:1) : le logo, lien vers l’accueil, disparaît au survol.
    const night = contrastCheck(
      link([{ kind: 'hover', hover: 1, color: TEXTE }]),
      link([{ kind: 'hover', hover: 1, color: NUIT }]),
      true,
    )
    assert.equal(night?.ok, false)
    assert.equal(night?.detail, '“Accueil” on hover: 17.06 → 1 at 375, 810, 1280 px')
  })
})

describe('contrastCheck — tous les textes visibles, au-delà des 10 relevés en entier', () => {
  const NUIT = 'rgb(15, 23, 42)'
  const TEXTE = 'rgb(248, 250, 252)'
  /** Corps d’article de `count` paragraphes (Texte sur Nuit), ceux de rang `from` et au-delà en `color`. */
  const article = (count: number, color = TEXTE, from = 0, total = count) => {
    const paragraphs = Array.from({ length: Math.min(count, MAX_PAINTS) }, (_, n) =>
      rawText({ key: String(n), text: `Paragraphe ${n + 1}`, color: n >= from ? color : TEXTE }),
    )
    return measuresOf(
      {},
      rawZone({ texts: paragraphs.slice(0, 10), paints: { texts: paragraphs.map(paintOf), total }, occurrences: 1 }),
    )
  }

  it('refuse un texte au-delà du 10e devenu illisible au repos (:nth-child(n+11))', () => {
    const result = contrastCheck(article(13), article(13, NUIT, 10), false)
    assert.equal(result?.ok, false)
    assert.equal(result?.detail, [11, 12, 13].map((n) => `“Paragraphe ${n}”: 17.06 → 1 at 375, 810, 1280 px`).join('; '))
  })

  it('refuse un relevé partiel (plus de MAX_PAINTS textes visibles) au lieu de le dire lisible', () => {
    // Décision 19 : 400 textes au plus par occurrence.
    assert.equal(MAX_PAINTS, 400)
    const long = article(MAX_PAINTS, TEXTE, 0, 450)
    const result = contrastCheck(long, long, false)
    assert.equal(result?.ok, false)
    assert.equal(result?.detail, 'Partial reading: 450 visible texts, only the first 400 are measured at 375, 810, 1280 px')
    assert.equal(
      result?.problem,
      'The zone has 450 visible texts: the contrast is only measured on the first 400, so it cannot be ' +
        'guaranteed. Do not change the style of this zone and tell the client it is too long to be checked by ' +
        'the editor.',
    )
    // Un état relevé en partie suffit.
    const state = rawState({ kind: 'hover', hover: 0, texts: [rawText()], total: 450 })
    const zone = measuresOf({}, rawZone({ states: [state] }))
    assert.equal(contrastCheck(zone, zone, false)?.ok, false)
    // Exactement MAX_PAINTS textes : relevé complet.
    const full = article(MAX_PAINTS)
    assert.equal(contrastCheck(full, full, false)?.ok, true)
  })

  it('ne cite que les 6 premières baisses, puis leur nombre', () => {
    const result = contrastCheck(article(13), article(13, NUIT), false)
    const cited = Array.from({ length: 6 }, (_, n) => `“Paragraphe ${n + 1}”: 17.06 → 1 at 375, 810, 1280 px`)
    assert.equal(result?.detail, `${cited.join('; ')}; and 7 other texts`)
    assert.match(String(result?.problem), /And 7 other texts of the zone also become less legible\.$/)
    assert.equal(String(result?.problem).match(/The text “/g)?.length, 6)
  })
})

describe('contrastCheck — chaque occurrence de la zone, au-delà des 12 relevées en entier', () => {
  const NUIT = 'rgb(15, 23, 42)'
  const NUIT_CLAIRE = 'rgb(30, 41, 59)'
  const BRUME = 'rgb(148, 163, 184)'
  /** Carte article : sa date en `color` sur Nuit claire. */
  const card = (color = BRUME) =>
    rawZone({
      texts: [
        rawText({ key: '0.1', text: '24 septembre 2026', color, fontSize: 14, layers: [{ color: NUIT_CLAIRE, image: 'none' }] }),
      ],
    })

  it('refuse la date des cartes 13 et 14 devenue illisible (.card:nth-child(n+13) .date)', () => {
    const before = occurrencesOf(Array.from({ length: 14 }, () => card()))
    const after = occurrencesOf(Array.from({ length: 14 }, (_, rank) => card(rank >= 12 ? NUIT_CLAIRE : BRUME)))
    const result = contrastCheck(before, after, false)
    assert.equal(result?.ok, false)
    assert.equal(result?.detail, '“24 septembre 2026” (occurrences 13 and 14 of 14): 5.71 → 1 at 375, 810, 1280 px')
  })

  it('refuse un relevé qui ne couvre pas toutes les occurrences de la zone, au lieu de le dire lisible', () => {
    const twelve = occurrencesOf(
      Array.from({ length: 12 }, () => card()),
      14,
    )
    const result = contrastCheck(twelve, twelve, false)
    assert.equal(result?.ok, false)
    assert.equal(result?.detail, 'Partial reading: 14 occurrences of the zone, only 12 are measured at 375, 810, 1280 px')
    assert.equal(
      result?.problem,
      'The zone repeats 14 times on the page: the contrast is only measured on 12 of them, so it cannot ' +
        'be guaranteed. Do not change the style of this zone and tell the client it repeats too often on the page ' +
        'to be checked by the editor.',
    )
    // Une occurrence introuvable n’est pas mesurée.
    const missing = occurrencesOf([card(), null], 2)
    assert.equal(contrastCheck(missing, missing, false)?.ok, false)
    // Toutes les occurrences mesurées : relevé complet.
    const all = occurrencesOf(Array.from({ length: 14 }, () => card()))
    assert.equal(contrastCheck(all, all, false)?.ok, true)
  })
})

describe('unverifiableCheck — une règle de couleur se juge sur son effet (décision 19)', () => {
  const MESSAGE =
    'Your color rule changes no visible text of the zone: write it on the selector of the zone or of its texts.'

  it('refuse une règle de couleur sans effet sur les textes visibles de la zone, avec le message du 2e essai', () => {
    const result = unverifiableCheck(['.content > :nth-child(n+1) { color }'], false)
    assert.equal(result?.id, 'contrast-unverifiable')
    assert.equal(result?.label, 'Each color or text size rule acts on a visible text')
    assert.equal(result?.ok, false)
    assert.equal(result?.detail, 'No effect on the visible texts of the zone: `.content > :nth-child(n+1) { color }`')
    assert.equal(
      result?.problem,
      'Rule with no measurable effect: `.content > :nth-child(n+1) { color }`. It would only paint texts absent from ' +
        'this page (another page, content added later in the CMS), whose contrast cannot be checked. ' +
        MESSAGE,
    )
  })

  it('nomme chaque règle sans effet, et dit de quelle sorte de règle il s’agit', () => {
    const two = unverifiableCheck(['.content { color }', '.card { background-color }'], false)
    assert.equal(
      two?.detail,
      'No effect on the visible texts of the zone: `.content { color }` and `.card { background-color }`',
    )
    assert.equal(
      two?.problem,
      'Rules with no measurable effect: `.content { color }` and `.card { background-color }`. They would only paint ' +
        'texts absent from this page (another page, content added later in the CMS), whose contrast cannot ' +
        'be checked. Your color rules change no visible text of the zone: write them on the selector of the ' +
        'zone or of its texts.',
    )
    const font = unverifiableCheck(['.content :global(p) { font-size }'], false)
    assert.ok(
      String(font?.problem).endsWith(
        'Your text size rule changes no visible text of the zone: write it on the selector of the zone or of ' +
          'its texts.',
      ),
    )
    const mixed = unverifiableCheck(['.content { color }', '.content p { font-size, font-weight }'], false)
    assert.match(String(mixed?.problem), /Your color or text size rules change no visible text/)
    // Au-delà de 6 règles, leur nombre.
    const many = unverifiableCheck(
      Array.from({ length: 9 }, (_, n) => `.content > :nth-child(${n + 1}) { color }`),
      false,
    )
    assert.match(String(many?.detail), /`\.content > :nth-child\(6\) \{ color \}` and 3 other rules$/)
  })

  it('ne dit rien sans règle jugée ; le logotype est exempté', () => {
    assert.equal(unverifiableCheck([], false), null)
    assert.equal(unverifiableCheck(['.accent { color }'], true), null)
    assert.equal(unverifiableCheck(null, true), null)
  })

  it('refuse quand les règles de style de la page n’ont pas toutes été lues', () => {
    assert.equal(MAX_RULES, 20000)
    const result = unverifiableCheck(null, false)
    assert.equal(result?.id, 'contrast-unverifiable')
    assert.equal(result?.ok, false)
    assert.equal(
      result?.detail,
      'Contrast cannot be checked: more than 20,000 style rules in the page, not all of them were read',
    )
    assert.equal(
      result?.problem,
      'The page has more than 20,000 style rules: not all of them were read, and the contrast of those you ' +
        'added cannot be checked. Do not change the style of this zone and tell the client it cannot be ' +
        'checked by the editor.',
    )
  })
})

describe('reachCheck — une règle de couleur se juge sur tous les textes qu’elle peut peindre (décision 19, 4e relecture)', () => {
  const CLOSING =
    'A rule overridden by a more specific rule, or a broad one, would paint without any check texts other than those of the ' +
    'page (another article, content added later in the CMS). Write each color on the selector of the texts it ' +
    'must paint (their class of the CSS Module, or, in the body of an article, their tag: `.content :global(h2)`), without ' +
    'having another rule override it, or choose a design system color that is legible on all these texts.'
  /** Paragraphe de 18 px que `.content { color: Rose }` peindrait sans la règle plus précise qui le rattrape. */
  const exposure = (partial: Partial<RuleExposure> = {}): RuleExposure => ({
    rule: '.content { color }',
    viewport: 375,
    occurrence: 0,
    occurrences: 1,
    kind: null,
    key: '0',
    text: 'Paragraphe 1',
    ratio: 3.8,
    required: 4.5,
    masked: true,
    apart: false,
    broad: true,
    ...partial,
  })
  const both = (partial: Partial<RuleExposure>) => [exposure(partial), exposure({ ...partial, viewport: 1280 })]

  it('refuse une règle rattrapée par une règle plus précise, et une règle large sous 4,5 (V1)', () => {
    const result = reachCheck(
      [...both({}), ...both({ key: '2', text: 'Paragraphe 3' }), ...both({ key: '1', text: 'Intertitre', masked: false })],
      false,
    )
    assert.equal(result?.id, 'contrast-reach')
    assert.equal(result?.label, 'Each color rule stays legible on all the texts it can paint')
    assert.equal(result?.ok, false)
    assert.equal(
      result?.detail,
      '`.content { color }` overridden: “Paragraphe 1” 3.8 (minimum 4.5) at 375, 1280 px; `.content { color }` ' +
        'overridden: “Paragraphe 3” 3.8 (minimum 4.5) at 375, 1280 px; `.content { color }` broad: “Intertitre” 3.8 ' +
        '(minimum 4.5) at 375, 1280 px',
    )
    assert.equal(
      result?.problem,
      'Without the more specific rule that overrides it, `.content { color }` would give the text “Paragraphe 1” a contrast ' +
        'of 3.8 at 375, 1280 px (minimum 4.5). Without the more specific rule that overrides it, `.content { color }` would give ' +
        'the text “Paragraphe 3” a contrast of 3.8 at 375, 1280 px (minimum 4.5). The rule `.content { color }` is ' +
        'broad (it paints by inheritance, or without a class or a block tag): it gives the text “Intertitre” a ' +
        'contrast of 3.8 at 375, 1280 px, below the minimum for body text (4.5). ' +
        CLOSING,
    )
  })

  it('réunit les occurrences et les états ; un état qui répète le repos n’est pas nommé', () => {
    const card = { rule: '.card:hover { background-color }', kind: 'hover' as const, occurrences: 3, masked: false, ratio: 1.06 }
    const title = { rule: '.content h2 { color }', key: '1', text: 'Intertitre', ratio: 1, required: 3, broad: false }
    const result = reachCheck(
      [exposure(card), exposure({ ...card, occurrence: 2 }), exposure(title), exposure({ ...title, kind: 'hover' })],
      false,
    )
    assert.equal(
      result?.detail,
      '`.card:hover { background-color }` broad: “Paragraphe 1” (occurrences 1 and 3 of 3) on hover 1.06 (minimum ' +
        '4.5) at 375 px; `.content h2 { color }` overridden: “Intertitre” 1 (minimum 3) at 375 px',
    )
    assert.equal(
      result?.problem,
      'The rule `.card:hover { background-color }` is broad (it paints by inheritance, or without a class or a block tag): ' +
        'it gives the text “Paragraphe 1” (occurrences 1 and 3 of 3) on hover a contrast of 1.06 at 375 px, below the ' +
        'minimum for body text (4.5). Without the more specific rule that overrides it, `.content h2 { color }` would give ' +
        'the text “Intertitre” a contrast of 1 at 375 px (minimum 3). ' +
        CLOSING,
    )
  })

  it('cite 6 textes au plus, puis leur nombre', () => {
    const many = Array.from({ length: 8 }, (_, n) => exposure({ key: String(n), text: `Paragraphe ${n + 1}` }))
    const result = reachCheck(many, false)
    assert.match(String(result?.detail), /“Paragraphe 6” 3.8 \(minimum 4.5\) at 375 px; and 2 other texts$/)
    assert.ok(String(result?.problem).endsWith(`And 2 other texts are also below the minimum. ${CLOSING}`))
  })

  it('ne dit rien sans texte sous le minimum ; le logotype est exempté', () => {
    assert.equal(reachCheck([], false), null)
    assert.equal(reachCheck([exposure()], true), null)
  })

  it('nomme une règle jugée seule dans une zone à contenu libre, et dit comment l’y écrire (5e relecture)', () => {
    const FREE =
      'The content of this zone comes from the CMS and changes from one page to another (lists, quotes, subheadings absent here): ' +
      'each color or background rule is judged alone there, because another rule that makes it legible here may be missing ' +
      'elsewhere. Set the background and the text color together, on the whole zone ' +
      '(`.content { background-color: …; color: … }`) or on the same selector ' +
      '(`.content :global(p) { background-color: …; color: … }`).'
    // D1 : `.content { background-color: Blanc }` + `.content p, .content h2 { color: Nuit }`, fond jugé sans ces couleurs.
    const white = { rule: '.content { background-color }', ratio: 1.05, masked: false, apart: true }
    const result = reachCheck([...both(white), ...both({ ...white, key: '1', text: 'Intertitre' })], false)
    assert.equal(result?.ok, false)
    assert.equal(
      result?.detail,
      '`.content { background-color }` alone: “Paragraphe 1” 1.05 (minimum 4.5) at 375, 1280 px; ' +
        '`.content { background-color }` alone: “Intertitre” 1.05 (minimum 4.5) at 375, 1280 px',
    )
    assert.equal(
      result?.problem,
      'Without the other rules of your change (except those of the same selector or of the whole zone), ' +
        '`.content { background-color }` would give the text “Paragraphe 1” a contrast of 1.05 at 375, 1280 px ' +
        '(minimum 4.5). Without the other rules of your change (except those of the same selector or of the whole zone), ' +
        '`.content { background-color }` would give the text “Intertitre” a contrast of 1.05 at 375, 1280 px ' +
        `(minimum 4.5). ${CLOSING} ${FREE}`,
    )
    // Une même règle jugée seule et rattrapée n’est pas confondue : deux constats distincts.
    const mixed = reachCheck([exposure(), exposure({ masked: false, apart: true, ratio: 1 })], false)
    assert.equal(
      mixed?.detail,
      '`.content { color }` overridden: “Paragraphe 1” 3.8 (minimum 4.5) at 375 px; `.content { color }` alone: ' +
        '“Paragraphe 1” 1 (minimum 4.5) at 375 px',
    )
  })
})
