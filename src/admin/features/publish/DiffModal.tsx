'use client'

import { useEffect, useState } from 'react'

import { Button, Callout, Icon, Modal } from '@/admin/ui'

import { loadDiffAction } from './actions'
import styles from './publish.module.css'

/** Type d'une ligne de diff unifié, pour la couleur (ajout, retrait, en-tête de bloc, métadonnées). */
export function diffLineKind(line: string): 'add' | 'del' | 'hunk' | 'meta' | 'context' {
  if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff ') || line.startsWith('index ')) return 'meta'
  if (line.startsWith('@@')) return 'hunk'
  if (line.startsWith('+')) return 'add'
  if (line.startsWith('-')) return 'del'
  return 'context'
}

/** Diff unifié rendu en texte (nœuds React, jamais de HTML), une ligne colorée par type. */
export function DiffView({ diff, label }: { diff: string; label: string }) {
  return (
    <pre className={styles.diff} tabIndex={0} role="region" aria-label={label}>
      <code>
        {diff.split('\n').map((line, i) => (
          <span key={i} className={styles.diffLine} data-kind={diffLineKind(line)}>
            {line || ' '}
          </span>
        ))}
      </code>
    </pre>
  )
}

type DiffState = { status: 'loading' } | { status: 'ready'; diff: string } | { status: 'error'; message: string }

/**
 * ‹/› Diff (Kuartz seulement, can('publish.diff')) : le diff du code d'une modification IA, lu par une server action
 * qui revérifie le droit. Chargement, erreur (avec Retry) et diff vide gérés.
 */
export function DiffModal({
  open,
  change,
  onClose,
}: {
  open: boolean
  /** Gardée après la fermeture : le titre ne change pas pendant l'animation de sortie. */
  change: { changeId: string; title: string } | null
  onClose: () => void
}) {
  const [state, setState] = useState<DiffState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const changeId = open ? change?.changeId : undefined

  useEffect(() => {
    if (!changeId) return
    let cancelled = false
    setState({ status: 'loading' })
    loadDiffAction({ changeId }).then(
      (result) => {
        if (cancelled) return
        setState(result.ok ? { status: 'ready', diff: result.data.diff } : { status: 'error', message: result.message })
      },
      () => {
        if (!cancelled) setState({ status: 'error', message: 'Couldn’t load the diff. Try again.' })
      },
    )
    return () => {
      cancelled = true
    }
  }, [changeId, attempt])

  return (
    <Modal
      open={open && change !== null}
      onClose={onClose}
      width={720}
      title={change ? `Diff · ${change.title}` : 'Diff'}
      description="The code of this AI editor change, on the draft branch. It goes live with the next publish."
      footer={
        <Button variant="secondary" size="small" onClick={onClose}>
          Close
        </Button>
      }
    >
      {state.status === 'loading' ? (
        <p className={styles.loadingLine} role="status">
          <Icon name="loader" size={12} set={18} spin />
          Loading the diff…
        </p>
      ) : state.status === 'error' ? (
        <Callout
          tone="error"
          role="alert"
          action={
            <Button variant="ghost" size="small" onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </Button>
          }
        >
          {state.message}
        </Callout>
      ) : state.diff.trim() ? (
        <DiffView diff={state.diff} label={`Diff of ${change?.title ?? 'the change'}`} />
      ) : (
        <Callout>This change has no code diff.</Callout>
      )}
    </Modal>
  )
}
