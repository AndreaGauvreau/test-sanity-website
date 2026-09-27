import type { EditJob, ThreadEntry, Usage } from '@/admin/core/contracts'

/** Données de test partagées (demandes, usages). Aucun import de test : utilisable par tous les *.test. */
export const TARGET = { zone: 'hero.title', index: 0, label: 'Hero · Title' }

export function usage(input: number, output: number, cost: number, extra: Partial<Usage> = {}): Usage {
  return {
    model: 'claude-opus-5-5',
    inputTokens: input,
    outputTokens: output,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    costUsd: cost,
    costKind: 'billed',
    access: 'api-key',
    durationMs: 1000,
    ...extra,
  }
}

export function job(overrides: Partial<EditJob> = {}): EditJob {
  return {
    id: 'job-1',
    changeId: 'chg-1',
    kind: 'request',
    request: { page: '/', targets: [TARGET], scope: ['style', 'text'], note: 'Make the title bigger.', viewport: 1280 },
    requestedBy: { id: 'u', name: 'U', email: 'u@example.com', role: 'client' },
    createdAt: '2026-09-27T10:00:00.000Z',
    status: 'running',
    steps: [],
    summary: [],
    checks: [],
    texts: [],
    hardcoded: [],
    attempts: 1,
    ...overrides,
  }
}

export const entry = (j: EditJob): ThreadEntry => ({ type: 'job', job: j })
