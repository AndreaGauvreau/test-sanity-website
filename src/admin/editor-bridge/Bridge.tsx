'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'

import { normalizeOrigin } from './protocol'
import { BridgeRuntime } from './runtime'
import type { ZoneLabels } from './zones'

export type BridgeProps = {
  /**
   * Origine de l'admin autorisée à piloter le pont (ADMIN_ORIGIN, lue côté serveur), ou « self » pour la page
   * d'essai servie par l'admin lui-même. Absente ou invalide : le pont reste inerte (fermé par défaut).
   */
  parentOrigin: string | null
  labels: ZoneLabels
}

let warned = false

/** Monte le runtime du pont (runtime.ts) ; ne rend rien. */
export function Bridge({ parentOrigin, labels }: BridgeProps) {
  const router = useRouter()
  // router.refresh via une ref : l'effet ne dépend pas de l'identité du routeur.
  const refresh = useRef(router.refresh)
  useEffect(() => {
    refresh.current = router.refresh
  }, [router])
  // Libellés figés au premier rendu : un router.refresh renvoie un nouvel objet identique, qui ne doit pas
  // redémarrer le pont (le parent devrait refaire la poignée de main).
  const labelsRef = useRef(labels)

  useEffect(() => {
    const origin = parentOrigin === 'self' ? window.location.origin : normalizeOrigin(parentOrigin)
    if (!origin) {
      if (!warned) {
        warned = true
        console.warn('[editor-bridge] ADMIN_ORIGIN is missing or invalid: the AI editor bridge stays inactive.')
      }
      return
    }
    const runtime = new BridgeRuntime({ window, parentOrigin: origin, labels: labelsRef.current, onRefresh: () => refresh.current() })
    runtime.start()
    return () => runtime.stop()
  }, [parentOrigin])

  return null
}
