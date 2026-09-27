import Link from 'next/link'
import type { Usage } from '@/admin/core/contracts'
import { Button, ButtonContent, buttonClassName, ModelUsage } from '@/admin/ui'
import styles from './EditorHeader.module.css'

/**
 * En-tête de la sidebar Claude (Figma « Editor header ») : « ‹ Admin » (retour à l'écran d'origine), « Publish ↗ »
 * (E1, grisé pendant que Claude travaille — state=locked), puis la consommation cumulée de la conversation.
 */
export function EditorHeader({
  backHref,
  publishHref = '/admin/publish',
  locked,
  model,
  usage,
}: {
  backHref: string
  publishHref?: string
  locked: boolean
  /** Id du modèle de la conversation (null pendant le chargement). */
  model: string | null
  usage: Usage | null
}) {
  return (
    <header className={styles.header} data-state={locked ? 'locked' : 'default'}>
      <div className={styles.top}>
        <Link href={backHref} aria-label="Back to Admin" className={buttonClassName({ variant: 'ghost', size: 'small' })}>
          <ButtonContent size="small" iconLeft="chevron-left">
            Admin
          </ButtonContent>
        </Link>
        <span className={styles.spacer} />
        {locked ? (
          <Button variant="ghost" size="small" iconRight="external" disabled title="Available when Claude has finished">
            Publish
          </Button>
        ) : (
          <Link href={publishHref} className={buttonClassName({ variant: 'ghost', size: 'small' })}>
            <ButtonContent size="small" iconRight="external">
              Publish
            </ButtonContent>
          </Link>
        )}
      </div>
      <div className={styles.usage} aria-label="Conversation usage">
        {model ? <ModelUsage model={model} usage={usage} size="small" /> : <span className={styles.placeholder} aria-hidden="true" />}
      </div>
    </header>
  )
}
