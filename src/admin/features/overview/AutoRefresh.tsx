'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'

import { engineClient } from '@/admin/core/engine/client'

import { publishFingerprint } from './format'

const INTERVAL_MS = 20_000

/**
 * B1 : « Données rafraîchies à l'ouverture de l'écran et après une publication ». Interroge l'état de publication
 * (relais du moteur) toutes les 20 s quand l'onglet est visible ; si l'état a changé depuis le rendu serveur,
 * `router.refresh()` relit les cartes. Ne rend rien.
 */
export function AutoRefresh({ fingerprint }: { fingerprint: string }) {
  const router = useRouter()
  const current = useRef(fingerprint)
  current.current = fingerprint

  useEffect(() => {
    let stopped = false
    let controller: AbortController | null = null
    const tick = async () => {
      if (document.visibilityState !== 'visible') return
      controller?.abort()
      controller = new AbortController()
      try {
        const status = await engineClient.publish.status({ signal: controller.signal })
        if (!stopped && publishFingerprint(status) !== current.current) router.refresh()
      } catch {
        // Moteur indisponible : la carte le dit déjà ; on réessaiera au prochain tour.
      }
    }
    const timer = window.setInterval(() => void tick(), INTERVAL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void tick()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stopped = true
      controller?.abort()
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [router])

  return null
}
