/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PublishButton } from './PublishButton'

afterEach(cleanup)

describe('PublishButton', () => {
  it('idle : désactivé ; pending : publie', async () => {
    const onPublish = vi.fn()
    const { rerender } = render(<PublishButton state="idle" onPublish={onPublish} />)
    expect((screen.getByRole('button', { name: 'Publish' }) as HTMLButtonElement).disabled).toBe(true)
    rerender(<PublishButton state="pending" onPublish={onPublish} pendingCount={3} />)
    const button = screen.getByRole('button', { name: 'Publish 3 changes' })
    await userEvent.click(button)
    expect(onPublish).toHaveBeenCalledTimes(1)
  })

  it('publishing : loader, aria-busy, aucun clic ; annonce polie', async () => {
    const onPublish = vi.fn()
    render(<PublishButton state="publishing" onPublish={onPublish} />)
    const button = screen.getByRole('button', { name: 'Publishing…' })
    expect(button.getAttribute('aria-busy')).toBe('true')
    await userEvent.click(button)
    expect(onPublish).not.toHaveBeenCalled()
    expect(screen.getByRole('status').textContent).toBe('Publishing…')
  })

  it('published puis failed → Retry', async () => {
    const onRetry = vi.fn()
    const { rerender } = render(<PublishButton state="published" onRetry={onRetry} />)
    expect(screen.getByRole('button', { name: 'Published' }).getAttribute('data-state')).toBe('published')
    rerender(<PublishButton state="failed" onRetry={onRetry} />)
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
    // QA-3 : sans étape connue, l'annonce n'affirme pas que rien n'a changé (la publication n'est pas atomique).
    expect(screen.getByRole('status').textContent).toBe('Publish failed. Retry to resume from the step that failed.')
  })

  it('failed : annonce adaptée à l\'étape en échec (QA-3)', () => {
    const { rerender } = render(<PublishButton state="failed" failedStep={1} />)
    const status = () => screen.getByRole('status').textContent ?? ''
    // Étape 1 = une seule transaction Sanity, précédée du typecheck : rien n'est parti.
    expect(status()).toBe('Publish failed at step 1 of 4. Nothing was published. Retry to try again.')
    for (const step of [2, 3, 4] as const) {
      rerender(<PublishButton state="failed" failedStep={step} />)
      expect(status()).toBe(`Publish failed at step ${step} of 4. Any content changes are already live. Retry to resume from this step.`)
      expect(status()).not.toMatch(/Nothing was (changed|published)/)
    }
    // Le libellé visible ne dépend pas de l'étape.
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
  })
})
