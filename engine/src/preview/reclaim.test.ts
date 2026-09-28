import assert from 'node:assert/strict'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, it } from 'vitest'
import { reclaimPreviewPort, type PortListener, type ReclaimDeps } from './reclaim'

/** Aperçu orphelin : faux port, faux signaux, aucune vraie commande système. */

let repoDir: string

beforeEach(async () => {
  repoDir = await realpath(await mkdtemp(path.join(os.tmpdir(), 'kz-reclaim-')))
})

afterEach(async () => {
  await rm(repoDir, { recursive: true, force: true })
})

function fakeDeps(listener: PortListener | null, options: { freesOn?: NodeJS.Signals | null } = {}) {
  let current = listener
  const signals: Array<[number, NodeJS.Signals]> = []
  const lines: string[] = []
  const deps: ReclaimDeps = {
    listenerOf: async () => current,
    killGroup: (pgid, signal) => {
      signals.push([pgid, signal])
      if (options.freesOn === undefined || options.freesOn === signal) current = null
    },
    sleep: async () => {},
    log: (line) => void lines.push(line),
  }
  return { deps, signals, lines }
}

describe('reclaimPreviewPort', () => {
  it('port libre : rien à faire', async () => {
    const { deps, signals } = fakeDeps(null)
    assert.equal(await reclaimPreviewPort({ port: 4042, repoDir }, deps), 'free')
    assert.deepEqual(signals, [])
  })

  it('aperçu orphelin du clone : son groupe reçoit SIGTERM, le port se libère', async () => {
    const { deps, signals, lines } = fakeDeps({ pid: 11, pgid: 10, cwd: repoDir })
    assert.equal(await reclaimPreviewPort({ port: 4042, repoDir }, deps), 'reclaimed')
    assert.deepEqual(signals, [[10, 'SIGTERM']])
    assert.ok(lines.some((line) => /left running by a previous engine \(pid 11\)/.test(line)))
  })

  it('orphelin qui résiste à SIGTERM : SIGKILL au groupe', async () => {
    const { deps, signals } = fakeDeps({ pid: 11, pgid: 10, cwd: repoDir }, { freesOn: 'SIGKILL' })
    assert.equal(await reclaimPreviewPort({ port: 4042, repoDir, graceMs: 600, pollMs: 200 }, deps), 'reclaimed')
    assert.deepEqual(signals, [
      [10, 'SIGTERM'],
      [10, 'SIGKILL'],
    ])
  })

  it('qui ne meurt jamais : « stuck », message clair', async () => {
    const { deps, lines } = fakeDeps({ pid: 11, pgid: 10, cwd: repoDir }, { freesOn: null })
    assert.equal(await reclaimPreviewPort({ port: 4042, repoDir, graceMs: 400, pollMs: 200 }, deps), 'stuck')
    assert.ok(lines.some((line) => /did not stop/.test(line)))
  })

  it('autre programme (autre dossier, dossier inconnu) : jamais touché', async () => {
    for (const cwd of ['/somewhere/else', null]) {
      const { deps, signals, lines } = fakeDeps({ pid: 22, pgid: 22, cwd })
      assert.equal(await reclaimPreviewPort({ port: 4042, repoDir }, deps), 'foreign')
      assert.deepEqual(signals, [])
      assert.ok(lines.some((line) => /used by another program \(pid 22\)/.test(line)))
    }
  })

  it('sonde en échec : considéré comme libre (comportement d’avant)', async () => {
    const deps: ReclaimDeps = { ...fakeDeps(null).deps, listenerOf: async () => Promise.reject(new Error('no lsof')) }
    assert.equal(await reclaimPreviewPort({ port: 4042, repoDir }, deps), 'free')
  })
})
