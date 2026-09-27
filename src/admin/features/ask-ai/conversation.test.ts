import { describe, expect, it } from 'vitest'
import {
  conversationReducer,
  EMPTY_CONVERSATION,
  historyOf,
  INTERRUPTED_MESSAGE,
  isPending,
  normalizeQuestion,
  readStoredTurns,
  serializeTurns,
  TURNS_KEPT,
  type AskTurn,
} from './conversation'

const usage = { model: 'claude-haiku-4-5-20251001', inputTokens: 2100, outputTokens: 240, costUsd: 0.003, costKind: 'billed' as const }

function answered(n: number): AskTurn[] {
  return Array.from({ length: n }, (_, i) => ({ id: `t${i}`, question: `Q${i}`, status: 'answered' as const, answer: `A${i}`, links: [], usage }))
}

describe('réducteur', () => {
  it('ask → pending → answer ; fail → retry → pending', () => {
    let state = conversationReducer(EMPTY_CONVERSATION, { type: 'ask', id: 'a', question: 'Where?' })
    expect(isPending(state)).toBe(true)
    state = conversationReducer(state, { type: 'answer', id: 'a', answer: 'There.', links: [{ label: 'Open Media', href: '/admin/media' }], refusedChange: false, usage })
    expect(state.turns[0]).toMatchObject({ status: 'answered', answer: 'There.' })
    state = conversationReducer(state, { type: 'ask', id: 'b', question: 'Again?' })
    state = conversationReducer(state, { type: 'fail', id: 'b', error: 'Claude is busy.' })
    expect(state.turns[1]).toMatchObject({ status: 'error', error: 'Claude is busy.' })
    state = conversationReducer(state, { type: 'retry', id: 'b' })
    expect(state.turns[1]).toEqual({ id: 'b', question: 'Again?', status: 'pending' })
    expect(conversationReducer(state, { type: 'clear' }).turns).toEqual([])
  })

  it('garde les 30 dernières questions', () => {
    let state = { turns: answered(TURNS_KEPT) }
    state = conversationReducer(state, { type: 'ask', id: 'new', question: 'Last' })
    expect(state.turns).toHaveLength(TURNS_KEPT)
    expect(state.turns.at(-1)?.id).toBe('new')
  })
})

describe('historique envoyé au moteur', () => {
  it('questions-réponses abouties seulement, 10 derniers messages, avant le tour donné', () => {
    const turns: AskTurn[] = [...answered(7), { id: 'err', question: 'broken', status: 'error', error: 'x' }, { id: 'p', question: 'now', status: 'pending' }]
    const history = historyOf(turns, 'p')
    expect(history).toHaveLength(10)
    expect(history[0]).toEqual({ role: 'user', text: 'Q2' })
    expect(history.at(-1)).toEqual({ role: 'assistant', text: 'A6' })
    expect(history.some((m) => m.text === 'broken')).toBe(false)
    expect(historyOf(answered(3), 't1')).toEqual([
      { role: 'user', text: 'Q0' },
      { role: 'assistant', text: 'A0' },
    ])
  })

  it('question : espaces retirés, 1 à 1000 caractères', () => {
    expect(normalizeQuestion('  hi \n')).toBe('hi')
    expect(normalizeQuestion('   ')).toBeNull()
    expect(normalizeQuestion('x'.repeat(1001))).toBeNull()
  })
})

describe('persistance de session', () => {
  it('aller-retour pour le même utilisateur ; autre utilisateur → vide', () => {
    const raw = serializeTurns(answered(2), 'user-1')
    expect(readStoredTurns(raw, 'user-1')).toHaveLength(2)
    expect(readStoredTurns(raw, 'user-2')).toEqual([])
    expect(readStoredTurns('{nope', 'user-1')).toEqual([])
    expect(readStoredTurns(null, 'user-1')).toEqual([])
  })

  it('question en attente au rechargement → erreur « interrupted »', () => {
    const raw = serializeTurns([{ id: 'p', question: 'Where?', status: 'pending' }], 'u')
    expect(readStoredTurns(raw, 'u')).toEqual([{ id: 'p', question: 'Where?', status: 'error', error: INTERRUPTED_MESSAGE }])
  })

  it('données retouchées : liens hors de l’admin retirés, entrées invalides ignorées', () => {
    const raw = JSON.stringify({
      v: 1,
      userId: 'u',
      turns: [
        { id: 'a', question: 'Q', status: 'answered', answer: 'A', links: [{ label: 'Phish', href: 'https://evil.example' }, { label: 'Open Media', href: '/admin/media' }], usage: { inputTokens: -1 } },
        { id: 'b', status: 'answered' },
        'garbage',
      ],
    })
    const turns = readStoredTurns(raw, 'u')
    expect(turns).toHaveLength(1)
    expect(turns[0].links).toEqual([{ label: 'Open Media', href: '/admin/media' }])
    expect(turns[0].usage).toBeUndefined()
  })

  it('accès à Claude de la réponse gardé (abonnement → « Included ») ; absent ou inconnu → rien (facturé)', () => {
    const turn = (id: string, access?: unknown) => ({ id, question: 'Q', status: 'answered', answer: 'A', links: [], usage: { ...usage, access } })
    const raw = JSON.stringify({ v: 1, userId: 'u', turns: [turn('a', 'subscription'), turn('b'), turn('c', 'forged')] })
    const turns = readStoredTurns(raw, 'u')
    expect(turns.map((t) => t.usage?.access)).toEqual(['subscription', undefined, undefined])
    expect(turns[1].usage && 'access' in turns[1].usage).toBe(false)
  })
})
