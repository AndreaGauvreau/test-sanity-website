/** @vitest-environment jsdom */
import { useState } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TabPanel, Tabs } from './Tabs'

afterEach(cleanup)

const ITEMS = [
  { value: 'pending', label: 'Pending (3)' },
  { value: 'versions', label: 'Versions' },
  { value: 'drafts', label: 'Drafts', disabled: true },
  { value: 'activity', label: 'Activity' },
]

function Demo({ activation }: { activation?: 'automatic' | 'manual' }) {
  const [value, setValue] = useState('pending')
  return (
    <>
      <Tabs idBase="pub" items={ITEMS} value={value} onValueChange={setValue} activation={activation} aria-label="Publish" />
      {ITEMS.map((t) => (
        <TabPanel key={t.value} idBase="pub" value={t.value} active={t.value === value}>
          Panel {t.label}
        </TabPanel>
      ))}
    </>
  )
}

describe('Tabs', () => {
  it('tablist / tab / tabpanel reliés, un seul onglet atteignable', () => {
    render(<Demo />)
    expect(screen.getByRole('tablist', { name: 'Publish' })).toBeTruthy()
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false', 'false'])
    expect(tabs.map((t) => t.tabIndex)).toEqual([0, -1, -1, -1])
    const panel = screen.getByRole('tabpanel')
    expect(panel.getAttribute('aria-labelledby')).toBe(tabs[0].id)
    expect(tabs[0].getAttribute('aria-controls')).toBe(panel.id)
  })

  it('activation automatique : ← → Home End, l’onglet désactivé est sauté, en boucle', async () => {
    render(<Demo />)
    const tabs = screen.getAllByRole('tab')
    tabs[0].focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(tabs[1])
    expect(tabs[1].getAttribute('aria-selected')).toBe('true')
    await userEvent.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(tabs[3])
    await userEvent.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(tabs[0])
    await userEvent.keyboard('{End}')
    expect(document.activeElement).toBe(tabs[3])
    expect(screen.getByRole('tabpanel').textContent).toBe('Panel Activity')
    await userEvent.keyboard('{Home}{ArrowLeft}')
    expect(document.activeElement).toBe(tabs[3])
  })

  it('activation manuelle : les flèches déplacent le focus, Entrée sélectionne', async () => {
    render(<Demo activation="manual" />)
    const tabs = screen.getAllByRole('tab')
    tabs[0].focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(tabs[1])
    expect(tabs[1].getAttribute('aria-selected')).toBe('false')
    await userEvent.keyboard('{Enter}')
    expect(tabs[1].getAttribute('aria-selected')).toBe('true')
  })

  it('clic : sélectionne ; non contrôlé avec defaultValue', async () => {
    const onValueChange = vi.fn()
    render(<Tabs items={ITEMS} defaultValue="versions" onValueChange={onValueChange} aria-label="X" />)
    await userEvent.click(screen.getByRole('tab', { name: 'Activity' }))
    expect(onValueChange).toHaveBeenCalledWith('activity')
    expect(screen.getByRole('tab', { name: 'Activity' }).getAttribute('aria-selected')).toBe('true')
  })

  it('onglets de route : nav de liens avec aria-current', () => {
    render(
      <Tabs
        aria-label="Page"
        value="content"
        items={[
          { value: 'content', label: 'Content', href: '/admin/pages/home' },
          { value: 'seo', label: 'SEO', href: '/admin/pages/home/seo' },
        ]}
      />,
    )
    expect(screen.queryByRole('tablist')).toBeNull()
    const nav = screen.getByRole('navigation', { name: 'Page' })
    const links = nav.querySelectorAll('a')
    expect(links[0].getAttribute('aria-current')).toBe('page')
    expect(links[1].getAttribute('href')).toBe('/admin/pages/home/seo')
  })
})
