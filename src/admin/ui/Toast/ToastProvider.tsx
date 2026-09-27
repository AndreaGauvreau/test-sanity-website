'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { slideUp, spring, useMotionTransition, useMotionVariants } from '../motion'
import { Portal } from '../Popover'
import { Toast, type ToastAction, type ToastType } from './Toast'
import styles from './Toast.module.css'

export type ToastOptions = {
  type?: ToastType
  message: ReactNode
  action?: ToastAction
  /** Durée en ms avant disparition. Défaut : 5000 (6000 pour une erreur) ; `loading` reste jusqu'à update/dismiss. 0 = permanent. */
  duration?: number
  /** Réutiliser un identifiant remplace le toast existant (ex. « publish »). */
  id?: string
}

type ToastEntry = Required<Pick<ToastOptions, 'id' | 'type'>> & Omit<ToastOptions, 'id' | 'type'> & { key: number }

export type ToastApi = {
  /** Affiche un toast et renvoie son identifiant. */
  show: (options: ToastOptions) => string
  /** Met à jour un toast (ex. loading → success) ; relance son minuteur. */
  update: (id: string, patch: Partial<Omit<ToastOptions, 'id'>>) => void
  dismiss: (id: string) => void
  clear: () => void
}

const ToastContext = createContext<ToastApi | null>(null)

const MAX_VISIBLE = 3
let counter = 0

function defaultDuration(type: ToastType): number {
  if (type === 'loading') return 0
  if (type === 'error') return 6000
  return 5000
}

/** Accès aux toasts : à appeler sous <ToastProvider> (posé une fois par la coque de l'admin). */
export function useToast(): ToastApi {
  const api = useContext(ToastContext)
  if (!api) throw new Error('useToast() doit être appelé sous <ToastProvider>.')
  return api
}

/**
 * Fournit les toasts : pile en bas au centre (3 visibles au plus, le plus récent en bas), disparition
 * après 4-6 s, minuteur suspendu au survol et au focus, annonce polie (erreur : role="alert").
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([])
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const paused = useRef(false)
  const variants = useMotionVariants(slideUp)
  const layoutTransition = useMotionTransition(spring.snappy)

  const clearTimer = useCallback((id: string) => {
    const t = timers.current.get(id)
    if (t) clearTimeout(t)
    timers.current.delete(id)
  }, [])

  const dismiss = useCallback(
    (id: string) => {
      clearTimer(id)
      setToasts((list) => list.filter((t) => t.id !== id))
    },
    [clearTimer],
  )

  const schedule = useCallback(
    (entry: ToastEntry) => {
      clearTimer(entry.id)
      const ms = entry.duration ?? defaultDuration(entry.type)
      if (ms > 0 && !paused.current) timers.current.set(entry.id, setTimeout(() => dismiss(entry.id), ms))
    },
    [clearTimer, dismiss],
  )

  const show = useCallback(
    (options: ToastOptions) => {
      const id = options.id ?? `toast-${++counter}`
      const entry: ToastEntry = { ...options, id, type: options.type ?? 'success', key: ++counter }
      setToasts((list) => {
        const rest = list.filter((t) => t.id !== id)
        const next = [...rest, entry]
        for (const dropped of next.slice(0, Math.max(0, next.length - MAX_VISIBLE))) clearTimer(dropped.id)
        return next.slice(-MAX_VISIBLE)
      })
      schedule(entry)
      return id
    },
    [schedule, clearTimer],
  )

  const update = useCallback(
    (id: string, patch: Partial<Omit<ToastOptions, 'id'>>) => {
      setToasts((list) =>
        list.map((t) => {
          if (t.id !== id) return t
          const next = { ...t, ...patch, type: patch.type ?? t.type }
          schedule(next)
          return next
        }),
      )
    },
    [schedule],
  )

  const clear = useCallback(() => {
    for (const id of timers.current.keys()) clearTimer(id)
    setToasts([])
  }, [clearTimer])

  // Suspension pendant le survol / focus de la pile, reprise ensuite (durée complète relancée).
  const toastsRef = useRef(toasts)
  toastsRef.current = toasts
  const pause = useCallback(() => {
    paused.current = true
    for (const id of [...timers.current.keys()]) clearTimer(id)
  }, [clearTimer])
  const resume = useCallback(() => {
    paused.current = false
    for (const t of toastsRef.current) schedule(t)
  }, [schedule])

  useEffect(() => {
    const map = timers.current
    return () => {
      for (const t of map.values()) clearTimeout(t)
      map.clear()
    }
  }, [])

  const api = useMemo<ToastApi>(() => ({ show, update, dismiss, clear }), [show, update, dismiss, clear])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <Portal>
        <section aria-label="Notifications" className={styles.region} onPointerEnter={pause} onPointerLeave={resume} onFocus={pause} onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) resume()
          }}>
          <ol aria-live="polite" aria-relevant="additions text" style={{ display: 'contents' }}>
            <AnimatePresence initial={false} mode="popLayout">
              {toasts.map((t) => (
                <motion.li
                  key={t.id}
                  layout
                  className={styles.item}
                  variants={variants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={{ layout: layoutTransition }}
                >
                  <Toast
                    type={t.type}
                    action={t.action}
                    role={t.type === 'error' ? 'alert' : undefined}
                    onDismiss={() => dismiss(t.id)}
                  >
                    {t.message}
                  </Toast>
                </motion.li>
              ))}
            </AnimatePresence>
          </ol>
        </section>
      </Portal>
    </ToastContext.Provider>
  )
}
