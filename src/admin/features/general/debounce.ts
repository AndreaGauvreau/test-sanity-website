/**
 * Enregistrement différé par champ (« Draft saved automatically ») : chaque frappe repousse l'envoi de `delay` ms ;
 * seule la dernière valeur part. `flush()` envoie tout de suite ce qui attend (sortie de champ, départ de la page).
 * PUR (minuteurs injectables pour les tests).
 */

export const AUTOSAVE_DELAY_MS = 600

type Timers = {
  setTimeout: (fn: () => void, ms: number) => unknown
  clearTimeout: (handle: unknown) => void
}

export type Debouncer<K extends string, V> = {
  schedule(key: K, value: V): void
  /** Envoie tout de suite la valeur en attente d'un champ (ou de tous). */
  flush(key?: K): void
  /** Oublie la valeur en attente d'un champ (ou de tous) sans l'envoyer. */
  cancel(key?: K): void
  pending(key: K): boolean
}

export function createDebouncer<K extends string, V>(
  run: (key: K, value: V) => void,
  delay = AUTOSAVE_DELAY_MS,
  timers: Timers = {
    setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
    clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
  },
): Debouncer<K, V> {
  const waiting = new Map<K, { handle: unknown; value: V }>()

  const fire = (key: K) => {
    const entry = waiting.get(key)
    if (!entry) return
    waiting.delete(key)
    timers.clearTimeout(entry.handle)
    run(key, entry.value)
  }

  return {
    schedule(key, value) {
      const previous = waiting.get(key)
      if (previous) timers.clearTimeout(previous.handle)
      waiting.set(key, { value, handle: timers.setTimeout(() => fire(key), delay) })
    },
    flush(key) {
      for (const k of key ? [key] : [...waiting.keys()]) fire(k)
    },
    cancel(key) {
      for (const k of key ? [key] : [...waiting.keys()]) {
        const entry = waiting.get(k)
        if (entry) timers.clearTimeout(entry.handle)
        waiting.delete(k)
      }
    },
    pending(key) {
      return waiting.has(key)
    },
  }
}
