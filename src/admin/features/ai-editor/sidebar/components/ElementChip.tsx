import { Icon } from '@/admin/ui'
import styles from './ElementChip.module.css'

/**
 * Élément sélectionné (Figma « Element chip » : point bleu + « Hero · Title » + ✕ facultatif). Pur.
 * Le ✕ est un vrai bouton nommé « Remove Hero · Title » ; sans `onRemove`, la puce est un simple libellé.
 */
export function ElementChip({ label, onRemove, disabled }: { label: string; onRemove?: () => void; disabled?: boolean }) {
  return (
    <span className={styles.chip} data-removable={onRemove ? '' : undefined}>
      <span className={styles.dot} aria-hidden="true" />
      <span className={styles.label}>{label}</span>
      {onRemove ? (
        <button type="button" className={styles.remove} onClick={onRemove} disabled={disabled} aria-label={`Remove ${label}`}>
          <Icon name="close" size={12} />
        </button>
      ) : null}
    </span>
  )
}
