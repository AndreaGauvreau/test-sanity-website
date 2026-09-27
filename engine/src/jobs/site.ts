import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

/**
 * Lectures du site dans le clone de travail, pour une demande : liste des pages publiques (Claude ne parle d'aucune page
 * qui n'existe pas, `site-pages.ts` du POC) et compilation TypeScript (contrôle `types` quand un .ts/.tsx a changé).
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

/** Routes des pages publiques, triées (vide si le dossier manque). */
export async function listPages(repoDir: string): Promise<string[]> {
  const dir = path.join(repoDir, SITE_ROUTES_DIR)
  if (!existsSync(dir)) return []
  const entries = await readdir(dir, { recursive: true })
  const routes = entries.map((entry) => routeOf(String(entry).split(path.sep).join('/')))
  return [...new Set(routes.filter((route): route is string => route !== null))].sort()
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
