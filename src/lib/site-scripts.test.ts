import { describe, expect, it } from 'vitest'

import { signableScript, signScript } from './script-signature'
import {
  parseScriptCode,
  resolveScriptParts,
  scriptsForPage,
  scriptVariables,
  scriptVariablesOutsideStrings,
  verifiedScripts,
  type SiteScript,
} from './site-scripts'

describe('parseScriptCode', () => {
  it('découpe <script>, <script src>, JSON-LD et <style>, dans l’ordre', () => {
    const code = `<!-- tag -->
<script async src="https://example.com/a.js"></script>
<script>window.a = 1</script>
<script type="application/ld+json">{"@type":"BlogPosting"}</script>
<style>.x { color: red }</style>`
    const { parts, ignored, unclosed } = parseScriptCode(code)
    expect(parts.map((part) => part.kind)).toEqual(['js', 'js', 'data', 'css'])
    expect(parts[0]).toMatchObject({ kind: 'js', attributes: { async: '', src: 'https://example.com/a.js' }, content: '' })
    expect(parts[1]).toMatchObject({ kind: 'js', content: 'window.a = 1' })
    expect(parts[2]).toMatchObject({ kind: 'data', type: 'application/ld+json' })
    expect(ignored).toBe('<!-- tag -->')
    expect(unclosed).toBe(false)
  })

  it('type="module" reste du JavaScript', () => {
    expect(parseScriptCode('<script type="module">import x from "y"</script>').parts[0].kind).toBe('js')
  })

  it('signale une balise non fermée', () => {
    const parsed = parseScriptCode('<script>alert(1)')
    expect(parsed.parts).toEqual([])
    expect(parsed.unclosed).toBe(true)
  })
})

describe('scriptsForPage', () => {
  const script = (page: string): SiteScript => ({ _key: page, name: page, placement: 'bodyEnd', page, run: 'once', code: '' })
  it('ne garde que la page exacte', () => {
    const scripts = [script('all'), script('home'), script('blog'), script('blog/slug')]
    expect(scriptsForPage(scripts, 'all').map((s) => s.page)).toEqual(['all'])
    expect(scriptsForPage(scripts, 'blog/slug').map((s) => s.page)).toEqual(['blog/slug'])
    expect(scriptsForPage(null, 'home')).toEqual([])
  })
})

describe('resolveScriptParts', () => {
  it('JSON-LD : valeurs échappées en chaîne JSON, le JSON reste valide', () => {
    const { parts } = parseScriptCode(
      '<script type="application/ld+json">{"headline":"{{title}}","image":"{{cover}}","x":"{{nope}}"}</script>',
    )
    const [resolved] = resolveScriptParts(parts, { title: 'A "quoted" </script> title', cover: 'https://cdn/x.jpg' })
    expect(resolved.content).not.toContain('</script')
    expect(JSON.parse(resolved.content)).toEqual({
      headline: 'A "quoted" </script> title',
      image: 'https://cdn/x.jpg',
      x: '{{nope}}',
    })
  })

  it('sans valeurs (page non article) : code intact', () => {
    const { parts } = parseScriptCode('<script>const t = "{{title}}"</script>')
    expect(resolveScriptParts(parts)[0].content).toBe('const t = "{{title}}"')
  })

  it('scriptVariables', () => {
    expect(scriptVariables('<script>"{{title}}" + "{{date}}"</script>')).toEqual(['title', 'date'])
  })
})

// SEC-01 : une valeur d'article (titre, extrait…) ne doit jamais sortir de la chaîne qui la contient,
// quel que soit le délimiteur (", ', `), ni devenir du code hors chaîne.
describe('resolveScriptParts — valeurs inertes (SEC-01)', () => {
  const hostile = `"'\`\${globalThis.pwned = 1} */ </script>\\ \n  end`

  function run(content: string): Record<string, unknown> {
    const sandbox: Record<string, unknown> = {}
    new Function('globalThis', content)(sandbox)
    return sandbox
  }

  it.each([
    ['guillemets doubles', '"{{title}}"'],
    ['apostrophes', "'{{title}}'"],
    ['accents graves', '`{{title}}`'],
    ['accents graves, texte autour', '`Read: {{title}} (${1 + 1})`'],
  ])('%s : la valeur reste une chaîne, rien n’est exécuté', (_label, literal) => {
    const { parts } = parseScriptCode(`<script>globalThis.t = ${literal}</script>`)
    const [resolved] = resolveScriptParts(parts, { title: hostile })
    expect(resolved.content).not.toContain('</script')
    const sandbox = run(resolved.content)
    expect(sandbox.pwned).toBeUndefined()
    expect(String(sandbox.t)).toContain(hostile)
  })

  it('hors chaîne (code, commentaire) : variable laissée telle quelle, jamais remplacée', () => {
    const code = '<script>/* {{title}} */ // {{title}}\nglobalThis.t = {{title}}; globalThis.u = "{{title}}"</script>'
    const [resolved] = resolveScriptParts(parseScriptCode(code).parts, { title: 'alert(1)' })
    expect(resolved.content).toBe('/* {{title}} */ // {{title}}\nglobalThis.t = {{title}}; globalThis.u = "alert(1)"')
  })

  it('expression d’un gabarit `${…}` : code, pas chaîne', () => {
    const [resolved] = resolveScriptParts(parseScriptCode('<script>globalThis.t = `a ${ {{title}} } b {{title}}`</script>').parts, {
      title: 'x',
    })
    expect(resolved.content).toBe('globalThis.t = `a ${ {{title}} } b x`')
  })

  it('expression régulière et division : les guillemets qu’elles contiennent n’ouvrent pas de chaîne', () => {
    const code = `<script>globalThis.r = /"/.test("a"); globalThis.d = 4 / 2 / 1; globalThis.t = {{title}}</script>`
    const [resolved] = resolveScriptParts(parseScriptCode(code).parts, { title: 'alert(1)' })
    expect(resolved.content).toContain('globalThis.t = {{title}}')
  })

  it('scriptVariablesOutsideStrings : variables placées hors d’une chaîne (B3 les refuse)', () => {
    expect(scriptVariablesOutsideStrings('<script>var a = "{{title}}"; var b = {{slug}}</script>')).toEqual(['slug'])
    expect(scriptVariablesOutsideStrings('<script type="application/ld+json">{"a":"{{title}}"}</script>')).toEqual([])
    expect(scriptVariablesOutsideStrings('<style>.x::after { content: "{{title}}" }</style>')).toEqual([])
  })
})

// SEC-04 : seul un script signé par l'admin (secret serveur) est injecté.
describe('verifiedScripts (SEC-04)', () => {
  const secret = 'x'.repeat(40)
  const base: SiteScript = {
    _key: 'k1',
    name: 'Tag',
    placement: 'bodyEnd',
    page: 'all',
    run: 'once',
    enabled: true,
    code: '<script>window.a = 1</script>',
  }

  it('script signé : gardé ; modifié hors admin, non signé, ou secret absent : écarté', async () => {
    const signature = await signScript(secret, signableScript(base))
    const signed = { ...base, signature }
    const tampered = { ...signed, _key: 'k2', code: '<script>steal()</script>' }
    const unsigned = { ...base, _key: 'k3' }
    expect((await verifiedScripts([signed, tampered, unsigned], secret)).map((s) => s._key)).toEqual(['k1'])
    expect(await verifiedScripts([signed], undefined)).toEqual([])
    expect(await verifiedScripts(null, secret)).toEqual([])
  })

  it('enabled absent = actif (même chaîne signée que enabled: true)', async () => {
    const signature = await signScript(secret, signableScript(base))
    const legacy = { ...base, enabled: null, signature }
    expect(await verifiedScripts([legacy], secret)).toHaveLength(1)
  })
})
