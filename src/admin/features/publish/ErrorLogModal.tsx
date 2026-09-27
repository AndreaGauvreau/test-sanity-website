'use client'

import type { PublishRun } from '@/admin/core/contracts/engine'
import { Button, Callout, CodeBlock, Modal } from '@/admin/ui'

import styles from './publish.module.css'

export type ErrorLogModalProps = {
  open: boolean
  onClose: () => void
  /** Erreur de la publication en échec (`run.error`). */
  error: PublishRun['error'] | undefined
  onRetry: () => void
  retrying?: boolean
  /** Message d'échec du Retry lui-même. */
  retryError?: string | null
}

/**
 * « See error » (G3, état 5) : le détail de l'échec (message du moteur + journal du build) et Retry.
 * Le journal est rendu en texte (CodeBlock, jamais de HTML) : il vient d'un build, donc du code du site.
 */
export function ErrorLogModal({ open, onClose, error, onRetry, retrying, retryError }: ErrorLogModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      width={640}
      title="Publish failed"
      description="The previous version is still live. Fix the problem or ask Kuartz, then retry: the publish resumes from the step that failed."
      footer={
        <>
          <Button variant="secondary" size="small" onClick={onClose}>
            Close
          </Button>
          <Button variant="danger" size="small" iconLeft="warning" loading={retrying} onClick={onRetry}>
            Retry
          </Button>
        </>
      }
    >
      <Callout tone="error">{error?.message ?? 'The engine didn’t say what went wrong.'}</Callout>
      {error?.log ? (
        <CodeBlock
          className={styles.log}
          label="Build log"
          readOnly
          readOnlyNote="Read only"
          highlight={false}
          value={error.log}
        />
      ) : null}
      {retryError ? (
        <Callout tone="error" role="alert">
          {retryError}
        </Callout>
      ) : null}
    </Modal>
  )
}
