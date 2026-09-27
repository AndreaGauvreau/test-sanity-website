import adminConfig from '../../../../admin.config'
import type { AskMessage, AskResponse, Usage } from '../../contracts/engine'
import { askRoutes, editorHref, resolveAskLinks, screenOf } from '../../../features/ask-ai/links'
import { engineErrorBody } from '../errors'
import type { MockEngineResponse, MockHandler } from './types'

/**
 * Ask AI simulé (POST /ask, ENGINE_MOCK=1, jamais en production) — propriétaire : ask-ai.
 * Réponses réalistes pour construire et vérifier le panneau G4 sans moteur ni Claude : question → réponse courte +
 * liens (catalogue réel du rôle, `features/ask-ai/links.ts`), demande de modification → refus du Figma, consommation
 * plausible (Haiku 4.5, 1 $ / 5 $ par million).
 * Déclencheurs de développement dans la question : « [mock:error] » (503), « [mock:slow] » (réponse en 4 s).
 * Mêmes limites que le vrai moteur : question 1-1000 caractères, historique ≤ 10.
 */

const MODEL = 'claude-haiku-4-5-20251001'
export const MOCK_REFUSAL = 'I can’t change anything. To edit a text on the page, open it in the AI editor.'

type Scenario = { test: RegExp; answer: string; links: string[]; refused?: boolean }

const CHANGE_REQUEST =
  /^(?:please\s+|can you\s+|could you\s+|would you\s+)?(?:change|edit|update|replace|rename|delete|remove|make|set|add|publish|rewrite|translate|fix|upload|put|write)\b/i

const SCENARIOS: Scenario[] = [
  { test: CHANGE_REQUEST, answer: MOCK_REFUSAL, links: [editorHref('home')], refused: true },
  {
    test: /\b(hero image|image|photo|picture)\b.*\bused\b|\bwhere\b.*\b(image|photo|media)\b/i,
    answer: 'On Home › Hero (background) and on the post “How to cut dock wait times” (cover).',
    links: ['/admin/media', '/admin/pages/home'],
  },
  {
    test: /favicon|site icon/i,
    answer: 'Go to Site Settings › General › Site images and drop your file in Favicon (light and dark versions). It goes live when you publish.',
    links: ['/admin/settings/general'],
  },
  {
    test: /meta description|meta title|\bseo\b|google/i,
    answer: 'Home has a meta title and a meta description. Blog uses its own SEO settings, and every post page uses the post SEO template.',
    links: ['/admin/pages/home/seo', '/admin/pages/blog/slug/seo'],
  },
  {
    test: /how many|number of|count/i,
    answer: 'The Blog has 12 posts, Testimonials has 3 items and the FAQ has 9 questions.',
    links: ['/admin/cms/blog'],
  },
  {
    test: /publish|go live|online|live\b/i,
    answer: 'Your edits are saved as drafts. Click Publish in the top bar to put them online; Review lists what will be published.',
    links: ['/admin/publish'],
  },
  {
    test: /cost|usage|token|price|bill/i,
    answer: 'AI usage is billed on your own Claude account, in tokens and dollars. Site Settings › Usage shows it by period, feature and model.',
    links: ['/admin/settings/usage'],
  },
  {
    test: /alt text|alternative text/i,
    answer: 'Alt text is stored on each image, in Media. Open the image and fill in its alt text; it is used everywhere the image appears.',
    links: ['/admin/media'],
  },
  {
    test: /script|analytics|tag manager|gtm/i,
    answer: 'Site scripts (analytics, tags) are managed by Kuartz in Site Settings › Code.',
    links: ['/admin/settings/code'],
  },
]

const FALLBACK: Scenario = {
  test: /.*/,
  answer: 'I answer questions about this site and its admin: where things are, how to do something, what is missing. I can’t change anything.',
  links: [],
}

function usageFor(question: string, history: readonly AskMessage[], answer: string): Usage {
  const inputTokens = 2050 + Math.round((question.length + history.reduce((n, m) => n + m.text.length, 0)) / 4)
  const outputTokens = 150 + Math.round(answer.length)
  return {
    model: MODEL,
    inputTokens,
    outputTokens,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    costUsd: (inputTokens * 1 + outputTokens * 5) / 1_000_000,
    costKind: 'billed',
    access: 'none',
    durationMs: 700,
    turns: 1,
  }
}

const badRequest = (message: string): MockEngineResponse => ({ status: 400, json: engineErrorBody('bad_request', message) })
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function parseBody(body: unknown): { question: string; history: AskMessage[]; screen?: string } | string {
  if (!body || typeof body !== 'object') return 'Invalid Ask AI request.'
  const { question, history = [], screen } = body as Record<string, unknown>
  if (typeof question !== 'string' || !question.trim() || [...question.trim()].length > 1000) return 'Ask a question of 1 to 1000 characters.'
  if (!Array.isArray(history) || history.length > 10) return 'The conversation sent is too long (10 messages at most).'
  const messages: AskMessage[] = []
  for (const item of history) {
    const m = item as Partial<AskMessage>
    if ((m?.role !== 'user' && m?.role !== 'assistant') || typeof m.text !== 'string') return 'Invalid Ask AI request.'
    messages.push({ role: m.role, text: m.text })
  }
  return { question: question.trim(), history: messages, ...(typeof screen === 'string' ? { screen } : {}) }
}

export type HandleAskOptions = { delay?: (ms: number) => Promise<unknown> }

/** Fabrique (tests : délai supprimé). */
export function createAskMock(options: HandleAskOptions = {}): MockHandler {
  const delay = options.delay ?? wait
  return async (request) => {
    if (request.method !== 'POST' || request.segments.length !== 1) return { status: 404, json: engineErrorBody('not_found', 'Not found.') }
    const parsed = parseBody(request.body)
    if (typeof parsed === 'string') return badRequest(parsed)
    const { question, history, screen } = parsed

    if (question.includes('[mock:error]')) {
      await delay(400)
      return { status: 503, json: engineErrorBody('unavailable', 'Claude is busy (rate limit): try again in a moment.') }
    }
    await delay(question.includes('[mock:slow]') ? 4000 : 700)

    const routes = askRoutes(adminConfig, request.user.role)
    const scenario = SCENARIOS.find((s) => s.test.test(question)) ?? FALLBACK
    let links = resolveAskLinks(routes, scenario.links)
    // Refus : l'éditeur IA de la page ouverte quand elle en a un (comme le vrai moteur).
    if (scenario.refused) {
      const page = screenOf(routes, screen)?.href.match(/^\/admin\/(?:pages\/|editor\?page=)([A-Za-z0-9_-]+)/)?.[1]
      const own = page ? resolveAskLinks(routes, [editorHref(page)]) : []
      if (own.length) links = own
    }
    const response: AskResponse = { answer: scenario.answer, links, refusedChange: !!scenario.refused, usage: usageFor(question, history, scenario.answer) }
    return { status: 200, json: response }
  }
}

export const handleAsk: MockHandler = createAskMock()
