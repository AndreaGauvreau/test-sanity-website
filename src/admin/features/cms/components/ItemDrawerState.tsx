'use client'

import { useParams, useRouter } from 'next/navigation'
import { useState } from 'react'

import { Button, Drawer, EmptyState, ProgressBar, duration, useReducedMotion } from '@/admin/ui'

import styles from './ItemDrawer.module.css'

/**
 * États du panneau C4 hors fiche : chargement (loading.tsx), élément introuvable (not-found.tsx), erreur
 * (error.tsx). Le panneau s'ouvre tout de suite par-dessus la liste ; ✕ / Échap / voile ramènent à la liste.
 */
export function ItemDrawerState({ kind, onRetry }: { kind: 'loading' | 'not-found' | 'error'; onRetry?: () => void }) {
  const router = useRouter()
  const params = useParams<{ collectionId: string }>()
  const reduced = useReducedMotion()
  const [open, setOpen] = useState(true)
  const listHref = `/admin/cms/${params?.collectionId ?? ''}`

  const close = () => {
    setOpen(false)
    setTimeout(() => router.push(listHref, { scroll: false }), reduced ? 0 : duration.overlay * 800)
  }

  return (
    <Drawer open={open} onClose={close} title={kind === 'loading' ? 'Loading…' : kind === 'not-found' ? 'Not found' : 'Something went wrong'}>
      {kind === 'loading' ? (
        <div className={styles.loading} role="status" aria-live="polite">
          <ProgressBar label="Loading item" />
          <span className="kz-visually-hidden">Loading item…</span>
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className={styles.row} aria-hidden="true">
              <span className={styles.label} />
              <span className={styles.control} />
            </div>
          ))}
        </div>
      ) : kind === 'not-found' ? (
        <EmptyState
          className={styles.state}
          icon="search"
          title="This item no longer exists"
          description="It may have been deleted. Go back to the list to see the current items."
          action={
            <Button variant="secondary" size="small" onClick={close}>
              Back to the list
            </Button>
          }
        />
      ) : (
        <EmptyState
          role="alert"
          className={styles.state}
          icon="error"
          title="This item couldn't be loaded"
          description="Nothing was changed. Try again — if it keeps happening, contact Kuartz."
          action={
            <Button variant="secondary" size="small" iconLeft="replace" onClick={() => onRetry?.()}>
              Try again
            </Button>
          }
        />
      )}
    </Drawer>
  )
}
