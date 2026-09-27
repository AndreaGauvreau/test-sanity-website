import { describe, expect, it } from 'vitest'
import type { Question } from '@/admin/core/contracts'
import { entry, job, TARGET } from './fixtures'
import {
  adjustmentScope,
  buildAnswers,
  canApply,
  checksLine,
  checksSpoken,
  composerState,
  hardcodedLabel,
  headerView,
  isValidNote,
  latestJobIndex,
  reviewTitle,
  shouldRestoreRequest,
  stepView,
  summaryNeedsTarget,
  summaryText,
  toggleScope,
  upsertJob,
  validatedText,
} from './machine'

describe('composerState — machine à états du Composer (6 états + answer)', () => {
  const base = { job: null, pending: null, selectionCount: 0, answeringOther: false }
  it('empty → ready → multi selon la sélection', () => {
    expect(composerState(base)).toBe('empty')
    expect(composerState({ ...base, selectionCount: 1 })).toBe('ready')
    expect(composerState({ ...base, selectionCount: 3 })).toBe('multi')
  })
  it('working pendant queued / running, waiting pendant une question, answer avec « Other answer… »', () => {
    expect(composerState({ ...base, selectionCount: 2, job: { status: 'queued' } })).toBe('working')
    expect(composerState({ ...base, job: { status: 'running' } })).toBe('working')
    expect(composerState({ ...base, job: { status: 'waiting' } })).toBe('waiting')
    expect(composerState({ ...base, job: { status: 'waiting' }, answeringOther: true })).toBe('answer')
  })
  it('adjust tant qu’une modification attend sa validation (même si une autre sélection existe)', () => {
    expect(composerState({ ...base, selectionCount: 1, pending: { status: 'to-validate' } })).toBe('adjust')
    expect(composerState({ ...base, pending: { status: 'working' } })).toBe('empty')
  })
  it('une demande terminée ne bloque plus', () => {
    expect(composerState({ ...base, selectionCount: 1, job: { status: 'done' } })).toBe('ready')
  })
})

describe('canApply', () => {
  it('ready : au moins une portée (rien par défaut), un texte de 1 à 600 caractères', () => {
    expect(canApply({ state: 'ready', scope: [], targetCount: 1, note: 'Bigger' })).toBe(false)
    expect(canApply({ state: 'ready', scope: ['style'], targetCount: 1, note: '   ' })).toBe(false)
    expect(canApply({ state: 'ready', scope: ['style'], targetCount: 1, note: 'Bigger' })).toBe(true)
    expect(canApply({ state: 'ready', scope: ['text'], targetCount: 1, note: 'x'.repeat(600) })).toBe(true)
    expect(canApply({ state: 'ready', scope: ['text'], targetCount: 1, note: 'x'.repeat(601) })).toBe(false)
    expect(canApply({ state: 'multi', scope: ['text'], targetCount: 9, note: 'x' })).toBe(false)
  })
  it('adjust : texte seul ; answer : 300 caractères ; working / waiting / empty : jamais', () => {
    expect(canApply({ state: 'adjust', scope: [], targetCount: 0, note: 'Smaller' })).toBe(true)
    expect(canApply({ state: 'answer', scope: [], targetCount: 0, note: 'x'.repeat(300) })).toBe(true)
    expect(canApply({ state: 'answer', scope: [], targetCount: 0, note: 'x'.repeat(301) })).toBe(false)
    for (const state of ['working', 'waiting', 'empty'] as const) {
      expect(canApply({ state, scope: ['style'], targetCount: 1, note: 'x' })).toBe(false)
    }
  })
  it('compte les caractères visibles (émojis = 1) et refuse les caractères de contrôle', () => {
    expect(isValidNote('😀'.repeat(600))).toBe(true)
    expect(isValidNote('a\u0007b')).toBe(false)
    expect(isValidNote('line 1\nline 2')).toBe(true)
  })
  it('portée : ordre stable, sans doublon', () => {
    expect(toggleScope(['text'], 'style', true)).toEqual(['style', 'text'])
    expect(toggleScope(['style', 'text'], 'style', false)).toEqual(['text'])
    expect(toggleScope(['style'], 'style', true)).toEqual(['style'])
  })
})

describe('buildAnswers — réponses aux questions', () => {
  const q = (id: string): Question => ({
    id,
    question: 'No token matches exactly.',
    options: [
      { id: 'token', label: 'Use Heading XL (recommended)', tone: 'recommended' },
      { id: 'hard', label: 'Hard-code 60 px', tone: 'discouraged', hardcoded: { property: 'font-size', value: '60px' } },
    ],
  })
  it('une option par question → réponses prêtes', () => {
    expect(buildAnswers([q('a')], { a: { optionId: 'token' } })).toEqual({ ok: true, answers: [{ questionId: 'a', optionId: 'token' }] })
  })
  it('attend que chaque question ait sa réponse', () => {
    expect(buildAnswers([q('a'), q('b')], { a: { optionId: 'token' } })).toEqual({ ok: false, missing: ['b'] })
  })
  it('refuse une option inconnue et une réponse libre vide ou > 300 caractères ; nettoie le texte', () => {
    expect(buildAnswers([q('a')], { a: { optionId: 'nope' } }).ok).toBe(false)
    expect(buildAnswers([q('a')], { a: { other: '  ' } })).toMatchObject({ ok: false, error: expect.stringContaining('300') })
    expect(buildAnswers([q('a')], { a: { other: 'x'.repeat(301) } }).ok).toBe(false)
    expect(buildAnswers([q('a')], { a: { other: '  58 px  ' } })).toEqual({ ok: true, answers: [{ questionId: 'a', other: '58 px' }] })
  })
  it('🔴 : « prop: value »', () => {
    expect(hardcodedLabel(q('a').options[1])).toBe('font-size: 60px')
    expect(hardcodedLabel(q('a').options[0])).toBeNull()
  })
})

describe('libellés du fil', () => {
  it('en-tête : Working… / Needs your answer / Done · 24 s / Adjusted · 12 s / Stopped', () => {
    expect(headerView(job({ status: 'queued' }))).toEqual({ state: 'working', status: 'Working…' })
    expect(headerView(job({ status: 'waiting' }))).toEqual({ state: 'asking', status: 'Needs your answer' })
    const done = job({ status: 'done', startedAt: '2026-09-27T10:00:00.000Z', finishedAt: '2026-09-27T10:00:24.000Z' })
    expect(headerView(done)).toEqual({ state: 'done', status: 'Done · 24 s' })
    expect(headerView({ ...done, kind: 'adjustment', finishedAt: '2026-09-27T10:00:12.000Z' }).status).toBe('Adjusted · 12 s')
    expect(headerView(job({ status: 'stopped' })).state).toBe('stopped')
  })
  it('étapes : edit / text = change, le reste = log', () => {
    expect(stepView({ kind: 'edit', label: 'Title → Heading XL' }).kind).toBe('change')
    expect(stepView({ kind: 'read', label: 'Reading Hero.module.css' }).kind).toBe('log')
  })
  it('résumé : « (Sanity draft) » pour un texte, cible préfixée seulement si plusieurs éléments', () => {
    const items = [
      { target: 'Title', description: 'size → Heading XL (token)', kind: 'style' as const, where: 'code' as const },
      { target: 'Title', description: '“solved” in bold', kind: 'text' as const, where: 'sanity-draft' as const },
    ]
    expect(summaryNeedsTarget(items)).toBe(false)
    expect(summaryText(items[1], false)).toBe('“solved” in bold (Sanity draft)')
    expect(summaryText({ ...items[1], description: 'x (Sanity draft)' }, false)).toBe('x (Sanity draft)')
    expect(summaryText(items[0], true)).toBe('Title: size → Heading XL (token)')
  })
  it('contrôles : « Checks: contrast ✓ · mobile ✓ · tablet ✕ » et phrase lue', () => {
    const checks = [
      { id: 'contrast' as const, label: 'contrast', ok: true },
      { id: 'responsive' as const, label: 'mobile', ok: true, warning: true },
      { id: 'lines' as const, label: 'tablet', ok: false },
    ]
    expect(checksLine(checks)).toBe('Checks: contrast ✓ · mobile ! · tablet ✕')
    expect(checksSpoken(checks)).toBe('Checks: contrast passed, mobile passed with a warning, tablet failed')
    expect(checksLine([])).toBeNull()
  })
  it('carte de validation et validation', () => {
    expect(reviewTitle(0)).toBe('1 change to validate')
    expect(reviewTitle(1)).toBe('1 change · adjusted once')
    expect(reviewTitle(2)).toBe('1 change · adjusted twice')
    expect(reviewTitle(3)).toBe('1 change · adjusted 3 times')
    expect(validatedText(3)).toBe('Validated — added to Publish (3 changes)')
    expect(validatedText(1)).toBe('Validated — added to Publish (1 change)')
  })
})

describe('fil', () => {
  it('la dernière demande est détaillée seulement si elle termine le fil', () => {
    const a = entry(job({ id: 'a', status: 'done' }))
    expect(latestJobIndex([a])).toBe(0)
    expect(latestJobIndex([a, { type: 'validated', changeId: 'chg-1', at: 'x', pendingTotal: 3 }])).toBe(-1)
    expect(latestJobIndex([])).toBe(-1)
  })
  it('upsertJob remplace sans changer l’ordre, ajoute sinon', () => {
    const a = job({ id: 'a' })
    const b = job({ id: 'b' })
    const thread = [entry(a), entry(b)]
    const next = upsertJob(thread, { ...a, status: 'done' })
    expect(next.map((e) => (e.type === 'job' ? `${e.job.id}:${e.job.status}` : ''))).toEqual(['a:done', 'b:running'])
    expect(upsertJob(thread, job({ id: 'c' }))).toHaveLength(3)
  })
  it('demande rendue au champ après Stop, échec ou refus ; pas après done', () => {
    expect(shouldRestoreRequest({ status: 'stopped', kind: 'request' })).toBe(true)
    expect(shouldRestoreRequest({ status: 'failed', kind: 'adjustment' })).toBe(true)
    expect(shouldRestoreRequest({ status: 'done', kind: 'request' })).toBe(false)
  })
  it('portée d’un ajustement = celle de la demande d’origine', () => {
    const t = [entry(job({ changeId: 'c', request: { page: '/', targets: [TARGET], scope: ['text'], note: 'x', viewport: 1280 } }))]
    expect(adjustmentScope(t, 'c')).toEqual(['text'])
    expect(adjustmentScope(t, 'other')).toEqual(['style', 'text'])
  })
})
