import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SectionHeader } from './SectionHeader'

describe('SectionHeader', () => {
  it('h2 par défaut', () => {
    expect(renderToStaticMarkup(<SectionHeader title="Scripts" />)).toMatch(/^<div[^>]*><div[^>]*><h2 /)
  })

  it('headingLevel={1} : titre de l’écran quand le Figma n’a qu’un Section header (B3 Code, B5 Usage)', () => {
    const html = renderToStaticMarkup(<SectionHeader title="Scripts" headingLevel={1} titleId="t" description="Code added to every page." />)
    expect(html).toContain('<h1 id="t"')
    expect(html).toContain('>Scripts</h1>')
  })
})
