'use client'

import type { Ref } from 'react'
import type { PublishState } from '@/admin/core/contracts'
import { Button, type ButtonProps } from '../Button'
import type { IconName } from '../icons'

type Visual = { variant: ButtonProps['variant']; label: string; icon?: IconName; announce: string }

/** Les 5 états visuels du Figma (« Publish button » 323:503) ; `failed` du contrat = état « error » du Figma. */
const VISUALS: Record<PublishState, Visual> = {
  idle: { variant: 'primary', label: 'Publish', announce: 'Everything is published.' },
  pending: { variant: 'primary', label: 'Publish', announce: 'Changes are waiting to be published.' },
  publishing: { variant: 'primary', label: 'Publishing…', announce: 'Publishing…' },
  published: { variant: 'secondary', label: 'Published', icon: 'success', announce: 'Published — the site is up to date.' },
  failed: { variant: 'danger', label: 'Retry', icon: 'warning', announce: "Couldn't publish. Nothing was changed." },
}

export type PublishButtonProps = Omit<ButtonProps, 'variant' | 'size' | 'iconLeft' | 'iconRight' | 'loading' | 'children' | 'onClick'> & {
  /** État partagé de la publication (contrat PublishState). */
  state: PublishState
  /** pending → Publish. */
  onPublish?: () => void
  /** failed → Retry. */
  onRetry?: () => void
  /** Nombre de modifications en attente, lu par les lecteurs d'écran (« Publish 3 changes »). */
  pendingCount?: number
  ref?: Ref<HTMLButtonElement>
}

/**
 * Bouton Publish de la Top bar : idle (désactivé, rien à publier), pending, publishing (loader),
 * published (confirmation 3 s, gérée par l'appelant), failed (Retry). Purement visuel : la logique
 * de publication est câblée par publish-ui. Un message poli annonce chaque changement d'état.
 */
export function PublishButton({ state, onPublish, onRetry, pendingCount, disabled, ref, ...rest }: PublishButtonProps) {
  const visual = VISUALS[state]
  const inactive = state === 'idle' || state === 'published'
  const label =
    state === 'pending' && pendingCount ? `Publish ${pendingCount} change${pendingCount > 1 ? 's' : ''}` : undefined
  return (
    <>
      <Button
        ref={ref}
        size="small"
        variant={visual.variant}
        iconLeft={visual.icon}
        loading={state === 'publishing'}
        disabled={disabled || state === 'idle'}
        aria-label={label}
        aria-disabled={inactive || state === 'publishing' || undefined}
        data-state={state}
        onClick={() => {
          if (state === 'pending') onPublish?.()
          else if (state === 'failed') onRetry?.()
        }}
        {...rest}
      >
        {visual.label}
      </Button>
      <span className="kz-visually-hidden" role="status" aria-live="polite">
        {state === 'idle' || state === 'pending' ? '' : visual.announce}
      </span>
    </>
  )
}
