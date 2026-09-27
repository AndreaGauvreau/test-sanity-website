import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Droits de la page B3 : `settings.code` vérifié AVANT toute lecture ; 404 pour client et editor. */

const state = vi.hoisted(() => ({ role: 'kuartz' as 'kuartz' | 'client' | 'editor', calls: [] as string[] }))

vi.mock('@/admin/core/auth/session', async () => {
  const { can } = await import('@/admin/core/contracts/roles')
  return {
    requireCapability: async (cap: 'settings.code') => {
      state.calls.push(`require:${cap}`)
      if (!can(state.role, cap)) throw new Error('NOT_FOUND')
      return { role: state.role }
    },
  }
})
vi.mock('@/admin/features/code/data', () => ({
  loadCodeScreen: async () => {
    state.calls.push('load')
    return { scripts: [], pages: [], hasDraft: false }
  },
}))
vi.mock('@/admin/features/code/CodeScreen', () => ({ CodeScreen: () => null }))
vi.mock('@/admin/features/code/CodeLoadError', () => ({ CodeLoadError: () => null }))

const { default: CodePage } = await import('./page')

beforeEach(() => {
  state.calls = []
})

describe('page B3', () => {
  it('Kuartz : droit vérifié en premier, puis lecture', async () => {
    state.role = 'kuartz'
    await CodePage()
    expect(state.calls).toEqual(['require:settings.code', 'load'])
  })

  it.each(['client', 'editor'] as const)('%s : 404 sans rien lire', async (role) => {
    state.role = role
    await expect(CodePage()).rejects.toThrow('NOT_FOUND')
    expect(state.calls).toEqual(['require:settings.code'])
  })
})
