'use client'

import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type { AskRequest, AskResponse } from '@/admin/core/contracts/engine'

import {
  conversationReducer,
  EMPTY_CONVERSATION,
  historyOf,
  isPending,
  normalizeQuestion,
  readStoredTurns,
  serializeTurns,
  sessionStore,
  type AskTurn,
} from './conversation'
import type { AskAiInfo } from './info'
import { isSafeAskHref } from './links'

/** Services du panneau (injectables pour les tests ; défaut : server action + relais du moteur). */
export type AskAiServices = {
  getInfo: () => Promise<AskAiInfo>
  ask: (request: AskRequest, options: { signal: AbortSignal }) => Promise<AskResponse>
}

export const ASK_ERROR_FALLBACK = 'Ask AI couldn’t answer. Try again in a moment.'

let counter = 0
const newTurnId = () => `t${Date.now().toString(36)}${(counter++).toString(36)}`

function errorMessage(err: unknown): string {
  const message = (err as { message?: unknown } | null)?.message
  return typeof message === 'string' && message.trim() ? message : ASK_ERROR_FALLBACK
}

export type AskConversation = {
  turns: AskTurn[]
  /** null tant que l'en-tête (modèle, mois, utilisateur) n'est pas chargé. */
  info: AskAiInfo | null
  pending: boolean
  send: (text: string) => boolean
  retry: (id: string) => void
}

/**
 * Conversation d'Ask AI, tenue par le fournisseur (elle survit à la fermeture du panneau et aux navigations dans la
 * coque) et gardée en sessionStorage pour l'utilisateur courant. `active` : charge l'en-tête à la première ouverture.
 */
export function useAskConversation({ active, screen, services }: { active: boolean; screen: string | null; services: AskAiServices }): AskConversation {
  const [state, dispatch] = useReducer(conversationReducer, EMPTY_CONVERSATION)
  const [info, setInfo] = useState<AskAiInfo | null>(null)
  const userId = info?.ok ? info.userId : null
  const stateRef = useRef(state)
  stateRef.current = state
  const controllers = useRef(new Set<AbortController>())
  const servicesRef = useRef(services)
  servicesRef.current = services
  const loading = useRef(false)

  const infoRef = useRef<AskAiInfo | null>(null)
  const loadInfo = useCallback(async () => {
    if (loading.current) return
    loading.current = true
    try {
      const next = await servicesRef.current.getInfo()
      const prev = infoRef.current
      // Nouvel utilisateur (ou premier chargement) : sa conversation de session, jamais celle d'un autre compte.
      if (next.ok && (!prev?.ok || prev.userId !== next.userId)) dispatch({ type: 'restore', turns: readStoredTurns(sessionStore.read(), next.userId) })
      infoRef.current = next
      setInfo(next)
    } catch {
      // Réseau coupé : on garde l'en-tête déjà chargé ; sinon, état d'erreur.
      if (!infoRef.current) {
        infoRef.current = { ok: false, code: 'internal', error: 'Ask AI couldn’t load. Reload the page.' }
        setInfo(infoRef.current)
      }
    } finally {
      loading.current = false
    }
  }, [])

  useEffect(() => {
    if (active && !info) void loadInfo()
  }, [active, info, loadInfo])

  // Persistance de session (après restauration seulement).
  useEffect(() => {
    if (userId) sessionStore.write(serializeTurns(state.turns, userId))
  }, [state.turns, userId])

  // Démontage du fournisseur (sortie de la coque) : les demandes en vol sont abandonnées.
  useEffect(() => {
    const set = controllers.current
    return () => {
      for (const controller of set) controller.abort()
      set.clear()
    }
  }, [])

  const run = useCallback(
    async (id: string, question: string) => {
      const controller = new AbortController()
      controllers.current.add(controller)
      try {
        const request: AskRequest = { question, history: historyOf(stateRef.current.turns, id), ...(screen ? { screen } : {}) }
        const res = await servicesRef.current.ask(request, { signal: controller.signal })
        dispatch({
          type: 'answer',
          id,
          answer: res.answer,
          // Défense en profondeur : seuls des chemins de l'admin deviennent des liens.
          links: (res.links ?? []).filter((link) => isSafeAskHref(link.href) && typeof link.label === 'string'),
          refusedChange: !!res.refusedChange,
          usage: res.usage,
        })
        // Le pied « This month » inclut cette réponse (journal écrit avant la réponse du moteur).
        void loadInfo()
      } catch (err) {
        if (controller.signal.aborted) return
        dispatch({ type: 'fail', id, error: errorMessage(err) })
      } finally {
        controllers.current.delete(controller)
      }
    },
    [screen, loadInfo],
  )

  const send = useCallback(
    (text: string) => {
      const question = normalizeQuestion(text)
      if (!question || !info?.ok || isPending(stateRef.current)) return false
      const id = newTurnId()
      dispatch({ type: 'ask', id, question })
      // Le réducteur n'a pas encore rendu : l'historique est lu avant ce tour (beforeId).
      stateRef.current = conversationReducer(stateRef.current, { type: 'ask', id, question })
      void run(id, question)
      return true
    },
    [info, run],
  )

  const retry = useCallback(
    (id: string) => {
      const turn = stateRef.current.turns.find((t) => t.id === id)
      if (!turn || turn.status !== 'error' || isPending(stateRef.current) || !info?.ok) return
      dispatch({ type: 'retry', id })
      stateRef.current = conversationReducer(stateRef.current, { type: 'retry', id })
      void run(id, turn.question)
    },
    [info, run],
  )

  return { turns: state.turns, info, pending: isPending(state), send, retry }
}
