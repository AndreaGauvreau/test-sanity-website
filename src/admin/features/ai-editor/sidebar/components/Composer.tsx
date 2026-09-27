'use client'

import { useId, type FormEvent, type KeyboardEvent, type Ref } from 'react'
import type { ElementTarget, Scope } from '@/admin/core/contracts'
import { Button, Chip, Kbd, useShortcutLabel } from '@/admin/ui'
import { NOTE_MAX, OTHER_ANSWER_MAX, targetKey, UI, visibleLength, type ComposerState } from '../machine'
import { ElementChip } from './ElementChip'
import styles from './Composer.module.css'

const PLACEHOLDER: Record<ComposerState, string> = {
  empty: UI.placeholderEmpty,
  ready: UI.placeholderReady,
  multi: UI.placeholderReady,
  working: UI.placeholderWorking,
  waiting: UI.placeholderWaiting,
  adjust: UI.placeholderAdjust,
  answer: UI.placeholderOther,
}

const LABEL: Record<ComposerState, string> = {
  empty: 'Describe the change',
  ready: 'Describe the change',
  multi: 'Describe the change',
  working: 'Describe the change',
  waiting: 'Describe the change',
  adjust: 'Adjust this change',
  answer: 'Your answer to Claude',
}

export type ComposerProps = {
  state: ComposerState
  /** Puces : sélection (ready / multi) ou éléments de la modification en attente (adjust). */
  targets: readonly ElementTarget[]
  /** ✕ d'une puce (ready / multi seulement : les éléments d'un ajustement sont ceux de la modification). */
  onRemoveTarget?: (target: ElementTarget) => void
  scope: readonly Scope[]
  onScopeChange: (scope: Scope, on: boolean) => void
  value: string
  onValueChange: (value: string) => void
  onSubmit: () => void
  /** Apply actif (calculé par machine.canApply). */
  canApply: boolean
  submitting?: boolean
  /** Échap dans le champ (« Other answer… » : retour aux options). */
  onEscape?: () => void
  /** Message d'erreur (role=alert) ou note (role=status) sous le champ. */
  error?: string | null
  note?: string | null
  textareaRef?: Ref<HTMLTextAreaElement>
}

/**
 * Champ de l'éditeur IA (Figma « Composer », 6 états + « answer ») : puces des éléments (✕ pour retirer), portée
 * Style / Text (rien de coché par défaut, au moins une), texte (600 caractères ; 300 pour une réponse libre),
 * « ⌘ ↵ to apply » et Apply. Inactif quand rien n'est sélectionné, pendant le travail et pendant une question.
 */
export function Composer({
  state,
  targets,
  onRemoveTarget,
  scope,
  onScopeChange,
  value,
  onValueChange,
  onSubmit,
  canApply,
  submitting = false,
  onEscape,
  error,
  note,
  textareaRef,
}: ComposerProps) {
  const id = useId()
  const kbd = useShortcutLabel({ key: 'Enter', mod: true })
  const editable = state === 'ready' || state === 'multi' || state === 'adjust' || state === 'answer'
  const showTargets = (state === 'ready' || state === 'multi' || state === 'adjust') && targets.length > 0
  const showScope = state === 'ready' || state === 'multi'
  const max = state === 'answer' ? OTHER_ANSWER_MAX : NOTE_MAX
  const length = visibleLength(value)
  const showCount = editable && length > max * 0.8
  const describedBy = [error ? `${id}-error` : null, note ? `${id}-note` : null, showCount ? `${id}-count` : null]
    .filter(Boolean)
    .join(' ')

  const submit = (event?: FormEvent) => {
    event?.preventDefault()
    if (canApply && !submitting) onSubmit()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.nativeEvent.isComposing) {
      event.preventDefault()
      submit()
    } else if (event.key === 'Escape' && onEscape) {
      event.preventDefault()
      event.stopPropagation()
      onEscape()
    }
  }

  return (
    <form className={styles.composer} data-state={state} onSubmit={submit} aria-busy={submitting || undefined} noValidate>
      {showTargets || showScope ? (
        <div className={styles.selection}>
          {showTargets ? (
            <ul className={styles.elements} aria-label="Selected elements">
              {targets.map((target) => (
                <li key={targetKey(target)}>
                  <ElementChip
                    label={target.label}
                    onRemove={state !== 'adjust' && onRemoveTarget ? () => onRemoveTarget(target) : undefined}
                    disabled={submitting}
                  />
                </li>
              ))}
            </ul>
          ) : null}
          {showScope ? (
            <div className={styles.scope} role="group" aria-label="What Claude may change">
              <Chip icon="style" pressed={scope.includes('style')} onPressedChange={(on) => onScopeChange('style', on)} disabled={submitting}>
                Style
              </Chip>
              <Chip icon="text" pressed={scope.includes('text')} onPressedChange={(on) => onScopeChange('text', on)} disabled={submitting}>
                Text
              </Chip>
            </div>
          ) : null}
        </div>
      ) : null}

      <label htmlFor={`${id}-text`} className="kz-visually-hidden">
        {LABEL[state]}
      </label>
      <textarea
        ref={textareaRef}
        id={`${id}-text`}
        className={styles.text}
        value={editable ? value : ''}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={PLACEHOLDER[state]}
        disabled={!editable}
        readOnly={submitting}
        maxLength={max * 2}
        rows={1}
        aria-invalid={length > max || undefined}
        aria-describedby={describedBy || undefined}
        spellCheck
      />

      {error ? (
        <p id={`${id}-error`} role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
      {note ? (
        <p id={`${id}-note`} role="status" className={styles.note}>
          {note}
        </p>
      ) : null}

      <div className={styles.footer}>
        <Kbd aria-hidden="true">{kbd}</Kbd>
        <span className={styles.hint} aria-hidden="true">
          {UI.toApply}
        </span>
        {showCount ? (
          <span id={`${id}-count`} className={styles.count} data-over={length > max || undefined}>
            {length}/{max}
          </span>
        ) : null}
        <Button type="submit" variant="primary" size="small" disabled={!canApply} loading={submitting} aria-keyshortcuts="Meta+Enter Control+Enter">
          {UI.apply}
        </Button>
      </div>
    </form>
  )
}
