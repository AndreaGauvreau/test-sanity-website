/**
 * Signal « aperçu à jour » (piège 1 du POC) : le HMR de `next dev` voit un CSS modifié, pas un brouillon Sanity. Plutôt
 * qu'un délai fixe (1 200 ms au POC), on interroge la page de l'aperçu jusqu'à ce qu'elle réponde ET que chaque texte
 * écrit y soit visible (HTML rendu côté serveur, perspective drafts, stega coupé).
 *
 * Côté CSS : une requête à `next dev` après une modification attend la recompilation du module (Turbopack compile à la
 * demande) ; `minDelayMs` laisse d'abord au surveillant de fichiers le temps de voir l'écriture.
 *
 * L'accès passe par COOKIE seulement (`kz_preview`), jamais en paramètre d'URL ni en en-tête générique. Sa valeur est un
 * jeton d'aperçu DÉRIVÉ du secret racine (`createPreviewCredential`) : le proxy de l'aperçu n'accepte plus le secret
 * racine lui-même (SEC-09, auth-core).
 */

import { signPreviewToken } from '../../../src/admin/core/engine/preview-token'

export const PREVIEW_COOKIE = 'kz_preview'

/** Valeur du cookie `kz_preview` : une chaîne fixe (tests) ou un fournisseur de jeton frais. */
export type PreviewCredential = string | (() => string | Promise<string>)

export const credentialValue = async (credential: PreviewCredential) => (typeof credential === 'function' ? await credential() : credential)

/** Durée des jetons du moteur lui-même (sonde, signal, Chrome) et marge de renouvellement, en secondes. */
export const ENGINE_PREVIEW_TOKEN_TTL = 2 * 60 * 60
export const ENGINE_PREVIEW_TOKEN_RENEW = 60 * 60
/** Id porté par les jetons du moteur (le proxy ne lit pas l'id ; il sert au diagnostic). */
export const ENGINE_PREVIEW_UID = 'kz-engine'

/**
 * Jeton d'aperçu du MOTEUR (côté serveur seulement) : `signPreviewToken(secret racine, 'kz-engine', 2 h)`, renouvelé
 * quand il lui reste moins d'1 h — une session Chrome ouverte avec lui reste valable jusqu'à la fin d'une demande.
 * Le secret racine ne sort jamais du moteur ; le jeton ne va jamais au navigateur de l'admin.
 */
export function createPreviewCredential(rootSecret: string, options: { now?: () => number } = {}): () => Promise<string> {
  const now = () => Math.floor((options.now?.() ?? Date.now()) / 1000)
  let current: { token: string; exp: number } | null = null
  let pending: Promise<string> | null = null
  return () => {
    if (current && current.exp - now() > ENGINE_PREVIEW_TOKEN_RENEW) return Promise.resolve(current.token)
    pending ??= (async () => {
      const issuedAt = now()
      const token = await signPreviewToken(rootSecret, ENGINE_PREVIEW_UID, issuedAt, ENGINE_PREVIEW_TOKEN_TTL)
      current = { token, exp: issuedAt + ENGINE_PREVIEW_TOKEN_TTL }
      return token
    })().finally(() => {
      pending = null
    })
    return pending
  }
}

export type PreviewSignal = {
  /**
   * Attend que l'aperçu serve `page` (chemin absolu) avec chacun des `texts`. true quand c'est le cas, false au délai
   * dépassé (jamais d'exception pour un aperçu lent : l'appelant décide).
   */
  waitFresh(page: string, texts: readonly string[], options?: { timeoutMs?: number }): Promise<boolean>
}

export type PreviewSignalSettings = {
  /** Origine de l'aperçu (http://127.0.0.1:4042). */
  origin: string
  /** Valeur du cookie `kz_preview` (jeton du moteur, `createPreviewCredential`). */
  secret: PreviewCredential
  fetchImpl?: typeof fetch
  minDelayMs?: number
  intervalMs?: number
  timeoutMs?: number
  sleep?: (ms: number) => Promise<void>
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', hellip: '…', mdash: '—', ndash: '–' }

/** Texte visible approximatif d'un HTML : scripts et styles retirés, balises → espace, entités décodées, blancs réduits. */
export function visibleText(html: string): string {
  return normalizeVisible(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
        if (entity[0] === '#') {
          const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10)
          return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : match
        }
        return Object.hasOwn(ENTITIES, entity.toLowerCase()) ? ENTITIES[entity.toLowerCase()] : match
      }),
  )
}

/** Blancs réduits, apostrophes et guillemets typographiques ramenés à leur forme simple, astérisques de mise en avant retirés. */
export function normalizeVisible(text: string): string {
  return text
    .replace(/[’‘]/g, "'")
    .replace(/[“”«»]/g, '"')
    .replace(/\*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function createPreviewSignal(settings: PreviewSignalSettings): PreviewSignal {
  const fetchImpl = settings.fetchImpl ?? fetch
  const sleep = settings.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const origin = new URL(settings.origin).origin
  return {
    async waitFresh(page, texts, options = {}) {
      if (!page.startsWith('/') || page.startsWith('//') || page.includes('\\')) return false
      const url = new URL(page, origin)
      if (url.origin !== origin) return false
      const expected = texts.map(normalizeVisible).filter(Boolean)
      const deadline = Date.now() + (options.timeoutMs ?? settings.timeoutMs ?? 20_000)
      await sleep(settings.minDelayMs ?? 300)
      for (;;) {
        try {
          const response = await fetchImpl(url, {
            headers: { cookie: `${PREVIEW_COOKIE}=${await credentialValue(settings.secret)}`, 'cache-control': 'no-cache' },
            redirect: 'manual',
            signal: AbortSignal.timeout(15_000),
          })
          if (response.status >= 200 && response.status < 300) {
            const html = await response.text()
            if (!expected.length) return true
            const text = visibleText(html)
            if (expected.every((wanted) => text.includes(wanted))) return true
          } else {
            await response.body?.cancel().catch(() => {})
          }
        } catch {
          // Aperçu en cours de (re)démarrage : on réessaie jusqu'au délai.
        }
        if (Date.now() >= deadline) return false
        await sleep(settings.intervalMs ?? 250)
      }
    },
  }
}
