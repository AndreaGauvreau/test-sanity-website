import { Button } from '@/admin/ui'
import { reviewTitle, UI } from '../machine'
import styles from './ReviewCard.module.css'

/**
 * Carte de validation (Figma « Review card ») : « 1 change to validate » / « 1 change · adjusted once »,
 * Cancel (annule la demande ET ses ajustements) et ✓ Validate (ajoute la modification à Publish).
 */
export function ReviewCard({
  adjustments,
  deciding,
  disabled,
  onCancel,
  onValidate,
}: {
  adjustments: number
  deciding: 'validate' | 'cancel' | null
  disabled?: boolean
  onCancel: () => void
  onValidate: () => void
}) {
  const title = reviewTitle(adjustments)
  return (
    <section className={styles.card} aria-label={title}>
      <p className={styles.title}>{title}</p>
      <div className={styles.actions}>
        <Button
          variant="secondary"
          size="small"
          onClick={onCancel}
          loading={deciding === 'cancel'}
          disabled={disabled || deciding === 'validate'}
        >
          {UI.cancel}
        </Button>
        <Button
          variant="primary"
          size="small"
          iconLeft="check"
          onClick={onValidate}
          loading={deciding === 'validate'}
          disabled={disabled || deciding === 'cancel'}
        >
          {UI.validate}
        </Button>
      </div>
    </section>
  )
}
