import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

/**
 * Lectures du site dans le clone de travail, pour une demande : liste des pages publiques (Claude ne parle d'aucune page
 * qui n'existe pas, `site-pages.ts` du POC) et compilation TypeScript (contrôle `types` quand un .ts/.tsx a changé).
 * Au démarrage : domaines du site (liste blanche des adresses montrées au client, SEC-08), lus dans le manifeste.
 */

const exec = promisify(execFile)

/** Dossier des pages publiques de Conduit (les routes de l'admin et du Studio n'en font pas partie). */
export const SITE_ROUTES_DIR = 'src/app/(site)'

/** `blog/[slug]/page.tsx` (relatif à src/app/(site)) → `/blog/[slug]` ; groupes `(nom)` retirés ; null sinon. */
export function routeOf(relative: string): string | null {
  const segments = relative.split('/')
  if (segments.at(-1) !== 'page.tsx' && segments.at(-1) !== 'page.ts') return null
  const route = segments.slice(0, -1).filter((segment) => !/^\(.+\)$/.test(segment) && !segment.startsWith('@') && !segment.startsWith('_'))
  return `/${route.join('/')}`
}

/**
 * Routes de développement du site, jamais citées à Claude (constat AI-07) : `/bench` (banc de mesure, noindex) et
 * `/preview/*` (aperçus de sections, notFound() en production). Préfixe exact : `/preview` et ses sous-routes.
 */
export const DEV_ROUTES: readonly string[] = ['/bench', '/preview']

export const isDevRoute = (route: string) => DEV_ROUTES.some((dev) => route === dev || route.startsWith(`${dev}/`))

/** Routes des pages PUBLIQUES, triées, sans les routes de développement (vide si le dossier manque). */
export async function listPages(repoDir: string): Promise<string[]> {
  const dir = path.join(repoDir, SITE_ROUTES_DIR)
  if (!existsSync(dir)) return []
  const entries = await readdir(dir, { recursive: true })
  const routes = entries.map((entry) => routeOf(String(entry).split(path.sep).join('/')))
  return [...new Set(routes.filter((route): route is string => route !== null && !isDevRoute(route)))].sort()
}

// ─── Domaines du site (SEC-08) ───────────────────────────────────────────────

/** Adresse de boucle locale ou littéral IP : jamais un domaine du site (le client n'a pas à voir 127.0.0.1:4043). */
const isLocalOrIp = (host: string) =>
  host === 'localhost' || host.endsWith('.localhost') || /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[') || host.includes(':')

/** Hôte d'un domaine écrit nu (`conduit.com`) ou en URL (`https://www.conduit.com/`), en minuscules ; null sinon. */
function hostOf(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const raw = value.trim()
  try {
    const host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.toLowerCase().replace(/\.+$/, '')
    return host && !isLocalOrIp(host) ? host : null
  } catch {
    return null
  }
}

/**
 * Domaines que les textes montrés au client peuvent citer (liste blanche de `sanitizeClientText`, engine-claude) :
 * `site.domain` et l'hôte de `site.url` du manifeste (`src/admin.config.ts`), sans doublon. Une adresse locale ou un
 * littéral IP (URL de développement `http://127.0.0.1:4040`) n'en est pas un. `conduit.com` couvre ses sous-domaines.
 */
export function siteDomainsOf(site: { domain?: unknown; url?: unknown } | null | undefined): string[] {
  if (!site) return []
  return [...new Set([hostOf(site.domain), hostOf(site.url)].filter((host): host is string => host !== null))]
}

/**
 * Domaines du site d'après `<dépôt source>/src/admin.config.ts` (import dynamique, comme engine-publish et ask-ai).
 * Manifeste absent ou illisible : liste vide (toute adresse est alors retirée des textes du client) + journal.
 */
export async function loadSiteDomains(sourceRepo: string, log: (line: string) => void = () => {}): Promise<string[]> {
  const file = path.join(sourceRepo, 'src', 'admin.config.ts')
  if (!path.isAbsolute(file) || !existsSync(file)) {
    log('⚠ src/admin.config.ts not found: links to the site are removed from the messages shown to the client.')
    return []
  }
  try {
    const mod = (await import(/* @vite-ignore */ file)) as { default?: { site?: unknown }; adminConfig?: { site?: unknown } }
    const site = (mod.adminConfig ?? mod.default)?.site as { domain?: unknown; url?: unknown } | undefined
    const domains = siteDomainsOf(site)
    if (!domains.length) log('⚠ src/admin.config.ts has no site domain: links to the site are removed from the messages shown to the client.')
    return domains
  } catch (error) {
    log(`⚠ src/admin.config.ts could not be loaded (${error instanceof Error ? error.message : String(error)}): links to the site are removed from the messages shown to the client.`)
    return []
  }
}

/**
 * `tsc --noEmit` dans le clone : null si tout compile, sinon les 12 premières lignes d'erreur. `next typegen` d'abord
 * (types des routes de Next 16 : PageProps, LayoutProps), sans échec bloquant.
 */
export async function typecheck(repoDir: string): Promise<string | null> {
  const bin = (name: string) => path.join(repoDir, 'node_modules', '.bin', name)
  // Environnement sans les secrets du moteur.
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, NEXT_TELEMETRY_DISABLED: '1' } as Record<string, string | undefined> as NodeJS.ProcessEnv
  if (existsSync(bin('next'))) await exec(bin('next'), ['typegen'], { cwd: repoDir, env, timeout: 120_000 }).catch(() => {})
  try {
    await exec(bin('tsc'), ['--noEmit', '-p', 'tsconfig.json'], { cwd: repoDir, env, timeout: 180_000, maxBuffer: 16 * 1024 * 1024 })
    return null
  } catch (error) {
    const output = (error as { stdout?: string }).stdout || (error as Error).message
    return output.split('\n').filter(Boolean).slice(0, 12).join('\n')
  }
}
