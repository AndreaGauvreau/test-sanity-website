import { describe, expect, it, vi } from 'vitest'

import type { PublishStatus } from '@/admin/core/contracts/engine'

import { POLL_ACTIVE_MS, POLL_ERROR_MS, POLL_IDLE_MS } from './bar-state'
import { createPublishStatusStore } from './status-store'

function status(state: PublishStatus['state'], total = 0): PublishStatus {
  return { state, pending: { content: [], design: [], total }, deploy: { mode: 'local' } }
}

/** Minuteurs manuels : on voit exactement quel délai est programmé. */
function fakeTimers() {
  const timers: { fn: () => void; ms: number; id: number }[] = []
  let id = 0
  return {
    timers,
    setTimer: (fn: () => void, ms: number) => {
      id += 1
      timers.push({ fn, ms, id })
      return id
    },
    clearTimer: (h: unknown) => {
      const i = timers.findIndex((t) => t.id === h)
      if (i >= 0) timers.splice(i, 1)
    },
    fire() {
      const t = timers.shift()
      t?.fn()
      return t
    },
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('magasin partagé de l’état de publication', () => {
  it('ne sonde que s’il a des abonnés ; ~5 s au repos, ~1 s pendant une publication', async () => {
    const t = fakeTimers()
    const fetchStatus = vi.fn().mockResolvedValueOnce(status('pending', 3)).mockResolvedValueOnce(status('publishing', 3))
    const store = createPublishStatusStore({ fetchStatus, setTimer: t.setTimer, clearTimer: t.clearTimer, now: () => 1 })
    expect(fetchStatus).not.toHaveBeenCalled()

    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)
    await flush()
    expect(fetchStatus).toHaveBeenCalledTimes(1)
    expect(store.get().status?.pending.total).toBe(3)
    expect(t.timers.at(-1)?.ms).toBe(POLL_IDLE_MS)

    t.fire()
    await flush()
    expect(store.get().status?.state).toBe('publishing')
    expect(t.timers.at(-1)?.ms).toBe(POLL_ACTIVE_MS)

    unsubscribe()
    expect(t.timers).toHaveLength(0)
    expect(listener).toHaveBeenCalled()
  })

  it('une erreur de lecture est gardée (jamais avalée) avec la dernière valeur connue, puis effacée au succès', async () => {
    const t = fakeTimers()
    const fetchStatus = vi
      .fn()
      .mockResolvedValueOnce(status('pending', 2))
      .mockRejectedValueOnce(new Error("The AI engine isn't responding. Try again in a moment."))
      .mockResolvedValueOnce(status('idle'))
    const store = createPublishStatusStore({ fetchStatus, setTimer: t.setTimer, clearTimer: t.clearTimer })
    store.subscribe(() => {})
    await flush()
    t.fire()
    await flush()
    expect(store.get().error).toBe("The AI engine isn't responding. Try again in a moment.")
    expect(store.get().status?.pending.total).toBe(2)
    expect(t.timers.at(-1)?.ms).toBe(POLL_ERROR_MS)
    t.fire()
    await flush()
    expect(store.get().error).toBeNull()
    expect(store.get().status?.state).toBe('idle')
  })

  it('lectures simultanées regroupées', async () => {
    const t = fakeTimers()
    let resolve!: (s: PublishStatus) => void
    const fetchStatus = vi.fn(() => new Promise<PublishStatus>((r) => (resolve = r)))
    const store = createPublishStatusStore({ fetchStatus, setTimer: t.setTimer, clearTimer: t.clearTimer })
    store.subscribe(() => {})
    void store.refresh()
    void store.refresh()
    await flush()
    expect(fetchStatus).toHaveBeenCalledTimes(1)
    resolve(status('idle'))
    await flush()
  })

  it('set() (réponse d’une action) l’emporte sur une lecture partie avant', async () => {
    const t = fakeTimers()
    let resolve!: (s: PublishStatus) => void
    const fetchStatus = vi.fn(() => new Promise<PublishStatus>((r) => (resolve = r)))
    const store = createPublishStatusStore({ fetchStatus, setTimer: t.setTimer, clearTimer: t.clearTimer })
    store.subscribe(() => {})
    await flush() // la lecture est partie
    store.set(status('publishing', 3))
    resolve(status('pending', 3)) // lecture ancienne
    await flush()
    expect(store.get().status?.state).toBe('publishing')
    expect(t.timers.at(-1)?.ms).toBe(POLL_ACTIVE_MS)
  })

  it('seed() ne remplace pas un état déjà connu', async () => {
    const store = createPublishStatusStore({ fetchStatus: vi.fn(() => new Promise<PublishStatus>(() => {})) })
    store.seed(status('pending', 1))
    store.seed(status('idle'))
    expect(store.get().status?.pending.total).toBe(1)
  })

  it('onglet caché : le minuteur ne lit pas ; retour visible : lecture immédiate', async () => {
    const t = fakeTimers()
    let visible = true
    let onVisible: () => void = () => {}
    const fetchStatus = vi.fn().mockResolvedValue(status('idle'))
    const store = createPublishStatusStore({
      fetchStatus,
      setTimer: t.setTimer,
      clearTimer: t.clearTimer,
      isVisible: () => visible,
      onVisibilityChange: (l) => {
        onVisible = l
        return () => {}
      },
    })
    store.subscribe(() => {})
    await flush()
    visible = false
    t.fire()
    await flush()
    expect(fetchStatus).toHaveBeenCalledTimes(1)
    visible = true
    onVisible()
    await flush()
    expect(fetchStatus).toHaveBeenCalledTimes(2)
  })
})
