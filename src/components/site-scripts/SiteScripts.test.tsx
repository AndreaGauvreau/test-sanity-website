import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { signableScript, signScript } from '@/lib/script-signature'
import type { SiteScript } from '@/lib/site-scripts'

// Rendu serveur hors de Next : Draft Mode coupé, next/script rendu en <script> simple.
vi.mock('next/headers', () => ({ draftMode: async () => ({ isEnabled: false }) }))
vi.mock('next/script', () => ({
  default: ({ id, dangerouslySetInnerHTML }: { id: string; dangerouslySetInnerHTML?: { __html: string } }) => (
    <script id={id} dangerouslySetInnerHTML={dangerouslySetInnerHTML} />
  ),
}))

const { SiteScripts } = await import('./SiteScripts')

const SECRET = 's'.repeat(48)

const script = (key: string, code: string): SiteScript => ({
  _key: key,
  name: key,
  placement: 'bodyEnd',
  page: 'all',
  run: 'once',
  enabled: true,
  code,
})

async function render(scripts: SiteScript[]): Promise<string> {
  const element = await SiteScripts({ scripts, page: 'all', placements: ['bodyEnd'] })
  return element ? renderToStaticMarkup(element) : ''
}

describe('<SiteScripts /> — signature (SEC-04)', () => {
  beforeEach(() => {
    vi.stubEnv('SCRIPTS_SIGNING_SECRET', SECRET)
    vi.stubEnv('KZ_EDITOR_PREVIEW', '')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('script signé par l’admin : injecté', async () => {
    const signed = script('signed', '<script>window.ok = 1</script>')
    signed.signature = await signScript(SECRET, signableScript(signed))
    expect(await render([signed])).toContain('window.ok = 1')
  })

  it('script modifié hors de l’admin (Studio, API) : ignoré', async () => {
    const original = script('tampered', '<script>window.ok = 1</script>')
    const signature = await signScript(SECRET, signableScript(original))
    const tampered = { ...original, code: '<script>steal(document.cookie)</script>', signature }
    const unsigned = script('unsigned', '<script>steal(2)</script>')
    const html = await render([tampered, unsigned])
    expect(html).not.toContain('steal')
    expect(html).toBe('')
  })

  it('secret absent sur le serveur : aucun script', async () => {
    const signed = script('signed', '<script>window.ok = 1</script>')
    signed.signature = await signScript(SECRET, signableScript(signed))
    vi.stubEnv('SCRIPTS_SIGNING_SECRET', '')
    expect(await render([signed])).toBe('')
  })
})
