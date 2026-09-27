'use client'

import { Button } from '@/admin/ui'
import styles from './ReviewBar.module.css'

export type ReviewBarProps = {
  /** Décision en cours (magasin `deciding`) : les deux boutons sont bloqués, celui qui tourne montre son loader. */
  busy: 'validate' | 'cancel' | null
  onValidate: () => void
  onCancel: () => void
}

/**
 * Barre flottante en haut de l'aperçu quand une modification attend (D3) : « Modified by Claude · to validate »,
 * Cancel, ✓ Validate. Le même choix existe dans la sidebar (« 1 change to validate », editor-sidebar), qui fait
 * l'appel au moteur et affiche l'erreur éventuelle : la barre n'a pas de message à elle.
 */
export function ReviewBar({ busy, onValidate, onCancel }: ReviewBarProps) {
  return (
    <div role="region" aria-label="Preview change to validate" className={styles.bar}>
      <p className={styles.label}>Modified by Claude · to validate</p>
      <Button variant="secondary" size="small" onClick={onCancel} loading={busy === 'cancel'} disabled={busy === 'validate'}>
        Cancel
      </Button>
      <Button variant="primary" size="small" iconLeft="check" onClick={onValidate} loading={busy === 'validate'} disabled={busy === 'cancel'}>
        Validate
      </Button>
    </div>
  )
}
