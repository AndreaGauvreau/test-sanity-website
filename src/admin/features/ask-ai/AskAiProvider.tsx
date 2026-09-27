'use client'

import { usePathname } from 'next/navigation'
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'

import { engineClient } from '@/admin/core/engine/client'
import { isTopLayer, Portal, useLayer } from '@/admin/ui/Popover'
import { AnimatePresence, motion, useMotionVariants } from '@/admin/ui/motion'
import { duration, ease } from '@/admin/ui/motion-presets'

import { getAskAiInfo } from './actions'
import { AskAiPanel } from './AskAiPanel'
import { useAskConversation, type AskAiServices } from './useAskConversation'
import styles from './AskAiProvider.module.css'

/**
 * Ask AI (G4) pour toute la coque : `<AskAiProvider>{children}</AskAiProvider>` (layout `(shell)`), et
 * `useAskAi().open() / .close() / .isOpen` (bouton « ✦ Ask AI » de la Sidebar). Le fournisseur tient la conversation
 * (gardée pendant la session, voir useAskConversation) et monte le panneau flottant à côté de la Sidebar.
 * ✕ ou Échap le ferment (Échap seulement s'il est la couche du dessus : un menu ou une modale ouverts passent avant).
 */
type AskAi = { open: () => void; close: () => void; isOpen: boolean }

const AskAiContext = createContext<AskAi>({ open: () => {}, close: () => {}, isOpen: false })

const DEFAULT_SERVICES: AskAiServices = {
  getInfo: () => getAskAiInfo(),
  ask: (request, { signal }) => engineClient.ask(request, { signal }),
}

/** Entrée : 0.96 → 1 + fondu depuis le coin haut gauche (côté du bouton Ask AI), 200 ms ease-out ; sortie 80 %. */
const panelVariants = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1, transition: { duration: duration.base, ease: ease.out } },
  exit: { opacity: 0, scale: 0.98, transition: { duration: duration.base * 0.8, ease: ease.out } },
}

export function AskAiProvider({ children, services = DEFAULT_SERVICES }: { children: ReactNode; services?: AskAiServices }) {
  const [isOpen, setOpen] = useState(false)
  const [openCount, setOpenCount] = useState(0)
  const pathname = usePathname()
  const returnFocus = useRef<HTMLElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const layerId = useId()
  const variants = useMotionVariants(panelVariants)
  const conversation = useAskConversation({ active: isOpen, screen: pathname, services })

  useLayer(layerId, isOpen)

  const focusInput = useCallback(() => {
    const input = inputRef.current
    if (input && !input.disabled) input.focus()
    else panelRef.current?.focus()
  }, [])

  const open = useCallback(() => {
    const active = document.activeElement
    // Déjà ouvert : on ramène seulement le focus dans le champ.
    if (!panelRef.current?.contains(active)) returnFocus.current = active instanceof HTMLElement ? active : null
    setOpen(true)
    setOpenCount((n) => n + 1)
  }, [])

  const close = useCallback(() => {
    setOpen(false)
    const panel = panelRef.current
    const target = returnFocus.current
    const active = document.activeElement
    // Le focus revient au déclencheur s'il était dans le panneau (ou perdu), jamais volé ailleurs.
    if (target?.isConnected && (!active || active === document.body || panel?.contains(active))) target.focus()
    returnFocus.current = null
  }, [])

  // Ouverture (ou nouveau clic sur « Ask AI ») : focus dans le champ.
  useEffect(() => {
    if (!isOpen) return
    const frame = requestAnimationFrame(focusInput)
    return () => cancelAnimationFrame(frame)
  }, [isOpen, openCount, focusInput])

  // Le champ devient utilisable (en-tête chargé) alors que le focus attendait sur le panneau.
  const ready = !!conversation.info?.ok
  useEffect(() => {
    if (isOpen && ready && document.activeElement === panelRef.current) inputRef.current?.focus()
  }, [isOpen, ready])

  // Échap ferme le panneau, où que soit le focus, s'il est la couche du dessus et que personne ne l'a déjà traitée.
  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing || !isTopLayer(layerId)) return
      event.preventDefault()
      close()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isOpen, layerId, close])

  const value = useMemo(() => ({ open, close, isOpen }), [open, close, isOpen])

  return (
    <AskAiContext.Provider value={value}>
      {children}
      <Portal>
        <AnimatePresence>
          {isOpen ? (
            <motion.div key="ask-ai" className={styles.host} variants={variants} initial="initial" animate="animate" exit="exit">
              <AskAiPanel
                panelRef={panelRef}
                inputRef={inputRef}
                turns={conversation.turns}
                info={conversation.info}
                pending={conversation.pending}
                onSend={conversation.send}
                onRetry={conversation.retry}
                onClose={close}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </Portal>
    </AskAiContext.Provider>
  )
}

export function useAskAi(): AskAi {
  return useContext(AskAiContext)
}
