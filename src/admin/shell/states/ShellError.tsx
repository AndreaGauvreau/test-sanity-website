'use client'

import { useEffect } from 'react'

import { Button, ContentArea, EmptyState } from '@/admin/ui'

import styles from './ShellStates.module.css'

export const ERROR_TITLE = 'Something went wrong'
export const ERROR_DESCRIPTION = "This screen couldn't be loaded. Nothing was changed. Try again — if it keeps happening, contact Kuartz."

/**
 * Erreur d'un écran de la coque (error.tsx du groupe (shell)) : message anglais + « Try again » (retry de Next 16 :
 * refait la requête serveur puis le rendu). La référence (digest) permet de retrouver l'erreur dans les logs du
 * serveur ; le message technique n'est jamais affiché (en production Next le remplace de toute façon).
 */
export function ShellError({ error, retry, standalone = false }: { error: Error & { digest?: string }; retry: () => void; standalone?: boolean }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  const body = (
    <EmptyState
      role="alert"
      icon="error"
      title={ERROR_TITLE}
      description={
        <>
          {ERROR_DESCRIPTION}
          {error.digest ? (
            <>
              <br />
              <span className={styles.reference}>Reference: {error.digest}</span>
            </>
          ) : null}
        </>
      }
      action={
        <Button variant="secondary" size="small" iconLeft="replace" onClick={() => retry()}>
          Try again
        </Button>
      }
    />
  )

  if (standalone) return <div className={styles.standalone}>{body}</div>
  return (
    <ContentArea gap={24}>
      <div className={styles.center}>{body}</div>
    </ContentArea>
  )
}
