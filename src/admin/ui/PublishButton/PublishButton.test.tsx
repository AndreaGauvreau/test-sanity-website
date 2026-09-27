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
    expect(screen.getByRole('status').textContent).toBe("Couldn't publish. Nothing was changed.")
  })
})
