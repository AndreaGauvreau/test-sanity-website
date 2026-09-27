/** @vitest-environment jsdom */
import type { ReactNode } from 'react'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MotionGlobalConfig } from 'motion/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EngineErrorBody } from '@/admin/core/contracts'
import { createEditorMock, MOCK_EDITOR_MESSAGES } from '@/admin/core/engine/mock/editor'
import type { MockEngineRequest } from '@/admin/core/engine/mock/types'
import { EditorStoreProvider, useEditorStore } from '../state/context'
import type { EditorStore } from '../state/store'
import { EditorSidebar } from '.'

// ─── Faux moteur : le client navigateur est branché sur le moteur SIMULÉ (même code que ENGINE_MOCK=1) ────

const engine = vi.hoisted(() => ({
  mock: null as null | ReturnType<typeof import('@/admin/core/engine/mock/editor').createEditorMock>,
  calls: [] as string[],
  failNext: 0,
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock('@/admin/core/engine/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/admin/core/engine/client')>()
  const user = { id: 'dev-client', name: 'Marie', email: 'marie@example.com', role: 'client' as const }
  async function call(method: 'GET' | 'POST', path: string, body?: unknown, signal?: AbortSignal) {
    engine.calls.push(`${method} ${path}`)
    if (signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' })
    if (engine.failNext > 0) {
      engine.failNext -= 1
      throw new actual.EngineClientError(0, 'unavailable', "The AI engine isn't responding. Try again in a moment.")
    }
    const url = new URL(`http://x/${path}`)
    const segments = url.pathname.slice(1).split('/')
    const params: Record<string, string> = {}
    if (segments[1] === 'jobs' || segments[1] === 'changes') params.id = segments[2]
    const req: MockEngineRequest = { method, segments, params, query: url.searchParams, body, user }
    const res = (await engine.mock!.handle(req)) as { status: number; json: unknown }
    if (res.status >= 400) {
      const err = (res.json as EngineErrorBody).error
      throw new actual.EngineClientError(res.status, err.code, err.message)
    }
    return structuredClone(res.json)
  }
  const fake = {
    ...actual.engineClient,
    editor: {
      ...actual.engineClient.editor,
      state: (page: string) => call('GET', `editor/state?page=${encodeURIComponent(page)}`),
      request: (r: unknown) => call('POST', 'editor/requests', r),
      job: (id: string, o?: { signal?: AbortSignal }) => call('GET', `editor/jobs/${id}`, undefined, o?.signal),
      answer: (id: string, answers: unknown) => call('POST', `editor/jobs/${id}/answer`, { answers }),
      stop: (id: string) => call('POST', `editor/jobs/${id}/stop`, {}),
      validate: (id: string) => call('POST', `editor/changes/${id}/validate`, {}),
      cancel: (id: string) => call('POST', `editor/changes/${id}/cancel`, {}),
    },
  }
  return { ...actual, engineClient: fake }
})

// ─── Montage ──────────────────────────────────────────────────────────────────────────────────────

const TITLE = { zone: 'hero.title', index: 0, label: 'Hero · Title' }
let store: EditorStore

function Capture() {
  store = useEditorStore()
  return null
}

function mount() {
  return render(
    <EditorStoreProvider pageId="home" path="/" backHref="/admin/pages/home/seo">
      <Capture />
      <EditorSidebar />
    </EditorStoreProvider>,
  )
}

/**
 * Interactions par fireEvent : user-event se bloque sous les minuteurs simulés de Vitest (nécessaires pour piloter
 * le sondage de 900 ms). Le clavier fin (⌘ ↵, Échap, compteur) est couvert en temps réel par Composer.test.tsx.
 */
const u = {
  click: async (el: Element) => {
    act(() => {
      fireEvent.click(el)
    })
    await tick(0)
  },
  type: async (el: Element, text: string) => {
    act(() => {
      fireEvent.change(el, { target: { value: ((el as HTMLTextAreaElement).value ?? '') + text } })
    })
  },
  key: async (el: Element, init: KeyboardEventInit) => {
    act(() => {
      fireEvent.keyDown(el, init)
    })
    await tick(0)
  },
}
const tick = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))
const sidebar = () => screen.getByRole('complementary', { name: 'Claude' })
const thread = () => within(screen.getByRole('list', { name: 'Conversation with Claude' }))

beforeEach(() => {
  vi.useFakeTimers({ now: Date.parse('2026-09-27T10:00:00Z'), toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
  engine.mock = createEditorMock()
  engine.calls = []
  engine.failNext = 0
  MotionGlobalConfig.skipAnimations = true
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  MotionGlobalConfig.skipAnimations = false
})

async function ask(note: string, scope: ('Style' | 'Text')[] = ['Style', 'Text']) {
  act(() => store.select(TITLE))
  for (const s of scope) await u.click(screen.getByRole('button', { name: s }))
  await u.type(screen.getByRole('textbox', { name: 'Describe the change' }), note)
  await u.click(screen.getByRole('button', { name: 'Apply' }))
}

describe('EditorSidebar — les 9 états de G2', () => {
  it('1 → 2 → 4 → 5 → 6 → 7 → 8 : demande, question, résultat, ajustement, validation', async () => {
    mount()
    await tick(0)
    // 1 · Rien de sélectionné
    expect(screen.getByText('Ready')).toBeTruthy()
    expect(screen.getByText('Select an element in the page, choose Style and/or Text, then describe the change.')).toBeTruthy()
    expect(screen.getByRole('textbox')).toHaveProperty('disabled', true)
    expect(screen.getByRole('link', { name: 'Back to Admin' }).getAttribute('href')).toBe('/admin/pages/home/seo')
    expect(within(sidebar()).getByText('0 input · 0 output · $0.00')).toBeTruthy()

    // 2 · Un élément → 4 · Envoyé : la bulle monte, le champ se vide, Publish grisé
    await ask('Make the title bigger and put "solved" in bold.')
    expect(store.get().selection).toEqual([])
    expect(screen.getByText('Make the title bigger and put "solved" in bold.')).toBeTruthy()
    expect(screen.getByText('Working…')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Publish' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('textbox').getAttribute('placeholder')).toBe('Claude is working…')
    expect(store.get().job?.status).toBe('queued')

    await tick(900)
    await tick(900)
    expect(screen.getAllByText(/^Reading /).length).toBeGreaterThan(0)

    // 5 · Claude demande
    await tick(1800)
    expect(screen.getByText('Needs your answer')).toBeTruthy()
    expect(screen.getByText(/no token matches exactly/)).toBeTruthy()
    expect(screen.getByRole('textbox').getAttribute('placeholder')).toBe('Waiting for your answer above…')
    expect(screen.getByText('font-size: 60px')).toBeTruthy()
    await u.click(screen.getByRole('button', { name: /Use Heading XL/ }))

    // 6 · Terminé — à valider
    await tick(900 * 5)
    expect(screen.getByText(/^Done · \d+ s$/)).toBeTruthy()
    expect(screen.getByText('Title: size → Heading XL (token)')).toBeTruthy()
    expect(screen.getByText('“solved” in bold (Sanity draft)')).toBeTruthy()
    expect(screen.getByText('Checks: contrast passed, mobile passed, tablet passed')).toBeTruthy()
    expect(screen.getByText('1 change to validate')).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Adjust this change' })).toBeTruthy()
    expect(store.get().pending?.status).toBe('to-validate')
    expect(store.get().previewNonce).toBeGreaterThan(0) // texte Sanity modifié → aperçu rechargé
    expect(within(sidebar()).getAllByText('20.9k input · 1.6k output · $0.09').length).toBeGreaterThan(0)

    // 7 · Ajustement
    await u.type(screen.getByRole('textbox', { name: 'Adjust this change' }), 'A bit smaller, and keep it on 2 lines.')
    await u.click(screen.getByRole('button', { name: 'Apply' }))
    expect(engine.mock!.world.sims.size).toBe(2)
    await tick(900 * 7)
    expect(screen.getByText(/^Adjusted · \d+ s$/)).toBeTruthy()
    expect(screen.getByText('1 change · adjusted once')).toBeTruthy()
    // Cumul de la conversation : 20.9k + 12.4k
    expect(within(sidebar()).getByText('33.3k input · 2.2k output · $0.14')).toBeTruthy()

    // 8 · Validé
    await u.click(screen.getByRole('button', { name: 'Validate' }))
    await tick(0)
    expect(screen.getByText('Validated — added to Publish (3 changes)')).toBeTruthy()
    expect(store.get().pending).toBeNull()
    expect(screen.getByRole('textbox')).toHaveProperty('disabled', true)
    // Le fil garde l'historique (repliée : durée, tokens, coût)
    expect(screen.getAllByText(/^(Done|Adjusted) · \d+ s$/)).toHaveLength(2)
  })

  it('9 · Stop : « Stopped — nothing was changed. », la demande revient dans le champ', async () => {
    mount()
    await tick(0)
    await ask('Put solved in bold', ['Text'])
    await tick(900)
    await u.click(screen.getByRole('button', { name: 'Stop' }))
    await tick(0)
    expect(thread().getByText('Stopped — nothing was changed.')).toBeTruthy()
    const field = screen.getByRole('textbox', { name: 'Describe the change' }) as HTMLTextAreaElement
    expect(field.value).toBe('Put solved in bold')
    expect(store.get().selection).toEqual([TITLE])
    expect(screen.getByRole('button', { name: 'Text' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Apply' })).toHaveProperty('disabled', false)
  })

  it('9 · Échec : « Couldn’t apply — nothing was changed. » et le détail du moteur', async () => {
    mount()
    await tick(0)
    await ask('Make it fail', ['Text'])
    await tick(900 * 6)
    expect(thread().getByText('Couldn’t apply — nothing was changed.')).toBeTruthy()
    expect(screen.getByText('The checks failed twice, so nothing was changed.')).toBeTruthy()
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Make it fail')
  })

  it('« Other answer… » rouvre le champ (300 caractères) et envoie la réponse libre', async () => {
    mount()
    await tick(0)
    await ask('Make the title bigger', ['Style'])
    await tick(900 * 3)
    await u.click(screen.getByRole('button', { name: 'Other answer…' }))
    const field = screen.getByRole('textbox', { name: 'Your answer to Claude' })
    expect(document.activeElement).toBe(field)
    await u.type(field, 'Use 58 px')
    await u.key(field, { key: 'Enter', metaKey: true })
    await tick(0)
    const last = engine.mock!.world.sims.values().next().value!.job
    expect(last.answers).toEqual([{ questionId: 'q1', other: 'Use 58 px' }])
    expect(screen.getByText('Working…')).toBeTruthy()
  })

  it('Cancel annule la demande et ses ajustements ; G1 scénario 2 : la modification en attente est rouverte', async () => {
    const first = mount()
    await tick(0)
    await ask('Put solved in bold', ['Text'])
    await tick(900 * 6)
    expect(screen.getByText('1 change to validate')).toBeTruthy()
    // Rechargement de l'écran : la modification en attente est retrouvée côté serveur.
    first.unmount()
    mount()
    await tick(0)
    expect(screen.getByText('1 change to validate')).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Adjust this change' })).toBeTruthy()
    const nonce = store.get().previewNonce
    await u.click(screen.getByRole('button', { name: 'Cancel' }))
    await tick(0)
    expect(screen.getByText('Cancelled — the change was undone.')).toBeTruthy()
    expect(store.get().pending).toBeNull()
    expect(store.get().previewNonce).toBeGreaterThan(nonce)
  })

  it('la barre de l’aperçu passe par les mêmes décisions (store.decisions)', async () => {
    mount()
    await tick(0)
    await ask('Put solved in bold', ['Text'])
    await tick(900 * 6)
    await act(() => store.get().decisions!.validate())
    await tick(0)
    expect(screen.getByText('Validated — added to Publish (3 changes)')).toBeTruthy()
  })

  it('409 busy : Claude travaille pour quelqu’un d’autre → message du moteur, puis « another page »', async () => {
    mount()
    await tick(0)
    act(() => store.select(TITLE))
    await u.click(screen.getByRole('button', { name: 'Text' }))
    await u.type(screen.getByRole('textbox', { name: 'Describe the change' }), 'Put solved in bold')
    // Une autre session lance une demande sur /blog entre-temps.
    const res = await engine.mock!.handle({
      method: 'POST',
      segments: ['editor', 'requests'],
      params: {},
      query: new URLSearchParams(),
      body: { page: '/blog', targets: [TITLE], scope: ['text'], note: 'x', viewport: 1280 },
      user: { id: 'u2', name: 'B', email: 'b@example.com', role: 'kuartz' },
    })
    expect(res.status).toBe(201)
    await u.click(screen.getByRole('button', { name: 'Apply' }))
    await tick(0)
    expect(screen.getByRole('alert').textContent).toMatch(/already working/)
    expect(screen.getByText('Claude is working on another page. You can send a request when it’s done.')).toBeTruthy()
    expect(screen.getByRole('textbox')).toHaveProperty('disabled', true)
    expect(engine.calls.filter((c) => c === 'POST editor/requests')).toHaveLength(1)
  })

  it('409 publishing (publication en cours) : message du moteur, la demande reste dans le champ', async () => {
    let running = true
    engine.mock = createEditorMock({ publish: { isPublishing: () => running } })
    mount()
    await tick(0)
    await ask('Make the title bigger', ['Style'])
    await tick(0)
    expect(screen.getByRole('alert').textContent).toBe(MOCK_EDITOR_MESSAGES.publishing)
    expect((screen.getByRole('textbox', { name: 'Describe the change' }) as HTMLTextAreaElement).value).toBe('Make the title bigger')
    expect(engine.mock!.world.sims.size).toBe(0)
    running = false
    await u.click(screen.getByRole('button', { name: 'Apply' }))
    await tick(0)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(engine.calls.filter((c) => c === 'POST editor/requests')).toHaveLength(2)
  })

  it('503 unavailable (scénario « no-claude ») : message du moteur, rien n’est envoyé à Claude', async () => {
    engine.mock!.setScenario('no-claude')
    mount()
    await tick(0)
    await ask('Put solved in bold', ['Text'])
    await tick(0)
    expect(screen.getByRole('alert').textContent).toBe(MOCK_EDITOR_MESSAGES.noClaude)
    expect((screen.getByRole('textbox', { name: 'Describe the change' }) as HTMLTextAreaElement).value).toBe('Put solved in bold')
    expect(engine.mock!.world.sims.size).toBe(0)
  })

  it('sondage : erreur affichée (jamais avalée), retour à la normale, arrêt au démontage', async () => {
    const view = mount()
    await tick(0)
    await ask('Put solved in bold', ['Text'])
    engine.failNext = 1
    await tick(900)
    expect(screen.getByText(/The AI engine isn't responding\. Try again in a moment\. Retrying…/)).toBeTruthy()
    await tick(900)
    expect(screen.queryByText(/Retrying/)).toBeNull()
    view.unmount()
    const before = engine.calls.length
    await tick(10_000)
    expect(engine.calls.length).toBe(before)
  })

  it('chargement impossible : message clair et « Try again »', async () => {
    engine.failNext = 1
    mount()
    await tick(0)
    expect(screen.getByRole('alert').textContent).toContain('Couldn’t open the conversation.')
    await u.click(screen.getByRole('button', { name: 'Try again' }))
    await tick(0)
    expect(screen.getByText('Ready')).toBeTruthy()
  })
})

describe('Poignée de redimensionnement', () => {
  it('260 → 480 px au clavier, double-clic → 260 px', async () => {
    mount()
    await tick(0)
    const handle = screen.getByRole('separator', { name: 'Resize the Claude sidebar' })
    expect(handle.getAttribute('aria-valuenow')).toBe('320')
    await u.key(handle, { key: 'End' })
    expect(handle.getAttribute('aria-valuenow')).toBe('480')
    await u.key(handle, { key: 'ArrowRight' })
    expect(handle.getAttribute('aria-valuenow')).toBe('480')
    await u.key(handle, { key: 'ArrowLeft' })
    expect(handle.getAttribute('aria-valuenow')).toBe('464')
    act(() => {
      fireEvent.doubleClick(handle)
    })
    expect(handle.getAttribute('aria-valuenow')).toBe('260')
    expect(sidebar().style.width).toBe('260px')
  })
})
