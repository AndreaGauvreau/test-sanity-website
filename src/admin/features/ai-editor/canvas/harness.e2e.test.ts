import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Browser, FrameLocator, Page } from 'playwright-core'

/**
 * Test de bout en bout de l'aperçu sur la PAGE D'ESSAI (/admin/editor/harness), contre le serveur de dev (ENGINE_MOCK=1,
 * session de dev automatique). Désactivé par défaut : il faut le serveur et Chrome.
 *
 *   EDITOR_E2E_URL=http://127.0.0.1:4040 npx vitest run src/admin/features/ai-editor/canvas/harness.e2e.test.ts
 *
 * Deux contournements propres au développement (voir CLAUDE.md, Pièges) :
 * - le proxy (auth-core) pose `X-Frame-Options: DENY` sur tout /admin : on retire ces en-têtes pour la seule page
 *   d'essai (demande de contrat en cours) ;
 * - Chrome (Local Network Access) : sans la permission `local-network-access`, `next dev` ne s'hydrate pas dans l'iframe.
 */
const BASE = process.env.EDITOR_E2E_URL
const run = BASE ? describe : describe.skip

run('page d’essai de l’aperçu (Playwright)', () => {
  let browser: Browser
  let page: Page
  let frame: FrameLocator
  const errors: string[] = []

  const overlay = () =>
    page.frames()[1].evaluate(() => {
      const host = document.querySelector('kz-editor-overlay')
      if (!host?.shadowRoot) return []
      return [...host.shadowRoot.querySelectorAll<HTMLElement>('.box')].map((b) => `${b.dataset.kind}:${b.querySelector('.label')?.textContent ?? ''}`)
    })
  const cursorOf = (selector: string) =>
    page.frames()[1].evaluate((s) => getComputedStyle(document.querySelector(s)!).cursor, selector)

  beforeAll(async () => {
    const { chromium } = await import('playwright-core')
    browser = await chromium.launch({ channel: 'chrome' })
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    await context.grantPermissions(['local-network-access'], { origin: BASE })
    page = await context.newPage()
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('console', (m) => {
      if (m.type() === 'error' && !/WebSocket|Failed to load resource/.test(m.text())) errors.push(m.text())
    })
    await page.route('**/admin/editor/harness**', async (route) => {
      const res = await route.fetch()
      const headers = { ...res.headers() }
      for (const h of ['x-frame-options', 'content-security-policy', 'content-encoding', 'transfer-encoding', 'content-length']) delete headers[h]
      await route.fulfill({ status: res.status(), headers, body: await res.text() })
    })
    await page.goto(`${BASE}/admin/editor?page=home&harness=1`, { waitUntil: 'networkidle' })
    frame = page.frameLocator('iframe[title="Draft preview of Home"]')
    await frame.locator('[data-edit="hero.title"]').waitFor()
    await page.waitForFunction(() => !document.querySelector('[data-status="loading"]'), undefined, { timeout: 20_000 })
    // État laissé par une session précédente du moteur simulé : demande en cours ou modification à valider.
    const stop = page.getByRole('button', { name: 'Stop' })
    if (await stop.isVisible().catch(() => false)) await stop.click()
    const bar = page.getByRole('region', { name: 'Preview change to validate' })
    if (await bar.isVisible().catch(() => false)) await bar.getByRole('button', { name: 'Cancel' }).click()
    await page.waitForTimeout(500)
  }, 60_000)

  afterAll(async () => {
    await browser?.close()
  })

  it('survol : contour fin et main sur un élément sélectionnable, flèche ailleurs', async () => {
    await frame.locator('[data-edit="hero.title"]').hover()
    await page.waitForTimeout(100)
    expect(await overlay()).toEqual(['hover:'])
    expect(await cursorOf('[data-edit="hero.title"]')).toBe('pointer')
    await frame.locator('header').hover({ position: { x: 5, y: 5 } })
    await page.waitForTimeout(100)
    expect(await overlay()).toEqual([])
    expect(await cursorOf('header')).toBe('default')
  })

  it('clic : sélection avec son label, le lien ne part pas', async () => {
    await frame.locator('[data-edit="hero.primaryCta"]').click()
    await page.waitForTimeout(150)
    expect(await overlay()).toEqual(['selected:Hero · Button 1'])
    expect(await page.frames()[1].evaluate(() => location.hash)).toBe('')
    await frame.locator('[data-edit="hero.title"]').click()
    await page.waitForTimeout(150)
    // Le titre survolé est déjà dessiné (sélection) : pas de second contour de survol.
    expect(await overlay()).toEqual(['selected:Hero · Title'])
  })

  it('Maj + clic : ajoute puis retire un élément', async () => {
    await frame.locator('[data-edit="features.card.title"]').nth(1).click({ modifiers: ['Shift'] })
    await page.waitForTimeout(150)
    const boxes = await overlay()
    expect(boxes).toContain('selected:Hero · Title')
    expect(boxes).toContain('selected:Features · Card title')
    await frame.locator('[data-edit="features.card.title"]').nth(1).click({ modifiers: ['Shift'] })
    await page.waitForTimeout(150)
    expect((await overlay()).filter((b) => b.startsWith('selected'))).toEqual(['selected:Hero · Title'])
  })

  it('Échap, focus dans l’aperçu (relayé par le pont) : tout désélectionner', async () => {
    await frame.locator('[data-edit="hero.primaryCta"]').press('Escape')
    await page.waitForTimeout(150)
    expect((await overlay()).filter((b) => b.startsWith('selected'))).toEqual([])
  })

  it('Échap, focus dans l’admin : tout désélectionner', async () => {
    await frame.locator('[data-edit="hero.title"]').click()
    await page.waitForTimeout(150)
    expect(await overlay()).toContain('selected:Hero · Title')
    // Clic dans la marge de l'aperçu : le focus revient au document de l'admin (sans infobulle ouverte, qui
    // prendrait Échap pour elle : une seule couche fermée par Échap).
    await page.mouse.click(1430, 450)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(150)
    expect((await overlay()).filter((b) => b.startsWith('selected'))).toEqual([])
  })

  it('View : le site se comporte normalement (liens actifs, pas de contour)', async () => {
    await page.getByRole('radio', { name: 'View' }).click()
    await page.waitForTimeout(150)
    await frame.locator('[data-edit="hero.secondaryCta"]').click()
    await page.waitForTimeout(150)
    expect(await page.frames()[1].evaluate(() => location.hash)).toBe('#features')
    expect(await overlay()).toEqual([])
    await page.getByRole('radio', { name: 'Select' }).click()
  })

  it('aucune erreur dans la console', () => {
    expect(errors).toEqual([])
  })
})
