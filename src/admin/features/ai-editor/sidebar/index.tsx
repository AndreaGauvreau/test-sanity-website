'use client'

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { sanitizeNextPath } from '@/admin/core/auth/next-path'
import type { ElementTarget } from '@/admin/core/contracts'
import { Button, Callout } from '@/admin/ui'
import { useEditorStore } from '../state/context'
import { isLocked, useEditorState } from '../state/store'
import { Composer } from './components/Composer'
import { EditorHeader } from './components/EditorHeader'
import { clampWidth, ResizeHandle, SIDEBAR_DEFAULT } from './components/ResizeHandle'
import { Thread } from './components/Thread'
import { headerView, isActive, targetKey, UI } from './machine'
import { useConversation, type Conversation } from './useConversation'
import styles from './EditorSidebar.module.css'

const WIDTH_KEY = 'kz-admin:editor-sidebar-width'

function readWidth(): number {
  try {
    const raw = window.localStorage.getItem(WIDTH_KEY)
    return raw ? clampWidth(Number(raw)) : SIDEBAR_DEFAULT
  } catch {
    return SIDEBAR_DEFAULT
  }
}

function writeWidth(width: number) {
  try {
    window.localStorage.setItem(WIDTH_KEY, String(width))
  } catch {
    // Stockage indisponible (navigation privée) : la largeur n'est simplement pas mémorisée.
  }
}

// useLayoutEffect côté client seulement (pas d'avertissement au rendu serveur).
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

/**
 * Sidebar Claude de l'éditeur IA (D1-D3, G2 : 9 états). Placée par l'écran de l'éditeur (editor-canvas) à gauche
 * de l'aperçu, dans un <EditorStoreProvider>. Signature figée : <EditorSidebar />, sans props — tout vient du
 * magasin de l'éditeur et du moteur (relais /admin/api/engine, droits vérifiés côté serveur).
 */
export function EditorSidebar() {
  const store = useEditorStore()
  const pageId = useEditorState(store, (s) => s.pageId)
  const backHrefRaw = useEditorState(store, (s) => s.backHref)
  const selection = useEditorState(store, (s) => s.selection)
  const locked = useEditorState(store, isLocked)
  const c = useConversation(store)
  const id = useId()

  const [width, setWidth] = useState(SIDEBAR_DEFAULT)
  useIsoLayoutEffect(() => setWidth(readWidth()), [])

  const backHref = backHrefRaw ? sanitizeNextPath(backHrefRaw) : `/admin/pages/${encodeURIComponent(pageId)}`

  // Fil calé en bas ; défilement automatique vers le bas si l'on y était déjà (pas si l'on relit plus haut).
  const scrollRef = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
  }, [])
  useIsoLayoutEffect(() => {
    const el = scrollRef.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  })

  // Focus : jamais volé à l'aperçu (sélection) ; donné au champ sur une action explicite (« Other answer… ») ou
  // quand le focus s'est perdu parce qu'un contrôle du fil a disparu (Stop, options d'une question).
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const prevComposer = useRef(c.composer.state)
  useEffect(() => {
    const prev = prevComposer.current
    const next = c.composer.state
    prevComposer.current = next
    if (prev === next) return
    const editable = next === 'ready' || next === 'multi' || next === 'answer' || next === 'adjust'
    const lost = typeof document !== 'undefined' && (!document.activeElement || document.activeElement === document.body)
    const fromWork = prev === 'working' || prev === 'waiting' || prev === 'answer'
    if (editable && (next === 'answer' || (fromWork && lost))) textareaRef.current?.focus({ preventScroll: true })
  }, [c.composer.state])

  const activeHere = !!c.job && isActive(c.job) && c.thread.some((e) => e.type === 'job' && e.job.id === c.job!.id)

  return (
    <aside id={`${id}-sidebar`} className={styles.sidebar} style={{ width }} aria-label="Claude">
      <EditorHeader backHref={backHref} locked={locked} model={c.model?.id ?? null} usage={c.conversationUsage} />

      <div ref={scrollRef} className={styles.scroll} onScroll={onScroll}>
        {c.load.status === 'loading' ? (
          <p className={styles.loading} role="status">
            Loading the conversation…
          </p>
        ) : c.load.status === 'error' ? (
          <Callout
            tone="error"
            role="alert"
            className={styles.callout}
            action={
              <Button variant="secondary" size="small" onClick={() => void c.retry()}>
                Try again
              </Button>
            }
          >
            {`Couldn’t open the conversation. ${c.load.message}`}
          </Callout>
        ) : (
          <Thread
            thread={c.thread}
            pending={c.pending}
            deciding={c.deciding}
            picks={c.picks}
            answeringOther={c.answeringOther}
            answering={c.answering}
            stopping={c.stopping}
            onPick={c.pick}
            onOther={c.other}
            onStop={() => void c.stop()}
            onValidate={() => void c.validate()}
            onCancel={() => void c.cancel()}
            notice={
              c.pollError && activeHere ? (
                <Callout tone="warning" role="status">
                  {c.pollError}
                </Callout>
              ) : null
            }
          />
        )}
      </div>

      <div className={styles.composerWrap}>
        {c.elsewhere.active ? (
          <Callout tone="info">{UI.busyElsewhere}</Callout>
        ) : c.elsewhere.pending ? (
          <Callout tone="info">{`${UI.pendingElsewhere} (${c.elsewhere.pending.page})`}</Callout>
        ) : null}
        <Composer
          state={c.composer.state}
          targets={c.composer.targets}
          onRemoveTarget={(t) => store.removeTarget(t)}
          scope={c.composer.scope}
          onScopeChange={c.composer.setScope}
          value={c.composer.note}
          onValueChange={(v) => {
            c.composer.setNote(v)
            if (c.actionError) c.clearActionError()
          }}
          onSubmit={() => void c.composer.submit()}
          canApply={c.composer.canApply}
          submitting={c.composer.submitting}
          onEscape={c.composer.state === 'answer' ? c.composer.cancelOther : undefined}
          error={c.actionError}
          note={c.composer.state === 'adjust' && hasOtherSelection(c.composer.targets, selection) ? UI.otherSelection : null}
          textareaRef={textareaRef}
        />
      </div>

      <div className="kz-visually-hidden" role="status" aria-live="polite">
        {announcement(c)}
      </div>

      <ResizeHandle width={width} onWidthChange={setWidth} onCommit={writeWidth} controls={`${id}-sidebar`} />
    </aside>
  )
}

/** Sélection en cours hors de la modification en attente → rappel « Validate or cancel… ». */
function hasOtherSelection(pendingTargets: readonly ElementTarget[], selection: readonly ElementTarget[]): boolean {
  const keys = new Set(pendingTargets.map(targetKey))
  return selection.some((s) => !keys.has(targetKey(s)))
}

/** Phrase annoncée aux lecteurs d'écran quand l'état de la dernière entrée du fil change. */
function announcement(c: Conversation): string {
  const last = c.thread.at(-1)
  if (!last) return ''
  if (last.type === 'validated') return 'Change validated and added to Publish.'
  if (last.type === 'cancelled') return 'Change cancelled.'
  const job = last.job
  if (job.status === 'stopped') return UI.stoppedStep
  if (job.status === 'failed') return UI.failedStep
  if (job.status === 'waiting') return 'Claude needs your answer.'
  if (job.status === 'done' && c.pending?.status === 'to-validate') return `Claude: ${headerView(job).status}. 1 change to validate.`
  return `Claude: ${headerView(job).status}`
}
