import { createClient } from '@sanity/client'
import path from 'node:path'
import type { AdminConfig } from '../../../src/admin/core/contracts'
import { createComplete } from '../claude'
import type { Router } from '../server/http'
import type { EngineContext, EngineModule } from '../server/modules'
import { askUsageRecorderOf } from '../usage'
import type { AskReader } from './context'
import { createAskService, type AskService, type AskServiceDeps } from './service'
import { sanityAskUsageRecorder, type AskUsageRecorder } from './usage'

/**
 * Branchement HTTP d'Ask AI dans le moteur : `POST /ask` (AskRequest → AskResponse), droit `ai.ask` revérifié par le
 * routeur d'après le rôle signé. `askModule()` est dans `MODULES` de engine/src/main.ts (après `usageModule`).
 * Voir engine/src/ask/CLAUDE.md.
 */

export function registerAskRoutes(router: Router, deps: AskServiceDeps | AskService): AskService {
  const service = 'ask' in deps ? deps : createAskService(deps)
  router.add({
    method: 'POST',
    path: '/ask',
    capability: 'ai.ask',
    handler: async ({ user, body, signal }) => ({ json: await service.ask(user, body, signal) }),
  })
  return service
}

/** Client Sanity de LECTURE (jeton Viewer `SANITY_API_READ_TOKEN`), perspective raw, sans CDN ni stega. */
export function createAskReader(settings: { projectId: string; dataset: string; apiVersion: string; token: string }): AskReader {
  const client = createClient({
    projectId: settings.projectId,
    dataset: settings.dataset,
    apiVersion: settings.apiVersion.replace(/^v/, ''),
    token: settings.token,
    useCdn: false,
    perspective: 'raw',
    stega: false,
    ignoreBrowserTokenWarning: true,
  })
  return { fetch: (query, params) => client.fetch(query, params ?? {}) }
}

/** Manifeste du site (import dynamique : `src/admin.config.ts` du dépôt, types seulement côté imports). */
export async function loadAdminConfig(): Promise<AdminConfig> {
  const mod = (await import('../../../src/admin.config')) as { default?: AdminConfig; adminConfig?: AdminConfig }
  const config = mod.adminConfig ?? mod.default
  if (!config?.pages) throw new Error('src/admin.config.ts does not export an AdminConfig.')
  return config
}

export type AskModuleOptions = {
  /** Manifeste (tests) ; défaut : `src/admin.config.ts`. */
  config?: AdminConfig
  /**
   * Journal de consommation ; défaut : le journal COMMUN d'engine-publish (`askUsageRecorderOf(context)`, posé par
   * `usageModule`, secours local + rejeu), sinon écriture directe par le port Sanity du robot, sinon aucun. null = aucun.
   */
  usage?: AskUsageRecorder | null
  /** Remplacements pour les tests. */
  reader?: AskReader | null
  complete?: AskServiceDeps['complete']
}

/**
 * Module du moteur (`EngineModule`), dans `MODULES` de main.ts APRÈS `usageModule` (le journal commun doit exister).
 * - accès Claude : `context.access` (resolveClaudeAccess) → `createComplete({ access, configDir: <workspace>/claude/ask })` ;
 * - modèle : `context.config.models.ask` (ASK_MODEL) ;
 * - lecture : jeton de lecture Sanity de la config ;
 * - journal : `options.usage`, sinon le journal commun (`askUsageRecorderOf(context)`), sinon `context.sanity` (robot),
 *   sinon aucun (avertissement au démarrage).
 */
export function askModule(options: AskModuleOptions = {}): EngineModule {
  return {
    name: 'ask',
    async register(context: EngineContext) {
      const log = (line: string) => console.log(`${new Date().toISOString().slice(11, 19)} ${line}`)
      const config = options.config ?? (await loadAdminConfig())
      const { sanity } = context.config
      const complete =
        options.complete !== undefined
          ? options.complete
          : context.access.ok
            ? createComplete({ access: context.access.access, configDir: path.join(context.config.paths.claude, 'ask') })
            : null
      const reader =
        options.reader !== undefined
          ? options.reader
          : createAskReader({ projectId: sanity.projectId, dataset: sanity.dataset, apiVersion: sanity.apiVersion, token: sanity.readToken })
      const usage =
        options.usage !== undefined
          ? options.usage
          : (askUsageRecorderOf(context) ?? (context.sanity ? sanityAskUsageRecorder(context.sanity) : null))
      if (!usage) log('⚠ Ask AI: usage is not recorded (no usage journal, no Sanity write token).')
      registerAskRoutes(context.router, { config, complete, model: context.config.models.ask, reader, usage, log })
    },
  }
}
