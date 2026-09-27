import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, it } from 'vitest'
import type { AgentResult, AgentRun } from '../claude'
import { MEASURE_BLOCKED } from './run'
import { listPages } from './site'
import { CLIENT, editRequest, HERO_CSS, LEDE_MUTED, ledeColor, makeBench, type Bench } from './testing'

/**
 * Cycle d'une demande : SEC-07 (l'aperçu ne rend un fichier modifié qu'après un contrôle statique vert) et AI-07 (pages
 * de développement jamais citées, échec de lecture journalisé).
 */

let bench: Bench | null = null
afterEach(async () => {
  await bench?.cleanup()
  bench = null
})

/** Enveloppe qui garde les réponses de l'outil measure (ce que Claude lit). */
const observeMeasure = (answers: string[]) => (run: AgentRun, agent: (run: AgentRun) => Promise<AgentResult>) =>
  agent({
    ...run,
    measureTool: run.measureTool && {
      measure: async () => {
        const answer = await run.measureTool!.measure()
        answers.push(answer)
        return answer
      },
    },
  })

describe('SEC-07 : measure et le signal d’aperçu attendent un contrôle statique vert', () => {
  it('violation dans la copie de travail : measure refusé (message anglais), aperçu jamais sollicité, retour arrière', async () => {
    const answers: string[] = []
    // Le hook refuse désormais un tel Edit avant l'écriture (SEC-07) : défense en profondeur, la valeur en dur est
    // écrite ici par un autre moyen, et measure doit encore refuser de faire rendre l'aperçu.
    bench = await makeBench([{ steps: [{ kind: 'measure' }] }, { steps: [{ kind: 'measure' }], message: 'still' }], {
      runAgent: async (run, agent) => {
        const file = path.join(run.cwd, HERO_CSS)
        const css = await readFile(file, 'utf8')
        if (css.includes(LEDE_MUTED)) await writeFile(file, css.replace(LEDE_MUTED, ledeColor('#ff0000')))
        return observeMeasure(answers)(run, agent)
      },
    })
    const job = await bench.service.request(CLIENT, editRequest())
    const done = await bench.until(job.id, ['done', 'failed', 'rejected'])
    assert.equal(done.status, 'failed')
    assert.equal(answers.length, 2)
    for (const answer of answers) {
      assert.ok(answer.startsWith(MEASURE_BLOCKED), answer)
      assert.match(answer, /fix the reported violations first/)
      assert.match(answer, /Hero\.module\.css/)
    }
    assert.equal(bench.signal.calls.length, 0, 'aucun rafraîchissement demandé à next dev')
    assert.ok(done.steps.some((step) => step.kind === 'warn' && /^Measure refused/.test(step.label)))
    assert.equal(bench.git('status', '--porcelain'), '')
  })

  it('fichier hors périmètre : measure refusé aussi', async () => {
    const answers: string[] = []
    // Le hook refuse l'Edit ; on simule un fichier modifié hors périmètre (écrit par un autre moyen).
    bench = await makeBench([{ steps: [{ kind: 'measure' }], message: 'x' }], {
      runAgent: async (run, agent) => {
        await writeFile(path.join(run.cwd, 'src/components/sections/Hero/Hero.tsx'), '// changed\n', { flag: 'a' })
        return observeMeasure(answers)(run, agent)
      },
    })
    const job = await bench.service.request(CLIENT, editRequest())
    await bench.until(job.id, ['done', 'failed', 'rejected'])
    assert.equal(answers.length, 1)
    assert.match(answers[0], /outside the files you may edit/)
  })

  it('copie de travail conforme : measure attend l’aperçu à jour puis mesure', async () => {
    const answers: string[] = []
    const valid = { steps: [{ kind: 'edit' as const, file: HERO_CSS, find: LEDE_MUTED, replace: ledeColor('var(--color-text)') }, { kind: 'measure' as const }], message: 'Darker.' }
    bench = await makeBench([valid], { runAgent: observeMeasure(answers) })
    const job = await bench.service.request(CLIENT, editRequest())
    const done = await bench.until(job.id, ['done', 'failed', 'rejected'])
    assert.equal(done.status, 'done', JSON.stringify(done.steps))
    assert.match(answers[0], /^Rendering measured in the draft preview/)
    // measure (1) + attente avant les contrôles du rendu (1).
    assert.equal(bench.signal.calls.length, 2)
  })
})

describe('AI-07 : pages citées à Claude', () => {
  it('listPages ignore /bench et /preview/* (routes de développement)', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'kz-pages-'))
    try {
      for (const route of ['', 'bench', 'blog/[slug]', 'preview/[type]', 'preview/tour', 'previews', 'benchmarks']) {
        await mkdir(path.join(dir, 'src/app/(site)', route), { recursive: true })
        await writeFile(path.join(dir, 'src/app/(site)', route, 'page.tsx'), 'export default function P() { return null }\n')
      }
      assert.deepEqual(await listPages(dir), ['/', '/benchmarks', '/blog/[slug]', '/previews'])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('échec de lecture des pages : étape warn et journal (plus de catch silencieux), la demande continue', async () => {
    const prompts: string[] = []
    bench = await makeBench([{ steps: [], message: 'Nothing to do.' }], {
      listPages: async () => {
        throw new Error('EACCES: permission denied')
      },
      runAgent: (run, agent) => (prompts.push(run.prompt), agent(run)),
    })
    const job = await bench.service.request(CLIENT, editRequest())
    const done = await bench.until(job.id, ['done', 'failed', 'rejected'])
    assert.equal(done.status, 'rejected')
    const warn = done.steps.find((step) => step.kind === 'warn' && /list of the site pages could not be read/.test(step.label))
    assert.ok(warn, JSON.stringify(done.steps))
    assert.match(warn.detail ?? '', /EACCES/)
    assert.doesNotMatch(prompts[0], /Existing pages of the site/)
  })
})
