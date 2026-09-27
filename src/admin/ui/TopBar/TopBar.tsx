import type { ElementType, HTMLAttributes, MouseEventHandler, ReactNode, Ref } from 'react'
import type { PublishState } from '@/admin/core/contracts/engine'
import { Button, ButtonContent, buttonClassName } from '../Button'
import { cx } from '../utils/cx'
import styles from './TopBar.module.css'

export type TopBarProps = Omit<HTMLAttributes<HTMLElement>, 'children'> & {
  /** Étape de publication (contrat PublishState ; `failed` = « error » du Figma). */
  state: PublishState
  /** Nombre de changements en attente / en cours de publication (textes pending et publishing). */
  pendingCount?: number
  /** Texte d'état sur mesure (remplace le texte par défaut de l'état). */
  statusText?: ReactNode
  /**
   * Action liée à l'état, posée juste après le texte d'état (et Review) : « See error » en échec (G3 état 5),
   * Button ghost small. Absente : rien n'est rendu.
   */
  statusAction?: ReactNode
  /** Lien « Review › » (page Publish) ; ou `onReview`. Absents : masqué. */
  reviewHref?: string
  onReview?: MouseEventHandler<HTMLElement>
  /** « Draft saved automatically » (Body Small, text/muted) ; `null` pour le masquer. */
  autosaveText?: ReactNode
  /** URL du site publié : bouton « View site ↗ » (nouvel onglet). */
  siteUrl?: string
  /** Emplacement du bouton Publish (`<PublishButton state=… />`, câblé par la feature publish). */
  publish?: ReactNode
  /** Composant de lien (next/link) pour Review. */
  linkAs?: ElementType
  ref?: Ref<HTMLElement>
}

/** Texte d'état par défaut (Figma « Top bar » 333:1407). */
export function topBarStatusText(state: PublishState, count = 0): string {
  const changes = `${count} change${count === 1 ? '' : 's'}`
  switch (state) {
    case 'idle':
      return 'Everything is published.'
    case 'pending':
      return `Unpublished changes: ${count}`
    case 'publishing':
      return count > 0 ? `Publishing ${changes}…` : 'Publishing…'
    case 'published':
      return 'Published just now.'
    case 'failed':
      return 'Publishing failed — nothing was changed.'
  }
}

/**
 * Barre du haut (Figma « Top bar » 333:1407) : 48 px, bg/primary, trait bas border/subtle, pad 0 12 0 16, gap 12.
 * À gauche : point de couleur + état de publication + « Review › » + `statusAction` (« See error ») ; à droite : « Draft saved automatically »,
 * « View site ↗ » et l'emplacement du Publish button. Présentationnelle (composant pur) : l'état vient de la
 * feature publish. Le texte d'état n'est pas une zone live : PublishButton annonce déjà les changements.
 */
export function TopBar({
  state,
  pendingCount = 0,
  statusText,
  statusAction,
  reviewHref,
  onReview,
  autosaveText = 'Draft saved automatically',
  siteUrl,
  publish,
  linkAs,
  className,
  ref,
  ...rest
}: TopBarProps) {
  const Link: ElementType = linkAs ?? 'a'
  return (
    <header ref={ref} data-state={state} className={cx(styles.bar, className)} {...rest}>
      <div className={styles.status}>
        <span className={styles.dot} data-state={state} aria-hidden="true" />
        <span className={styles.statusText}>{statusText ?? topBarStatusText(state, pendingCount)}</span>
        {reviewHref ? (
          <Link href={reviewHref} onClick={onReview} className={buttonClassName({ variant: 'ghost', size: 'small' })}>
            <ButtonContent size="small" iconRight="chevron-right">
              Review
            </ButtonContent>
          </Link>
        ) : onReview ? (
          <Button variant="ghost" size="small" iconRight="chevron-right" onClick={onReview}>
            Review
          </Button>
        ) : null}
        {statusAction != null ? (
          <span className={styles.statusAction} data-status-action="">
            {statusAction}
          </span>
        ) : null}
      </div>
      {autosaveText != null ? <span className={styles.autosave}>{autosaveText}</span> : null}
      {siteUrl ? (
        <a href={siteUrl} target="_blank" rel="noopener noreferrer" className={buttonClassName({ variant: 'secondary', size: 'small' })}>
          <ButtonContent size="small" iconRight="external">
            View site
          </ButtonContent>
          <span className="kz-visually-hidden"> (opens in a new tab)</span>
        </a>
      ) : null}
      {publish}
    </header>
  )
}
