# Serveur HTTP du moteur (`engine/src/server`) — LLM context

> Propriétaire : engine-core · Figma : — (sert D1-D3, G1, G2 ; E1-E2 et G4 via les modules) · Mis à jour : 2026-09-27

## Utilité
Serveur `node:http` sur 127.0.0.1:ENGINE_PORT, routeur extensible, authentification, erreurs du contrat, routes de
l'éditeur (EXACTEMENT celles de `core/contracts/engine.ts`), santé, point d'extension des autres modules du moteur.

## Fichiers
- `http.ts` — `createRouter()`, `createHandler()`, `createEngineServer()`, `MAX_BODY_BYTES` (64 Kio), types `RouteDef`, `RouteContext`, `RouteResult`.
- `editor-routes.ts` — `registerEditorRoutes(router, editor, health)` : /health et les 8 routes /editor/*.
- `errors.ts` — `EngineError(status, code, message)` → `EngineErrorBody` ; fabriques (badRequest, notFound, conflict, busy, awaitingValidation, publishing, unavailable, forbidden).
- `health.ts` — `createHealth(...)` → `EngineHealth` (accès Claude sans secret, jeton Sanity présent, aperçu, git du clone).
- `modules.ts` — `EngineContext`, `EngineModule` (engine-publish, ask-ai).
- `http.test.ts` — bout en bout sur un port libre.

## Contrats
Routes : `GET /health` (toute identité signée) ; `GET /editor/state?page=` ; `POST /editor/requests` (201) ;
`GET /editor/jobs/:id` ; `POST /editor/jobs/:id/answer|stop` ; `POST /editor/changes/:id/validate|cancel` ;
`GET /editor/jobs/:id/shots/:file` (`^\d{3,4}-(before|after)\.png$`, image/png, `private, max-age=300`) — droit `ai.editor`.
Ids : `^[a-z]{2,4}_[a-z0-9]{8,40}$` (`job_…`, `chg_…`), compatibles avec la liste blanche du relais de l'admin.

**Ajouter une route (engine-publish, ask-ai)** : dans `register(context)` de son module,
`context.router.add({ method, path: '/publish/diff/:id', capability: 'publish.diff', params: { id: /…/ }, handler })`.
Le handler reçoit `{ user, params, query, body, signal }` et renvoie `{ status?, json }` ou `{ status?, png }` ; il lève
`EngineError` pour une erreur du contrat. `EngineContext` : config, router, store (editor + publications), repo
(WorkRepo), lock (`runPublish`), editor (`validatedDesign()`, `blocker()`), sanity (port robot ou null), texts, preview,
access, settings, `ports.usage` (UsageRecorder) et `ports.pendingTotal` à brancher.

## Comportement
Ordre : Bearer (temps constant) → identité signée (`verifyEngineUser`, HMAC + forme) → 401 `unauthorized` sinon, et
SEULEMENT là ; route (404 `not_found` après l'authentification) ; droit du rôle signé (`can`) → 403 ; POST : corps JSON
(`content-type` JSON si présent, sinon 415), ≤ 64 Kio compté en flux (413), JSON invalide 400 ; handler. Réponses
`no-store`, `nosniff`, `no-referrer`. Exception imprévue → 500 `internal` « Internal error of the AI engine. » (détail au
journal du moteur seulement). Segments décodés : `.`/`..` refusés, motif par paramètre.

## Forces
Même fichier de signature que l'admin (`src/admin/core/engine/signature.ts`, import relatif) ; testé : Bearer absent ou
faux, identité absente ou retouchée, 403 par rôle, 413/415/400, traversée par la capture, 409 au format du contrat.

## Faiblesses et limites connues
- Identité signée sans horodatage (rejeu possible tant que le secret ne change pas ; canal local) — voir auth-core.
- Pas de limite de débit ; pas de journal d'accès.

## Points sensibles
- Ne JAMAIS répondre 401 pour autre chose que l'authentification (l'admin traduit 401 en « moteur mal configuré »).
- Ne jamais renvoyer `error.message` d'une exception imprévue au client ; ne jamais journaliser les en-têtes.

## Tests
`npx vitest run engine/src/server` (~1 s).

## Demandes de contrat
Aucune.
