'use client'

import Link from 'next/link'
import { useState, useTransition, type ReactNode } from 'react'

import type { PendingContentItem, PendingDesignItem, PublishStatus } from '@/admin/core/contracts/engine'
import {
  AnimatePresence,
  Button,
  ButtonContent,
  buttonClassName,
  Callout,
  EmptyState,
  ListItem,
  Modal,
  motion,
  Tag,
  useReducedMotion,
  spring,
  transition,
  type IconName,
} from '@/admin/ui'

import { discardChangeAction, unstageChangeAction } from './actions'
import { AfterPublishCard } from './AfterPublishCard'
import { DiffModal } from './DiffModal'
import { ErrorLogModal } from './ErrorLogModal'
import { contentItemMeta, designItemMeta, publishButtonLabel } from './format'
import { contentItemAction, contentItemIcon, DESIGN_ITEM_ICON, designViewHref, viewUrl, type ItemKinds } from './items'
import { afterPublishSteps } from './steps'
import { useNow } from './use-now'
import { usePublishActions } from './use-publish-actions'
import { publishStatusStore, usePublishStatus } from './use-publish-status'
import styles from './publish.module.css'

export type PendingViewProps = {
  /** État lu par le Server Component (null si le moteur n'a pas répondu). */
  initialStatus: PublishStatus | null
  /** Message si la lecture serveur a échoué. */
  initialError: string | null
  /** Kuartz seulement : bouton « ‹/› Diff » (can('publish.diff'), revérifié par la server action). */
  canDiff: boolean
  siteUrl: string
  /** « conduit.com » (étape 4 « Live on conduit.com »). */
  domain: string
  kinds: ItemKinds
}

type DiscardTarget = { kind: 'content'; id: string; label: string } | { kind: 'design'; changeId: string; label: string }

/**
 * E1 · Publish — pending changes. Groupes Content (Sanity · drafts) et Design (git · draft → Vercel), carte
 * « After “Publish” », « Publish N changes ». Même état partagé que la Top bar (une publication lancée ici se suit
 * aussi là-haut, et inversement).
 */
export function PendingView({ initialStatus, initialError, canDiff, siteUrl, domain, kinds }: PendingViewProps) {
  const { status, error: readError } = usePublishStatus(initialStatus)
  const now = useNow()
  const actions = usePublishActions()
  const [discard, setDiscard] = useState<DiscardTarget | null>(null)
  const [discardOpen, setDiscardOpen] = useState(false)
  const [discardError, setDiscardError] = useState<string | null>(null)
  const [discarding, startDiscard] = useTransition()
  const [unstageError, setUnstageError] = useState<string | null>(null)
  const [unstaging, startUnstage] = useTransition()
  const [diff, setDiff] = useState<{ changeId: string; title: string } | null>(null)
  const [diffOpen, setDiffOpen] = useState(false)
  const [logOpen, setLogOpen] = useState(false)
  const reduced = useReducedMotion()

  const loadError = status ? readError : (readError ?? initialError)
  const content = status?.pending.content ?? []
  const design = status?.pending.design ?? []
  const total = status?.pending.total ?? 0
  const state = status?.state
  const publishing = state === 'publishing' || (actions.pending && state === 'pending')
  const failed = state === 'failed'
  const locked = publishing // pas de Discard pendant une publication (le moteur répondrait 409)

  const openDiscard = (target: DiscardTarget) => {
    setDiscard(target)
    setDiscardError(null)
    setDiscardOpen(true)
  }

  const confirmDiscard = () => {
    if (!discard) return
    const input = discard.kind === 'content' ? { kind: 'content' as const, id: discard.id } : { kind: 'design' as const, changeId: discard.changeId }
    startDiscard(async () => {
      const result = await discardChangeAction(input)
      if (result.ok) {
        publishStatusStore.set(result.data)
        setDiscardOpen(false)
      } else {
        setDiscardError(result.message)
        void publishStatusStore.refresh()
      }
    })
  }

  // Annuler un dépublier / supprimer programmé : rien n'est détruit, donc pas de confirmation.
  const unstage = (id: string) => {
    setUnstageError(null)
    startUnstage(async () => {
      const result = await unstageChangeAction({ id })
      if (result.ok) publishStatusStore.set(result.data)
      else {
        setUnstageError(result.message)
        void publishStatusStore.refresh()
      }
    })
  }

  // Rangées : sortie en fondu, les voisines glissent à leur place (layout, transform) ; rien en mouvement réduit.
  const rowMotion = reduced
    ? {}
    : {
        layout: 'position' as const,
        initial: { opacity: 0 },
        animate: { opacity: 1, transition: transition.enter },
        exit: { opacity: 0, transition: transition.exit },
        transition: spring.snappy,
      }

  const group = (title: string, where: string, rows: ReactNode) => (
    <section className={styles.group} aria-label={title}>
      <div className={styles.groupHeader}>
        <h2 className={styles.groupTitle}>{title}</h2>
        <Tag tone="neutral">{where}</Tag>
      </div>
      <ul className={styles.groupList}>
        <AnimatePresence initial={false} mode="popLayout">
          {rows}
        </AnimatePresence>
      </ul>
    </section>
  )

  const contentRow = (item: PendingContentItem) => {
    const href = viewUrl(siteUrl, item.viewPath)
    // Dépublier / supprimer programmé depuis le CMS : tag de l'action, et le bouton l'annule au lieu de Discard.
    const staged = contentItemAction(item)
    return (
      <motion.li key={`c-${item.id}`} {...rowMotion}>
        <ListItem
          className={styles.row}
          textGap={2}
          icon={contentItemIcon(item, kinds)}
          title={item.path}
          subtitle={
            <span className={styles.rowMeta} suppressHydrationWarning>
              {contentItemMeta(item, now)}
            </span>
          }
          tag={staged ? <Tag tone={staged.tone}>{staged.tag}</Tag> : undefined}
          action={
            <span className={styles.rowActions}>
              {href ? <ViewLink href={href} label={item.path} /> : null}
              {staged ? (
                <Button
                  variant="ghost"
                  size="small"
                  disabled={locked || unstaging}
                  aria-label={`${staged.undoLabel}: ${item.path}`}
                  onClick={() => unstage(item.id)}
                >
                  {staged.undoLabel}
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="small"
                  disabled={locked}
                  aria-label={`Discard ${item.path}`}
                  onClick={() => openDiscard({ kind: 'content', id: item.id, label: item.path })}
                >
                  Discard
                </Button>
              )}
            </span>
          }
        />
      </motion.li>
    )
  }

  const designRow = (item: PendingDesignItem) => (
    <motion.li key={`d-${item.changeId}`} {...rowMotion}>
      <ListItem
        className={styles.row}
        textGap={2}
        icon={DESIGN_ITEM_ICON as IconName}
        title={item.title}
        subtitle={
          <span className={styles.rowMeta} suppressHydrationWarning>
            {designItemMeta(item, now)}
          </span>
        }
        tag={canDiff ? <Tag tone="info">KUARTZ</Tag> : undefined}
        action={
          <span className={styles.rowActions}>
            {canDiff ? (
              <Button
                variant="ghost"
                size="small"
                iconLeft="code"
                aria-haspopup="dialog"
                aria-label={`Diff of ${item.title}`}
                onClick={() => {
                  setDiff({ changeId: item.changeId, title: item.title })
                  setDiffOpen(true)
                }}
              >
                Diff
              </Button>
            ) : null}
            <ViewLink href={designViewHref(item)} label={item.title} internal />
            <Button
              variant="ghost"
              size="small"
              disabled={locked}
              aria-label={`Discard ${item.title}`}
              onClick={() => openDiscard({ kind: 'design', changeId: item.changeId, label: item.title })}
            >
              Discard
            </Button>
          </span>
        }
      />
    </motion.li>
  )

  const steps = afterPublishSteps(status, domain)
  const mainButton = failed ? (
    <Button variant="danger" iconLeft="warning" block loading={actions.pending} onClick={() => actions.retry()}>
      Retry
    </Button>
  ) : publishing ? (
    <Button block loading aria-disabled="true">
      Publishing…
    </Button>
  ) : (
    <Button block disabled={total === 0 || !status} onClick={() => actions.publish(status)}>
      {publishButtonLabel(total)}
    </Button>
  )

  return (
    <div className={styles.body}>
      <div className={styles.changes}>
        {loadError ? (
          <Callout
            tone="error"
            role="alert"
            action={
              <Button variant="ghost" size="small" onClick={() => void publishStatusStore.refresh()}>
                Try again
              </Button>
            }
          >
            {loadError}
          </Callout>
        ) : null}
        {unstageError ? (
          <Callout tone="error" role="alert">
            {unstageError}
          </Callout>
        ) : null}
        {!status ? null : total === 0 ? (
          <div className={styles.empty}>
            <EmptyState
              title="Everything is published."
              description="Drafts from Pages, CMS and Settings, and changes validated in the AI editor, appear here until you publish them."
            />
          </div>
        ) : (
          <>
            {content.length > 0 ? group('Content', 'Sanity · drafts', content.map(contentRow)) : null}
            {design.length > 0 ? group('Design', 'git · draft → Vercel', design.map(designRow)) : null}
          </>
        )}
      </div>

      <aside className={styles.aside} aria-label="Publish all changes">
        <AfterPublishCard
          steps={steps}
          failedAction={
            status?.run?.error ? (
              <Button variant="ghost" size="small" aria-haspopup="dialog" onClick={() => setLogOpen(true)}>
                See error
              </Button>
            ) : undefined
          }
        />
        {mainButton}
        {actions.error ? (
          <Callout tone="error" role="alert">
            {actions.error}
          </Callout>
        ) : null}
        <p className={styles.note}>Content only: live in seconds. With code: about 1 minute.</p>
      </aside>

      <Modal
        open={discardOpen}
        onClose={() => {
          if (!discarding) setDiscardOpen(false)
        }}
        tone="destructive"
        title={discard?.kind === 'design' ? 'Discard this AI editor change?' : 'Discard this draft?'}
        description={
          discard?.kind === 'design'
            ? `“${discard.label}” is removed from the draft branch. The live site doesn’t change. This can’t be undone.`
            : `“${discard?.label ?? ''}” goes back to its published version. The live site doesn’t change. This can’t be undone.`
        }
        confirmLabel="Discard"
        onConfirm={confirmDiscard}
        confirmLoading={discarding}
      >
        {discardError ? (
          <Callout tone="error" role="alert">
            {discardError}
          </Callout>
        ) : null}
      </Modal>

      {canDiff ? <DiffModal open={diffOpen} change={diff} onClose={() => setDiffOpen(false)} /> : null}

      <ErrorLogModal
        open={logOpen}
        onClose={() => setLogOpen(false)}
        error={status?.run?.error}
        retrying={actions.pending}
        retryError={actions.error}
        onRetry={() => actions.retry((ok) => ok && setLogOpen(false))}
      />
    </div>
  )
}

/** « View ↗ » : lien stylé en bouton ghost small, nouvel onglet ; le nom accessible dit quoi et où. */
function ViewLink({ href, label, internal }: { href: string; label: string; internal?: boolean }) {
  const className = buttonClassName({ variant: 'ghost', size: 'small' })
  // Nom accessible : commence par le texte visible « View » (WCAG 2.5.3), puis dit quoi et où.
  const name = `View ${label} (opens in a new tab)`
  const content = (
    <ButtonContent size="small" iconRight="external">
      View
    </ButtonContent>
  )
  return internal ? (
    <Link href={href} target="_blank" className={className} aria-label={name}>
      {content}
    </Link>
  ) : (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className} aria-label={name}>
      {content}
    </a>
  )
}
