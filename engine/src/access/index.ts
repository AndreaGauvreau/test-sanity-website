import type { Router } from '../server/http'
import type { EngineContext, EngineModule } from '../server/modules'
import type { ClaudeAccessService } from './service'

/**
 * Connexion à Claude depuis l'admin (B5 · « Claude connection ») : routes `/claude/access*` du contrat, droit
 * `ai.access` (Kuartz et client) revérifié par le routeur d'après le rôle signé. Le service lui-même est créé par
 * `startEngine` (main.ts) AVANT l'éditeur, qui lit son accès à chaque demande (rechargement à chaud) ; ce module ne fait
 * que brancher les routes sur `context.claudeAccess`.
 */

export function registerAccessRoutes(router: Router, service: ClaudeAccessService): void {
  router.add({ method: 'GET', path: '/claude/access', capability: 'ai.access', handler: async () => ({ json: await service.state() }) })
  router.add({ method: 'POST', path: '/claude/access', capability: 'ai.access', handler: async ({ body }) => ({ json: await service.save(body) }) })
  router.add({ method: 'POST', path: '/claude/access/test', capability: 'ai.access', handler: async () => ({ json: await service.test() }) })
  router.add({ method: 'POST', path: '/claude/access/clear', capability: 'ai.access', handler: async () => ({ json: await service.clear() }) })
}

const WATCHERS = new WeakMap<EngineContext, () => void>()

export const accessModule: EngineModule = {
  name: 'claude-access',
  register(context: EngineContext) {
    registerAccessRoutes(context.router, context.claudeAccess)
    // Abonnement de la machine : un /login fait dans un terminal s'applique sans passer par B5 (sonde toutes les 60 s).
    WATCHERS.set(context, context.claudeAccess.watch())
  },
  stop(context: EngineContext) {
    WATCHERS.get(context)?.()
    WATCHERS.delete(context)
  },
}

export { createClaudeAccessService, testConfigDirOf, type ClaudeAccessDeps, type ClaudeAccessService } from './service'
export { openAccessStore, ACCESS_FILE, UNREADABLE_KEY, type AccessStore, type StoredAccess } from './store'
export { detectMachineLogin, machineLoginOf, systemProbe, keychainService, keychainAccount, type MachineProbe } from './machine'
export { resolveEngineAccess, NOT_SIGNED_IN, NO_ACCESS, SUBSCRIPTION_HOSTED } from './resolve'
export { testApiKey, testSubscription, MODELS_URL, TEST_MESSAGES } from './connection-test'
