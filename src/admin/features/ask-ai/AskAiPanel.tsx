'use client'

import Link from 'next/link'
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type Ref } from 'react'

import { formatCostShort, formatTokens, formatUsageLine } from '@/admin/core/contracts/format'
import { Button, ButtonContent, buttonClassName } from '@/admin/ui/Button'
import { Callout } from '@/admin/ui/Callout'
import { Icon } from '@/admin/ui/icons'
import { IconButton } from '@/admin/ui/IconButton'
import { ModelUsage } from '@/admin/ui/ModelUsage'
import { AnimatePresence, listItem, motion, useMotionVariants, useReducedMotion } from '@/admin/ui/motion'

import { QUESTION_MAX, type AskTurn } from './conversation'
import type { AskAiInfo } from './info'
import styles from './AskAiPanel.module.css'

/**
 * Panneau Ask AI (Figma G4 `359:2358` + composant « Ask AI panel » `340:1586`) : 360 px, bg/elevated, Elevation/Popover.
 * En-tête « Ask AI » + modèle (logo Claude + « Haiku 4.5 ») + ✕ ; « Questions only — it doesn’t change anything. » ;
 * fil (question en Message, réponse, liens « Open Media ↗ », consommation) ; champ « Ask about this site… » + envoyer
 * (⌘ ↵) ; pied « This month: … » + « Usage ↗ ». Présentation + clavier : l'état vient de useAskConversation.
 */

export const ASK_AI_TEXT = {
  title: 'Ask AI',
  help: 'Questions only — it doesn’t change anything.',
  placeholder: 'Ask about this site…',
  send: 'Send',
  close: 'Close Ask AI',
  thinking: 'Thinking…',
  retry: 'Try again',
  usage: 'Usage',
  loading: 'Loading…',
  inputLabel: 'Question for Ask AI',
  inputHint: `Up to ${QUESTION_MAX} characters. Press Command or Control and Enter to send.`,
} as const

const USAGE_HREF = '/admin/settings/usage'
const MAX_INPUT_HEIGHT = 120

export type AskAiPanelProps = {
  turns: readonly AskTurn[]
  info: AskAiInfo | null
  pending: boolean
  onSend: (text: string) => boolean
  onRetry: (id: string) => void
  onClose: () => void
  inputRef?: Ref<HTMLTextAreaElement>
  panelRef?: Ref<HTMLDivElement>
}

function isSendShortcut(event: KeyboardEvent<HTMLTextAreaElement>): boolean {
  return event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && !event.nativeEvent.isComposing
}

/**
 * Pied « This month: 1.2M input · 147k output · $4.80 » : coût FACTURÉ ; ce qui est passé par l'abonnement Claude
 * s'affiche « Included » (« $0.10 + included » avec du facturé), le détail dans l'infobulle.
 */
function monthLine(info: AskAiInfo | null): { text: string; title?: string } | null {
  if (!info) return { text: `This month: ${ASK_AI_TEXT.loading}` }
  if (!info.ok || !info.month) return null
  const m = { ...info.month, includedUsd: info.month.includedUsd ?? 0 }
  return {
    text: `This month: ${formatTokens(m.inputTokens)} input · ${formatTokens(m.outputTokens)} output · ${formatCostShort(m)}`,
    title: `This month: ${formatUsageLine(m)}`,
  }
}

export function AskAiPanel({ turns, info, pending, onSend, onRetry, onClose, inputRef, panelRef }: AskAiPanelProps) {
  const titleId = useId()
  const helpId = useId()
  const hintId = useId()
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const logRef = useRef<HTMLDivElement | null>(null)
  const reduced = useReducedMotion()
  const itemVariants = useMotionVariants(listItem)

  const ready = !!info?.ok
  const canSend = ready && !pending && text.trim().length > 0
  // Comme le Figma, le bouton reste bleu quand le champ est vide : il ne fait alors que remettre le focus dans le champ.
  const sendDisabled = !ready || pending
  const model = info?.ok ? info.model : null
  const month = monthLine(info)

  // Champ qui grandit avec le texte (1 ligne → 120 px, puis défilement).
  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_HEIGHT)}px`
  }, [text])

  // Nouveau message ou réponse : le fil descend en bas.
  const last = turns.at(-1)
  const lastKey = last ? `${last.id}:${last.status}` : ''
  useEffect(() => {
    const el = logRef.current
    if (!el || !lastKey) return
    el.scrollTo({ top: el.scrollHeight, behavior: reduced ? 'auto' : 'smooth' })
  }, [lastKey, reduced])

  const submit = () => {
    if (!canSend) {
      textareaRef.current?.focus()
      return
    }
    if (onSend(text)) setText('')
  }

  const setRefs = (el: HTMLTextAreaElement | null) => {
    textareaRef.current = el
    if (typeof inputRef === 'function') inputRef(el)
    else if (inputRef) inputRef.current = el
  }

  return (
    <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="false" aria-labelledby={titleId} aria-describedby={helpId} className={styles.panel} data-ask-ai-panel="">
      <div className={styles.header}>
        <Icon name="ai" size={16} set={18} className={styles.headerIcon} />
        <h2 id={titleId} className={styles.title}>
          {ASK_AI_TEXT.title}
        </h2>
        {model ? <ModelUsage model={model} size="small" showUsage={false} /> : null}
        <IconButton icon="close" label={ASK_AI_TEXT.close} size="small" onClick={onClose} />
      </div>
      <p id={helpId} className={styles.help}>
        {ASK_AI_TEXT.help}
      </p>

      {turns.length ? (
        <div ref={logRef} role="log" aria-live="polite" aria-relevant="additions text" aria-label="Conversation" className={styles.log}>
          <AnimatePresence initial={false}>
            {turns.map((turn) => (
              <motion.div key={turn.id} className={styles.turn} variants={itemVariants} initial="initial" animate="animate" exit="exit">
                <p className={styles.question}>{turn.question}</p>
                <TurnBody turn={turn} onRetry={onRetry} canRetry={ready && !pending} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ) : null}

      {info && !info.ok ? (
        <Callout tone="error" role="alert">
          {info.error}
        </Callout>
      ) : null}

      <div className={styles.input} data-disabled={!ready || undefined}>
        <textarea
          ref={setRefs}
          className={styles.textarea}
          rows={1}
          value={text}
          maxLength={QUESTION_MAX}
          placeholder={info ? ASK_AI_TEXT.placeholder : ASK_AI_TEXT.loading}
          aria-label={ASK_AI_TEXT.inputLabel}
          aria-describedby={hintId}
          disabled={!ready}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (isSendShortcut(event)) {
              event.preventDefault()
              submit()
            }
          }}
        />
        <span id={hintId} className="kz-visually-hidden">
          {ASK_AI_TEXT.inputHint}
        </span>
        <IconButton
          icon="send"
          label={ASK_AI_TEXT.send}
          variant="primary"
          size="small"
          shortcut="⌘ ↵"
          tooltipPlacement="top"
          disabled={sendDisabled}
          loading={pending}
          onClick={submit}
        />
      </div>

      <div className={styles.footer}>
        <span className={styles.month} title={month?.title}>
          {month?.text}
        </span>
        <Link href={USAGE_HREF} className={buttonClassName({ variant: 'ghost', size: 'small' })}>
          <ButtonContent size="small" iconRight="external">
            {ASK_AI_TEXT.usage}
          </ButtonContent>
        </Link>
      </div>
    </div>
  )
}

function TurnBody({ turn, onRetry, canRetry }: { turn: AskTurn; onRetry: (id: string) => void; canRetry: boolean }) {
  if (turn.status === 'pending') {
    return (
      <p className={styles.thinking} role="status">
        <Icon name="loader" size={12} set={18} spin />
        {ASK_AI_TEXT.thinking}
      </p>
    )
  }
  if (turn.status === 'error') {
    return (
      <Callout
        tone="error"
        action={
          <Button variant="ghost" size="small" disabled={!canRetry} onClick={() => onRetry(turn.id)}>
            {ASK_AI_TEXT.retry}
          </Button>
        }
      >
        {turn.error}
      </Callout>
    )
  }
  return (
    <>
      <p className={styles.answer}>{turn.answer}</p>
      {turn.links?.length ? (
        <div className={styles.links}>
          {turn.links.map((link) => (
            <Link key={link.href} href={link.href} className={buttonClassName({ variant: 'ghost', size: 'small' })}>
              <ButtonContent size="small" iconRight="external">
                {link.label}
              </ButtonContent>
            </Link>
          ))}
        </div>
      ) : null}
      {turn.usage ? <ModelUsage usage={turn.usage} size="small" showModel={false} className={styles.cost} /> : null}
    </>
  )
}
