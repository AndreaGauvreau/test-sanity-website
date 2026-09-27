import { afterEach, describe, expect, it, vi } from 'vitest'

import { assertNotProduction } from './dataset-guard'

const client = (dataset?: string) => ({ config: () => ({ dataset, projectId: 'test' }) })

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('assertNotProduction', () => {
  it('refuse production, tout nom qui contient « prod », et un dataset absent', () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    for (const name of ['production', 'Production', 'prod', 'preprod-copy']) {
      expect(() => assertNotProduction(client(name) as never)).toThrow(/Refus/)
    }
    expect(() => assertNotProduction(client(undefined) as never)).toThrow(/Refus/)
  })

  it('refuse si l’environnement vise production, même quand le client dit autre chose', () => {
    vi.stubEnv('NEXT_PUBLIC_SANITY_DATASET', 'production')
    expect(() => assertNotProduction(client('development') as never)).toThrow(/production/)
  })

  it('laisse passer development', () => {
    vi.stubEnv('NEXT_PUBLIC_SANITY_DATASET', 'development')
    vi.stubEnv('SANITY_STUDIO_DATASET', 'development')
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    expect(assertNotProduction(client('development') as never)).toBe('development')
  })
})
