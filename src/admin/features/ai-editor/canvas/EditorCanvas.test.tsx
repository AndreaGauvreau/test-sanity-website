/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MotionGlobalConfig } from 'motion/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { EditJob, PendingChange } from '@/admin/core/contracts'
import { bridgeMessage } from '@/admin/editor-bridge/protocol'
import { EditorStoreProvider, useEditorStore } from '../state/context'
import type { EditorStore } from '../state/store'
import { BRIDGE_TIMEOUT_MS, EditorCanvas } from './EditorCanvas'
import { EditorToolbar } from './EditorToolbar'

const engine = vi.hoisted(() => ({
  state: vi.fn(),
  validate: vi.fn(),
  cancel: vi.fn(),
}))

vi.mock('@/admin/core/engine/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/admin/core/engine/client')>()
  return {
    ...actual,
    engineClient: { editor: { state: engine.state, validate: engine.validate, cancel: engine.cancel } },
  }
})

const LABELS = { 'hero.title': 'Hero · Title', 'features.card.title': 'Features · Card title' }
const PREVIEW_ORIGIN = 'http://127.0.0.1:4042'
const TARGET = { zone: 'hero.title', index: 0, label: 'Hero · Title' }

let store: EditorStore
function Capture() {
  store = useEditorStore()
  return null
}

function renderCanvas(props: { previewOverride?: string | null } = {}) {
  return render(
    <EditorStoreProvider pageId="home" path="/">
      <Capture />
      <EditorCanvas pageLabel="Home" labels={LABELS} {...props} />
    </EditorStoreProvider>,
  )
}

/** Message du pont, émis par l'iframe (source) depuis `origin`. */
function fromBridge(data: unknown, origin = PREVIEW_ORIGIN) {
  const iframe = document.querySelector('iframe')!
  const event = new Event('message')
  Object.defineProperties(event, { data: { value: data }, origin: { value: origin }, source: { value: iframe.contentWindow } })
  act(() => {
    window.dispatchEvent(event)
  })
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
  })
}

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
})

beforeEach(() => {
  engine.state.mockResolvedValue({ preview: { url: `${PREVIEW_ORIGIN}/`, origin: PREVIEW_ORIGIN } })
  engine.validate.mockResolvedValue({})
  engine.cancel.mockResolvedValue({})
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('EditorCanvas — aperçu', () => {
  it('charge l’iframe de EditorState.preview, « Loading draft preview… » jusqu’au ready du pont', async () => {
    renderCanvas()
    expect(screen.getByRole('status').textContent).toContain('Loading draft preview…')
    await flush()
    expect(engine.state).toHaveBeenCalledWith('/', expect.anything())
    const iframe = screen.getByTitle('Draft preview of Home') as HTMLIFrameElement
    expect(iframe.getAttribute('src')).toBe(`${PREVIEW_ORIGIN}/`)
    expect(iframe.getAttribute('sandbox')).not.toContain('allow-top-navigation')

    const post = vi.spyOn(iframe.contentWindow!, 'postMessage')
    fromBridge(bridgeMessage({ type: 'hello' }))
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: 'sync' }), PREVIEW_ORIGIN)

    fromBridge(bridgeMessage({ type: 'ready', path: '/' }))
    expect(store.get().bridgeReady).toBe(true)
    await flush()
    expect(screen.queryByText('Loading draft preview…')).toBeNull()
  })

  it('pont muet 15 s → message d’erreur et « Try again » qui recharge', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    renderCanvas()
    await flush()
    act(() => {
      vi.advanceTimersByTime(BRIDGE_TIMEOUT_MS + 10)
    })
    expect(screen.getByRole('alert').textContent).toContain('The draft preview isn’t responding')
    const before = document.querySelector('iframe')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(document.querySelector('iframe')).not.toBe(before)
    expect(screen.getByRole('status').textContent).toContain('Loading draft preview…')
  })

  it('moteur injoignable → message du moteur, « Try again » relance la lecture', async () => {
    const { EngineClientError } = await import('@/admin/core/engine/client')
    engine.state.mockRejectedValueOnce(new EngineClientError(502, 'unavailable', 'The AI engine is not responding.'))
    renderCanvas()
    await flush()
    expect(screen.getByRole('alert').textContent).toContain('The AI engine is not responding.')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await flush()
    expect(engine.state).toHaveBeenCalledTimes(2)
    expect(document.querySelector('iframe')).not.toBeNull()
  })

  it('URL imposée (page d’essai) : pas d’appel au moteur, origine = celle de l’admin', async () => {
    renderCanvas({ previewOverride: '/admin/editor/harness' })
    await flush()
    expect(engine.state).not.toHaveBeenCalled()
    expect(document.querySelector('iframe')!.getAttribute('src')).toBe(`${window.location.origin}/admin/editor/harness`)
  })

  it('previewNonce : refresh au pont quand il répond', async () => {
    renderCanvas()
    await flush()
    fromBridge(bridgeMessage({ type: 'ready', path: '/' }))
    const post = vi.spyOn(document.querySelector('iframe')!.contentWindow!, 'postMessage')
    act(() => store.refreshPreview())
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: 'refresh' }), PREVIEW_ORIGIN)
  })
})

describe('EditorCanvas — sélection depuis le pont', () => {
  it('clic, Maj + clic (additive), Échap ; messages d’une autre origine ignorés', async () => {
    renderCanvas()
    await flush()
    fromBridge(bridgeMessage({ type: 'select', target: { zone: 'hero.title', index: 0 }, additive: false }))
    expect(store.get().selection).toEqual([TARGET])

    fromBridge(bridgeMessage({ type: 'select', target: { zone: 'features.card.title', index: 1, key: 'k2' }, additive: true }))
    expect(store.get().selection.map((t) => t.label)).toEqual(['Hero · Title', 'Features · Card title'])

    // Maj + clic sur un élément déjà choisi : il est retiré.
    fromBridge(bridgeMessage({ type: 'select', target: { zone: 'hero.title', index: 0 }, additive: true }))
    expect(store.get().selection.map((t) => t.zone)).toEqual(['features.card.title'])

    // Autre origine, zone inconnue : rien.
    fromBridge(bridgeMessage({ type: 'select', target: { zone: 'hero.title', index: 0 }, additive: false }), 'https://evil.test')
    fromBridge(bridgeMessage({ type: 'select', target: { zone: 'hero.unknown', index: 0 }, additive: false }))
    expect(store.get().selection.map((t) => t.zone)).toEqual(['features.card.title'])

    fromBridge(bridgeMessage({ type: 'escape' }))
    expect(store.get().selection).toEqual([])
  })

  it('verrouillé pendant le travail : sélection refusée, View / Select grisés, formats actifs', async () => {
    renderCanvas()
    await flush()
    act(() => store.setJob({ id: 'j1', status: 'running', request: { targets: [TARGET] } } as unknown as EditJob))
    fromBridge(bridgeMessage({ type: 'select', target: { zone: 'hero.title', index: 0 }, additive: false }))
    expect(store.get().selection).toEqual([])
    expect(screen.getByRole('radiogroup', { name: 'Mode' }).getAttribute('aria-disabled')).toBe('true')
    expect((screen.getByRole('radio', { name: 'View' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('radio', { name: 'Mobile' }))
    expect(store.get().viewport).toBe(375)
  })
})

describe('EditorCanvas — modification à valider', () => {
  const pending = { id: 'c1', status: 'to-validate', targets: [TARGET] } as unknown as PendingChange

  it('barre flottante : Validate / Cancel passent par les actions de la sidebar, jamais par le moteur direct', async () => {
    renderCanvas()
    await flush()
    const validate = vi.fn().mockResolvedValue(undefined)
    const cancel = vi.fn().mockResolvedValue(undefined)
    act(() => {
      store.registerDecisions({ validate, cancel })
      store.setPending(pending)
    })
    expect(screen.getByText('Modified by Claude · to validate')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Validate' }))
    await flush()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await flush()
    expect(validate).toHaveBeenCalledTimes(1)
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(engine.validate).not.toHaveBeenCalled()
    expect(engine.cancel).not.toHaveBeenCalled()
  })

  it('FOLLOWUPS #29 : sans actions de la sidebar, pas de barre et aucun appel direct au moteur', async () => {
    renderCanvas()
    await flush()
    act(() => store.setPending(pending))
    expect(screen.queryByText('Modified by Claude · to validate')).toBeNull()
    expect(engine.validate).not.toHaveBeenCalled()
    expect(engine.cancel).not.toHaveBeenCalled()
  })

  it('FOLLOWUPS #29 : `deciding` du magasin met le bouton en chargement et bloque un second choix', async () => {
    renderCanvas()
    await flush()
    const validate = vi.fn().mockResolvedValue(undefined)
    const cancel = vi.fn().mockResolvedValue(undefined)
    act(() => {
      store.registerDecisions({ validate, cancel })
      store.setPending(pending)
      store.setDeciding('validate')
    })
    const cancelButton = screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement
    expect(cancelButton.disabled).toBe(true)
    expect(screen.getByRole('region', { name: 'Preview change to validate' }).querySelector('[aria-busy="true"]')).not.toBeNull()
    fireEvent.click(cancelButton)
    await flush()
    expect(cancel).not.toHaveBeenCalled()
  })

  it('QA-5 : en Mobile, la barre est bornée à la largeur du cadre (375 − 2 × 12)', async () => {
    renderCanvas()
    await flush()
    act(() => {
      store.registerDecisions({ validate: vi.fn(), cancel: vi.fn() })
      store.setPending(pending)
      store.setViewport(375)
    })
    const wrapper = screen.getByRole('region', { name: 'Preview change to validate' }).parentElement!
    expect(wrapper.style.maxWidth).toBe('351px')
  })

  it('pas de barre pendant le travail (ajustement en cours)', async () => {
    renderCanvas()
    await flush()
    act(() => {
      store.registerDecisions({ validate: vi.fn(), cancel: vi.fn() })
      store.setPending(pending)
      store.setJob({ id: 'j2', status: 'running', request: { targets: [TARGET] } } as unknown as EditJob)
    })
    expect(screen.queryByText('Modified by Claude · to validate')).toBeNull()
  })
})

describe('EditorCanvas — jeton d’aperçu court (SEC-09)', () => {
  const now = () => Math.floor(Date.now() / 1000)
  const withToken = (exp: number, path = '/') => `${PREVIEW_ORIGIN}${path}?kz_preview=v1.${exp}.dXNlcg.c2ln`

  it('charge l’URL à jeton court ; un jeton renouvelé pour la même page ne recharge pas l’iframe', async () => {
    const first = withToken(now() + 900)
    engine.state.mockResolvedValue({ preview: { url: first, origin: PREVIEW_ORIGIN } })
    renderCanvas()
    await flush()
    const iframe = document.querySelector('iframe')!
    expect(iframe.getAttribute('src')).toBe(first)
    fromBridge(bridgeMessage({ type: 'ready', path: '/' }))

    // La sidebar relit GET /editor/state (fin de demande, décision) : nouveau jeton, même page.
    act(() => store.setPreview({ url: withToken(now() + 1800), origin: PREVIEW_ORIGIN }))
    expect(document.querySelector('iframe')).toBe(iframe)
    expect(iframe.getAttribute('src')).toBe(first)
    expect(store.get().bridgeReady).toBe(true)

    // Autre page : l'iframe change d'adresse.
    const other = withToken(now() + 1800, '/about')
    act(() => store.setPreview({ url: other, origin: PREVIEW_ORIGIN }))
    expect(document.querySelector('iframe')!.getAttribute('src')).toBe(other)
  })

  it('rechargement (« Try again ») : prend le jeton le plus récent', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    engine.state.mockResolvedValue({ preview: { url: withToken(now() + 900), origin: PREVIEW_ORIGIN } })
    renderCanvas()
    await flush()
    const fresh = withToken(now() + 1800)
    act(() => store.setPreview({ url: fresh, origin: PREVIEW_ORIGIN }))
    act(() => {
      vi.advanceTimersByTime(BRIDGE_TIMEOUT_MS + 10)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await flush()
    expect(document.querySelector('iframe')!.getAttribute('src')).toBe(fresh)
  })

  it('previewNonce avec un jeton chargé expiré : nouvelle adresse demandée au moteur, puis rechargement complet', async () => {
    const expired = withToken(now() + 10)
    engine.state.mockResolvedValueOnce({ preview: { url: expired, origin: PREVIEW_ORIGIN } })
    renderCanvas()
    await flush()
    fromBridge(bridgeMessage({ type: 'ready', path: '/' }))
    const post = vi.spyOn(document.querySelector('iframe')!.contentWindow!, 'postMessage')
    const fresh = withToken(now() + 900)
    engine.state.mockResolvedValueOnce({ preview: { url: fresh, origin: PREVIEW_ORIGIN } })
    act(() => store.refreshPreview())
    await flush()
    await flush()
    // Le cookie posé avec l'ancien jeton a expiré : router.refresh dans l'aperçu serait refusé (403).
    expect(post).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'refresh' }), PREVIEW_ORIGIN)
    expect(engine.state).toHaveBeenCalledTimes(2)
    expect(document.querySelector('iframe')!.getAttribute('src')).toBe(fresh)
    expect(store.get().preview?.url).toBe(fresh)
  })
})

describe('EditorToolbar', () => {
  it('View / Select et Desktop / Tablet / Mobile, nommés, au clavier', () => {
    const onMode = vi.fn()
    const onViewport = vi.fn()
    render(<EditorToolbar mode="select" viewport={1280} locked={false} onModeChange={onMode} onViewportChange={onViewport} />)
    expect(screen.getByRole('group', { name: 'Preview tools' })).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: 'View' }))
    expect(onMode).toHaveBeenCalledWith('view')
    fireEvent.click(screen.getByRole('radio', { name: 'Tablet' }))
    expect(onViewport).toHaveBeenCalledWith(768)
    expect(screen.getByRole('radio', { name: 'Desktop' }).getAttribute('aria-checked')).toBe('true')
  })
})
