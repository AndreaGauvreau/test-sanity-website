import type { HTMLAttributes, ReactNode, Ref } from 'react'
import { Icon, type IconName } from '../icons'
import { cx } from '../utils/cx'
import styles from './ChecklistItem.module.css'

/** État d'une étape : à faire, en cours, faite, sautée, en échec. */
export type ChecklistState = 'todo' | 'running' | 'done' | 'skipped' | 'failed'

const ICONS: Record<ChecklistState, IconName> = {
  todo: 'pending',
  running: 'loader',
  done: 'success',
  skipped: 'minus',
  failed: 'error',
}

/** Préfixe lu par les lecteurs d'écran avant le titre (« Done: Merged »). */
export const CHECKLIST_STATE_LABELS: Record<ChecklistState, string> = {
  todo: 'To do',
  running: 'In progress',
  done: 'Done',
  skipped: 'Skipped',
  failed: 'Failed',
}

export type ChecklistItemProps = Omit<HTMLAttributes<HTMLElement>, 'children' | 'title'> & {
  /** État (défaut « todo », Figma state=todo). */
  state?: ChecklistState
  /** Titre (Body, text/primary ; text/tertiary quand l'étape est sautée). */
  title: ReactNode
  /** Description (Body Small, text/tertiary ; interactive/danger en échec). */
  description?: ReactNode
  /** Action sous la description (Figma « Show action ») : « See error », « Retry »… */
  action?: ReactNode
  /** Préfixe lu avant le titre (défaut : CHECKLIST_STATE_LABELS[state]). */
  stateLabel?: string
  /** Élément racine : `li` (défaut, dans un `<ol>` / `<ul>`) ou `div`. */
  as?: 'li' | 'div'
  ref?: Ref<HTMLElement>
}

/**
 * Étape d'une liste de contrôle (Figma « Checklist item », Kuartz hub ; carte « After “Publish” » de E1) :
 * H gap 10, pad 10 0 ; icône 18 (pending / loader qui tourne / success / minus / error) + titre + description.
 * L'étape en cours porte aria-current="step". L'icône est reposée à chaque changement d'état (clé = état) :
 * petite entrée 150 ms en CSS, coupée en mouvement réduit. Composant pur.
 */
export function ChecklistItem({
  state = 'todo',
  title,
  description,
  action,
  stateLabel,
  as: Root = 'li',
  className,
  ref,
  ...rest
}: ChecklistItemProps) {
  return (
    <Root
      ref={ref as Ref<HTMLLIElement & HTMLDivElement>}
      data-state={state}
      aria-current={state === 'running' ? 'step' : undefined}
      className={cx(styles.item, className)}
      {...rest}
    >
      <span key={state} className={styles.icon}>
        <Icon name={ICONS[state]} size={18} spin={state === 'running'} />
      </span>
      <span className={styles.text}>
        <span className={styles.title}>
          <span className="kz-visually-hidden">{stateLabel ?? CHECKLIST_STATE_LABELS[state]}: </span>
          {title}
        </span>
        {description != null ? <span className={styles.description}>{description}</span> : null}
        {action != null ? <span className={styles.action}>{action}</span> : null}
      </span>
    </Root>
  )
}
