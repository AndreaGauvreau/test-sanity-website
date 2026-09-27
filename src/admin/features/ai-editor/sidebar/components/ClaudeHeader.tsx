import type { Usage } from '@/admin/core/contracts'
import { Icon, ModelUsage } from '@/admin/ui'
import type { ClaudeHeaderState } from '../machine'
import styles from './ClaudeHeader.module.css'

const ICON_COLOR: Record<ClaudeHeaderState, string> = {
  ready: 'default',
  working: 'primary',
  asking: 'warning',
  done: 'success',
  stopped: 'default',
}

/**
 * En-tête du fil de Claude (Figma « Claude header ») : ✦ Claude + état à droite (Ready, Working… avec loader,
 * Needs your answer, Done · 24 s, Stopped) ; ready → consigne ; done → consommation de la demande. Pur.
 */
export function ClaudeHeader({
  state,
  status,
  help,
  usage,
}: {
  state: ClaudeHeaderState
  status: string
  help?: string
  usage?: Usage | null
}) {
  return (
    <div className={styles.header} data-state={state}>
      <div className={styles.row} data-icon-color={ICON_COLOR[state]}>
        <Icon name="ai" size={16} className={styles.icon} />
        <span className={styles.name}>Claude</span>
        {state === 'working' ? <Icon name="loader" size={12} spin className={styles.spinner} /> : null}
        <span className={styles.status}>{status}</span>
      </div>
      {help ? <p className={styles.help}>{help}</p> : null}
      {state === 'done' && usage ? <ModelUsage usage={usage} size="small" showModel={false} /> : null}
    </div>
  )
}
