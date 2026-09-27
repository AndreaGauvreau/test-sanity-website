'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { EditJob, EditRequest, EditorState, PendingChange, Question, Scope, ThreadEntry, Usage } from '@/admin/core/contracts'
import { engineClient, EngineClientError, type EngineClient } from '@/admin/core/engine/client'
import { ENGINE_MESSAGES } from '@/admin/core/engine/errors'
import { useEditorState, type EditorStore } from '../state/store'
import {
  adjustmentScope,
  buildAnswers,
  canApply as canApplyFn,
  cleanNote,
  composerState,
  isActive,
  normalizeScope,
  shouldRestoreRequest,
  toggleScope,
  upsertJob,
  type AnswerPick,
  type ComposerState,
} from './machine'
import { startJobPolling } from './poller'
import { cumulativeUsage, usageByJob } from './usage'

/**
 * Contrôleur de la conversation (sans rendu) : état initial (GET /editor/state), envoi (POST /editor/requests,
 * `changeId` pour un ajustement), sondage de la demande active (900 ms, erreurs affichées, arrêt au démontage),
 * réponses, Stop, Validate, Cancel. Écrit dans le magasin partagé : job, pending (de CETTE page), preview,
 * selection (demande rendue au champ), refreshPreview (textes Sanity changés), decisions (barre de l'aperçu).
 */

export type LoadState = { status: 'loading' } | { status: 'ready' } | { status: 'error'; message: string }

type Snapshot = { base: Usage | null; loaded: Map<string, Usage>; model: { id: string; label: string } }

export function errorMessage(error: unknown): string {
  if (error instanceof EngineClientError) return error.message
  if (error && typeof error === 'object' && 'message' in error && typeof (error as Error).message === 'string') {
    const message = (error as Error).message
    if (message) return message
  }
  return ENGINE_MESSAGES.unavailable
}

export function useConversation(store: EditorStore, client: EngineClient = engineClient) {
  const path = useEditorState(store, (s) => s.path)
  const selection = useEditorState(store, (s) => s.selection)
  const job = useEditorState(store, (s) => s.job)
  const pending = useEditorState(store, (s) => s.pending)
  const deciding = useEditorState(store, (s) => s.deciding)

  const [load, setLoad] = useState<LoadState>({ status: 'loading' })
  const [thread, setThread] = useState<ThreadEntry[]>([])
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [elsewhere, setElsewhere] = useState<{ active: boolean; pending: PendingChange | null }>({ active: false, pending: null })
  const [note, setNote] = useState('')
  const [scope, setScope] = useState<Scope[]>([])
  const [answeringOther, setAnsweringOther] = useState<string | null>(null)
  const [picks, setPicks] = useState<Record<string, AnswerPick>>({})
  const [submitting, setSubmitting] = useState(false)
  const [answering, setAnswering] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [pollError, setPollError] = useState<string | null>(null)

  const mounted = useRef(true)
  const finalized = useRef(new Set<string>())
  const textsTouched = useRef(new Set<string>())
  const loadSeq = useRef(0)
  const loadedOnce = useRef(false)
  const noteRef = useRef(note)
  noteRef.current = note

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  /** Applique l'état du moteur (chargement, ou rechargement après une fin de demande / une décision). */
  const applyState = useCallback(
    (state: EditorState) => {
      setThread(state.thread)
      setSnapshot({ base: state.conversationUsage, loaded: usageByJob(state.thread), model: state.model })
      store.setPreview(state.preview)
      const here = (p: { page: string } | null | undefined) => !!p && p.page === state.page
      if (state.active) {
        store.setJob(state.active)
        if (state.active.texts.length) textsTouched.current.add(state.active.id)
      } else {
        const current = store.get().job
        // Garder la dernière demande (terminée) pour l'aperçu ; oublier une demande active disparue.
        if (current && isActive(current)) store.setJob(null)
      }
      store.setPending(here(state.pending) ? state.pending : null)
      setElsewhere({
        active: !!state.active && !here(state.active.request),
        pending: state.pending && !here(state.pending) ? state.pending : null,
      })
    },
    [store],
  )

  const reload = useCallback(async () => {
    const seq = ++loadSeq.current
    try {
      const state = await client.editor.state(path)
      if (!mounted.current || seq !== loadSeq.current) return
      applyState(state)
      loadedOnce.current = true
      setLoad({ status: 'ready' })
    } catch (error) {
      if (!mounted.current || seq !== loadSeq.current) return
      // Premier chargement : écran d'erreur avec « Try again » ; ensuite : message sous le champ, le fil reste.
      if (!loadedOnce.current) setLoad({ status: 'error', message: errorMessage(error) })
      else setActionError(errorMessage(error))
    }
  }, [client, path, applyState])

  // Chargement initial (et changement de page).
  useEffect(() => {
    setLoad({ status: 'loading' })
    void reload()
  }, [reload])

  /** Suite commune à toute mise à jour d'une demande (sondage, envoi, réponse, Stop). */
  const onJob = useCallback(
    (next: EditJob) => {
      if (!mounted.current) return
      store.setJob(next)
      if (next.request.page === store.get().path) setThread((t) => upsertJob(t, next))
      if (next.texts.length) textsTouched.current.add(next.id)
      if (isActive(next) || finalized.current.has(next.id)) return
      finalized.current.add(next.id)
      setPicks({})
      setAnsweringOther(null)
      setPollError(null)
      // Un texte Sanity a changé (ou a été remis en l'état) : le HMR ne le voit pas, l'aperçu doit se recharger.
      if (textsTouched.current.has(next.id)) store.refreshPreview()
      // Arrêt, échec ou refus : la demande revient dans le champ pour réessayer (G2, état 9).
      if (shouldRestoreRequest(next) && !noteRef.current.trim()) {
        setNote(next.request.note)
        if (next.kind === 'request') {
          setScope(normalizeScope(next.request.scope))
          store.setSelection(next.request.targets)
        }
      }
      void reload()
    },
    [store, reload],
  )

  // Sondage de la demande active (une seule à la fois).
  const activeId = job && isActive(job) ? job.id : null
  useEffect(() => {
    if (!activeId) return
    const stop = startJobPolling({
      jobId: activeId,
      fetchJob: (id, signal) => client.editor.job(id, { signal }),
      onJob,
      onError: (error, failures) => {
        if (!mounted.current) return
        const base = errorMessage(error)
        setPollError(failures > 1 ? `${base} (retrying — ${failures} attempts)` : `${base} Retrying…`)
        if (error instanceof EngineClientError && error.status === 404) void reload()
      },
      onRecovered: () => mounted.current && setPollError(null),
    })
    return stop
  }, [activeId, client, onJob, reload])

  // La barre flottante de l'aperçu peut valider / annuler elle-même (puis vider `pending`) : le fil se resynchronise
  // pour afficher « Validated — added to Publish (N changes) » ou l'annulation.
  const prevPending = useRef(pending)
  useEffect(() => {
    const before = prevPending.current
    prevPending.current = pending
    if (before?.status === 'to-validate' && !pending && !store.get().deciding) void reload()
  }, [pending, store, reload])

  const onPage = (p: { page: string } | null | undefined) => !!p && p.page === path
  const pendingHere = pending && onPage(pending) ? pending : null
  const state: ComposerState = composerState({
    job: job && isActive(job) ? job : null,
    pending: pendingHere,
    selectionCount: selection.length,
    answeringOther: answeringOther !== null,
  })
  const lockedElsewhere = elsewhere.active || !!elsewhere.pending
  // Claude travaille sur une autre page → « working » ; une modification attend ailleurs → champ inactif.
  const composer: ComposerState =
    load.status !== 'ready' ? 'empty' : elsewhere.active ? 'working' : elsewhere.pending ? 'empty' : state
  const targets = composer === 'adjust' ? (pendingHere?.targets ?? []) : selection
  const canApply = load.status === 'ready' && !lockedElsewhere && canApplyFn({ state: composer, scope, targetCount: targets.length, note })

  // Nouvelle sélection : la portée repart de zéro (rien de coché par défaut) si le champ était vide.
  const prevState = useRef<ComposerState>(composer)
  useEffect(() => {
    if (prevState.current === 'empty' && (composer === 'ready' || composer === 'multi') && !noteRef.current) setScope([])
    prevState.current = composer
  }, [composer])

  const setScopeValue = useCallback((value: Scope, on: boolean) => setScope((s) => toggleScope(s, value, on)), [])

  const sendAnswers = useCallback(
    async (current: EditJob, questions: readonly Question[], nextPicks: Record<string, AnswerPick>, fromComposer = false) => {
      const check = buildAnswers(questions, nextPicks)
      if (!check.ok) {
        setPicks(nextPicks)
        if (check.error) setActionError(check.error)
        return
      }
      setAnswering(true)
      setActionError(null)
      try {
        const updated = await client.editor.answer(current.id, check.answers)
        if (!mounted.current) return
        setPicks({})
        setAnsweringOther(null)
        if (fromComposer) setNote('')
        onJob(updated)
      } catch (error) {
        if (!mounted.current) return
        setPicks(nextPicks)
        setActionError(errorMessage(error))
        if (error instanceof EngineClientError && error.status === 409) void reload()
      } finally {
        if (mounted.current) setAnswering(false)
      }
    },
    [client, onJob, reload],
  )

  /** Envoie la demande, l'ajustement ou la réponse libre (Apply, ⌘ ↵). */
  const submit = useCallback(async () => {
    if (!canApply || submitting) return
    setActionError(null)
    if (composer === 'answer' && job && answeringOther && job.question) {
      await sendAnswers(job, job.question.questions, { ...picks, [answeringOther]: { other: note } }, true)
      return
    }
    const request: EditRequest = {
      page: path,
      targets: composer === 'adjust' ? (pendingHere?.targets ?? []) : selection,
      scope: composer === 'adjust' && pendingHere ? adjustmentScope(thread, pendingHere.id) : normalizeScope(scope),
      note: cleanNote(note),
      viewport: store.get().viewport,
      ...(composer === 'adjust' && pendingHere ? { changeId: pendingHere.id } : {}),
    }
    setSubmitting(true)
    try {
      const created = await client.editor.request(request)
      if (!mounted.current) return
      setNote('')
      store.clearSelection()
      if (pendingHere && request.changeId) store.setPending({ ...pendingHere, status: 'working' })
      onJob(created)
    } catch (error) {
      if (!mounted.current) return
      setActionError(errorMessage(error))
      if (error instanceof EngineClientError && error.status === 409) void reload()
    } finally {
      if (mounted.current) setSubmitting(false)
    }
  }, [canApply, submitting, composer, job, answeringOther, picks, note, path, pendingHere, selection, thread, scope, client, store, onJob, reload, sendAnswers])

  /** Clic sur une option : relance Claude dès que chaque question a sa réponse. */
  const pick = useCallback(
    (question: Question, optionId: string) => {
      if (!job || !job.question || answering) return
      setAnsweringOther((q) => (q === question.id ? null : q))
      void sendAnswers(job, job.question.questions, { ...picks, [question.id]: { optionId } })
    },
    [job, answering, picks, sendAnswers],
  )

  /** « Other answer… » : rouvre le champ (300 caractères) pour cette question. */
  const other = useCallback((question: Question) => {
    setActionError(null)
    setAnsweringOther((q) => {
      if (q === question.id) return null
      setNote('')
      return question.id
    })
  }, [])

  const cancelOther = useCallback(() => {
    setAnsweringOther(null)
    setNote('')
  }, [])

  const stop = useCallback(async () => {
    if (!job || !isActive(job) || stopping) return
    setStopping(true)
    setActionError(null)
    try {
      const updated = await client.editor.stop(job.id)
      onJob(updated)
    } catch (error) {
      if (mounted.current) setActionError(errorMessage(error))
    } finally {
      if (mounted.current) setStopping(false)
    }
  }, [job, stopping, client, onJob])

  const decide = useCallback(
    async (decision: 'validate' | 'cancel') => {
      const change = store.get().pending
      if (!change || change.status !== 'to-validate' || store.get().deciding) return
      store.setDeciding(decision)
      setActionError(null)
      try {
        await (decision === 'validate' ? client.editor.validate(change.id) : client.editor.cancel(change.id))
        if (!mounted.current) return
        store.setPending(null)
        // Cancel remet les brouillons Sanity en l'état : l'aperçu doit relire les textes.
        if (decision === 'cancel' && change.jobIds.some((id) => textsTouched.current.has(id) || textsInThread(thread, id))) {
          store.refreshPreview()
        }
        await reload()
      } catch (error) {
        if (!mounted.current) return
        setActionError(errorMessage(error))
        if (error instanceof EngineClientError && (error.status === 409 || error.status === 404)) void reload()
      } finally {
        store.setDeciding(null)
      }
    },
    [store, client, reload, thread],
  )

  const validate = useCallback(() => decide('validate'), [decide])
  const cancel = useCallback(() => decide('cancel'), [decide])

  // La barre flottante de l'aperçu (editor-canvas) passe par les mêmes actions.
  useEffect(() => store.registerDecisions({ validate, cancel }), [store, validate, cancel])

  const conversationUsage = useMemo(() => {
    if (!snapshot) return null
    return cumulativeUsage(snapshot.base, snapshot.loaded, usageByJob(thread), snapshot.model.id)
  }, [snapshot, thread])

  return {
    load,
    retry: reload,
    thread,
    model: snapshot?.model ?? null,
    conversationUsage,
    job,
    pending: pendingHere,
    elsewhere,
    deciding,
    composer: {
      state: composer,
      targets,
      scope,
      setScope: setScopeValue,
      note,
      setNote,
      canApply,
      submitting: submitting || answering,
      submit,
      cancelOther,
    },
    picks,
    answeringOther,
    answering,
    stopping,
    pick,
    other,
    stop,
    validate,
    cancel,
    actionError,
    clearActionError: () => setActionError(null),
    pollError,
  }
}

function textsInThread(thread: readonly ThreadEntry[], jobId: string): boolean {
  return thread.some((e) => e.type === 'job' && e.job.id === jobId && e.job.texts.length > 0)
}

export type Conversation = ReturnType<typeof useConversation>
