'use client'

import { useEffect, useState } from 'react'

import styles from './LiveStatus.module.css'

type Status = 'connecting' | 'connected' | 'error'

const EVENT = 'sanity-live-status'
let lastStatus: Status = 'connecting'

function publish(status: Status) {
  lastStatus = status
  window.dispatchEvent(new CustomEvent<Status>(EVENT, { detail: status }))
}

// Branchés sur <SanityLive onWelcome onError onReconnect onGoAway /> dans (site)/layout.tsx.
export function onLiveWelcome() {
  console.info('[sanity-live] connecté au Live Content API : les publications mettront la page à jour')
  publish('connected')
}

export function onLiveError(error: unknown) {
  console.error('[sanity-live]', error)
  publish('error')
}

export function onLiveReconnect() {
  console.warn('[sanity-live] connexion perdue, reconnexion…')
  publish('connecting') // un nouveau « welcome » suit si la reconnexion réussit
}

export function onLiveGoAway(_event: unknown, _context: unknown, setPollingInterval: (interval: number) => void) {
  console.warn('[sanity-live] connexion fermée par le serveur : rafraîchissement toutes les 30 s')
  publish('error')
  setPollingInterval(30_000) // garde le repli par défaut de next-sanity
}

const modifiers: Record<Status, string | undefined> = {
  connecting: undefined,
  connected: styles.connected,
  error: styles.error,
}

const labels: Record<Status, string> = {
  connecting: 'Connexion…',
  connected: 'Live',
  error: 'Live coupé',
}

// Pastille (page /bench) : le site écoute-t-il les publications de l'admin ?
export function LiveStatus() {
  const [status, setStatus] = useState<Status>(lastStatus)

  useEffect(() => {
    const listener = (event: Event) => setStatus((event as CustomEvent<Status>).detail)
    window.addEventListener(EVENT, listener)
    setStatus(lastStatus)
    return () => window.removeEventListener(EVENT, listener)
  }, [])

  return (
    <span
      className={[styles.live, modifiers[status]].filter(Boolean).join(' ')}
      title="Connexion au Live Content API de Sanity : une publication dans l'admin met à jour cette page sans recharger."
    >
      {labels[status]}
    </span>
  )
}
