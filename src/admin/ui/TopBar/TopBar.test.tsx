import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TopBar } from './TopBar'

describe('TopBar', () => {
  it('statusAction : « See error » posé juste après le texte d’état, avant l’autosave et le Publish (G3 état 5)', () => {
    const html = renderToStaticMarkup(
      <TopBar
        state="failed"
        statusText="Publish failed — previous version still live"
        statusAction={<button type="button">See error</button>}
        autosaveText="Draft saved automatically"
        publish={<button type="button">Retry</button>}
      />,
    )
    const status = html.indexOf('Publish failed')
    const seeError = html.indexOf('See error')
    const autosave = html.indexOf('Draft saved automatically')
    const retry = html.indexOf('Retry')
    expect(seeError).toBeGreaterThan(status)
    expect(seeError).toBeLessThan(autosave)
    expect(autosave).toBeLessThan(retry)
    expect(html).toMatch(/data-status-action=""[^>]*><button type="button">See error<\/button>/)
  })

  it('sans statusAction : pas d’emplacement vide', () => {
    expect(renderToStaticMarkup(<TopBar state="idle" />)).not.toContain('data-status-action')
  })
})
