import { describe, expect, it } from 'vitest'

import { ENGINE_ROUTES, filterEngineQuery, isSafeSegment, matchEngineRoute } from './routes'

describe('liste blanche du relais', () => {
  it('reconnaît chaque route du contrat engine.ts', () => {
    const cases: [string, string][] = [
      ['GET', 'health'],
      ['GET', 'editor/state'],
      ['POST', 'editor/requests'],
      ['GET', 'editor/jobs/job_1'],
      ['POST', 'editor/jobs/job_1/answer'],
      ['POST', 'editor/jobs/job_1/stop'],
      ['POST', 'editor/changes/chg-1/validate'],
      ['POST', 'editor/changes/chg-1/cancel'],
      ['GET', 'editor/jobs/job_1/shots/001-before.png'],
      ['GET', 'publish/status'],
      ['POST', 'publish'],
      ['POST', 'publish/retry'],
      ['POST', 'publish/discard'],
      ['GET', 'publish/diff/chg-1'],
      ['GET', 'versions'],
      ['POST', 'versions/12/rollback'],
      ['POST', 'ask'],
    ]
    for (const [method, path] of cases) expect(matchEngineRoute(method, path.split('/')), `${method} ${path}`).not.toBeNull()
    expect(ENGINE_ROUTES).toHaveLength(cases.length)
  })
  it('refuse routes hors contrat, mauvaise méthode, segments dangereux', () => {
    for (const [method, path] of [
      ['GET', 'publish'],
      ['POST', 'health'],
      ['GET', 'editor/jobs'],
      ['GET', 'admin/secrets'],
      ['GET', 'editor/jobs/../../etc'],
      ['GET', 'editor/jobs/a%2Fb'],
      ['GET', 'editor/jobs/job 1'],
      ['DELETE', 'editor/jobs/job_1'],
      ['GET', 'editor/jobs/job_1/shots/secret.txt'],
      ['GET', 'editor/jobs/job_1/shots/1-before.png'],
      ['POST', 'versions/abc/rollback'],
      ['GET', ''],
    ] as const) {
      expect(matchEngineRoute(method, path.split('/')), `${method} ${path}`).toBeNull()
    }
  })
  it('droits : diff et rollback réservés à Kuartz ; santé ouverte', () => {
    expect(matchEngineRoute('GET', ['publish', 'diff', 'c1'])?.route.capability).toBe('publish.diff')
    expect(matchEngineRoute('POST', ['versions', '3', 'rollback'])?.route.capability).toBe('versions.rollback')
    expect(matchEngineRoute('GET', ['health'])?.route.capability).toBeNull()
    expect(matchEngineRoute('GET', ['editor', 'jobs', 'j1', 'shots', '0012-after.png'])).toMatchObject({ route: { kind: 'image' }, params: { id: 'j1', file: '0012-after.png' } })
  })
  it('segments : ^[\\w.-]+$, ni « . » ni « .. »', () => {
    expect(isSafeSegment('job_1.v2')).toBe(true)
    expect(isSafeSegment('..')).toBe(false)
    expect(isSafeSegment('.')).toBe(false)
    expect(isSafeSegment('a/b')).toBe(false)
    expect(isSafeSegment('x'.repeat(129))).toBe(false)
  })
  it('ne relaie que les paramètres de requête permis', () => {
    const state = matchEngineRoute('GET', ['editor', 'state'])!.route
    expect(filterEngineQuery(state, new URLSearchParams('page=/&token=x&kz_admin=y')).toString()).toBe('page=%2F')
    expect(filterEngineQuery(matchEngineRoute('GET', ['health'])!.route, new URLSearchParams('a=1')).toString()).toBe('')
  })
})
