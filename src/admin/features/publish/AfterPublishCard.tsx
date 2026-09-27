import type { ReactNode } from 'react'

import { ChecklistItem } from '@/admin/ui'

import type { AfterPublishStep } from './steps'
import styles from './publish.module.css'

/**
 * Carte « After “Publish” » de E1 : les 4 étapes (`ChecklistItem` du kit), avec l'état de la publication en cours.
 * L'action (« See error ») n'est posée que sur l'étape en échec.
 */
export function AfterPublishCard({ steps, failedAction }: { steps: AfterPublishStep[]; failedAction?: ReactNode }) {
  return (
    <section className={styles.card} aria-labelledby="after-publish-title">
      <h2 id="after-publish-title" className={styles.cardTitle}>
        After “Publish”
      </h2>
      <ol className={styles.checklist}>
        {steps.map((step) => (
          <ChecklistItem
            key={step.step}
            state={step.state}
            title={step.title}
            description={step.description}
            action={step.state === 'failed' ? failedAction : undefined}
          />
        ))}
      </ol>
    </section>
  )
}
