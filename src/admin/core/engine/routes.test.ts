import { describe, expect, it } from 'vitest'

import { ENGINE_ROUTES, filterEngineQuery, isSafeSegment, matchEngineRoute, requiresLocalAdmin } from './routes'

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
      ['POST', 'publish/stage'],
      ['POST', 'publish/unstage'],
      ['GET', 'publish/diff/chg-1'],
      ['GET', 'versions'],
      ['POST', 'versions/12/rollback'],
      ['POST', 'ask'],
      ['GET', 'claude/access'],
      ['POST', 'claude/access'],
      ['POST', 'claude/access/test'],
      ['POST', 'claude/access/clear'],
      ['GET', 'claude/settings'],
      ['POST', 'claude/settings'],
    ]
    for (const [method, path] of cases) expect(matchEngineRoute(method, path.split('/')), `${method} ${path}`).not.toBeNull()
    expect(ENGINE_ROUTES).toHaveLength(cases.length)
  })
  it('connexion à Claude : droit ai.access (Kuartz et client), GET/POST seulement', () => {
    expect(matchEngineRoute('GET', ['claude', 'access'])?.route.capability).toBe('ai.access')
    expect(matchEngineRoute('POST', ['claude', 'access', 'test'])?.route.capability).toBe('ai.access')
    expect(matchEngineRoute('POST', ['claude', 'access', 'clear'])?.route.capability).toBe('ai.access')
    expect(matchEngineRoute('GET', ['claude', 'access', 'test'])).toBeNull()
    expect(matchEngineRoute('POST', ['claude', 'access', 'key'])).toBeNull()
  })
  it('réglages de l’IA (B5 · AI settings) : droit ai.access, GET/POST seulement, jamais « admin local »', () => {
    expect(matchEngineRoute('GET', ['claude', 'settings'])?.route.capability).toBe('ai.access')
    expect(matchEngineRoute('POST', ['claude', 'settings'])?.route.capability).toBe('ai.access')
    expect(matchEngineRoute('POST', ['claude', 'settings', 'reset'])).toBeNull()
    expect(matchEngineRoute('PUT', ['claude', 'settings'])).toBeNull()
    expect(requiresLocalAdmin('POST', ['claude', 'settings'], '{"kind":"subscription"}')).toBe(false)
  })
  it('« Use my Claude subscription » exige un admin local ; la clé API non', () => {
    expect(requiresLocalAdmin('POST', ['claude', 'access'], '{"kind":"subscription"}')).toBe(true)
    expect(requiresLocalAdmin('POST', ['claude', 'access'], '{"kind":"api-key","apiKey":"x"}')).toBe(false)
    expect(requiresLocalAdmin('POST', ['claude', 'access', 'test'], '{"kind":"subscription"}')).toBe(false)
    expect(requiresLocalAdmin('GET', ['claude', 'access'], undefined)).toBe(false)
    expect(requiresLocalAdmin('POST', ['claude', 'access'], 'not json')).toBe(false)
  })
  it('stage / unstage : POST seulement, droit publish.run', () => {
    expect(matchEngineRoute('POST', ['publish', 'stage'])?.route.capability).toBe('publish.run')
    expect(matchEngineRoute('POST', ['publish', 'unstage'])?.route.capability).toBe('publish.run')
    expect(matchEngineRoute('GET', ['publish', 'stage'])).toBeNull()
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
