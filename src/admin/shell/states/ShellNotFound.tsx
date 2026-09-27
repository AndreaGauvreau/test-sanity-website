import Link from 'next/link'

import { ButtonContent, ContentArea, EmptyState, buttonClassName } from '@/admin/ui'

import styles from './ShellStates.module.css'

export const NOT_FOUND_TITLE = 'Page not found'
export const NOT_FOUND_DESCRIPTION = "This page doesn't exist, or your role doesn't give access to it."

/**
 * Page introuvable de l'admin : `notFound()` d'un écran (élément de collection supprimé, page absente du manifeste)
 * et refus d'un droit en page (`requireCapability` → 404, pour ne pas révéler une page réservée à Kuartz).
 * `standalone` : hors coque (plein écran), sinon dans la zone de contenu, la sidebar reste utilisable.
 */
export function ShellNotFound({ standalone = false }: { standalone?: boolean }) {
  const body = (
    <EmptyState
      icon="search"
      title={NOT_FOUND_TITLE}
      description={NOT_FOUND_DESCRIPTION}
      action={
        <Link href="/admin" className={buttonClassName({ variant: 'secondary', size: 'small' })}>
          <ButtonContent size="small" iconLeft="chevron-left">
            Back to Overview
          </ButtonContent>
        </Link>
      }
    />
  )
  if (standalone) return <main className={styles.standalone}>{body}</main>
  return (
    <ContentArea gap={24}>
      <div className={styles.center}>{body}</div>
    </ContentArea>
  )
}
