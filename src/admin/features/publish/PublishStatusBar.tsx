'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

import { useAutosave } from '@/admin/core/autosave'
import { Button, PublishButton, TopBar } from '@/admin/ui'

import { deriveBarView } from './bar-state'
import { ErrorLogModal } from './ErrorLogModal'
import { usePublishActions } from './use-publish-actions'
import { publishStatusStore, usePublishStatus } from './use-publish-status'
import styles from './publish.module.css'

/**
 * Barre du haut de l'admin (Top bar) avec l'état de publication (G3), posée par la coque (shell).
 * Signature du contrat de jonction : <PublishStatusBar siteUrl={…} />.
 *
 * - État PARTAGÉ du moteur (GET /publish/status, ~5 s au repos, ~1 s pendant une publication) : tous les
 *   utilisateurs voient la même publication. Les erreurs de lecture s'affichent à la place du texte d'état.
 * - 5 états (bar-state.ts) ; Publish publie tout (expected = liste affichée) ; Retry après un échec ; « See error ».
 * - « Draft saved automatically » suit `useAutosave()` ; chaque brouillon enregistré relit le compteur.
 */
export function PublishStatusBar({ siteUrl }: { siteUrl: string }) {
  const { status, error: readError } = usePublishStatus()
  const autosave = useAutosave()
  const { publish, retry, pending, error: actionError, clearError } = usePublishActions()
  const [logOpen, setLogOpen] = useState(false)

  // Le message d'une action refusée reste lisible 8 s dans la barre (la fenêtre d'erreur le garde, elle).
  useEffect(() => {
    if (!actionError || logOpen) return
    const t = setTimeout(clearError, 8000)
    return () => clearTimeout(t)
  }, [actionError, logOpen, clearError])

  // Horloge de la vue : l'état « Published » ne dure que quelques secondes.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    setNow(Date.now())
  }, [status])
  const view = deriveBarView(status, now)
  useEffect(() => {
    if (!view.publishedUntil) return
    const t = setTimeout(() => setNow(Date.now()), Math.max(0, view.publishedUntil - Date.now()) + 50)
    return () => clearTimeout(t)
  }, [view.publishedUntil])

  // Un brouillon vient d'être enregistré ailleurs dans l'admin : le compteur « Unpublished changes » peut changer.
  const lastSaved = useRef(autosave.savedAt)
  useEffect(() => {
    if (autosave.savedAt !== null && autosave.savedAt !== lastSaved.current) void publishStatusStore.refresh()
    lastSaved.current = autosave.savedAt
  }, [autosave.savedAt])

  // Publication demandée mais pas encore confirmée par le moteur : on montre déjà « Publishing… ».
  const optimistic = pending && view.state === 'pending'
  const state = optimistic ? 'publishing' : view.state
  const message = actionError ?? readError
  const statusText = message ? (
    <span role="alert" className={styles.barError}>
      {message}
    </span>
  ) : optimistic ? (
    'Publishing… step 1 / 4'
  ) : status ? (
    view.text
  ) : (
    <span aria-busy="true">{view.text}</span>
  )

  const autosaveText =
    autosave.status === 'saving' ? (
      'Saving draft…'
    ) : autosave.status === 'error' ? (
      <span role="alert" className={styles.barError}>
        {`Draft not saved: ${autosave.message}`}
      </span>
    ) : (
      'Draft saved automatically'
    )

  return (
    <>
      <TopBar
        state={state}
        pendingCount={view.count}
        statusText={statusText}
        reviewHref="/admin/publish"
        linkAs={Link}
        autosaveText={autosaveText}
        siteUrl={siteUrl}
        publish={
          <>
            {view.showSeeError ? (
              <Button variant="ghost" size="small" onClick={() => setLogOpen(true)} aria-haspopup="dialog">
                See error
              </Button>
            ) : null}
            <PublishButton
              state={state}
              pendingCount={view.count}
              disabled={!status && state === 'idle'}
              onPublish={() => {
                if (!pending) publish(status)
              }}
              onRetry={() => {
                if (!pending) retry()
              }}
            />
          </>
        }
      />
      <ErrorLogModal
        open={logOpen}
        onClose={() => setLogOpen(false)}
        error={status?.run?.error}
        retrying={pending}
        retryError={actionError}
        onRetry={() => retry((ok) => ok && setLogOpen(false))}
      />
    </>
  )
}
