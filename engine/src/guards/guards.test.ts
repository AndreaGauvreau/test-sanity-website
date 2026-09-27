import assert from 'node:assert/strict'
import path from 'node:path'
import { beforeAll as before, describe, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { loadDesignSystem, type DesignSystem } from './design-system'
import { LYONDRIVE } from './fixtures/lyondrive-options'
import {
  ASK_TOOL,
  checkToolUse,
  isReadable,
  lintChanges,
  MEASURE_TOOL,
  outOfScope,
  repoPath,
  TEXT_TOOL,
} from './guards'

const siteDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/lyondrive')

let ds: DesignSystem
before(async () => {
  ds = await loadDesignSystem(siteDir, LYONDRIVE)
})

const root = '/repo/site-draft'
const heroFiles = ['src/components/Hero/Hero.module.css', 'src/components/Hero/Hero.tsx']
const styleAccess = { files: heroFiles, textTool: false }
const textOnlyCms = { files: [], textTool: true }

describe('repoPath', () => {
  it('rend un chemin relatif au repo, ou null quand il en sort', () => {
    assert.equal(repoPath(root, `${root}/src/app/page.tsx`), 'src/app/page.tsx')
    assert.equal(repoPath(root, 'src/app/page.tsx'), 'src/app/page.tsx')
    assert.equal(repoPath(root, root), '')
    assert.equal(repoPath(root, '/etc/passwd'), null)
    assert.equal(repoPath(root, `${root}/../site/.env.local`), null)
  })
})

describe('isReadable', () => {
  it('autorise src/ et les fichiers de config, refuse le reste', () => {
    assert.ok(isReadable('src/components/Hero/Hero.tsx'))
    assert.ok(isReadable('package.json'))
    assert.ok(!isReadable('.env.local'))
    assert.ok(!isReadable('src/.env'))
    assert.ok(!isReadable('node_modules/next/package.json'))
    assert.ok(!isReadable('.git/config'))
  })
})

describe('checkToolUse', () => {
  it('laisse lire le composant et refuse les secrets', () => {
    assert.deepEqual(checkToolUse(root, styleAccess, 'Read', { file_path: `${root}/src/components/Hero/Hero.tsx` }), { allow: true })
    assert.equal(checkToolUse(root, styleAccess, 'Read', { file_path: `${root}/.env.local` }).allow, false)
    assert.equal(checkToolUse(root, styleAccess, 'Read', { file_path: '/Users/someone/.ssh/id_rsa' }).allow, false)
  })

  it('limite les modifications aux fichiers du périmètre', () => {
    assert.equal(checkToolUse(root, styleAccess, 'Edit', { file_path: `${root}/src/components/Hero/Hero.module.css` }).allow, true)
    const denied = checkToolUse(root, styleAccess, 'Edit', { file_path: `${root}/src/app/globals.css` })
    assert.equal(denied.allow, false)
    assert.match((denied as { reason: string }).reason, /Hero\.module\.css/)
  })

  it('en mode Texte (CMS) : aucun fichier, mais set_text', () => {
    const edit = checkToolUse(root, textOnlyCms, 'Edit', { file_path: `${root}/src/components/Hero/Hero.module.css` })
    assert.equal(edit.allow, false)
    assert.match((edit as { reason: string }).reason, /set_text/)
    assert.equal(checkToolUse(root, textOnlyCms, TEXT_TOOL, { field: 'title', value: 'x' }).allow, true)
    assert.equal(checkToolUse(root, styleAccess, TEXT_TOOL, { field: 'title', value: 'x' }).allow, false)
  })

  it('cantonne les recherches aux dossiers du site', () => {
    // Portage Conduit : `src` entier contient l'admin et le client Sanity, une recherche n'y est plus permise.
    assert.equal(checkToolUse(root, styleAccess, 'Grep', { pattern: 'data-edit', path: 'src' }).allow, false)
    assert.equal(checkToolUse(root, styleAccess, 'Grep', { pattern: 'data-edit', path: 'src/components' }).allow, true)
    assert.equal(checkToolUse(root, styleAccess, 'Glob', { pattern: '**/*.css', path: `${root}/src/components` }).allow, true)
    assert.equal(checkToolUse(root, styleAccess, 'Grep', { pattern: 'SECRET' }).allow, false)
    assert.equal(checkToolUse(root, styleAccess, 'Glob', { pattern: '../**/.env*', path: 'src' }).allow, false)
  })

  it('laisse toujours mesurer le rendu et poser une question au client', () => {
    for (const access of [styleAccess, textOnlyCms]) {
      assert.equal(checkToolUse(root, access, MEASURE_TOOL, {}).allow, true)
      assert.equal(checkToolUse(root, access, ASK_TOOL, { questions: [] }).allow, true)
    }
  })

  it('refuse tout autre outil', () => {
    assert.equal(checkToolUse(root, styleAccess, 'Bash', { command: 'ls' }).allow, false)
    assert.equal(checkToolUse(root, styleAccess, 'Write', { file_path: `${root}/src/x.css` }).allow, false)
  })

  it('donne ses raisons en anglais : Claude les lit, et le client les voit dans le journal', () => {
    const reason = (access: typeof styleAccess, tool: string, input: Record<string, unknown>) => {
      const verdict = checkToolUse(root, access, tool, input)
      assert.equal(verdict.allow, false, tool)
      return (verdict as { reason: string }).reason
    }
    assert.equal(
      reason(styleAccess, 'Read', { file_path: `${root}/.env.local` }),
      `Read refused (${root}/.env.local): only src/components, src/styles, src/app/(site), src/lib and ` +
        'package.json, tsconfig.json, next.config.ts can be read.',
    )
    assert.equal(
      reason(styleAccess, 'Grep', { pattern: 'x', path: 'src' }),
      'Search is limited to the site folders: pass path: "src/components" (or src/styles, src/app/(site), src/lib).',
    )
    assert.equal(
      reason(styleAccess, 'Glob', { pattern: '../**/.env*', path: 'src/components' }),
      'Search pattern refused: stay within the site folders.',
    )
    assert.equal(
      reason(textOnlyCms, 'Edit', { file_path: `${root}/src/components/Hero/Hero.module.css` }),
      'No file can be edited for this request: text is changed with the set_text tool.',
    )
    assert.equal(
      reason(styleAccess, 'Edit', { file_path: `${root}/src/app/globals.css` }),
      'Edit refused (src/app/globals.css): outside the scope allowed by the client. ' +
        'Allowed files: src/components/Hero/Hero.module.css, src/components/Hero/Hero.tsx.',
    )
    assert.equal(reason(styleAccess, TEXT_TOOL, { field: 'title', value: 'x' }), 'The client did not allow text changes (T).')
    assert.equal(reason(styleAccess, 'Bash', { command: 'ls' }), 'Tool not allowed in the visual editor: Bash.')
  })
})

const STYLE = { style: true, text: false }

describe('lintChanges', () => {
  const HERO_CSS = 'src/components/Hero/Hero.module.css'
  const context = () => ({ scope: STYLE, policy: ds.policy, hardcoded: [], zone: 'hero.cta', zones: ds.zones })

  it('juge un CSS entier, fichier d’avant contre fichier d’après', () => {
    const { violations } = lintChanges(
      [{ file: HERO_CSS, before: '.cta { color: var(--color-ink); }', after: '.cta { color: #fff; }' }],
      context(),
    )
    assert.deepEqual(
      violations.map((violation) => [violation.file, violation.rule]),
      [[HERO_CSS, 'value']],
    )
  })

  it('envoie un composant au contrôle de son arbre', () => {
    const change = {
      file: 'src/components/Article/Article.tsx',
      before: 'export const Meta = () => <p><span>{a}</span><span>{b}</span></p>\n',
      after: 'export const Meta = () => <p><span>{b}</span><span>{a}</span></p>\n',
    }
    assert.deepEqual(
      lintChanges([change], context()).violations.map((violation) => violation.rule),
      ['structure-change'],
    )
  })

  it('passe au contrôle du composant la zone choisie par le client', () => {
    const header = (nav: string) =>
      'export const Header = () => (\n  <header data-edit="header">\n    <a data-edit="header.logo">LyonDrive</a>\n' +
      `    <nav data-edit="header.nav"><a href="/">${nav}</a></nav>\n  </header>\n)\n`
    const change = { file: 'src/components/Header/Header.tsx', before: header('Accueil'), after: header('Nos voitures') }
    const rules = (zone: string) =>
      lintChanges([change], { ...context(), scope: { style: false, text: true }, zone }).violations.map((v) => v.rule)
    assert.deepEqual(rules('header.nav'), [])
    assert.deepEqual(rules('header.logo'), ['text-zone'])
  })

  it('refuse tout autre type de fichier', () => {
    const [violation] = lintChanges([{ file: 'src/lib/data.json', before: '{}', after: '{"a":1}' }], context()).violations
    assert.equal(violation.rule, 'file-type')
    assert.equal(violation.message, 'File type cannot be edited in the editor: src/lib/data.json.')
    for (const file of ['src/editor/RULES.md', 'src/lib/data.mjs', 'src/lib/data.mts', 'src/components/Hero/Hero.module.scss']) {
      const { violations } = lintChanges([{ file, before: 'a', after: 'b' }], context())
      assert.deepEqual(violations.map((v) => v.rule), ['file-type'], file)
    }
  })

  const WHITE_60 = { property: 'background-color', value: 'rgb(248 250 252 / 0.6)' }
  const ROSE = '.cta { background-color: var(--color-rose); }'

  it('renvoie les valeurs en dur accordées qui ont laissé passer une déclaration ajoutée, quelle que soit leur écriture', () => {
    const unused = { property: 'font-size', value: '40px' }
    const { violations, granted } = lintChanges(
      [{ file: HERO_CSS, before: ROSE, after: '.cta { background-color: rgb( 248   250 252 /\n    0.6 ); }' }],
      { ...context(), hardcoded: [WHITE_60, unused] },
    )
    assert.deepEqual(violations, [])
    assert.deepEqual(granted, [WHITE_60])
  })

  it('ne compte pas une valeur accordée déjà présente, retirée, sur une autre propriété ou refusée', () => {
    const cases = [
      // Déjà présente et inchangée : aucune déclaration ajoutée ne l’utilise.
      {
        before: `.cta { background-color: ${WHITE_60.value}; }`,
        after: `.cta { background-color: ${WHITE_60.value}; color: var(--color-ink); }`,
      },
      // Retirée : elle figure dans le diff, mais n’est pas écrite.
      { before: `.cta { background-color: ${WHITE_60.value}; }`, after: ROSE },
      // Même valeur sur une autre propriété : refusée.
      { before: ROSE, after: `.cta { background-color: var(--color-rose); color: ${WHITE_60.value}; }` },
      // Accordée, mais la déclaration est refusée pour une autre raison.
      { before: ROSE, after: `.cta { background-color: ${WHITE_60.value} !important; }` },
    ]
    for (const { before, after } of cases) {
      const { granted } = lintChanges([{ file: HERO_CSS, before, after }], { ...context(), hardcoded: [WHITE_60] })
      assert.deepEqual(granted, [], after)
    }
  })
})

describe('outOfScope', () => {
  it('liste les fichiers modifiés hors du périmètre', () => {
    assert.deepEqual(outOfScope(['src/components/Hero/Hero.module.css', 'src/app/globals.css'], heroFiles), ['src/app/globals.css'])
  })
})
