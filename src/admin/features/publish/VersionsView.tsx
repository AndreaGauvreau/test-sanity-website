'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition, type KeyboardEvent } from 'react'

import type { Publication } from '@/admin/core/contracts/engine'
import { Button, ButtonContent, buttonClassName, Callout, DetailRow, EmptyState, Modal, Tag, VersionItem } from '@/admin/ui'

import { rollbackVersionAction } from './actions'
import { formatDateTime, versionId, versionLabel } from './format'
import { useNow } from './use-now'
import styles from './publish.module.css'

export type VersionsData = { publications: Publication[]; rollback: { available: boolean; reason?: string } }

export type VersionsViewProps = {
  /** Lu par le Server Component (null si le moteur n'a pas répondu). */
  initial: VersionsData | null
  initialError: string | null
  /** Kuartz seulement (can('versions.rollback'), revérifié par la server action et le moteur). */
  canRollback: boolean
}

const STATUS_TAG: Record<Publication['status'], { tone: 'success' | 'error' | 'neutral'; label: string; dot?: boolean }> = {
  live: { tone: 'success', label: 'Live', dot: true },
  previous: { tone: 'success', label: 'Ready', dot: true },
  failed: { tone: 'error', label: 'Failed', dot: true },
  'rolled-back': { tone: 'neutral', label: 'Rolled back', dot: true },
}

/** « Changes » de la fiche : un élément par ligne (chemins de contenu, puis modifications de design). */
export function publicationChanges(p: Publication): string {
  const lines = [...p.content.map((c) => c.path), ...p.design.map((d) => d.title)]
  if (lines.length === 0) return 'No change recorded.'
  const shown = lines.slice(0, 6)
  return lines.length > shown.length ? [...shown, `+ ${lines.length - shown.length} more`].join('\n') : shown.join('\n')
}

/**
 * E2 · Publish — versions : à gauche la liste défilante des publications (la plus récente en haut, Live, ✕ Failed),
 * à droite la fiche de la version choisie (Version, Status, Published by, Published at, Changes), « View ↗ » (le
 * déploiement de cette version, avec le contenu d'aujourd'hui) et « Roll back to this version » (Kuartz).
 */
export function VersionsView({ initial, initialError, canRollback }: VersionsViewProps) {
  const router = useRouter()
  const now = useNow()
  const [data, setData] = useState(initial)
  const publications = data?.publications ?? []
  const [selected, setSelected] = useState<number | null>(publications[0]?.number ?? null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [rollbackError, setRollbackError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [rolling, startRollback] = useTransition()
  const listRef = useRef<HTMLUListElement | null>(null)

  const current = publications.find((p) => p.number === selected) ?? publications[0]

  if (initialError || !data) {
    return (
      <Callout
        tone="error"
        role="alert"
        action={
          <Button variant="ghost" size="small" onClick={() => router.refresh()}>
            Try again
          </Button>
        }
      >
        {initialError ?? 'Couldn’t load the versions.'}
      </Callout>
    )
  }

  if (publications.length === 0) {
    return (
      <div className={styles.empty}>
        <EmptyState icon="history" title="No versions yet" description="Each time you publish, a version appears here." />
      </div>
    )
  }

  // Flèches ↑ ↓ (et Home / End) : passent d'une version à l'autre, sans animation.
  const onListKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const index = publications.findIndex((p) => p.number === current?.number)
    let next = -1
    if (event.key === 'ArrowDown') next = Math.min(publications.length - 1, index + 1)
    else if (event.key === 'ArrowUp') next = Math.max(0, index - 1)
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = publications.length - 1
    if (next < 0) return
    event.preventDefault()
    setSelected(publications[next].number)
    listRef.current?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus()
  }

  const confirmRollback = () => {
    if (!current) return
    const number = current.number
    startRollback(async () => {
      const result = await rollbackVersionAction({ number })
      if (!result.ok) {
        setRollbackError(result.message)
        return
      }
      setConfirmOpen(false)
      setDone(`${versionId(result.data)} is live again.`)
      setData((d) =>
        d
          ? {
              ...d,
              publications: d.publications.map((p) =>
                p.number === number ? result.data : p.status === 'live' ? { ...p, status: 'rolled-back' } : p,
              ),
            }
          : d,
      )
      router.refresh()
    })
  }

  const tag = current ? STATUS_TAG[current.status] : null
  const rollbackBlocked = !data.rollback.available

  return (
    <div className={styles.versionsBody}>
      <ul ref={listRef} className={styles.versions} aria-label="Versions" onKeyDown={onListKeyDown}>
        {publications.map((p) => (
          <li key={p.number}>
            <VersionItem
              label={<span suppressHydrationWarning>{versionLabel(p, now)}</span>}
              status={p.status === 'live' ? 'live' : p.status === 'failed' ? 'failed' : undefined}
              selected={p.number === current?.number}
              tabIndex={p.number === current?.number ? 0 : -1}
              onClick={() => {
                setSelected(p.number)
                setDone(null)
              }}
            />
          </li>
        ))}
      </ul>

      {current ? (
        <section className={styles.details} aria-label={`Version ${versionId(current)}`}>
          <DetailRow label="Version" value={versionId(current)} />
          <div className={styles.statusField}>
            <span className={styles.fieldLabel}>Status</span>
            {tag ? (
              <Tag tone={tag.tone} dot={tag.dot}>
                {tag.label}
              </Tag>
            ) : null}
          </div>
          <DetailRow label="Published by" value={current.by} />
          <DetailRow label="Published at" value={<span suppressHydrationWarning>{formatDateTime(current.at)}</span>} />
          <DetailRow label="Changes" value={<span className={styles.changesList}>{publicationChanges(current)}</span>} />
          <div className={styles.spacer} />
          {done ? (
            <Callout tone="success" role="status">
              {done}
            </Callout>
          ) : null}
          <Callout>View opens this version’s code with today’s content.</Callout>
          {current.deployUrl ? (
            <a href={current.deployUrl} target="_blank" rel="noopener noreferrer" className={buttonClassName({ variant: 'secondary', block: true })}>
              <ButtonContent iconRight="external">View</ButtonContent>
              <span className="kz-visually-hidden"> {versionId(current)} (opens in a new tab)</span>
            </a>
          ) : (
            <>
              <Button variant="secondary" block iconRight="external" disabled aria-describedby="version-view-hint">
                View
              </Button>
              <p id="version-view-hint" className={styles.hint}>
                {current.status === 'failed' ? 'This version failed to build: there is nothing to open.' : 'No deployment for this version (local mode).'}
              </p>
            </>
          )}
          {canRollback ? (
            <>
              <div className={styles.rollbackRow}>
                <Button
                  variant="secondary"
                  iconLeft="history"
                  disabled={rollbackBlocked || current.status === 'live' || current.status === 'failed'}
                  aria-describedby={rollbackBlocked ? 'rollback-hint' : undefined}
                  aria-haspopup="dialog"
                  onClick={() => {
                    setRollbackError(null)
                    setConfirmOpen(true)
                  }}
                >
                  Roll back to this version
                </Button>
                <Tag tone="info">KUARTZ</Tag>
              </div>
              {rollbackBlocked ? (
                <p id="rollback-hint" className={styles.hint}>
                  {data.rollback.reason ?? 'Roll back isn’t available in local mode.'}
                </p>
              ) : null}
            </>
          ) : null}
        </section>
      ) : null}

      <Modal
        open={confirmOpen}
        onClose={() => {
          if (!rolling) setConfirmOpen(false)
        }}
        tone="destructive"
        title={current ? `Roll back to ${versionId(current)}?` : 'Roll back?'}
        description="The site’s code goes back to this version with Vercel Instant Rollback. Texts don’t change: restore them separately from the Sanity history if needed."
        confirmLabel="Roll back"
        onConfirm={confirmRollback}
        confirmLoading={rolling}
      >
        {rollbackError ? (
          <Callout tone="error" role="alert">
            {rollbackError}
          </Callout>
        ) : null}
      </Modal>
    </div>
  )
}
