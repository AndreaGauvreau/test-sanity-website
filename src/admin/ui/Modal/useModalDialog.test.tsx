/** @vitest-environment jsdom */
import { useEffect, useRef, useState } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MotionGlobalConfig } from 'motion/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Drawer } from '../Drawer'
import { useModalDialog } from './useModalDialog'

beforeEach(() => {
  MotionGlobalConfig.skipAnimations = true
})
afterEach(() => {
  cleanup()
  MotionGlobalConfig.skipAnimations = false
})

/** Fenêtre ouverte dès le montage, dont l'élément n'apparaît qu'après quelques frames (portail, navigation). */
function LateDialog({ delay }: { delay: number }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [mounted, setMounted] = useState(false)
  const onKeyDown = useModalDialog({ id: 'late', open: true, dialogRef: ref })
  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), delay)
    return () => clearTimeout(timer)
  }, [delay])
  return mounted ? (
    <div ref={ref} role="dialog" aria-label="Late" tabIndex={-1} onKeyDown={onKeyDown}>
      <input aria-label="Title" />
    </div>
  ) : null
}

describe('useModalDialog', () => {
  it('ouverte au montage, fenêtre montée plus tard : le focus initial attend la fenêtre', async () => {
    render(<LateDialog delay={80} />)
    const title = await screen.findByRole('textbox', { name: 'Title' })
    await waitFor(() => expect(document.activeElement).toBe(title))
  })

  it('Drawer ouvert dès le montage : focus sur le premier champ', async () => {
    render(
      <div data-kz-admin="">
        <Drawer open onClose={() => {}} title="Carrier portals">
          <input aria-label="Title" />
        </Drawer>
      </div>,
    )
    const title = await screen.findByRole('textbox', { name: 'Title' })
    await waitFor(() => expect(document.activeElement).toBe(title))
  })

  it('ne reprend pas le focus si l’utilisateur l’a déjà placé dans la fenêtre', async () => {
    function Placed() {
      const ref = useRef<HTMLDivElement | null>(null)
      useModalDialog({ id: 'placed', open: true, dialogRef: ref })
      return (
        <div ref={ref} role="dialog" aria-label="Placed">
          <input aria-label="First" />
          <input aria-label="Second" autoFocus />
        </div>
      )
    }
    render(<Placed />)
    const second = screen.getByRole('textbox', { name: 'Second' })
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(document.activeElement).toBe(second)
  })
})
