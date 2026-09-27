import { describe, expect, it } from 'vitest'

import { escapeValue, resolveTemplate, templateVariables } from './template-variables'

describe('templateVariables', () => {
  it('liste les variables sans doublon, espaces tolérés', () => {
    expect(templateVariables('{{title}} | {{ excerpt }} {{title}}')).toEqual(['title', 'excerpt'])
    expect(templateVariables('rien')).toEqual([])
  })
})

describe('resolveTemplate', () => {
  const values = { title: 'Carrier portals: a checklist', excerpt: '', author: null }

  it('remplace les variables connues, signale les vides et les inconnues', () => {
    const result = resolveTemplate('{{title}} | {{excerpt}} {{nope}} {{author}}', values, 'text')
    expect(result.value).toBe('Carrier portals: a checklist |  {{nope}} ')
    expect(result.empty).toEqual(['excerpt', 'author'])
    expect(result.unknown).toEqual(['nope'])
  })

  it('texte sans variable : intact', () => {
    expect(resolveTemplate('Blog', values, 'text')).toEqual({ value: 'Blog', empty: [], unknown: [] })
  })
})

describe('escapeValue', () => {
  it('js : jamais de fermeture de chaîne ni de </script>', () => {
    const value = 'He said "hi" </script><script>alert(1)</script>\n\u2028'
    const escaped = escapeValue(value, 'js')
    expect(escaped).not.toContain('</script')
    expect(escaped).not.toMatch(/(^|[^\\])"/)
    expect(JSON.parse(`"${escaped}"`)).toBe(value)
  })

  // SEC-01 : la valeur doit rester inerte entre guillemets doubles, apostrophes ET accents graves.
  it('js : ni apostrophe, ni accent grave, ni $, ni barre oblique en clair', () => {
    const escaped = escapeValue("it's `x` ${alert(1)} */", 'js')
    expect(escaped).not.toMatch(/['`$/]/)
    expect(JSON.parse(`"${escaped}"`)).toBe("it's `x` ${alert(1)} */")
  })

  it('css : ni guillemet ni accolade', () => {
    const escaped = escapeValue(`a"}body{color:red}'`, 'css')
    expect(escaped).not.toMatch(/["'{}]/)
  })

  it('html : entités', () => {
    expect(escapeValue(`<a href="x">&'`, 'html')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;')
  })
})
