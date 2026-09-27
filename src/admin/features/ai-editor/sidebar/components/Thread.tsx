'use client'

import type { ReactNode } from 'react'
import type { EditJob, PendingChange, Question, ThreadEntry } from '@/admin/core/contracts'
import { AnimatePresence, Button, list, listItem, ModelUsage, motion, slideUp, useMotionVariants } from '@/admin/ui'
import {
  checksLine,
  checksSpoken,
  hardcodedLabel,
  headerView,
  isActive,
  latestJobIndex,
  stepView,
  summaryNeedsTarget,
  summaryText,
  UI,
  validatedText,
  type AnswerPick,
} from '../machine'
import { AnswerOption } from './AnswerOption'
import { ClaudeHeader } from './ClaudeHeader'
import { Message } from './Message'
import { ReviewCard } from './ReviewCard'
import { Step } from './Step'
import styles from './Thread.module.css'

export type ThreadProps = {
  thread: readonly ThreadEntry[]
  /** Modification en attente de CETTE page (carte « 1 change to validate » sous sa dernière demande). */
  pending: PendingChange | null
  deciding: 'validate' | 'cancel' | null
  picks: Readonly<Record<string, AnswerPick>>
  /** Question dont la réponse libre est en cours dans le Composer (« Other answer… » pressé). */
  answeringOther: string | null
  answering: boolean
  stopping: boolean
  onPick: (question: Question, optionId: string) => void
  onOther: (question: Question) => void
  onStop: () => void
  onValidate: () => void
  onCancel: () => void
  /** Bandeau d'erreur de sondage (« Lost contact… ») sous la dernière demande. */
  notice?: ReactNode
}

/**
 * Fil de la conversation (G2) : se lit comme une messagerie, du plus ancien au plus récent, calé en bas.
 * La dernière demande est détaillée ; les précédentes sont repliées sur une ligne (durée, tokens et coût gardés).
 */
export function Thread(props: ThreadProps) {
  const { thread } = props
  const item = useMotionVariants(listItem)
  const latest = latestJobIndex(thread)
  if (!thread.length) {
    return (
      <div className={styles.thread}>
        <ClaudeHeader state="ready" status={UI.ready} help={UI.readyHelp} />
      </div>
    )
  }
  return (
    <ol className={styles.thread} aria-label="Conversation with Claude">
      <AnimatePresence initial={false}>
        {thread.map((entry, index) => (
          <motion.li key={entryKey(entry)} className={styles.entry} variants={item} initial="initial" animate="animate" exit="exit">
            {entry.type === 'job' ? (
              index === latest ? (
                <LatestJob job={entry.job} {...props} />
              ) : (
                <CollapsedJob job={entry.job} />
              )
            ) : entry.type === 'validated' ? (
              <Step kind="validated">{validatedText(entry.pendingTotal)}</Step>
            ) : (
              <Step kind="stopped">{UI.cancelledStep}</Step>
            )}
          </motion.li>
        ))}
      </AnimatePresence>
      {props.notice ? <li className={styles.entry}>{props.notice}</li> : null}
    </ol>
  )
}

function entryKey(entry: ThreadEntry): string {
  return entry.type === 'job' ? `job:${entry.job.id}` : `${entry.type}:${entry.changeId}:${entry.at}`
}

function JobMessage({ job }: { job: EditJob }) {
  return job.kind === 'adjustment' ? (
    <Message type="adjustment" text={job.request.note} />
  ) : (
    <Message type="request" targets={job.request.targets} text={job.request.note} />
  )
}

/** Demande précédente : message + une ligne de fin. */
function CollapsedJob({ job }: { job: EditJob }) {
  const view = headerView(job)
  return (
    <div className={styles.group}>
      <JobMessage job={job} />
      {job.status === 'done' ? (
        <Step kind="done" trailing={job.usage ? <ModelUsage usage={job.usage} size="small" showModel={false} /> : null}>
          {view.status}
        </Step>
      ) : job.status === 'rejected' ? (
        <Step kind="log">{job.message || view.status}</Step>
      ) : job.status === 'failed' ? (
        <Step kind="error">{UI.failedStep}</Step>
      ) : job.status === 'stopped' ? (
        <Step kind="stopped">{UI.stoppedStep}</Step>
      ) : (
        <Step kind="log">{view.status}</Step>
      )}
    </div>
  )
}

function StopRow({ onStop, stopping }: { onStop: () => void; stopping: boolean }) {
  return (
    <div className={styles.stopRow}>
      <Button variant="secondary" size="small" iconLeft="stop" onClick={onStop} loading={stopping}>
        {UI.stop}
      </Button>
    </div>
  )
}

function LatestJob({ job, ...props }: ThreadProps & { job: EditJob }) {
  const view = headerView(job)
  const cardIn = useMotionVariants(slideUp)
  const options = useMotionVariants(list)
  const optionItem = useMotionVariants(listItem)
  const showReview = !!props.pending && props.pending.id === job.changeId && props.pending.status === 'to-validate'

  if (job.status === 'stopped' || job.status === 'failed') {
    return (
      <div className={styles.group}>
        <JobMessage job={job} />
        {job.status === 'stopped' ? <Step kind="stopped">{UI.stoppedStep}</Step> : <Step kind="error">{UI.failedStep}</Step>}
        {job.status === 'failed' && job.error ? <p className={styles.detail}>{job.error}</p> : null}
      </div>
    )
  }

  const prefix = summaryNeedsTarget(job.summary)
  const checks = checksLine(job.checks)
  return (
    <div className={styles.group}>
      <JobMessage job={job} />
      <ClaudeHeader state={view.state} status={view.status} usage={job.usage} />

      {isActive(job) && job.status !== 'waiting'
        ? job.steps.map((step, i) => {
            const s = stepView(step)
            return (
              <Step key={`${step.at}-${i}`} kind={s.kind}>
                {s.text}
              </Step>
            )
          })
        : null}

      {job.status === 'waiting' && job.question
        ? job.question.questions.map((question) => (
            <div key={question.id} className={styles.question} role="group" aria-labelledby={`q-${job.id}-${question.id}`}>
              <p id={`q-${job.id}-${question.id}`} className={styles.questionText}>
                {question.topic && job.question!.questions.length > 1 ? <span className={styles.topic}>{question.topic} · </span> : null}
                {question.question}
              </p>
              <motion.div className={styles.options} variants={options} initial="initial" animate="animate">
                {question.options.map((option) => {
                  const pick = props.picks[question.id]
                  return (
                    <motion.div key={option.id} variants={optionItem}>
                      <AnswerOption
                        kind={option.tone}
                        label={option.label}
                        description={option.description}
                        hardcoded={hardcodedLabel(option)}
                        selected={!!pick && 'optionId' in pick && pick.optionId === option.id}
                        disabled={props.answering}
                        onSelect={() => props.onPick(question, option.id)}
                      />
                    </motion.div>
                  )
                })}
                <motion.div variants={optionItem}>
                  <AnswerOption
                    kind="other"
                    label={UI.otherAnswer}
                    selected={props.answeringOther === question.id || (!!props.picks[question.id] && 'other' in props.picks[question.id])}
                    disabled={props.answering}
                    onSelect={() => props.onOther(question)}
                  />
                </motion.div>
              </motion.div>
            </div>
          ))
        : null}

      {job.status === 'done' || job.status === 'rejected' ? (
        <>
          {job.message ? <p className={styles.message}>{job.message}</p> : null}
          {job.summary.map((item, i) => (
            <Step key={`summary-${i}`} kind="change">
              {summaryText(item, prefix)}
            </Step>
          ))}
          {job.hardcoded.map((h, i) => (
            <Step key={`hard-${i}`} kind="log">
              {`Hard-coded value: ${h.property}: ${h.value} (flagged to Kuartz)`}
            </Step>
          ))}
          {checks ? (
            <Step kind="log" label={checksSpoken(job.checks)}>
              {checks}
            </Step>
          ) : null}
        </>
      ) : null}

      {isActive(job) ? <StopRow onStop={props.onStop} stopping={props.stopping} /> : null}

      <AnimatePresence initial={false}>
        {showReview ? (
          <motion.div key="review" variants={cardIn} initial="initial" animate="animate" exit="exit">
            <ReviewCard
              adjustments={props.pending!.adjustments}
              deciding={props.deciding}
              onCancel={props.onCancel}
              onValidate={props.onValidate}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
