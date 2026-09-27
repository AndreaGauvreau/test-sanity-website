import { createPublicKey } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { z } from 'zod'

/**
 * Configuration du moteur IA, lue dans son environnement (`engine/.env.local`, chargé par `tsx --env-file`) et
 * validée au démarrage : un refus clair plutôt qu'un moteur qui travaille au mauvais endroit.
 *
 * Piège 5 du POC : `env.X ?? '../site'` ne remplace pas une chaîne vide, et `path.resolve(root, '')` désigne le dossier
 * du moteur, où le runner faisait `git reset --hard` + `git clean -fd`. Ici : chemins ABSOLUS, non vides, espace de
 * travail HORS du dépôt source et différent de lui, jamais la racine ni le dossier personnel.
 *
 * Aucun secret dans les messages d'erreur : seulement le NOM des variables.
 */

export type EngineMode = 'local' | 'hosted'

/**
 * Scénarios du faux Claude activable au démarrage (`ENGINE_FAKE_CLAUDE`, mode local ÉCRIT seulement), pour le parcours
 * de bout en bout sans appel réel (FOLLOWUPS #12). Détail : `jobs/fake-claude.ts`.
 */
export const FAKE_CLAUDE_SCENARIOS = ['auto', 'css', 'text', 'ask', 'fail', 'budget'] as const
export type FakeClaudeScenario = (typeof FAKE_CLAUDE_SCENARIOS)[number]

export type EngineConfig = {
  mode: EngineMode
  /**
   * ENGINE_MODE=local écrit explicitement : SEUL cas où le jeton d'abonnement Claude est accepté
   * (`resolveClaudeAccess(env, { localMode })`, engine-claude ; NODE_ENV n'y joue plus aucun rôle, AI-02) et où
   * ENGINE_FAKE_CLAUDE est permis. Jamais vrai en mode hébergé.
   */
  explicitLocal: boolean
  /** Adresse d'écoute : toujours la boucle locale. */
  host: '127.0.0.1'
  port: number
  /** ENGINE_SECRET : Bearer attendu de l'admin (transport seulement). */
  secret: string
  /**
   * ENGINE_IDENTITY_PUBLIC_KEY : clé publique Ed25519 (SPKI, base64) qui vérifie l'identité signée X-Kz-User (SEC-10).
   * La clé privée reste côté admin : qui vole ENGINE_SECRET ne peut pas forger un rôle.
   */
  identityPublicKey: string
  /** ENGINE_FAKE_CLAUDE : faux Claude à la place du vrai (mode local écrit seulement), null sinon. */
  fakeClaude: FakeClaudeScenario | null
  paths: {
    /** Dépôt du site (celui du développeur) : on le clone, on n'y écrit jamais. */
    sourceRepo: string
    /** ENGINE_WORKSPACE. */
    workspace: string
    /** Clone de travail (branche draft extraite) : le SEUL dossier où le moteur fait reset / clean / commit. */
    repo: string
    /** Magasin JSON du moteur (demandes, modifications, fils, publications). */
    data: string
    /** CLAUDE_CONFIG_DIR dédié (jamais ~/.claude). */
    claude: string
    /** Captures avant/après des demandes. */
    shots: string
  }
  /** Branche du dépôt source à cloner ; null = la branche courante de la source. */
  sourceBranch: string | null
  preview: {
    port: number
    /** http://127.0.0.1:<port> (sans secret). */
    origin: string
    /**
     * ENGINE_PREVIEW_SECRET (≥ 16 caractères), secret RACINE de l'aperçu : cookie `kz_preview` de la sonde et de Chrome
     * (côté serveur seulement) et clé des jetons courts de l'iframe (`signPreviewToken`, SEC-09). Jamais au navigateur.
     */
    secret: string
    /** Origine stricte de l'admin, autorisée à encadrer l'aperçu (frame-ancestors). */
    adminOrigin: string
  }
  git: { push: boolean }
  publish: {
    vercelDeployHookUrl: string | null
    siteRevalidateUrl: string | null
    revalidateSecret: string | null
  }
  sanity: {
    projectId: string
    dataset: string
    apiVersion: string
    /** Jeton de lecture (aperçu : perspective drafts). */
    readToken: string
    /** Jeton d'écriture « robot » : sans lui, la portée Text de l'éditeur est indisponible. */
    writeToken: string | null
  }
  models: { ask: string }
  /**
   * Plafond du CUMUL d'une demande (tous essais), en dollars. null = celui de l'agent (EDITOR_MAX_BUDGET_USD, plafond
   * par appel du SDK) : sans lui, une demande à 2 essais pourrait coûter jusqu'à 2 × ce montant (piège 3 du POC).
   */
  maxRequestUsd: number | null
}

export class EngineConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid engine configuration (engine/.env.local):\n${problems.map((problem) => `- ${problem}`).join('\n')}`)
    this.name = 'EngineConfigError'
  }
}

export type EngineEnv = Readonly<Record<string, string | undefined>>

const trimmed = (value: string | undefined) => (typeof value === 'string' ? value.trim() : '')

/** Chemin a dans b (ou égal). */
export function isInside(child: string, parent: string): boolean {
  const relative = path.relative(parent, child)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

/** Problèmes d'un chemin de dossier (vide, relatif, racine, dossier personnel). */
function pathProblems(name: string, value: string, home: string): string[] {
  if (!value) return [`${name} is missing or empty: set an absolute path.`]
  if (!path.isAbsolute(value)) return [`${name} must be an absolute path (got a relative path).`]
  const normalized = path.resolve(value)
  if (normalized === path.parse(normalized).root) return [`${name} cannot be the filesystem root.`]
  if (home && normalized === path.resolve(home)) return [`${name} cannot be your home folder.`]
  return []
}

const port = (name: string) =>
  z
    .string({ error: `${name} is missing.` })
    .trim()
    .regex(/^\d{2,5}$/, `${name} must be a port number.`)
    .transform(Number)
    .refine((n) => n >= 1024 && n <= 65535, `${name} must be between 1024 and 65535.`)

const secret = (name: string, min: number) =>
  z
    .string({ error: `${name} is missing.` })
    .trim()
    .min(min, `${name} must be at least ${min} characters long.`)
    .refine((value) => !/\s/.test(value), `${name} cannot contain spaces.`)

/** Clé publique Ed25519 en base64 (SPKI DER ; une armure PEM et des retours à la ligne sont tolérés). */
export function isEd25519PublicKey(value: string): boolean {
  const body = value.replace(/-----(BEGIN|END)[^-]*-----/g, '').replace(/\s+/g, '')
  if (!body || !/^[A-Za-z0-9+/]+={0,2}$/.test(body)) return false
  try {
    const key = createPublicKey({ key: Buffer.from(body, 'base64'), format: 'der', type: 'spki' })
    return key.asymmetricKeyType === 'ed25519'
  } catch {
    return false
  }
}

const optionalUrl = (name: string, protocols: readonly string[]) =>
  z
    .string()
    .optional()
    .transform((value, ctx) => {
      const text = trimmed(value)
      if (!text) return null
      try {
        const url = new URL(text)
        if (!protocols.includes(url.protocol)) throw new Error('protocol')
        return url.toString()
      } catch {
        ctx.addIssue({ code: 'custom', message: `${name} must be a ${protocols.join(' or ')} URL.` })
        return z.NEVER
      }
    })

const SCHEMA = z.object({
  ENGINE_MODE: z
    .string()
    .optional()
    .transform((value) => trimmed(value) || 'local')
    .pipe(z.enum(['local', 'hosted'], { error: 'ENGINE_MODE must be "local" or "hosted".' })),
  ENGINE_PORT: port('ENGINE_PORT'),
  ENGINE_PREVIEW_PORT: port('ENGINE_PREVIEW_PORT'),
  ENGINE_SECRET: secret('ENGINE_SECRET', 16),
  ENGINE_PREVIEW_SECRET: secret('ENGINE_PREVIEW_SECRET', 16),
  ENGINE_IDENTITY_PUBLIC_KEY: z
    .string({ error: 'ENGINE_IDENTITY_PUBLIC_KEY is missing (Ed25519 public key, SPKI in base64).' })
    .trim()
    .min(1, 'ENGINE_IDENTITY_PUBLIC_KEY is missing (Ed25519 public key, SPKI in base64).')
    .refine(isEd25519PublicKey, 'ENGINE_IDENTITY_PUBLIC_KEY must be an Ed25519 public key (SPKI, base64).'),
  ENGINE_FAKE_CLAUDE: z
    .string()
    .optional()
    .transform((value) => trimmed(value) || null)
    .refine(
      (value) => value === null || (FAKE_CLAUDE_SCENARIOS as readonly string[]).includes(value),
      `ENGINE_FAKE_CLAUDE must be one of: ${FAKE_CLAUDE_SCENARIOS.join(', ')} (or empty).`,
    ),
  ADMIN_ORIGIN: z
    .string({ error: 'ADMIN_ORIGIN is missing.' })
    .trim()
    .refine((value) => {
      try {
        const url = new URL(value)
        return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === value
      } catch {
        return false
      }
    }, 'ADMIN_ORIGIN must be a strict origin (scheme://host[:port], no path, no trailing slash).'),
  ENGINE_SOURCE_BRANCH: z
    .string()
    .optional()
    .transform((value) => trimmed(value) || null)
    .refine((value) => value === null || /^[A-Za-z0-9._/-]{1,100}$/.test(value), 'ENGINE_SOURCE_BRANCH is not a valid branch name.')
    .refine((value) => value === null || (!value.startsWith('-') && !value.includes('..')), 'ENGINE_SOURCE_BRANCH is not a valid branch name.'),
  ENGINE_GIT_PUSH: z
    .string()
    .optional()
    .transform((value) => trimmed(value) || '0')
    .pipe(z.enum(['0', '1'], { error: 'ENGINE_GIT_PUSH must be 0 or 1.' })),
  VERCEL_DEPLOY_HOOK_URL: optionalUrl('VERCEL_DEPLOY_HOOK_URL', ['https:']),
  SITE_REVALIDATE_URL: optionalUrl('SITE_REVALIDATE_URL', ['http:', 'https:']),
  REVALIDATE_SECRET: z
    .string()
    .optional()
    .transform((value) => trimmed(value) || null),
  NEXT_PUBLIC_SANITY_PROJECT_ID: z
    .string({ error: 'NEXT_PUBLIC_SANITY_PROJECT_ID is missing.' })
    .trim()
    .regex(/^[a-z0-9-]{1,64}$/, 'NEXT_PUBLIC_SANITY_PROJECT_ID is not a valid project id.'),
  NEXT_PUBLIC_SANITY_DATASET: z
    .string({ error: 'NEXT_PUBLIC_SANITY_DATASET is missing.' })
    .trim()
    .regex(/^[a-z0-9_-]{1,64}$/, 'NEXT_PUBLIC_SANITY_DATASET is not a valid dataset name.'),
  NEXT_PUBLIC_SANITY_API_VERSION: z
    .string()
    .optional()
    .transform((value) => trimmed(value) || '2026-09-01')
    .pipe(z.string().regex(/^v?\d{4}-\d{2}-\d{2}$/, 'NEXT_PUBLIC_SANITY_API_VERSION must look like 2026-09-01.')),
  SANITY_API_READ_TOKEN: secret('SANITY_API_READ_TOKEN', 8),
  SANITY_API_WRITE_TOKEN: z
    .string()
    .optional()
    .transform((value) => trimmed(value) || null)
    .refine((value) => value === null || !/\s/.test(value), 'SANITY_API_WRITE_TOKEN cannot contain spaces.'),
  ASK_MODEL: z
    .string()
    .optional()
    .transform((value) => trimmed(value) || 'claude-haiku-4-5-20251001'),
  EDITOR_MAX_REQUEST_USD: z
    .string()
    .optional()
    .transform((value, ctx) => {
      const text = trimmed(value)
      if (!text) return null
      const n = Number(text)
      if (!Number.isFinite(n) || n <= 0) {
        ctx.addIssue({ code: 'custom', message: 'EDITOR_MAX_REQUEST_USD must be a positive number of dollars.' })
        return z.NEVER
      }
      return n
    }),
})

/**
 * Lit et valide la configuration. Lève `EngineConfigError` (liste de problèmes, noms de variables seulement) au lieu
 * de démarrer à moitié. `home` est injectable pour les tests.
 */
export function readEngineConfig(env: EngineEnv, options: { home?: string } = {}): EngineConfig {
  const home = options.home ?? os.homedir()
  const problems: string[] = []

  const parsed = SCHEMA.safeParse(env)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      // Jamais la valeur reçue : zod peut la citer dans ses messages par défaut.
      const name = String(issue.path[0] ?? 'environment')
      problems.push(issue.message.includes(name) ? issue.message : `${name}: invalid value.`)
    }
  }

  const workspace = trimmed(env.ENGINE_WORKSPACE)
  const sourceRepo = trimmed(env.ENGINE_SOURCE_REPO)
  const pathIssues = [...pathProblems('ENGINE_WORKSPACE', workspace, home), ...pathProblems('ENGINE_SOURCE_REPO', sourceRepo, home)]
  problems.push(...pathIssues)
  if (!pathIssues.length) {
    const ws = path.resolve(workspace)
    const src = path.resolve(sourceRepo)
    if (ws === src) problems.push('ENGINE_WORKSPACE and ENGINE_SOURCE_REPO must be different folders.')
    else if (isInside(ws, src)) problems.push('ENGINE_WORKSPACE must be OUTSIDE the source repository (ENGINE_SOURCE_REPO).')
    else if (isInside(src, ws)) problems.push('ENGINE_SOURCE_REPO cannot be inside ENGINE_WORKSPACE.')
  }

  if (parsed.success) {
    const data = parsed.data
    if (data.ENGINE_PORT === data.ENGINE_PREVIEW_PORT) problems.push('ENGINE_PORT and ENGINE_PREVIEW_PORT must differ.')
    if (data.ENGINE_SECRET === data.ENGINE_PREVIEW_SECRET) problems.push('ENGINE_SECRET and ENGINE_PREVIEW_SECRET must differ.')
    // Le faux Claude n'existe qu'en local ÉCRIT : jamais sur un moteur hébergé, même par oubli dans le fichier.
    if (data.ENGINE_FAKE_CLAUDE && trimmed(env.ENGINE_MODE) !== 'local') {
      problems.push('ENGINE_FAKE_CLAUDE is only allowed with ENGINE_MODE=local written explicitly.')
    }
  }

  if (problems.length || !parsed.success) throw new EngineConfigError([...new Set(problems)])
  const data = parsed.data
  const ws = path.resolve(workspace)
  const previewOrigin = `http://127.0.0.1:${data.ENGINE_PREVIEW_PORT}`

  return {
    mode: data.ENGINE_MODE,
    explicitLocal: trimmed(env.ENGINE_MODE) === 'local',
    host: '127.0.0.1',
    port: data.ENGINE_PORT,
    secret: data.ENGINE_SECRET,
    identityPublicKey: data.ENGINE_IDENTITY_PUBLIC_KEY,
    fakeClaude: (data.ENGINE_FAKE_CLAUDE as FakeClaudeScenario | null) ?? null,
    paths: {
      sourceRepo: path.resolve(sourceRepo),
      workspace: ws,
      repo: path.join(ws, 'repo'),
      data: path.join(ws, 'data'),
      claude: path.join(ws, 'claude'),
      shots: path.join(ws, 'shots'),
    },
    sourceBranch: data.ENGINE_SOURCE_BRANCH,
    preview: { port: data.ENGINE_PREVIEW_PORT, origin: previewOrigin, secret: data.ENGINE_PREVIEW_SECRET, adminOrigin: data.ADMIN_ORIGIN },
    git: { push: data.ENGINE_GIT_PUSH === '1' },
    publish: {
      vercelDeployHookUrl: data.VERCEL_DEPLOY_HOOK_URL,
      siteRevalidateUrl: data.SITE_REVALIDATE_URL,
      revalidateSecret: data.REVALIDATE_SECRET,
    },
    sanity: {
      projectId: data.NEXT_PUBLIC_SANITY_PROJECT_ID,
      dataset: data.NEXT_PUBLIC_SANITY_DATASET,
      apiVersion: data.NEXT_PUBLIC_SANITY_API_VERSION,
      readToken: data.SANITY_API_READ_TOKEN,
      writeToken: data.SANITY_API_WRITE_TOKEN,
    },
    models: { ask: data.ASK_MODEL },
    maxRequestUsd: data.EDITOR_MAX_REQUEST_USD,
  }
}

/** Version du moteur (EngineHealth.version). */
export const ENGINE_VERSION = '0.1.0'
