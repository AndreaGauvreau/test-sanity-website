import Link from 'next/link'
import type { Usage } from '@/admin/core/contracts'
import { Button, ButtonContent, buttonClassName, ModelUsage } from '@/admin/ui'
import styles from './EditorHeader.module.css'

/** Faux Claude (moteur simulé / mode auto) : repéré par son libellé ou son id, signalé visiblement. */
export function isFakeModel(model: { id: string; label?: string | null }): boolean {
  return /fake/i.test(model.label ?? '') || /fake/i.test(model.id)
}

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
  /** Modèle de la conversation tel que fourni par le moteur (null pendant le chargement). Le libellé du moteur
   *  prime sur l'id (ex. « Fake Claude (auto) — no real call » quand le faux Claude est actif). */
  model: { id: string; label?: string | null } | null
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
        {model ? (
          model.label ? (
            <>
              <span className={styles.model} data-fake={isFakeModel(model) ? 'true' : undefined} title={model.label}>
                {model.label}
              </span>
              <ModelUsage model={model.id} usage={usage} size="small" showModel={false} />
            </>
          ) : (
            <ModelUsage model={model.id} usage={usage} size="small" />
          )
        ) : (
          <span className={styles.placeholder} aria-hidden="true" />
        )}
      </div>
    </header>
  )
}
