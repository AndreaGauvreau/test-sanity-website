import { describe, expect, it } from 'vitest'
import { askRoutes } from '../../../src/admin/features/ask-ai/links'
import { ANSWER_MAX, cleanAnswer, finalizeAnswer, REFUSAL_ELSEWHERE_TEXT, REFUSAL_TEXT, splitModelOutput } from './answer'
import { CONFIG } from './testing'

const ROUTES = askRoutes(CONFIG, 'client')
const OPTIONS = { editorPageIds: ['home'], screenPageId: null }

describe('lecture du format ANSWER / LINKS / CHANGE', () => {
  it('découpe les trois parties, tolère la casse et le gras', () => {
    const parts = splitModelOutput('**Answer:** On Home › Hero.\nSecond line.\nLINKS: /admin/media, /admin/pages/home\nChange: no')
    expect(parts).toEqual({ answer: 'On Home › Hero.\nSecond line.', links: ['/admin/media', '/admin/pages/home'], change: false })
    expect(splitModelOutput('ANSWER: x\nLINKS: none\nCHANGE: yes').change).toBe(true)
    expect(splitModelOutput('Just a plain answer.').answer).toBe('Just a plain answer.')
  })
})

describe('liens : seulement le catalogue du rôle', () => {
  it('garde les routes permises avec le libellé du catalogue ; retire le reste', () => {
    const out = finalizeAnswer(
      'ANSWER: Look there.\nLINKS: /admin/media https://evil.example/admin/media /admin/settings/code javascript:alert(1) //evil.example /admin/../studio /admin/pages/home/\nCHANGE: no',
      ROUTES,
      OPTIONS,
    )
    // /admin/settings/code : réservé à Kuartz → retiré pour le client. Barre finale tolérée. 3 liens au plus.
    expect(out.links).toEqual([
      { label: 'Open Media', href: '/admin/media' },
      { label: 'Open Home', href: '/admin/pages/home' },
    ])
  })

  it('une URL absolue vers l’admin est ramenée à son chemin ; les doublons disparaissent', () => {
    const out = finalizeAnswer('ANSWER: ok\nLINKS: http://127.0.0.1:4040/admin/media /admin/media\nCHANGE: no', ROUTES, OPTIONS)
    expect(out.links).toEqual([{ label: 'Open Media', href: '/admin/media' }])
  })

  it('texte : markdown, URL et chemins retirés (les chemins de l’admin deviennent le nom de l’écran)', () => {
    const text = cleanAnswer('**Go** to [General](https://x.test/y) at /admin/settings/general or https://evil.example/phish, see `code`.', ROUTES)
    expect(text).toBe('Go to General at Site Settings › General or see code.')
    expect(cleanAnswer('a'.repeat(2000), ROUTES).length).toBeLessThanOrEqual(ANSWER_MAX)
  })
})

describe('refus des modifications', () => {
  it('CHANGE: yes → texte fixe du Figma + « Open Home in AI editor » ; le texte du modèle est ignoré', () => {
    const out = finalizeAnswer('ANSWER: Sure! New title: “Docks, solved.”\nLINKS: none\nCHANGE: yes', ROUTES, OPTIONS)
    expect(out).toEqual({ answer: REFUSAL_TEXT, links: [{ label: 'Open Home in AI editor', href: '/admin/editor?page=home' }], refusedChange: true })
  })

  it('une réponse qui prétend avoir modifié est refusée même sans CHANGE: yes', () => {
    const out = finalizeAnswer('ANSWER: I’ve updated the hero title for you.\nLINKS: none\nCHANGE: no', ROUTES, OPTIONS)
    expect(out.refusedChange).toBe(true)
    expect(out.answer).toBe(REFUSAL_TEXT)
  })

  it('demande hors page (réglage) : « make this change yourself » avec le lien proposé', () => {
    const out = finalizeAnswer('ANSWER: no\nLINKS: /admin/settings/general\nCHANGE: yes', ROUTES, OPTIONS)
    expect(out).toMatchObject({ answer: REFUSAL_ELSEWHERE_TEXT, links: [{ href: '/admin/settings/general' }], refusedChange: true })
  })

  it('l’éditeur IA de l’écran ouvert quand il en a un', () => {
    const out = finalizeAnswer('ANSWER: x\nLINKS: none\nCHANGE: yes', ROUTES, { editorPageIds: ['home'], screenPageId: 'blog' })
    // Blog n'a pas d'éditeur IA : repli sur Home.
    expect(out.links).toEqual([{ label: 'Open Home in AI editor', href: '/admin/editor?page=home' }])
  })

  it('une question « How do I change… » n’est pas un refus', () => {
    const out = finalizeAnswer('ANSWER: Go to Site Settings › General and drop your file in Favicon.\nLINKS: /admin/settings/general\nCHANGE: no', ROUTES, OPTIONS)
    expect(out.refusedChange).toBe(false)
    expect(out.links).toEqual([{ label: 'Open General', href: '/admin/settings/general' }])
  })

  it('réponse vide → phrase de repli', () => {
    expect(finalizeAnswer('LINKS: none\nCHANGE: no', ROUTES, OPTIONS).answer).toMatch(/I don’t know/)
  })
})
