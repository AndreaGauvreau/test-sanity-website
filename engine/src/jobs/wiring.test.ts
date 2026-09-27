import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { HookInput } from '@anthropic-ai/claude-agent-sdk'
import { afterEach, describe, it } from 'vitest'
import type { EditJob } from '../../../src/admin/core/contracts'
import { createGuardHook, LINK_REMOVED, NO_TOKENS, type AgentResult, type AgentRun } from '../claude'
import { loadSiteDomains, siteDomainsOf } from './site'
import { CLIENT, editRequest, HERO_CSS, makeBench, type Bench } from './testing'

/**
 * Branchements croisés du cycle (FOLLOWUPS #36) :
 * - SEC-07 : `toolAccess.lint = lintContextFor(…)` passé au hook ; un Edit dont le fichier FUTUR viole le lint est refusé
 *   par le hook AVANT l'écriture (fichier intact sur le disque, étape warn), un vrai changement de texte ou de token passe ;
 * - SEC-08 : domaines du site en liste blanche pour ask_client, le message final et le journal de Claude.
 *
 * Claude est remplacé par un agent « façon SDK » : chaque Edit passe par le VRAI hook PreToolUse (`createGuardHook`
 * d'engine-claude, celui que `createAgentRunner` enregistre) avec l'entrée exacte de l'outil Edit de Claude Code
 * (`file_path`, `old_string`, `new_string`), puis n'est appliqué (remplacement littéral) que si le hook l'autorise.
 */

let bench: Bench | null = null
afterEach(async () => {
  await bench?.cleanup()
  bench = null
})

const BANNER = 'src/components/sections/Banner/Banner.tsx'
const BANNER_CSS = 'src/components/sections/Banner/Banner.module.css'
const BANNER_SOURCE = `import { editAttrs } from '@/lib/editor/preview'

import styles from './Banner.module.css'

export function Banner() {
  return (
    <section className={styles.banner} {...editAttrs('banner')}>
      <p className={styles.text} {...editAttrs('banner.text')}>Free trial for 30 days</p>
    </section>
  )
}
`

/** Zone dont le texte est écrit dans le code (T ouvre le composant), ajoutée au dépôt du banc et commitée. */
async function addBannerZone(b: Bench) {
  await mkdir(path.join(b.repoDir, path.dirname(BANNER)), { recursive: true })
  await writeFile(path.join(b.repoDir, BANNER), BANNER_SOURCE)
  await writeFile(path.join(b.repoDir, BANNER_CSS), '.banner {\n  display: grid;\n}\n\n.text {\n  color: var(--color-text);\n}\n')
  const zonesFile = path.join(b.repoDir, 'src/editor/zones.json')
  const zones = JSON.parse(await readFile(zonesFile, 'utf8')) as { zones: Record<string, unknown> }
  const zone = (selector: string, label: string) => ({
    label,
    section: 'Banner',
    files: [BANNER_CSS, BANNER],
    selectors: [selector],
    controls: [],
    text: { source: 'code', files: [BANNER] },
  })
  zones.zones.banner = { ...zone('.banner', 'Section'), children: ['banner.text'] }
  zones.zones['banner.text'] = zone('.text', 'Text')
  await writeFile(zonesFile, `${JSON.stringify(zones, null, 2)}\n`)
  b.git('add', '--all')
  b.git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--quiet', '-m', 'banner zone')
}

type PlannedEdit = { file: string; old_string: string; new_string: string }
type HookVerdict = { file: string; decision: 'allow' | 'deny'; reason: string; diskAtDecision: string }

/** Agent façon SDK : chaque Edit passe par le vrai hook PreToolUse avec l'entrée de l'outil Edit, appliqué s'il est permis. */
function sdkLikeAgent(edits: PlannedEdit[], verdicts: HookVerdict[], seen: AgentRun[] = [], message = 'Done.') {
  return async (run: AgentRun): Promise<AgentResult> => {
    seen.push(run)
    const hook = createGuardHook(run.cwd, run.toolAccess, (event) => run.onEvent(event))
    for (const edit of edits) {
      const file = path.join(run.cwd, edit.file)
      const input = {
        hook_event_name: 'PreToolUse',
        tool_name: 'Edit',
        tool_input: { file_path: file, old_string: edit.old_string, new_string: edit.new_string },
        session_id: 'sdk-like',
        transcript_path: '',
        cwd: run.cwd,
        tool_use_id: `edit-${verdicts.length}`,
      } as unknown as HookInput
      const output = (await hook(input, undefined, { signal: run.signal })) as {
        hookSpecificOutput?: { permissionDecision?: string; permissionDecisionReason?: string }
      }
      const denied = output.hookSpecificOutput?.permissionDecision === 'deny'
      const current = await readFile(file, 'utf8')
      verdicts.push({ file: edit.file, decision: denied ? 'deny' : 'allow', reason: output.hookSpecificOutput?.permissionDecisionReason ?? '', diskAtDecision: current })
      if (denied) continue
      const index = current.indexOf(edit.old_string)
      await writeFile(file, current.slice(0, index) + edit.new_string + current.slice(index + edit.old_string.length))
    }
    return { ok: true, message, sessionId: 'sdk-like-1', costUsd: 0.01, tokens: NO_TOKENS, turns: 1, apiTurns: 1, costKind: 'session', error: null }
  }
}

/** Couleur de la règle `.lede` (unique dans Hero.module.css, comme l'exige l'outil Edit). */
const LEDE_COLOR = '  max-inline-size: 28.75rem; /* 460 */\n  color: var(--color-text-muted);'

const read = (b: Bench, file: string) => readFile(path.join(b.repoDir, file), 'utf8')
const warnSteps = (job: EditJob) => job.steps.filter((step) => step.kind === 'warn').map((step) => step.label)

describe('SEC-07 dans le vrai cycle : le hook juge le fichier futur AVANT l’écriture', () => {
  it('toolAccess porte le contexte du lint (zones de la demande, périmètre, tableau hardcoded vivant)', async () => {
    const seen: AgentRun[] = []
    bench = await makeBench([], { runAgent: (run) => sdkLikeAgent([], [], seen)(run) })
    const job = await bench.service.request(CLIENT, editRequest({ zone: 'hero.lede', scope: ['style'] }))
    await bench.until(job.id, ['done', 'failed', 'rejected'])
    const lint = seen[0].toolAccess.lint
    assert.ok(lint, 'access.lint absent : la pré-validation du hook serait inactive')
    assert.equal(lint.zone, 'hero.lede')
    assert.deepEqual(lint.scope, { style: true, text: false })
    assert.ok(Object.hasOwn(lint.zones, 'hero.lede'))
    assert.ok(Array.isArray(lint.hardcoded))
  })

  it('.tsx de zone : import de node:fs et process.env REFUSÉS avant l’écriture (fichier intact, étape warn), rien n’est commité', async () => {
    const verdicts: HookVerdict[] = []
    bench = await makeBench([], {
      runAgent: (run) =>
        sdkLikeAgent(
          [
            { file: BANNER, old_string: "import styles from './Banner.module.css'", new_string: "import fs from 'node:fs'\nimport styles from './Banner.module.css'" },
            { file: BANNER, old_string: 'Free trial for 30 days</p>', new_string: 'Free trial for 30 days{process.env.SANITY_API_WRITE_TOKEN}</p>' },
          ],
          verdicts,
        )(run),
    })
    await addBannerZone(bench)
    const head = bench.git('rev-parse', 'HEAD')
    const job = await bench.service.request(CLIENT, editRequest({ zone: 'banner.text', scope: ['text'], note: 'Change the banner text.' }))
    const done = await bench.until(job.id, ['done', 'failed', 'rejected'])

    assert.deepEqual(verdicts.map((verdict) => verdict.decision), ['deny', 'deny'])
    assert.match(verdicts[0].reason, /^Edit refused \(src\/components\/sections\/Banner\/Banner\.tsx\): the file after this edit breaks/)
    assert.match(verdicts[0].reason, /Import added or changed: forbidden\./)
    assert.match(verdicts[1].reason, /`process\.env` added/)
    // Au moment de la décision, le disque n'a pas bougé : le refus a lieu AVANT l'écriture.
    for (const verdict of verdicts) assert.equal(verdict.diskAtDecision, BANNER_SOURCE)
    assert.equal(await read(bench, BANNER), BANNER_SOURCE)
    // Étapes warn au journal, avec la raison lue par Claude.
    const warns = warnSteps(done)
    assert.ok(warns.some((label) => /^Edit refused .*Import added or changed/.test(label)), JSON.stringify(warns))
    assert.ok(warns.some((label) => /^Edit refused .*process\.env/.test(label)), JSON.stringify(warns))
    // Rien n'a changé : demande sans effet, aucun commit, copie propre, aperçu jamais sollicité.
    assert.equal(done.status, 'rejected')
    assert.equal(bench.git('rev-parse', 'HEAD'), head)
    assert.equal(bench.git('status', '--porcelain'), '')
    assert.equal(bench.signal.calls.length, 0)
  })

  it('.tsx de zone : une vraie modification du texte passe le hook et va jusqu’au commit', async () => {
    const verdicts: HookVerdict[] = []
    bench = await makeBench([], {
      runAgent: (run) =>
        sdkLikeAgent([{ file: BANNER, old_string: 'Free trial for 30 days', new_string: 'Free trial for 60 days' }], verdicts, [], 'The banner now says 60 days.')(run),
    })
    await addBannerZone(bench)
    const head = bench.git('rev-parse', 'HEAD')
    const job = await bench.service.request(CLIENT, editRequest({ zone: 'banner.text', scope: ['text'], note: 'Say 60 days.' }))
    const done = await bench.until(job.id, ['done', 'failed', 'rejected'])
    assert.deepEqual(verdicts.map((verdict) => verdict.decision), ['allow'])
    assert.equal(done.status, 'done', JSON.stringify(done.steps))
    assert.match(await read(bench, BANNER), /Free trial for 60 days/)
    assert.notEqual(bench.git('rev-parse', 'HEAD'), head)
    assert.equal(warnSteps(done).filter((label) => label.startsWith('Edit refused')).length, 0)
  })

  it('CSS : une valeur en dur est refusée AVANT l’écriture (plus seulement après l’essai) ; un token du design system passe', async () => {
    const verdicts: HookVerdict[] = []
    bench = await makeBench([], {
      runAgent: (run) =>
        sdkLikeAgent(
          [
            { file: HERO_CSS, old_string: LEDE_COLOR, new_string: LEDE_COLOR.replace('var(--color-text-muted)', '#ff0000') },
            { file: HERO_CSS, old_string: LEDE_COLOR, new_string: LEDE_COLOR.replace('var(--color-text-muted)', 'var(--color-text)') },
          ],
          verdicts,
          [],
          'The lede is darker.',
        )(run),
    })
    const original = await read(bench, HERO_CSS)
    const job = await bench.service.request(CLIENT, editRequest({ zone: 'hero.lede', scope: ['style'] }))
    const done = await bench.until(job.id, ['done', 'failed', 'rejected'])
    assert.deepEqual(verdicts.map((verdict) => verdict.decision), ['deny', 'allow'], JSON.stringify(verdicts.map((verdict) => verdict.reason)))
    assert.equal(verdicts[0].diskAtDecision, original, 'la valeur en dur n’a jamais atteint le disque')
    assert.equal(done.status, 'done', JSON.stringify(done.steps))
    const css = await read(bench, HERO_CSS)
    assert.doesNotMatch(css, /#ff0000/)
    assert.match(css, /\.lede \{[^}]*color: var\(--color-text\);/)
    assert.ok(warnSteps(done).some((label) => label.startsWith(`Edit refused (${HERO_CSS})`)))
  })
})

describe('SEC-08 : domaines du site en liste blanche', () => {
  it('siteDomainsOf : site.domain + hôte de site.url, sans doublon ; adresse locale ou IP ignorée', () => {
    assert.deepEqual(siteDomainsOf({ domain: 'conduit.com', url: 'https://www.conduit.com/' }), ['conduit.com', 'www.conduit.com'])
    assert.deepEqual(siteDomainsOf({ domain: 'Conduit.com', url: 'https://conduit.com' }), ['conduit.com'])
    assert.deepEqual(siteDomainsOf({ domain: 'conduit.com', url: 'http://127.0.0.1:4040' }), ['conduit.com'])
    assert.deepEqual(siteDomainsOf({ domain: '', url: 'http://localhost:4040' }), [])
    assert.deepEqual(siteDomainsOf({ domain: 'https://conduit.com/path', url: 'not a url' }), ['conduit.com'])
    assert.deepEqual(siteDomainsOf(null), [])
  })

  it('loadSiteDomains lit le vrai manifeste du dépôt (conduit.com) ; manifeste absent : liste vide + journal', async () => {
    const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..')
    assert.ok((await loadSiteDomains(repo)).includes('conduit.com'))
    const lines: string[] = []
    assert.deepEqual(await loadSiteDomains('/nonexistent/site', (line) => lines.push(line)), [])
    assert.match(lines[0], /admin\.config\.ts not found/)
  })

  it('le cycle passe les domaines à Claude (AgentRun.allowedDomains), à ask_client et au message final', async () => {
    const seen: AgentRun[] = []
    let askResult: unknown = null
    const message = 'See https://conduit.com/pricing and https://evil.example/steal for details.'
    bench = await makeBench([], {
      siteDomains: ['conduit.com'],
      runAgent: async (run) => {
        seen.push(run)
        // Une question qui cite une adresse hors du site est refusée par ask_client (liste blanche passée par le cycle).
        askResult = await run.askTool!.ask([
          { question: 'Should the link go to https://evil.example?', options: [{ label: 'Yes', description: 'Go.', tone: 'neutral' }, { label: 'No', description: 'Stay.', tone: 'recommended' }] },
        ])
        return { ok: true, message, sessionId: 's', costUsd: 0.01, tokens: NO_TOKENS, turns: 1, apiTurns: 1, costKind: 'session', error: null }
      },
    })
    const job = await bench.service.request(CLIENT, editRequest())
    const done = await bench.until(job.id, ['done', 'failed', 'rejected'])
    assert.deepEqual(seen[0].allowedDomains, ['conduit.com'])
    assert.ok(askResult && typeof askResult === 'object' && 'error' in askResult, JSON.stringify(askResult))
    assert.equal(done.status, 'rejected')
    assert.equal(done.message, `See https://conduit.com/pricing and ${LINK_REMOVED} for details.`)
  })

  it('sans domaine configuré : toute adresse est retirée du message final', async () => {
    bench = await makeBench([], {
      runAgent: async () => ({ ok: true, message: 'See https://conduit.com/pricing.', sessionId: 's', costUsd: 0.01, tokens: NO_TOKENS, turns: 1, apiTurns: 1, costKind: 'session', error: null }),
    })
    const job = await bench.service.request(CLIENT, editRequest())
    const done = await bench.until(job.id, ['done', 'failed', 'rejected'])
    assert.equal(done.message, `See ${LINK_REMOVED}.`)
  })
})
