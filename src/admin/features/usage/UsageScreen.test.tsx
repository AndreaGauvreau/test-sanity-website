/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { parseUsageDocs, summarizeUsage, usageRows } from '@/admin/core/usage/aggregate'
import { AI_USAGE_NOTES } from '@/admin/ui'

/** B5 en jsdom : chiffres formatés, tableau, état vide, changement de période par l'URL. Données de TEST en mémoire. */

const router = vi.hoisted(() => ({ replace: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/admin/settings/usage' }))
vi.mock('next/link', () => ({ default: ({ href, children, scroll: _s, ...rest }: Record<string, unknown>) => <a href={String(href)} {...rest}>{children as never}</a> }))

const { UsageScreen, EMPTY_USAGE } = await import('./UsageScreen')

const NOW = new Date('2026-09-27T16:00:00Z')
const DOCS = parseUsageDocs([
  { _id: 'aiUsage.1', feature: 'editor', createdAt: '2026-09-20T10:00:00Z', model: 'claude-sonnet-5', inputTokens: 900_000, outputTokens: 107_000, costUsd: 4.3, status: 'done', request: 'Make the title bigger', user: { id: 'm', name: 'Marie', role: 'client' } },
  { _id: 'aiUsage.2', feature: 'ask', createdAt: '2026-09-21T10:00:00Z', model: 'claude-haiku-4-5-20251001', inputTokens: 300_000, outputTokens: 40_000, costUsd: 0.5, costKind: 'estimated', status: 'failed', user: { id: 'a', name: 'Andrea', role: 'kuartz' } },
  { _id: 'aiUsage.3', feature: 'editor', createdAt: '2026-09-02T09:00:00Z', model: 'claude-sonnet-5', inputTokens: 3_700_000, outputTokens: 413_000, costUsd: 14.1, status: 'done', user: { id: 'm', name: 'Marie', role: 'client' } },
])

beforeEach(() => {
  MotionGlobalConfig.skipAnimations = true
  router.replace.mockReset()
})
afterEach(() => {
  cleanup()
  MotionGlobalConfig.skipAnimations = false
})

function renderScreen(docs = DOCS, limit = 50, launchedAt?: string) {
  render(
    <div data-kz-admin="">
      <UsageScreen
        period="month"
        summary={summarizeUsage(docs, 'month', NOW)}
        allTime={summarizeUsage(docs, 'all-time', NOW)}
        rows={usageRows(docs, 'month', NOW, limit)}
        limit={limit}
        now={NOW}
        launchedAt={launchedAt}
      />
    </div>,
  )
}

describe('UsageScreen', () => {
  it('carte AI usage et Since launch (formats du contrat, jamais de crédits)', () => {
    renderScreen()
    expect(screen.getByRole('heading', { level: 1, name: 'Usage' })).toBeTruthy()
    const card = screen.getByRole('heading', { name: 'AI usage' }).closest('section')!
    expect(card.textContent).toContain('4.9M')
    expect(card.textContent).toContain('$18.90')
    expect(within(card).getByRole('list', { name: 'Usage by feature' }).textContent).toContain('Sonnet 5')
    expect(document.body.textContent).toContain('4.9M input · 560k output tokens · since Sep 2, 2026')
    expect(document.body.textContent?.toLowerCase()).not.toContain('credit')
  })

  it('Since launch : date de mise en ligne du manifeste quand elle est connue', () => {
    renderScreen(DOCS, 50, '2026-08-30')
    expect(document.body.textContent).toContain('4.9M input · 560k output tokens · online since Aug 30, 2026')
  })

  it('tableau Recent requests : plus récent en haut, statut et coût estimé signalés', () => {
    renderScreen()
    const rows = within(screen.getByRole('table')).getAllByRole('row')
    expect(rows[0].textContent).toBe('WhenWhoFeatureRequestModelInputOutputCost')
    expect(rows[1].textContent).toContain('Andrea')
    expect(rows[1].textContent).toContain('Question · Failed')
    expect(rows[1].textContent).toContain('~$0.50 (estimated)')
    expect(rows[2].textContent).toContain('Make the title bigger')
  })

  describe('abonnement Claude : jamais additionné au coût facturé', () => {
    const user = { id: 'a', name: 'Andrea', role: 'kuartz' }
    // Forme du dataset development au 28/09 : 5 demandes facturées (clé API, 0,02 $) + 2 par l'ABONNEMENT (0,18 $ et
    // 0,12 $ au prix de l'API, non facturées). Données de TEST en mémoire.
    const billed = Array.from({ length: 5 }, (_, i) => ({
      _id: `aiUsage.k${i}`,
      feature: 'editor',
      createdAt: `2026-09-2${i}T08:00:00Z`,
      model: 'claude-opus-5-5',
      inputTokens: 9_000,
      outputTokens: 100,
      costUsd: 0.02,
      costKind: 'billed',
      access: 'api-key',
      status: 'done',
      user,
    }))
    const subscription = [
      { _id: 'aiUsage.s1', feature: 'editor', createdAt: '2026-09-27T10:00:00Z', model: 'claude-opus-5-5', inputTokens: 120_000, outputTokens: 2_800, costUsd: 0.18, costKind: 'billed', access: 'subscription', status: 'done', request: 'Make the title bigger', user },
      { _id: 'aiUsage.s2', feature: 'editor', createdAt: '2026-09-26T10:00:00Z', model: 'claude-opus-5-5', inputTokens: 80_000, outputTokens: 900, costUsd: 0.12, costKind: 'billed', access: 'subscription', status: 'done', user },
    ]
    const INCLUDED = '≈ $0.30 at API prices — included in your Claude subscription'

    it('mélange : Cost et Since launch = facturé seulement ; part incluse à part ; note adaptée', () => {
      renderScreen(parseUsageDocs([...billed, ...subscription]))
      const card = screen.getByRole('heading', { name: 'AI usage' }).closest('section')!
      expect(within(card).getByText('$0.10')).toBeTruthy()
      expect(within(card).getByText(INCLUDED)).toBeTruthy()
      expect(within(card).getByText(AI_USAGE_NOTES.mixed)).toBeTruthy()
      expect(within(card).getByText('$0.10 + included')).toBeTruthy()
      // Since launch : même règle (valeur facturée, part incluse sur sa ligne).
      expect(screen.getAllByText('$0.10')).toHaveLength(2)
      expect(screen.getAllByText(INCLUDED)).toHaveLength(2)
      expect(document.body.textContent).not.toContain('$0.40')
    })

    it('abonnement seulement : Cost $0.00, « Included » par fonctionnalité, note de l’abonnement', () => {
      renderScreen(parseUsageDocs(subscription))
      const card = screen.getByRole('heading', { name: 'AI usage' }).closest('section')!
      expect(within(card).getByText('$0.00')).toBeTruthy()
      expect(within(card).getByText(INCLUDED)).toBeTruthy()
      expect(within(card).getByText(AI_USAGE_NOTES.included)).toBeTruthy()
      expect(within(card).queryByText(AI_USAGE_NOTES.billed)).toBeNull()
      expect(within(within(card).getByRole('list', { name: 'Usage by feature' })).getByText('Included')).toBeTruthy()
    })

    it('Recent requests : « Included » + prix API en secondaire (et lu en entier) ; facturé inchangé', () => {
      renderScreen(parseUsageDocs([...billed, ...subscription]))
      const rows = within(screen.getByRole('table')).getAllByRole('row')
      const cost = (row: HTMLElement) => row.querySelectorAll('td')[7]
      expect(cost(rows[1]).textContent).toContain('Included')
      expect(cost(rows[1]).textContent).toContain('≈ $0.18')
      expect(cost(rows[1]).textContent).toContain('included in your Claude subscription (≈ $0.18 at API prices)')
      expect(cost(rows[1]).querySelector('[title]')?.getAttribute('title')).toBe('≈ $0.18 at API prices — included in your Claude subscription')
      expect(cost(rows[2]).textContent).toContain('≈ $0.12')
      expect(cost(rows[3]).textContent).toBe('$0.02')
    })

    it('anciens documents sans `access` : facturés, comme avant', () => {
      renderScreen()
      const card = screen.getByRole('heading', { name: 'AI usage' }).closest('section')!
      expect(within(card).getByText(AI_USAGE_NOTES.billed)).toBeTruthy()
      expect(document.body.textContent).not.toContain('Included')
    })
  })

  it('état vide', () => {
    renderScreen([])
    expect(screen.getByRole('status').textContent).toBe(EMPTY_USAGE)
    expect(screen.queryByRole('table')).toBeNull()
    expect(document.body.textContent).toContain('No AI requests yet.')
  })

  it('« Show more » quand la période a plus de lignes que la limite', () => {
    renderScreen(DOCS, 1)
    expect(document.body.textContent).toContain('Showing 1 of 3 requests')
    expect(screen.getByRole('link', { name: 'Show more' }).getAttribute('href')).toBe('?limit=51')
  })

  it('changer de période met à jour l’URL', async () => {
    const user = userEvent.setup()
    renderScreen()
    await user.click(screen.getByRole('combobox', { name: 'Period' }))
    await user.click(await screen.findByRole('option', { name: 'Last 3 months' }))
    expect(router.replace).toHaveBeenCalledWith('/admin/settings/usage?period=3-months', { scroll: false })
  })

  it('carte « AI settings » seulement avec le droit ai.access (prop aiSettings), sous « Claude connection »', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      Response.json(
        String(url).endsWith('/claude/settings')
          ? { current: { model: 'claude-opus-5-5', effort: 'medium' }, defaults: { model: 'claude-opus-5-5', effort: 'medium' }, source: 'default', askModel: 'claude-haiku-4-5' }
          : { mode: 'hosted', subscriptionAllowed: false, access: 'none', source: 'none', saved: null, envApiKey: false },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    try {
      renderScreen()
      expect(screen.queryByRole('heading', { name: 'AI settings' })).toBeNull()
      cleanup()
      const docs = DOCS
      render(
        <div data-kz-admin="">
          <UsageScreen
            period="month"
            summary={summarizeUsage(docs, 'month', NOW)}
            allTime={summarizeUsage(docs, 'all-time', NOW)}
            rows={usageRows(docs, 'month', NOW, 50)}
            limit={50}
            now={NOW}
            claudeConnection={{ adminLocal: false }}
            aiSettings
          />
        </div>,
      )
      const headings = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)
      expect(headings.indexOf('AI settings')).toBe(headings.indexOf('Claude connection') + 1)
      expect(await screen.findByRole('combobox', { name: /Model/ })).toBeTruthy()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
