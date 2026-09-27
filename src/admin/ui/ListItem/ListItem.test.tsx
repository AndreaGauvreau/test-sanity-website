import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ListItem } from './ListItem'

describe('ListItem', () => {
  it('sans écart par défaut (Figma « List item » : V gap 0)', () => {
    const html = renderToStaticMarkup(<ListItem title="Marie Dupont" subtitle="marie@conduit.com" />)
    expect(html).not.toContain('data-text-gap')
  })

  it('textGap={2} : écart de 2 px entre titre et sous-titre (E1)', () => {
    const html = renderToStaticMarkup(<ListItem title="Home" subtitle="Hero — title" textGap={2} />)
    expect(html).toContain('data-text-gap="2"')
  })
})
