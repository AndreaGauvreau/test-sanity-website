/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MotionGlobalConfig } from 'motion/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider, useToast, type ToastApi } from './ToastProvider'

let api: ToastApi
function Grab() {
  api = useToast()
  return null
}

// Animations coupées : on teste la pile et les minuteurs, pas les courbes.
beforeEach(() => {
  MotionGlobalConfig.skipAnimations = true
  vi.useFakeTimers()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  MotionGlobalConfig.skipAnimations = false
})

async function mount() {
  render(
    <ToastProvider>
      <Grab />
    </ToastProvider>,
  )
  // Le portail se monte après le premier effet.
  await act(async () => {})
}

const texts = () => [...document.querySelectorAll('section[aria-label=Notifications] li')].map((li) => li.textContent)

describe('Toast', () => {
  it('région polie, bas au centre ; un toast disparaît après 5 s', async () => {
    await mount()
    const region = screen.getByRole('region', { name: 'Notifications' })
    expect(region.querySelector('ol')?.getAttribute('aria-live')).toBe('polite')
    act(() => void api.show({ message: 'Draft saved automatically.', type: 'info' }))
    expect(texts()).toEqual([expect.stringContaining('Draft saved automatically.')])
    act(() => vi.advanceTimersByTime(4900))
    expect(texts()).toHaveLength(1)
    act(() => vi.advanceTimersByTime(200))
    await act(async () => vi.advanceTimersByTime(1000))
    expect(texts()).toHaveLength(0)
  })

  it('erreur = role alert ; pile limitée à 3 ; ✕ ferme', async () => {
    await mount()
    act(() => {
      api.show({ message: 'one' })
      api.show({ message: 'two' })
      api.show({ message: 'three' })
      api.show({ message: "Couldn't publish.", type: 'error' })
    })
    await act(async () => vi.advanceTimersByTime(1000))
    expect(texts()).toHaveLength(3)
    expect(screen.getByRole('alert').textContent).toContain("Couldn't publish.")
    fireEvent.click(screen.getAllByRole('button', { name: 'Dismiss notification' })[0])
    await act(async () => vi.advanceTimersByTime(1000))
    expect(texts()).toHaveLength(2)
  })

  it('loading reste jusqu\'à update, puis minuteur normal ; même id = remplacement', async () => {
    await mount()
    act(() => void api.show({ id: 'publish', type: 'loading', message: 'Publishing…' }))
    act(() => vi.advanceTimersByTime(20_000))
    expect(texts()).toEqual([expect.stringContaining('Publishing…')])
    act(() => api.update('publish', { type: 'success', message: 'Published' }))
    expect(texts()).toEqual([expect.stringContaining('Published')])
    act(() => void api.show({ id: 'publish', type: 'info', message: 'Again' }))
    expect(texts()).toHaveLength(1)
    await act(async () => vi.advanceTimersByTime(7000))
    expect(texts()).toHaveLength(0)
  })

  it('survol : minuteur suspendu puis relancé', async () => {
    await mount()
    act(() => void api.show({ message: 'Hover me' }))
    const region = screen.getByRole('region', { name: 'Notifications' })
    fireEvent.pointerEnter(region)
    act(() => vi.advanceTimersByTime(10_000))
    expect(texts()).toHaveLength(1)
    fireEvent.pointerLeave(region)
    await act(async () => vi.advanceTimersByTime(6000))
    expect(texts()).toHaveLength(0)
  })

  it('useToast hors fournisseur : erreur claire', () => {
    const Bad = () => {
      useToast()
      return null
    }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Bad />)).toThrow(/ToastProvider/)
  })
})
