import { describe, expect, it } from 'vitest'

import { parseScriptCode, resolveScriptParts, scriptsForPage, scriptVariables, type SiteScript } from './site-scripts'

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
