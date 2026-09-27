'use client'

import { useEffect, useRef, useState } from 'react'

import { autosave } from '@/admin/core/autosave'

/**
 * Sauvegarde automatique d'un champ (« pas de bouton Save : chaque frappe enregistre un brouillon ») :
 * attend `delay` ms sans frappe, puis envoie la DERNIÈRE valeur ; une seule requête à la fois par champ
 * (une frappe pendant l'envoi repart juste après). `flush()` envoie tout de suite (perte du focus, fermeture).
 * Signale chaque envoi à la Top bar (`autosave.saving()` puis `saved()` / `failed(message)`).
 */

export type SaveOutcome = { ok: true } | { ok: false; error: string }

export type FieldSaver<T> = {
  change: (value: T) => void
  /** Envoie tout de suite la valeur en attente (et attend la fin des envois en cours). */
  flush: () => Promise<void>
  /** Abandonne la valeur en attente (ex. valeur invalide corrigée avant l'envoi). */
  cancel: () => void
  dispose: () => void
}

export const SAVE_FAILED = "Couldn't save. Check your connection and try again."

export function createFieldSaver<T>(
  save: (value: T) => Promise<SaveOutcome>,
  options: { delay?: number; onError?: (error: string | null) => void; onSaving?: (saving: boolean) => void } = {},
): FieldSaver<T> {
  const delay = options.delay ?? 600
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: { value: T } | null = null
  let inFlight: Promise<void> | null = null

  const send = async (): Promise<void> => {
    if (inFlight) {
      await inFlight
      if (pending) await send()
      return
    }
    const next = pending
    if (!next) return
    pending = null
    options.onSaving?.(true)
    autosave.saving()
    inFlight = (async () => {
      try {
        const result = await save(next.value)
        if (result.ok) {
          autosave.saved()
          options.onError?.(null)
        } else {
          autosave.failed(result.error)
          options.onError?.(result.error)
        }
      } catch {
        autosave.failed(SAVE_FAILED)
        options.onError?.(SAVE_FAILED)
      }
    })()
    await inFlight
    inFlight = null
    options.onSaving?.(false)
    // Une frappe arrivée pendant l'envoi : on l'envoie à son tour.
    if (pending && !timer) await send()
  }

  return {
    change(value) {
      pending = { value }
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        void send()
      }, delay)
    },
    async flush() {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      await send()
    },
    cancel() {
      if (timer) clearTimeout(timer)
      timer = null
      pending = null
    },
    dispose() {
      // Démontage : la dernière frappe part quand même.
      if (timer) {
        clearTimeout(timer)
        timer = null
        void send()
      }
    },
  }
}

/** Version hook : un enregistreur stable pour la vie du composant, erreur et état d'envoi en état React. */
export function useFieldSaver<T>(save: (value: T) => Promise<SaveOutcome>, delay = 600) {
  const saveRef = useRef(save)
  useEffect(() => {
    saveRef.current = save
  })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saver] = useState(() => createFieldSaver<T>((v) => saveRef.current(v), { delay, onError: setError, onSaving: setSaving }))
  useEffect(() => () => saver.dispose(), [saver])
  return { ...saver, error, saving, setError }
}
