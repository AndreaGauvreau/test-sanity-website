'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { engineClient, EngineClientError } from '@/admin/core/engine/client'
import { toElementTarget, type ZoneLabels } from '@/admin/editor-bridge/zones'
import { AnimatePresence, Button, EmptyState, Icon, fade, motion, slideDown, useMotionVariants } from '@/admin/ui'
import { useEditorStore } from '../state/context'
import { isLocked, useEditorState } from '../state/store'
import { connectPreview, type PreviewChannel } from './channel'
import { EditorToolbar } from './EditorToolbar'
import { previewKey, previewTokenExpired, resolvePreview, type PreviewTarget } from './preview-url'
import { ReviewBar } from './ReviewBar'
import { computeFrame, floatingMaxWidth } from './scale'
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
} as const

/**
 * Aperçu du brouillon de l'éditeur IA (D1-D3, G1) : iframe du site en brouillon, mise à l'échelle, dialogue avec le
 * pont (sélection, survol, reflet, cadre « modified by Claude »), barre d'outils flottante et barre de validation.
 * Tout l'état partagé passe par le magasin de l'éditeur (../state) ; le canvas n'écrit que mode, viewport,
 * sélection, bridgeReady et preview (adresse relue au moteur). ✓ Validate / Cancel passent par les actions de la
 * sidebar (`decisions`) : le canvas n'appelle jamais le moteur pour décider.
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
  const canDecide = useEditorState(store, (s) => s.decisions !== null)

  const [preview, setPreview] = useState<Preview>({ kind: 'resolving' })
  const [attempt, setAttempt] = useState(0)
  const [frameKey, setFrameKey] = useState(0)
  const [timedOut, setTimedOut] = useState(false)
  const [size, setSize] = useState({ width: 0, height: 0 })

  const stageRef = useRef<HTMLDivElement | null>(null)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const channelRef = useRef<PreviewChannel | null>(null)
  const lastSentRef = useRef('')
  // Adresse chargée dans l'iframe (son jeton a posé le cookie de l'aperçu) et adresse la plus récente du moteur (jeton
  // court renouvelé à chaque GET /editor/state) : l'iframe ne change d'adresse qu'au rechargement ou d'une page à l'autre.
  const targetRef = useRef<PreviewTarget | null>(null)
  const latestRef = useRef<PreviewTarget | null>(null)
  const layout = computeFrame(size, viewport)
  const scaleRef = useRef(layout.scale)

  // ─── Adresse de l'aperçu ───────────────────────────────────────────────────
  // Source : EditorState.preview, lu par la sidebar (magasin `preview`) ; si elle ne l'a pas encore, le canvas
  // interroge lui-même GET /editor/state (et le range dans le magasin) : il gère seul l'erreur et « Try again ».
  // L'URL porte un jeton COURT (`?kz_preview=v1.<exp>…`, 15 min, SEC-09) renouvelé à chaque lecture de l'état : un
  // nouveau jeton pour la même page ne recharge PAS l'iframe (le cookie posé au chargement vaut encore) ; il est gardé
  // pour le prochain rechargement.
  useEffect(() => {
    if (previewOverride) {
      const target = resolvePreview(previewOverride, null, window.location.href)
      latestRef.current = target
      setPreview(target ? { kind: 'frame', target } : { kind: 'error', message: MESSAGES.badUrl })
      return
    }
    if (storePreview) {
      const target = resolvePreview(storePreview.url, storePreview.origin, window.location.href)
      if (!target) {
        setPreview({ kind: 'error', message: MESSAGES.badUrl })
        return
      }
      latestRef.current = target
      setPreview((current) =>
        current.kind === 'frame' && previewKey(current.target.url) === previewKey(target.url) ? current : { kind: 'frame', target },
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
  const targetUrl = target?.url ?? null
  const targetOrigin = target?.origin ?? null
  useEffect(() => {
    targetRef.current = target
  }, [target])

  useEffect(() => {
    if (!targetOrigin) return
    const channel = connectPreview({
      window,
      frame: () => iframeRef.current?.contentWindow,
      origin: targetOrigin,
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
  }, [targetOrigin, store, labels, sendView])

  // Chaque changement du magasin (mode, sélection, demande, modification à valider) est renvoyé au pont.
  useEffect(() => store.subscribe(() => sendView()), [store, sendView])
  useEffect(() => {
    scaleRef.current = layout.scale
    sendView()
  }, [layout.scale, sendView])

  // Le pont n'a jamais répondu : message d'erreur au bout de 15 s (remis à zéro à chaque rechargement).
  useEffect(() => {
    if (!targetUrl || bridgeReady) return
    setTimedOut(false)
    const timer = window.setTimeout(() => setTimedOut(true), BRIDGE_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [targetUrl, frameKey, bridgeReady])

  useEffect(() => () => store.setBridgeReady(false), [store])

  /** Rechargement complet de l'iframe, avec l'adresse (et donc le jeton) la plus récente. */
  const reloadFrame = useCallback(
    (next?: PreviewTarget | null) => {
      const fresh = next ?? latestRef.current
      store.setBridgeReady(false)
      lastSentRef.current = ''
      if (fresh && fresh.url !== targetRef.current?.url) setPreview({ kind: 'frame', target: fresh })
      setFrameKey((k) => k + 1)
    },
    [store],
  )

  /**
   * Rechargement qui redemande d'abord une adresse au moteur si le jeton le plus récent a expiré (sinon l'aperçu
   * répondrait 403). Échec de la lecture : rechargement quand même (le pont muet mènera à « Try again »).
   */
  const renewAndReload = useCallback(() => {
    const latest = latestRef.current
    if (previewOverride || !latest || !previewTokenExpired(latest.url)) {
      reloadFrame()
      return
    }
    engineClient.editor
      .state(path)
      .then((state) => {
        const next = state.preview ? resolvePreview(state.preview.url, state.preview.origin, window.location.href) : null
        if (next && state.preview) {
          latestRef.current = next
          store.setPreview(state.preview)
        }
        reloadFrame(next)
      })
      .catch(() => reloadFrame())
  }, [previewOverride, path, store, reloadFrame])

  // Brouillon Sanity modifié (le HMR ne le voit pas) : refresh du pont s'il répond et que le cookie de l'aperçu vaut
  // encore (jeton chargé non expiré) ; sinon rechargement complet avec un jeton valide.
  const nonceRef = useRef(previewNonce)
  useEffect(() => {
    if (nonceRef.current === previewNonce) return
    nonceRef.current = previewNonce
    const loaded = targetRef.current
    if (store.get().bridgeReady && channelRef.current && !(loaded && previewTokenExpired(loaded.url))) channelRef.current.refresh()
    else renewAndReload()
  }, [previewNonce, store, renewAndReload])

  const retry = () => {
    if (preview.kind === 'error') setAttempt((n) => n + 1)
    else renewAndReload()
  }

  // ─── ✓ Validate / Cancel (barre flottante) ─────────────────────────────────
  // Un seul chemin vers le moteur (FOLLOWUPS #29) : les actions enregistrées par la sidebar (magasin `decisions`), qui
  // mettent à jour le fil, rechargent l'état et affichent l'erreur éventuelle ; `deciding` (magasin) met le bouton
  // concerné en chargement des deux côtés. Sans ces actions, pas de barre.
  const decide = (action: 'validate' | 'cancel') => {
    const { pending: change, decisions, deciding: current } = store.get()
    if (!change || !decisions || current) return
    void decisions[action]()
  }

  const showReview = pending?.status === 'to-validate' && canDecide && !locked && preview.kind === 'frame'
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
            <motion.div
              key="review"
              className={styles.floating}
              // QA-5 : jamais plus large que le cadre (Mobile 375 → 351 px), le libellé passe alors sur deux lignes.
              style={{ maxWidth: floatingMaxWidth(layout.width) }}
              variants={barVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <ReviewBar busy={deciding} onValidate={() => decide('validate')} onCancel={() => decide('cancel')} />
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
