import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EditJob } from '@/admin/core/contracts'
import { job } from './fixtures'
import { startJobPolling } from './poller'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

function setup(responses: (EditJob | Error)[]) {
  const calls: AbortSignal[] = []
  const fetchJob = vi.fn(async (_id: string, signal: AbortSignal) => {
    calls.push(signal)
    const next = responses.shift() ?? job({ status: 'done' })
    if (next instanceof Error) throw next
    return next
  })
  const onJob = vi.fn()
  const onError = vi.fn()
  const onRecovered = vi.fn()
  const onSettled = vi.fn()
  return { calls, fetchJob, onJob, onError, onRecovered, onSettled }
}

describe('startJobPolling', () => {
  it('interroge toutes les 900 ms, une seule requête en vol, et s’arrête quand la demande est finie', async () => {
    const t = setup([job({ status: 'running' }), job({ status: 'waiting' }), job({ status: 'done' })])
    startJobPolling({ jobId: 'job-1', ...t })
    await vi.advanceTimersByTimeAsync(899)
    expect(t.fetchJob).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(t.fetchJob).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(900 * 5)
    expect(t.fetchJob).toHaveBeenCalledTimes(3)
    expect(t.onJob.mock.calls.map(([j]) => j.status)).toEqual(['running', 'waiting', 'done'])
    expect(t.onSettled).toHaveBeenCalledTimes(1)
  })

  it('n’avale pas les erreurs : onError à chaque échec, recul progressif, onRecovered au retour', async () => {
    const t = setup([new Error('down'), new Error('down'), job({ status: 'running' }), job({ status: 'done' })])
    startJobPolling({ jobId: 'job-1', ...t })
    await vi.advanceTimersByTimeAsync(900)
    expect(t.onError).toHaveBeenLastCalledWith(expect.any(Error), 1)
    await vi.advanceTimersByTimeAsync(900)
    expect(t.onError).toHaveBeenLastCalledWith(expect.any(Error), 2)
    // 2e échec → attente de 1 800 ms avant le 3e appel.
    await vi.advanceTimersByTimeAsync(1_799)
    expect(t.fetchJob).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(t.fetchJob).toHaveBeenCalledTimes(3)
    expect(t.onRecovered).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(900)
    expect(t.onSettled).toHaveBeenCalled()
  })

  it('recul plafonné à 5 s', async () => {
    const t = setup(Array.from({ length: 10 }, () => new Error('down')))
    startJobPolling({ jobId: 'job-1', ...t })
    await vi.advanceTimersByTimeAsync(900 + 1800 + 3600 + 5000)
    expect(t.fetchJob).toHaveBeenCalledTimes(4)
    await vi.advanceTimersByTimeAsync(5000)
    expect(t.fetchJob).toHaveBeenCalledTimes(5)
  })

  it('404 : la demande n’existe plus → erreur signalée et arrêt', async () => {
    const t = setup([Object.assign(new Error('gone'), { status: 404, code: 'not_found' })])
    startJobPolling({ jobId: 'job-1', ...t })
    await vi.advanceTimersByTimeAsync(900)
    expect(t.onError).toHaveBeenCalledTimes(1)
    expect(t.onSettled).toHaveBeenCalledWith(null)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(t.fetchJob).toHaveBeenCalledTimes(1)
  })

  it('arrêt propre : minuteur annulé, requête en vol abandonnée, plus aucun rappel', async () => {
    let release: (j: EditJob) => void = () => {}
    const fetchJob = vi.fn((_id: string, signal: AbortSignal) => {
      return new Promise<EditJob>((resolve, reject) => {
        release = resolve
        signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
      })
    })
    const onJob = vi.fn()
    const onError = vi.fn()
    const stop = startJobPolling({ jobId: 'job-1', fetchJob, onJob, onError })
    await vi.advanceTimersByTimeAsync(900)
    expect(fetchJob).toHaveBeenCalledTimes(1)
    const signal = fetchJob.mock.calls[0][1]
    stop()
    expect(signal.aborted).toBe(true)
    release(job({ status: 'running' }))
    await vi.advanceTimersByTimeAsync(10_000)
    expect(onJob).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
    expect(fetchJob).toHaveBeenCalledTimes(1)
    stop()
  })

  it('immediate : premier appel tout de suite (rechargement de page)', async () => {
    const t = setup([job({ status: 'done' })])
    startJobPolling({ jobId: 'job-1', ...t, immediate: true })
    await vi.advanceTimersByTimeAsync(0)
    expect(t.fetchJob).toHaveBeenCalledTimes(1)
  })
})
