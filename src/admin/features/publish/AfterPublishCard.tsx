import type { ReactNode } from 'react'

import { Icon, type IconName } from '@/admin/ui'

import type { AfterPublishStep, ChecklistState } from './steps'
import styles from './publish.module.css'

const ICONS: Record<ChecklistState, IconName> = {
  todo: 'pending',
  running: 'loader',
  done: 'success',
  skipped: 'minus',
  failed: 'error',
}

/** Nom lu par les lecteurs d'écran pour l'état d'une étape. */
const STATE_LABEL: Record<ChecklistState, string> = {
  todo: 'To do',
  running: 'In progress',
  done: 'Done',
  skipped: 'Skipped',
  failed: 'Failed',
}

/**
 * Checklist item (Figma « Checklist item », absent du kit : composé ici) : icône 18 + titre (Body) + description
 * (Body Small, tertiaire). L'icône est reposée (clé = état) à chaque changement : petite entrée 150 ms (CSS).
 */
export function ChecklistItem({ step, action }: { step: AfterPublishStep; action?: ReactNode }) {
  return (
    <li className={styles.check} data-state={step.state} aria-current={step.state === 'running' ? 'step' : undefined}>
      <span key={step.state} className={styles.checkIcon}>
        <Icon name={ICONS[step.state]} size={18} spin={step.state === 'running'} />
      </span>
      <span className={styles.checkText}>
        <span className={styles.checkTitle}>
          <span className="kz-visually-hidden">{STATE_LABEL[step.state]}: </span>
          {step.title}
        </span>
        <span className={styles.checkDescription}>{step.description}</span>
        {action ? <span className={styles.checkAction}>{action}</span> : null}
      </span>
    </li>
  )
}

/** Carte « After “Publish” » de E1 : les 4 étapes, avec l'état de la publication en cours. */
export function AfterPublishCard({ steps, failedAction }: { steps: AfterPublishStep[]; failedAction?: ReactNode }) {
  return (
    <section className={styles.card} aria-labelledby="after-publish-title">
      <h2 id="after-publish-title" className={styles.cardTitle}>
        After “Publish”
      </h2>
      <ol className={styles.checklist}>
        {steps.map((step) => (
          <ChecklistItem key={step.step} step={step} action={step.state === 'failed' ? failedAction : undefined} />
        ))}
      </ol>
    </section>
  )
}
