import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AUTOSAVE_DELAY_MS, createDebouncer } from './debounce'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('createDebouncer', () => {
  it('n’envoie que la dernière valeur, 600 ms après la dernière frappe', () => {
    const run = vi.fn()
    const d = createDebouncer<'title', string>(run)
    d.schedule('title', 'C')
    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS - 1)
    d.schedule('title', 'Co')
    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS - 1)
    expect(run).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(run).toHaveBeenCalledExactlyOnceWith('title', 'Co')
    expect(d.pending('title')).toBe(false)
  })

  it('un minuteur par champ ; flush et cancel', () => {
    const run = vi.fn()
    const d = createDebouncer<'title' | 'description', string>(run)
    d.schedule('title', 'A')
    d.schedule('description', 'B')
    d.flush('title')
    expect(run).toHaveBeenCalledExactlyOnceWith('title', 'A')
    d.cancel('description')
    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS * 2)
    expect(run).toHaveBeenCalledTimes(1)
    d.schedule('description', 'C')
    d.flush()
    expect(run).toHaveBeenLastCalledWith('description', 'C')
    d.flush()
    expect(run).toHaveBeenCalledTimes(2)
  })
})
