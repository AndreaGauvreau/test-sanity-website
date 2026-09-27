/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MotionGlobalConfig } from 'motion/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Drawer } from '@/admin/ui'

// FOLLOWUPS #40 : plus de filet `useDrawerFocus` — le Drawer du kit attend son portail (ouvert au montage) ;
// le champ demandé (`?field=`) passe par `initialFocusRef` (useFieldFocusRef).

const router = { push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }
vi.mock('next/navigation', () => ({ useRouter: () => router, useParams: () => ({ collectionId: 'blog' }) }))
vi.mock('../server/actions', () => ({ saveFieldAction: vi.fn(), statusAction: vi.fn() }))
vi.mock('@/admin/features/media/server/actions', () => ({ listImagesAction: vi.fn() }))

const { fieldId, useFieldFocusRef } = await import('./ItemDrawer')
const { ItemDrawerState } = await import('./ItemDrawerState')

beforeEach(() => {
  MotionGlobalConfig.skipAnimations = true
})
afterEach(() => {
  cleanup()
  MotionGlobalConfig.skipAnimations = false
})

function Panel({ focusField }: { focusField: string | null }) {
  const initialFocusRef = useFieldFocusRef('post-1', focusField)
  return (
    <div data-kz-admin="">
      <Drawer open onClose={() => {}} title="Post" initialFocusRef={initialFocusRef}>
        <input id={fieldId('post-1', 'title')} aria-label="Title" defaultValue="Hello" />
        {/* Contrôle composé : conteneur non focalisable, le focus va à son premier élément focalisable. */}
        <div id={fieldId('post-1', 'category')} tabIndex={-1}>
          <button type="button">Category</button>
        </div>
      </Drawer>
    </div>
  )
}

describe('focus initial du panneau C4 (Drawer du kit, ouvert au montage)', () => {
  it('sans champ demandé : le premier champ', async () => {
    render(<Panel focusField={null} />)
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Title')))
  })

  it('champ demandé (contrôle composé) : son premier élément focalisable', async () => {
    render(<Panel focusField="category" />)
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Category' })))
  })

  it('champ inconnu : repli du kit sur le premier champ', async () => {
    render(<Panel focusField="nope" />)
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Title')))
  })

  it('ItemDrawerState (introuvable) : le focus entre dans le panneau sans filet', async () => {
    render(
      <div data-kz-admin="">
        <ItemDrawerState kind="not-found" />
      </div>,
    )
    const dialog = await screen.findByRole('dialog')
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))
  })
})
