'use client'

import { useSyncExternalStore } from 'react'

/**
 * État « Draft saved automatically » de la Top bar (Figma : pas de bouton Save, chaque frappe enregistre un brouillon).
 *
 * CONTRAT PARTAGÉ — propriétaire : l'orchestrateur.
 * Les features qui écrivent un brouillon (pages, cms, media, general, code…) appellent `autosave.saving()` puis
 * `autosave.saved()` ou `autosave.failed(message)`. La barre de publication (features/publish) affiche l'état avec
 * `useAutosave()` et rafraîchit le compteur « Unpublished changes: N » quand `savedAt` change.
 */

export type AutosaveState =
  | { status: 'idle'; savedAt: number | null }
  | { status: 'saving'; savedAt: number | null; pending: number }
  | { status: 'saved'; savedAt: number }
  | { status: 'error'; savedAt: number | null; message: string }

let state: AutosaveState = { status: 'idle', savedAt: null }
let inFlight = 0
const listeners = new Set<() => void>()

function emit(next: AutosaveState) {
  state = next
  for (const listener of listeners) listener()
}

export const autosave = {
  saving() {
    inFlight += 1
    emit({ status: 'saving', savedAt: state.savedAt, pending: inFlight })
  },
  saved() {
    inFlight = Math.max(0, inFlight - 1)
    if (inFlight > 0) emit({ status: 'saving', savedAt: Date.now(), pending: inFlight })
    else emit({ status: 'saved', savedAt: Date.now() })
  },
  failed(message: string) {
    inFlight = Math.max(0, inFlight - 1)
    emit({ status: 'error', savedAt: state.savedAt, message })
  },
  get(): AutosaveState {
    return state
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}

const serverState: AutosaveState = { status: 'idle', savedAt: null }

export function useAutosave(): AutosaveState {
  return useSyncExternalStore(autosave.subscribe, autosave.get, () => serverState)
}
