'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { engineClient, EngineClientError } from '@/admin/core/engine/client'
import { toElementTarget, type ZoneLabels } from '@/admin/editor-bridge/zones'
import { AnimatePresence, Button, EmptyState, Icon, fade, motion, slideDown, useMotionVariants } from '@/admin/ui'
import { useEditorStore } from '../state/context'
import { isLocked, useEditorState } from '../state/store'
import { connectPreview, type PreviewChannel } from './channel'
import { EditorToolbar } from './EditorToolbar'
import { resolvePreview, type PreviewTarget } from './preview-url'
import { ReviewBar } from './ReviewBar'
import { computeFrame } from './scale'
import { bridgeViewFrom } from './view'
import styles from './EditorCanvas.module.css'

/** Délai laissé au pont de l'aperçu pour répondre (D1, POC : « aperçu muet au bout de 15 s → message d'erreur »). */
export const BRIDGE_TIMEOUT_MS = 15_000

export type EditorCanvasProps = {
  /** Nom de la page (« Home ») : titre accessible de l'iframe. */
  pageLabel: string
  /** Libellés des zones (« Hero · Title »), calculés côté serveur depuis zones.json. */
  labels: ZoneLabels
  /**
   * URL d'aperçu imposée (développement seulement : page d'essai /admin/editor/harness quand le moteur est simulé).
   * Sinon : EditorState.preview du moteur.
   */
  previewOverride?: string | null
}

type Preview = { kind: 'resolving' } | { kind: 'error'; message: string } | { kind: 'frame'; target: PreviewTarget }

const MESSAGES = {
  loading: 'Loading draft preview…',
  engineTitle: 'Couldn’t load the draft preview',
  badUrl: 'The AI engine returned an invalid preview address.',
  unavailable: 'The AI engine isn’t responding. Try again in a moment.',
  timeoutTitle: 'The draft preview isn’t responding',
  timeoutText: 'Nothing was changed. Check that the AI engine and its preview are running, then try again.',
  retry: 'Try again',
  actionFailed: 'Couldn’t reach the AI engine. Try again.',
} as const

/**
 * Aperçu du brouillon de l'éditeur IA (D1-D3, G1) : iframe du site en brouillon, mise à l'échelle, dialogue avec le
 * pont (sélection, survol, reflet, cadre « modified by Claude »), barre d'outils flottante et barre de validation.
 * Tout l'état partagé passe par le magasin de l'éditeur (../state) ; le canvas n'écrit que mode, viewport,
 * sélection, bridgeReady et — après ✓ Validate / Cancel — pending.
 */
export function EditorCanvas({ pageLabel, labels, previewOverride }: EditorCanvasProps) {
  const store = useEditorStore()
  const path = useEditorState(store, (s) => s.path)
  const mode = useEditorState(store, (s) => s.mode)
  const viewport = useEditorState(store, (s) => s.viewport)
  const locked = useEditorState(store, isLocked)
  const pending = useEditorState(store, (s) => s.pending)
  const selection = useEditorState(store, (s) => s.selection)
  const bridgeReady = useEditorState(store, (s) => s.bridgeReady)
  const previewNonce = useEditorState(store, (s) => s.previewNonce)
  const storePreview = useEditorState(store, (s) => s.preview)
  const deciding = useEditorState(store, (s) => s.deciding)

  const [preview, setPreview] = useState<Preview>({ kind: 'resolving' })
  const [attempt, setAttempt] = useState(0)
  const [frameKey, setFrameKey] = useState(0)
  const [timedOut, setTimedOut] = useState(false)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [busy, setBusy] = useState<'validate' | 'cancel' | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const stageRef = useRef<HTMLDivElement | null>(null)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const channelRef = useRef<PreviewChannel | null>(null)
  const lastSentRef = useRef('')
  const layout = computeFrame(size, viewport)
  const scaleRef = useRef(layout.scale)

  // ─── Adresse de l'aperçu ───────────────────────────────────────────────────
  // Source : EditorState.preview, lu par la sidebar (magasin `preview`) ; si elle ne l'a pas encore, le canvas
  // interroge lui-même GET /editor/state (et le range dans le magasin) : il gère seul l'erreur et « Try again ».
  useEffect(() => {
    if (previewOverride) {
      const target = resolvePreview(previewOverride, null, window.location.href)
      setPreview(target ? { kind: 'frame', target } : { kind: 'error', message: MESSAGES.badUrl })
      return
    }
    if (storePreview) {
      const target = resolvePreview(storePreview.url, storePreview.origin, window.location.href)
      setPreview((current) =>
        target
          ? current.kind === 'frame' && current.target.url === target.url
            ? current
            : { kind: 'frame', target }
          : { kind: 'error', message: MESSAGES.badUrl },
      )
      return
    }
    const controller = new AbortController()
    setPreview({ kind: 'resolving' })
    engineClient.editor
      .state(path, { signal: controller.signal })
      .then((state) => {
        if (state.preview) store.setPreview(state.preview)
        else setPreview({ kind: 'error', message: MESSAGES.badUrl })
      })
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name === 'AbortError') return
        setPreview({ kind: 'error', message: err instanceof EngineClientError ? err.message : MESSAGES.unavailable })
      })
    return () => controller.abort()
  }, [path, previewOverride, storePreview, store, attempt])

  // ─── Place disponible (marge de 20 px posée en CSS sur .stage) ─────────────
  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const measure = () => setSize({ width: stage.clientWidth, height: stage.clientHeight })
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [])

  // ─── Dialogue avec le pont ─────────────────────────────────────────────────
  const sendView = useCallback(
    (force = false) => {
      const view = bridgeViewFrom(store.get(), scaleRef.current)
      const serialized = JSON.stringify(view)
      if (!force && serialized === lastSentRef.current) return
      lastSentRef.current = serialized
      channelRef.current?.sync(view)
    },
    [store],
  )

  const target = preview.kind === 'frame' ? preview.target : null
  useEffect(() => {
    if (!target) return
    const channel = connectPreview({
      window,
      frame: () => iframeRef.current?.contentWindow,
      origin: target.origin,
      handlers: {
        onHello: () => sendView(true),
        onReady: () => {
          store.setBridgeReady(true)
          setTimedOut(false)
        },
        onSelect: (ref, additive) => {
          const element = toElementTarget(ref, labels)
          if (element) store.select(element, additive)
        },
        onEscape: () => store.clearSelection(),
      },
    })
    channelRef.current = channel
    return () => {
      channel.dispose()
      channelRef.current = null
    }
  }, [target, store, labels, sendView])

  // Chaque changement du magasin (mode, sélection, demande, modification à valider) est renvoyé au pont.
  useEffect(() => store.subscribe(() => sendView()), [store, sendView])
  useEffect(() => {
    scaleRef.current = layout.scale
    sendView()
  }, [layout.scale, sendView])

  // Le pont n'a jamais répondu : message d'erreur au bout de 15 s (remis à zéro à chaque rechargement).
  useEffect(() => {
    if (!target || bridgeReady) return
    setTimedOut(false)
    const timer = window.setTimeout(() => setTimedOut(true), BRIDGE_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [target, frameKey, bridgeReady])

  useEffect(() => () => store.setBridgeReady(false), [store])

  const reloadFrame = useCallback(() => {
    store.setBridgeReady(false)
    lastSentRef.current = ''
    setFrameKey((k) => k + 1)
  }, [store])

  // Brouillon Sanity modifié (le HMR ne le voit pas) : refresh du pont s'il répond, sinon rechargement complet.
  const nonceRef = useRef(previewNonce)
  useEffect(() => {
    if (nonceRef.current === previewNonce) return
    nonceRef.current = previewNonce
    if (store.get().bridgeReady && channelRef.current) channelRef.current.refresh()
    else reloadFrame()
  }, [previewNonce, store, reloadFrame])

  const retry = () => {
    if (preview.kind === 'error') setAttempt((n) => n + 1)
    else reloadFrame()
  }

  // ─── ✓ Validate / Cancel (barre flottante) ─────────────────────────────────
  // Un seul chemin vers le moteur : les actions enregistrées par la sidebar (magasin `decisions`), qui mettent à
  // jour le fil et affichent l'erreur éventuelle. Sans sidebar (tests, écran isolé) : appel direct du moteur.
  const pendingId = pending?.id
  useEffect(() => setActionError(null), [pendingId])

  const decide = async (action: 'validate' | 'cancel') => {
    const { pending: change, decisions, deciding: current } = store.get()
    if (!change || busy || current) return
    if (decisions) {
      await decisions[action]()
      return
    }
    setBusy(action)
    setActionError(null)
    try {
      await (action === 'validate' ? engineClient.editor.validate(change.id) : engineClient.editor.cancel(change.id))
      store.setPending(null)
      // Cancel remet le brouillon (Sanity + git) en l'état : l'aperçu doit le montrer.
      if (action === 'cancel') store.refreshPreview()
    } catch (err) {
      setActionError(err instanceof EngineClientError ? err.message : MESSAGES.actionFailed)
    } finally {
      setBusy(null)
    }
  }

  const showReview = pending?.status === 'to-validate' && !locked && preview.kind === 'frame'
  const status: 'loading' | 'error' | 'timeout' | null =
    preview.kind === 'error' ? 'error' : preview.kind === 'resolving' ? 'loading' : bridgeReady ? null : timedOut ? 'timeout' : 'loading'

  const fadeVariants = useMotionVariants(fade)
  const barVariants = useMotionVariants(slideDown)

  const announcement = useMemo(() => {
    if (selection.length === 0) return ''
    const names = selection.map((t) => t.label).join(', ')
    return `Selected: ${names}`
  }, [selection])

  return (
    <section className={styles.canvas} aria-label="Draft preview" data-status={status ?? 'ready'}>
      <div ref={stageRef} className={styles.stage}>
        <div className={styles.frame} style={{ width: layout.width, height: layout.height }}>
          {target ? (
            <iframe
              key={frameKey}
              ref={iframeRef}
              src={target.url}
              title={`Draft preview of ${pageLabel}`}
              className={styles.iframe}
              style={{
                width: layout.iframeWidth,
                height: layout.iframeHeight,
                transform: layout.scale === 1 ? undefined : `scale(${layout.scale})`,
              }}
              // Pas de navigation de la fenêtre de l'admin depuis l'aperçu (pas d'allow-top-navigation).
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              // Chrome (Local Network Access) : l'aperçu local (next dev) doit joindre 127.0.0.1 pour son HMR, sinon
              // Next ne s'hydrate pas dans l'iframe. La permission accordée à l'admin est déléguée ici.
              allow="local-network-access"
              referrerPolicy="no-referrer"
              onLoad={() => sendView(true)}
            />
          ) : null}
          <AnimatePresence initial={false}>
            {status ? (
              <motion.div key={status} className={styles.status} variants={fadeVariants} initial="initial" animate="animate" exit="exit">
                {status === 'loading' ? (
                  <p className={styles.loading} role="status">
                    <Icon name="loader" size={16} set={18} spin />
                    {MESSAGES.loading}
                  </p>
                ) : (
                  <EmptyState
                    role="alert"
                    icon="warning"
                    title={status === 'error' ? MESSAGES.engineTitle : MESSAGES.timeoutTitle}
                    description={status === 'error' && preview.kind === 'error' ? preview.message : MESSAGES.timeoutText}
                    action={
                      <Button variant="secondary" size="small" onClick={retry}>
                        {MESSAGES.retry}
                      </Button>
                    }
                  />
                )}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      <div className={styles.top}>
        <AnimatePresence>
          {showReview ? (
            <motion.div key="review" className={styles.floating} variants={barVariants} initial="initial" animate="animate" exit="exit">
              <ReviewBar busy={deciding ?? busy} error={actionError} onValidate={() => decide('validate')} onCancel={() => decide('cancel')} />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <div className={styles.bottom}>
        <div className={styles.floating}>
          <EditorToolbar
            mode={mode}
            viewport={viewport}
            locked={locked}
            onModeChange={(m) => store.setMode(m)}
            onViewportChange={(v) => store.setViewport(v)}
          />
        </div>
      </div>

      <p className="kz-visually-hidden" aria-live="polite">
        {announcement}
      </p>
    </section>
  )
}
