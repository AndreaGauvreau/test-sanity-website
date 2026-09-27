/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Composants interactifs de C1, C2, C6 en jsdom, avec de fausses fonctions d'écriture (aucune server action réelle) :
 * formulaire généré depuis le manifeste, accordéon, validation immédiate, sauvegarde automatique (debounce) et
 * état « Draft saved automatically » (autosave), aperçus mis à jour pendant la frappe.
 */

vi.stubEnv('NEXT_PUBLIC_SANITY_PROJECT_ID', 'test1234')
vi.stubEnv('NEXT_PUBLIC_SANITY_DATASET', 'development')
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock('../server/actions', () => ({
  savePageFieldAction: vi.fn(),
  savePageArrayAction: vi.fn(),
  savePageSeoAction: vi.fn(),
  saveArticleSeoAction: vi.fn(),
}))

const { autosave } = await import('@/admin/core/autosave')
const { findPage, sectionSource, sectionSummary } = await import('../lib/manifest')
const { ContentView } = await import('./ContentView')
const { SeoView } = await import('./SeoView')
const { ArticleSeoView, indexingTarget } = await import('./ArticleSeoView')
const { adminConfig } = await import('@/admin.config')

MotionGlobalConfig.skipAnimations = true
const text = (el: Element) => el.textContent ?? ''
const value = (el: Element) => (el as HTMLInputElement).value
// jsdom : défilement du cadre d'aperçu et CSS.escape.
Element.prototype.scrollTo = function () {} as never
if (!('escape' in CSS)) (CSS as { escape?: (s: string) => string }).escape = (s: string) => s

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const home = findPage('home')!
const doc = {
  hero: {
    title: 'Dock scheduling, solved.',
    lede: 'Book, confirm and track every appointment in one place.',
    primaryCta: { label: 'Book a demo', href: '/demo' },
    ratings: [{ _key: 'g2', _type: 'rating', platform: 'g2', label: '4.7 stars on G2' }],
  },
  features: { title: 'Features', items: ['a', 'b', 'c'].map((k) => ({ _key: k, title: `Card ${k}`, text: 'x' })) },
  testimonial: { title: 'Customer testimonial' },
}

type SaveFn = (path: string, value: unknown) => Promise<{ ok: true } | { ok: false; error: string }>
type ArrayFn = (path: string, op: import('../lib/form').ArrayOp) => Promise<{ ok: true; items?: Record<string, unknown>[] } | { ok: false; error: string }>

function renderContent(
  saveField: ReturnType<typeof vi.fn<SaveFn>> = vi.fn<SaveFn>(async () => ({ ok: true })),
  saveArray: ReturnType<typeof vi.fn<ArrayFn>> = vi.fn<ArrayFn>(async () => ({ ok: true })),
) {
  const sections = home.sections.map((section) => ({
    section,
    summary: sectionSummary(section, ((doc as unknown as Record<string, Record<string, unknown>>)[section.name]) ?? null),
    source: sectionSource(section),
  }))
  render(
    <ContentView
      pageId="home"
      sections={sections}
      value={doc}
      hasDraft={false}
      readOnly={false}
      referenceOptions={{ testimonial: [{ value: 't1', label: 'Jane Doe' }] }}
      saveField={saveField}
      saveArray={saveArray}
      uploadImage={vi.fn()}
    />,
  )
  return saveField
}

describe('C1 · formulaire généré depuis le manifeste', () => {
  it('sections dans l’ordre du site, première ouverte, résumés et sources des autres', () => {
    renderContent()
    const headers = screen.getAllByRole('button', { expanded: false }).filter((b) => b.closest('h2'))
    expect(headers).toHaveLength(home.sections.length - 1)
    const hero = screen.getByRole('button', { name: /Hero/, expanded: true })
    expect(text(hero)).toContain(`Section 1 / ${home.sections.length}`)
    expect(text(screen.getByRole('button', { name: /Features/ }))).toContain('3 cards')
    expect(text(screen.getByRole('button', { name: /Testimonial/ }))).toContain('From CMS › Testimonials')
    // Champs du Hero : texte, textarea, bouton (libellé + lien), tableau à longueur variable.
    expect(value(screen.getByLabelText('Title'))).toBe('Dock scheduling, solved.')
    expect(screen.getByLabelText('Subtitle').tagName).toBe('TEXTAREA')
    expect(value(screen.getByLabelText('Button 1 · label'))).toBe('Book a demo')
    expect(value(screen.getByLabelText('Button 1 · link'))).toBe('/demo')
    expect((screen.getByRole('button', { name: 'Add rating' }) as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByText('Need another field? Ask Kuartz — fields are defined in code.')).toBeTruthy()
  })

  it('une seule section ouverte à la fois ; tableau à longueur fixe sans ajout ; champ masqué signalé', async () => {
    const user = userEvent.setup()
    renderContent()
    await user.click(screen.getByRole('button', { name: /Features/ }))
    expect((screen.getByRole('button', { name: /Hero/ })).getAttribute('aria-expanded')).toBe('false')
    const panel = screen.getByRole('region', { name: /Features/ })
    expect(within(panel).getAllByRole('group', { name: /Card \d/ })).toHaveLength(3)
    expect(within(panel).queryByRole('button', { name: /Add card/ })).toBeNull()
    expect(within(panel).getByText('Hidden on screen')).toBeTruthy()
  })

  it('frappe → validation immédiate, puis enregistrement du champ (chemin du manifeste) après le délai', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const saveField = renderContent()
    const states: string[] = []
    const off = autosave.subscribe(() => states.push(autosave.get().status))
    const title = screen.getByLabelText('Title')

    fireEvent.change(title, { target: { value: '' } })
    expect(screen.getByText('Title is required.')).toBeTruthy()
    await act(async () => void vi.advanceTimersByTime(1000))
    expect(saveField).not.toHaveBeenCalled()

    fireEvent.change(title, { target: { value: 'Dock scheduling' } })
    fireEvent.change(title, { target: { value: 'Dock scheduling, done.' } })
    expect(screen.queryByText('Title is required.')).toBeNull()
    await act(async () => void vi.advanceTimersByTime(700))
    expect(saveField).toHaveBeenCalledTimes(1)
    expect(saveField).toHaveBeenCalledWith('hero.title', 'Dock scheduling, done.')
    await waitFor(() => expect(states).toContain('saved'))
    expect(states[0]).toBe('saving')
    off()
  })

  it('lien dangereux refusé dans le navigateur ; erreur du serveur affichée', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const saveField = vi.fn<SaveFn>(async () => ({ ok: false, error: "You don't have permission to edit this in Sanity." }))
    renderContent(saveField)
    fireEvent.change(screen.getByLabelText('Button 1 · link'), { target: { value: 'javascript:alert(1)' } })
    expect(screen.getByText('Button 1 · link must be a valid link (https://…, /page, mailto:…).')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Button 1 · label'), { target: { value: 'Talk to sales' } })
    await act(async () => void vi.advanceTimersByTime(700))
    expect(saveField).toHaveBeenCalledWith('hero.primaryCta.label', 'Talk to sales')
    expect(await screen.findByText("You don't have permission to edit this in Sanity.")).toBeTruthy()
  })

  it('tableau à longueur variable : un élément ajouté incomplet n’est pas envoyé, la suppression part par clé', async () => {
    const user = userEvent.setup()
    const saveArray = vi.fn<ArrayFn>(async () => ({ ok: true }))
    const saveField = renderContent(undefined, saveArray)
    await user.click(screen.getByRole('button', { name: 'Add rating' }))
    expect((screen.getByRole('button', { name: 'Add rating' }) as HTMLButtonElement).disabled).toBe(true)
    expect(text(screen.getByRole('alert'))).toContain('Ratings 2 · Platform is required.')
    // Retirer l'élément neuf revient à l'état enregistré : rien à envoyer.
    await user.click(screen.getByRole('button', { name: 'Remove rating 2' }))
    await new Promise((r) => setTimeout(r, 800))
    expect(saveArray).not.toHaveBeenCalled()
    // Retirer l'élément existant : opération par CLÉ (FOLLOWUPS #40), jamais le tableau entier.
    await user.click(screen.getByRole('button', { name: 'Remove rating 1' }))
    await waitFor(() => expect(saveArray).toHaveBeenCalledWith('hero.ratings', { op: 'remove', key: 'g2' }))
    expect(saveField).not.toHaveBeenCalledWith('hero.ratings', expect.anything())
  })

  it('FOLLOWUPS #40 : ajout complété → insert après le dernier élément enregistré, puis update ; ajout fait ailleurs affiché', async () => {
    const user = userEvent.setup()
    const saveArray = vi.fn<ArrayFn>(async (_path, op) =>
      op.op === 'insert'
        ? // Le serveur renvoie aussi un élément ajouté entre-temps par un autre onglet.
          { ok: true, items: [{ _key: 'g2', _type: 'rating', platform: 'g2', label: '4.7 stars on G2' }, { _key: 'other', _type: 'rating', platform: 'g2', label: 'Other tab' }, op.item] }
        : { ok: true },
    )
    renderContent(undefined, saveArray)
    await user.click(screen.getByRole('button', { name: 'Add rating' }))
    const card = screen.getByRole('group', { name: 'Rating 2' })
    await user.click(within(card).getByRole('combobox', { name: /Platform/ }))
    await user.click(screen.getByRole('option', { name: 'Capterra' }))
    await user.type(within(card).getByLabelText(/^Text/), 'Top rated')
    await waitFor(() => expect(saveArray).toHaveBeenCalledTimes(1), { timeout: 2000 })
    const [path, op] = saveArray.mock.calls[0]
    expect(path).toBe('hero.ratings')
    expect(op).toMatchObject({ op: 'insert', after: 'g2', item: { _type: 'rating', platform: 'capterra', label: 'Top rated' } })
    // Le tableau du serveur est fusionné : l'ajout de l'autre onglet apparaît, la saisie locale reste.
    await waitFor(() => expect(screen.getAllByRole('group', { name: /^Rating \d$/ })).toHaveLength(3))
    expect(value(within(screen.getByRole('group', { name: 'Rating 3' })).getByLabelText(/^Text/))).toBe('Top rated')
    // Frappe suivante sur le même élément : update par clé (l'élément existe désormais).
    await user.type(within(screen.getByRole('group', { name: 'Rating 3' })).getByLabelText(/^Text/), '!')
    await waitFor(() => expect(saveArray).toHaveBeenCalledTimes(2), { timeout: 2000 })
    expect(saveArray.mock.calls[1][1]).toMatchObject({ op: 'update', item: { _key: (op as unknown as { item: { _key: string } }).item._key, label: 'Top rated!' } })
  })

  it('FOLLOWUPS #40 : réordonnancement par clé (move before / after), bornes désactivées', async () => {
    const user = userEvent.setup()
    const saveArray = vi.fn<ArrayFn>(async () => ({ ok: true }))
    const two = { ...doc, hero: { ...doc.hero, ratings: [...doc.hero.ratings, { _key: 'cap', _type: 'rating', platform: 'capterra', label: '4.8' }] } }
    render(
      <ContentView
        pageId="home"
        sections={home.sections.map((section) => ({ section, summary: '', source: null }))}
        value={two}
        hasDraft
        readOnly={false}
        referenceOptions={{}}
        saveField={vi.fn()}
        saveArray={saveArray}
        uploadImage={vi.fn()}
      />,
    )
    expect((screen.getByRole('button', { name: 'Move rating 1 up' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Move rating 2 down' }) as HTMLButtonElement).disabled).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Move rating 2 up' }))
    await waitFor(() => expect(saveArray).toHaveBeenCalledWith('hero.ratings', { op: 'move', key: 'cap', to: { before: 'g2' } }))
    expect(value(within(screen.getByRole('group', { name: 'Rating 1' })).getByLabelText(/^Text/))).toBe('4.8')
  })

  it('référence : liste des éléments de la collection', async () => {
    const user = userEvent.setup()
    const saveField = renderContent()
    await user.click(screen.getByRole('button', { name: /Testimonial/ }))
    await user.click(screen.getByRole('combobox', { name: /Testimonial shown/ }))
    await user.click(screen.getByRole('option', { name: 'Jane Doe' }))
    await waitFor(() => expect(saveField).toHaveBeenCalledWith('testimonial.item', { _type: 'reference', _ref: 't1' }))
  })
})

const settings = { title: 'Conduit', description: 'Site description', allowIndexing: true, faviconLight: null, faviconDark: null, socialImage: null, scripts: null } as never

describe('C2 · SEO de la page', () => {
  it('compteurs indicatifs (orange au-delà), aperçus mis à jour pendant la frappe, écriture de la clé', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const save = vi.fn(async () => ({ ok: true as const }))
    render(
      <SeoView
        pageId="home"
        path="/"
        domain="conduit.com"
        siteName="Conduit"
        initial={{ metaTitle: 'Dock', metaDescription: '', ogImage: null, allowIndexing: true }}
        settings={settings}
        readOnly={false}
        jsonLd={<p>json</p>}
        headings={<p>headings</p>}
        save={save}
        upload={vi.fn()}
      />,
    )
    expect(screen.getByText('4 / 60')).toBeTruthy()
    const preview = screen.getByLabelText('Google search preview')
    expect(text(preview)).toContain('Dock — Conduit')
    expect(text(preview)).toContain('Site description')
    const long = 'x'.repeat(61)
    fireEvent.change(screen.getByLabelText('Meta title'), { target: { value: long } })
    expect((screen.getByText('61 / 60')).className).toMatch(/over/)
    expect(text(screen.getByLabelText('Social media preview'))).toContain(long)
    await act(async () => void vi.advanceTimersByTime(700))
    expect(save).toHaveBeenCalledWith('metaTitle', long)
    fireEvent.click(screen.getByRole('switch', { name: 'Search engines' }))
    await act(async () => void vi.advanceTimersByTime(10))
    expect(save).toHaveBeenCalledWith('allowIndexing', false)
  })
})

describe('C6 · modèle SEO d’article', () => {
  const blog = findPage('blog')!
  const articles = [
    {
      id: 'p1',
      title: 'Carrier portals: a checklist',
      slug: 'carrier-portals',
      values: { title: 'Carrier portals: a checklist', excerpt: 'Before you roll out a carrier portal.', slug: 'carrier-portals', cover: 'https://cdn/c.jpg' },
      coverUrl: 'https://cdn/c.jpg',
      coverAlt: null,
    },
    { id: 'p2', title: 'Second', slug: 'second', values: { title: 'Second', excerpt: 'Two' }, coverUrl: null, coverAlt: null },
  ]

  it('variables résolues avec l’article choisi, longueur estimée, indexation de tous les articles', async () => {
    const user = userEvent.setup()
    render(
      <ArticleSeoView
        pageId="blog"
        domain="conduit.com"
        siteName="Conduit"
        pathPattern={blog.article!.path}
        collectionLabel="Blog"
        itemLabel="post"
        itemsLabel="posts"
        variables={adminConfig.articleSeoTemplates[0].variables}
        imageFields={[{ value: 'cover', label: 'Cover' }]}
        initial={{ metaTitle: '{{title}} | Conduit Blog', metaDescription: '{{excerpt}}', ogImageField: 'cover', ogImage: null, allowIndexing: true }}
        settings={settings}
        articles={articles}
        total={12}
        readOnly={false}
        jsonLd={null}
        save={vi.fn(async () => ({ ok: true as const }))}
        upload={vi.fn()}
      />,
    )
    expect(screen.getByText('≈ 43 / 60 with “Carrier portals: a checklist”')).toBeTruthy()
    expect(text(screen.getByLabelText('Google search preview'))).toContain('Carrier portals: a checklist | Conduit Blog — Conduit')
    expect(text(screen.getByLabelText('Google search preview'))).toContain('https://conduit.com › blog › carrier-portals')
    expect(screen.getByText('Allow indexing of all 12 Blog posts.')).toBeTruthy()
    expect(screen.getByText('From field')).toBeTruthy()
    expect(screen.getByText(/with this post$/)).toBeTruthy()
    await user.click(screen.getByRole('combobox', { name: 'Preview with' }))
    await user.click(screen.getByRole('option', { name: 'Second' }))
    expect(text(screen.getByLabelText('Social media preview'))).toContain('Second | Conduit Blog')
  })

  it('FAQ : variables de la question, libellés de la collection, pas de « From field » (pas d’image)', async () => {
    const save = vi.fn(async () => ({ ok: true as const }))
    const faqPage = findPage('faq')!
    const faqs = [
      {
        id: 'f1',
        title: 'How do carriers book a slot?',
        slug: 'how-do-carriers-book-a-slot',
        values: { question: 'How do carriers book a slot?', slug: 'how-do-carriers-book-a-slot', answer: 'From the carrier portal, in two clicks.' },
        coverUrl: null,
        coverAlt: null,
      },
    ]
    render(
      <ArticleSeoView
        pageId="faq"
        domain="conduit.com"
        siteName="Conduit"
        pathPattern={faqPage.article!.path}
        collectionLabel="FAQ"
        itemLabel="question"
        itemsLabel="questions"
        variables={adminConfig.articleSeoTemplates.find((t) => t.collection === 'faq')!.variables}
        imageFields={[]}
        initial={{ metaTitle: '{{question}}', metaDescription: '{{answer}}', ogImageField: null, ogImage: null, allowIndexing: true }}
        settings={settings}
        articles={faqs}
        total={9}
        readOnly={false}
        jsonLd={null}
        save={save}
        upload={vi.fn()}
      />,
    )
    expect(screen.getByText('≈ 28 / 60 with “How do carriers book a slot?”')).toBeTruthy()
    expect(screen.getByText(/with this question$/)).toBeTruthy()
    expect(text(screen.getByLabelText('Google search preview'))).toContain('How do carriers book a slot? — Conduit')
    expect(text(screen.getByLabelText('Google search preview'))).toContain('https://conduit.com › faq › how-do-carriers-book-a-slot')
    expect(text(screen.getByLabelText('Google search preview'))).toContain('From the carrier portal, in two clicks.')
    expect(screen.getByText('Allow indexing of all 9 FAQ questions.')).toBeTruthy()
    expect(screen.queryByText('From field')).toBeNull()
    expect(screen.queryByRole('button', { name: /Use the/ })).toBeNull()
    expect(screen.queryByText(/post/)).toBeNull()
    expect(save).not.toHaveBeenCalled()
  })

  it('indexation : le nom de la collection n’est pas répété (« all 3 testimonials »)', () => {
    expect(indexingTarget(12, 'Blog', 'posts')).toBe('12 Blog posts')
    expect(indexingTarget(3, 'Testimonials', 'testimonials')).toBe('3 testimonials')
    expect(indexingTarget(1, 'Testimonials', 'testimonial')).toBe('1 testimonial')
    expect(indexingTarget(9, 'FAQ', 'questions')).toBe('9 FAQ questions')
  })
})
