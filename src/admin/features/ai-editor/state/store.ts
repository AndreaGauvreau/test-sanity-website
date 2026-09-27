'use client'

import { useSyncExternalStore } from 'react'
import type { EditJob, ElementTarget, PendingChange, Viewport } from '@/admin/core/contracts'

/**
 * État partagé de l'éditeur IA plein écran (D1-D3) entre la sidebar Claude (editor-sidebar) et l'aperçu
 * (editor-canvas). Un seul magasin par écran d'éditeur, créé par l'écran et transmis par contexte.
 *
 * CONTRAT PARTAGÉ — créé par l'orchestrateur, puis PROPRIÉTÉ d'editor-sidebar, qui peut l'étendre de façon
 * ADDITIVE ; editor-canvas le consomme et ne le modifie que via ses actions.
 *
 * Qui écrit quoi :
 * - canvas : mode, viewport, selection (clic / Maj + clic / Échap), bridgeReady ;
 * - sidebar : job (demande active, interrogée toutes les 900 ms), pending (modification à valider),
 *   refreshPreview() quand un brouillon Sanity a changé (le HMR ne le voit pas) ;
 * - dérivé : locked = une demande est active → sélection, View/Select, saisie et Publish bloqués ;
 *   Stop et Desktop/Tablet/Mobile restent actifs (G2).
 */

export type EditorMode = 'select' | 'view'

export type EditorState = {
  /** PageDef.id (« home ») et son chemin public (« / »). */
  pageId: string
  path: string
  mode: EditorMode
  viewport: Viewport
  /** Éléments choisis, dans l'ordre du clic. La demande vaut pour tous. */
  selection: ElementTarget[]
  /** Demande en file, en cours ou en attente de réponse. */
  job: EditJob | null
  /** Modification en attente de validation (anneau vert + barre flottante « Modified by Claude · to validate »). */
  pending: PendingChange | null
  /** Le pont de l'aperçu a répondu (sinon message d'erreur après 15 s). */
  bridgeReady: boolean
  /** Incrémenté pour demander à l'aperçu de se recharger (brouillon Sanity modifié). */
  previewNonce: number
  /**
   * AJOUTS editor-sidebar (additifs) ─────────────────────────────────────────────────────────────
   * Écran d'origine pour « ‹ Admin » (G1 : même page, même onglet). Donné par l'écran (EditorStoreProvider
   * `backHref`) ; absent → `/admin/pages/<pageId>`. Toujours un chemin `/admin…` (nettoyé par la sidebar).
   */
  backHref: string | null
  /** URL et origine de l'aperçu, lues dans GET /editor/state par la sidebar (null tant que non chargé). */
  preview: { url: string; origin: string } | null
  /**
   * Actions Validate / Cancel de la modification en attente, enregistrées par la sidebar : la barre flottante de
   * l'aperçu (« Modified by Claude · to validate ») les appelle, pour un seul chemin vers le moteur.
   */
  decisions: EditorDecisions | null
  /** Décision en cours (boutons en chargement des deux côtés). */
  deciding: 'validate' | 'cancel' | null
}

export type EditorDecisions = {
  validate: () => Promise<void>
  cancel: () => Promise<void>
}

export type EditorStore = ReturnType<typeof createEditorStore>

const ACTIVE = new Set(['queued', 'running', 'waiting'])

export function isLocked(state: EditorState): boolean {
  return state.job !== null && ACTIVE.has(state.job.status)
}

function sameTarget(a: ElementTarget, b: ElementTarget): boolean {
  return a.zone === b.zone && a.index === b.index && (a.key ?? '') === (b.key ?? '') && (a.doc ?? '') === (b.doc ?? '')
}

export function createEditorStore(initial: Pick<EditorState, 'pageId' | 'path'> & Partial<EditorState>) {
  let state: EditorState = {
    mode: 'select',
    viewport: 1280,
    selection: [],
    job: null,
    pending: null,
    bridgeReady: false,
    previewNonce: 0,
    backHref: null,
    preview: null,
    decisions: null,
    deciding: null,
    ...initial,
  }
  const listeners = new Set<() => void>()
  const set = (patch: Partial<EditorState>) => {
    state = { ...state, ...patch }
    for (const listener of listeners) listener()
  }

  return {
    get: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    setMode(mode: EditorMode) {
      if (!isLocked(state)) set({ mode })
    },
    setViewport(viewport: Viewport) {
      set({ viewport })
    },
    /** Clic : remplace la sélection ; Maj + clic (additive) : ajoute ou retire l'élément. Max 8 éléments. */
    select(target: ElementTarget, additive = false) {
      if (isLocked(state)) return
      if (!additive) return set({ selection: [target] })
      const exists = state.selection.some((t) => sameTarget(t, target))
      const selection = exists ? state.selection.filter((t) => !sameTarget(t, target)) : [...state.selection, target].slice(0, 8)
      set({ selection })
    },
    removeTarget(target: ElementTarget) {
      if (!isLocked(state)) set({ selection: state.selection.filter((t) => !sameTarget(t, target)) })
    },
    clearSelection() {
      if (!isLocked(state)) set({ selection: [] })
    },
    setJob(job: EditJob | null) {
      set({ job })
    },
    setPending(pending: PendingChange | null) {
      set({ pending })
    },
    setBridgeReady(bridgeReady: boolean) {
      set({ bridgeReady })
    },
    refreshPreview() {
      set({ previewNonce: state.previewNonce + 1 })
    },
    // ─── Ajouts editor-sidebar ───────────────────────────────────────────────────────────────
    /** Remplace la sélection (demande arrêtée ou en échec : elle revient dans le champ). Bloqué pendant le travail. */
    setSelection(selection: ElementTarget[]) {
      if (!isLocked(state)) set({ selection: selection.slice(0, 8) })
    },
    setPreview(preview: EditorState['preview']) {
      set({ preview })
    },
    /** La sidebar enregistre Validate / Cancel ; renvoie la fonction de désinscription. */
    registerDecisions(decisions: EditorDecisions) {
      set({ decisions })
      return () => {
        if (state.decisions === decisions) set({ decisions: null })
      }
    },
    setDeciding(deciding: EditorState['deciding']) {
      set({ deciding })
    },
  }
}

const EMPTY_SUBSCRIBE = () => () => {}

/** Lecture d'une tranche de l'état (re-rendu seulement quand elle change par référence). */
export function useEditorState<T>(store: EditorStore, select: (state: EditorState) => T): T {
  return useSyncExternalStore(
    store ? store.subscribe : EMPTY_SUBSCRIBE,
    () => select(store.get()),
    () => select(store.get()),
  )
}
