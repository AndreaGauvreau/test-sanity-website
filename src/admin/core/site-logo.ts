'use client'

import { useSyncExternalStore } from 'react'

import { siteLogoSrc } from './site-logo-src'

/**
 * Logo du site dans la sidebar, mis à jour SANS rechargement quand le favicon change dans B2 · General.
 *
 * Le layout de la coque ne se recalcule pas à la navigation client : la valeur lue par le serveur au chargement
 * (`shell/site-logo.ts`) resterait l'ancienne. B2 appelle `siteLogo.set(url)` après un envoi ou un retrait réussi ;
 * la sidebar lit `useSiteLogo(valeurDuServeur)`, qui renvoie la dernière valeur connue.
 *
 * CONTRAT PARTAGÉ — propriétaire : l'orchestrateur (comme core/autosave.ts).
 */

/** null : aucune mise à jour depuis le chargement (la valeur du serveur fait foi). */
let override: { src: string | undefined } | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

export const siteLogo = {
  /** Nouveau favicon du site (URL du CDN Sanity) ; null / undefined = plus de favicon → icône globe. */
  set(url: string | null | undefined) {
    const src = siteLogoSrc(url)
    if (override && override.src === src) return
    override = { src }
    emit()
  },
  /** Oublie les mises à jour (tests, changement de site). */
  reset() {
    override = null
    emit()
  },
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Logo à afficher : la dernière mise à jour de B2 si elle existe, sinon `initial` (lu par le serveur). */
export function useSiteLogo(initial: string | undefined): string | undefined {
  const current = useSyncExternalStore(
    subscribe,
    () => override,
    () => null,
  )
  return current ? current.src : initial
}
