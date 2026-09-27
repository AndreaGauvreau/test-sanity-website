/**
 * Ask AI (G4) dans le moteur : `POST /ask`, en lecture seule. API publique du module (propriétaire : ask-ai).
 * Branché : `MODULES` de main.ts contient `askModule()`, après `usageModule` (voir CLAUDE.md).
 */
export { askModule, createAskReader, loadAdminConfig, registerAskRoutes, type AskModuleOptions } from './routes'
export { ASK_MESSAGES, createAskService, type AskComplete, type AskService, type AskServiceDeps } from './service'
export { buildSiteData, buildSiteQuery, renderSiteData, type AskReader, type AskSiteData } from './context'
export { ASK_MAX_TOKENS, ASK_SYSTEM, buildAskMessages } from './prompt'
export { finalizeAnswer, REFUSAL_TEXT, siteDomains } from './answer'
export { parseAskRequest, HISTORY_MAX, QUESTION_MAX } from './request'
export { askUsageDoc, sanityAskUsageRecorder, type AskUsageEntry, type AskUsageRecorder } from './usage'
