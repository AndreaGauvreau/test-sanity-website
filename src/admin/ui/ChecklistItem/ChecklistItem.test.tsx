import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ChecklistItem } from './ChecklistItem'

describe('ChecklistItem', () => {
  it('à faire par défaut : <li>, icône pending, état lu avant le titre', () => {
    const html = renderToStaticMarkup(<ChecklistItem title="Content goes live in Sanity" description="In seconds, no build." />)
    expect(html).toMatch(/^<li [^>]*data-state="todo"/)
    expect(html).toContain('data-icon="pending"')
    expect(html).toContain('To do: </span>Content goes live in Sanity')
    expect(html).toContain('In seconds, no build.')
    expect(html).not.toContain('aria-current')
  })

  it('en cours : aria-current="step", icône qui tourne ; échec : action affichée', () => {
    const running = renderToStaticMarkup(<ChecklistItem state="running" title="Vercel builds and deploys" />)
    expect(running).toContain('aria-current="step"')
    expect(running).toContain('data-icon="loader"')
    const failed = renderToStaticMarkup(
      <ChecklistItem state="failed" title="Live on conduit.com" description="Build failed." action={<button type="button">See error</button>} />,
    )
    expect(failed).toContain('Failed: </span>')
    expect(failed).toContain('data-icon="error"')
    expect(failed).toContain('<button type="button">See error</button>')
  })

  it('as="div" et libellé d’état sur mesure', () => {
    const html = renderToStaticMarkup(<ChecklistItem as="div" state="done" stateLabel="Completed" title="Merged" />)
    expect(html).toMatch(/^<div /)
    expect(html).toContain('Completed: </span>Merged')
  })
})
