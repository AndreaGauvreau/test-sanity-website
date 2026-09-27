'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { autosave } from '@/admin/core/autosave'

import type { SaveResult } from '../server/save'

/**
 * Sauvegarde automatique d'UN champ (Figma : pas de bouton Save, « Draft saved automatically ») :
 * - `schedule(value)` : enregistre après `delay` ms sans nouvelle frappe (debounce) ;
 * - `flush()` : enregistre tout de suite ce qui attend (perte du focus, démontage) ;
 * - chaque écriture réelle signale `autosave.saving()` puis `saved()` / `failed(message)` (Top bar) ;
 * - une valeur identique à la dernière enregistrée n'est pas renvoyée ;
 * - `error` : message du serveur (validation, droits, Sanity), effacé à l'écriture suivante réussie.
 */
export function useFieldSave<V>(save: (value: V) => Promise<SaveResult>, initial: V, delay = 600) {
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<{ value: V } | null>(null)
  const last = useRef<string>(JSON.stringify(initial ?? null))
  const saveRef = useRef(save)
  useEffect(() => {
    saveRef.current = save
  }, [save])

  const run = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const next = pending.current
    pending.current = null
    if (!next) return
    const serialized = JSON.stringify(next.value ?? null)
    if (serialized === last.current) return
    setSaving(true)
    autosave.saving()
    try {
      const result = await saveRef.current(next.value)
      if (result.ok) {
        last.current = serialized
        setError(null)
        autosave.saved()
      } else {
        setError(result.error)
        autosave.failed(result.error)
      }
    } catch {
      const message = "Couldn't save. Check your connection and try again."
      setError(message)
      autosave.failed(message)
    } finally {
      setSaving(false)
    }
  }, [])

  const schedule = useCallback(
    (value: V) => {
      pending.current = { value }
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => void run(), delay)
    },
    [delay, run],
  )

  /** Oublie une écriture en attente (valeur invalide côté navigateur : rien n'est envoyé). */
  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    pending.current = null
  }, [])

  /** Valeur enregistrée par un autre chemin (envoi d'image) : devient la référence « déjà enregistrée ». */
  const markSaved = useCallback((value: V) => {
    last.current = JSON.stringify(value ?? null)
  }, [])

  // Démontage (changement de section, navigation) : ce qui attend part tout de suite.
  useEffect(() => () => void run(), [run])

  return { schedule, flush: run, cancel, markSaved, error, setError, saving }
}
