# Serveur HTTP du moteur (`engine/src/server`) — LLM context

> Propriétaire : engine-core · Figma : — (sert D1-D3, G1, G2 ; E1-E2 et G4 via les modules) · Mis à jour : 2026-09-27

## Utilité
Serveur `node:http` sur 127.0.0.1:ENGINE_PORT, routeur extensible, authentification, erreurs du contrat, routes de
l'éditeur (EXACTEMENT celles de `core/contracts/engine.ts`), santé, point d'extension des autres modules du moteur.

## Fichiers
- `http.ts` — `createRouter()`, `createHandler()`, `createEngineServer({ router, secret, identityPublicKey, log })`, `MAX_BODY_BYTES` (64 Kio), types `RouteDef`, `RouteContext`, `RouteResult`.
- `editor-routes.ts` — `registerEditorRoutes(router, editor, health)` : /health et les 8 routes /editor/*.
- `errors.ts` — `EngineError(status, code, message)` → `EngineErrorBody` ; fabriques (badRequest, notFound, conflict, busy, awaitingValidation, publishing, unavailable, forbidden).
- `health.ts` — `createHealth(...)` → `EngineHealth` + champs additifs `HealthExtras` (`warnings`, `fakeClaude`).
- `modules.ts` — `EngineContext`, `EngineModule` (`register`, `stop?`).
- `http.test.ts` — bout en bout sur un port libre (paire Ed25519 de test de `jobs/testing.ts`).

## Contrats
Routes : `GET /health` (toute identité signée) ; `GET /editor/state?page=` ; `POST /editor/requests` (201) ;
`GET /editor/jobs/:id` ; `POST /editor/jobs/:id/answer|stop` ; `POST /editor/changes/:id/validate|cancel` ;
`GET /editor/jobs/:id/shots/:file` (`^\d{3,4}-(before|after)\.png$`, image/png, `private, max-age=300`) — droit `ai.editor`.
Ids : `^[a-z]{2,4}_[a-z0-9]{8,40}$` (`job_…`, `chg_…`), compatibles avec la liste blanche du relais de l'admin.
`/editor/state` passe l'utilisateur signé au service : l'URL d'aperçu porte un jeton émis pour lui (SEC-09).
`/health` : `EngineHealth` + `warnings?: string[]` et `fakeClaude?: string` quand ENGINE_FAKE_CLAUDE est actif
(additifs, hors contrat pour l'instant ; l'admin les ignore).
`EngineContext` : config, router, store (editor + publications), repo (WorkRepo), lock (`runPublish`), editor
(`validatedDesign()`, `blocker()`), sanity (port robot ou null), texts, preview, access (accès Claude RÉEL, ACCESSEUR relu
à chaque lecture : rechargé depuis l'admin), claudeAccess (service `engine/src/access` : routes `/claude/access*`), settings,
`ports.usage` (UsageRecorder) et `ports.pendingTotal` à brancher.

## Comportement
Ordre : Bearer ENGINE_SECRET (temps constant, transport) → identité signée (`verifyEngineUser(req.headers,
ENGINE_IDENTITY_PUBLIC_KEY)` d'auth-core : signature Ed25519, `exp` non dépassé, `iat` ≤ maintenant + 30 s,
`exp − iat` ≤ 120 s, forme de l'identité) → 401 `unauthorized` sinon, et SEULEMENT là ; route (404 `not_found` après
l'authentification) ; droit du rôle signé (`can`) → 403 ; POST : corps JSON (`content-type` JSON si présent, sinon 415),
≤ 64 Kio compté en flux (413), JSON invalide 400 ; handler. Réponses `no-store`, `nosniff`, `no-referrer`. Exception
imprévue → 500 `internal` « Internal error of the AI engine. » (détail au journal du moteur seulement). Segments
décodés : `.`/`..` refusés, motif par paramètre. Délais : en-têtes 20 s, requête 60 s, keep-alive 5 s.

## Forces
Même fichier de signature que l'admin (`src/admin/core/engine/signature.ts`, import relatif) ; testé : Bearer absent ou
faux, identité absente, retouchée, d'une autre clé (qui détient le Bearer ne forge pas un rôle), expirée, future,
ancienne forme HMAC refusée, 403 par rôle, 413/415/400, traversée par la capture, 409 au format du contrat.

## Faiblesses et limites connues
- Rejeu possible pendant la durée de vie d'une identité (60 s émise, 120 s acceptée) ; canal local.
- Pas de limite de débit ; pas de journal d'accès.

## Points sensibles
- Ne JAMAIS répondre 401 pour autre chose que l'authentification (l'admin traduit 401 en « moteur mal configuré »).
- Ne jamais renvoyer `error.message` d'une exception imprévue au client ; ne jamais journaliser les en-têtes.
- Le moteur ne détient que la clé PUBLIQUE d'identité : ne jamais y ajouter la clé privée (elle reste à l'admin).

## Pièges
- 401 est réservé à l'authentification : une ressource absente est 404, un droit manquant 403, même pour /health.
- `verifyEngineUser` lit directement `req.headers` (noms en minuscules de Node) : pas d'adaptateur `get()` à écrire.
- Horloges : une identité émise par un admin en avance de plus de 30 s est refusée (401) ; vérifier l'heure des machines
  en mode hébergé.

## Comment modifier
- **Ajouter une route (engine-publish, ask-ai)** : dans `register(context)` de son module,
  `context.router.add({ method, path: '/publish/diff/:id', capability: 'publish.diff', params: { id: /…/ }, handler })`.
  Le handler reçoit `{ user, params, query, body, signal }` et renvoie `{ status?, json }` ou `{ status?, png }` ; il
  lève `EngineError` pour une erreur du contrat.
- Nouveau code d'erreur : contrat d'abord (`EngineErrorCode`, orchestrateur), puis une fabrique dans `errors.ts`.
- Nouveau champ de santé : contrat `EngineHealth` (orchestrateur) puis `health.ts`.
- Tester un serveur : `createEngineServer({ router, secret, identityPublicKey: TEST_IDENTITY.publicKey })` et
  `signedIdentity(user)` de `jobs/testing.ts`.

## Tests
`npx vitest run engine/src/server` (~2 s).

## Décisions et « À trancher »
- Identité Ed25519 à clé distincte du Bearer (SEC-10, orchestrateur + auth-core) : la vérification est celle
  d'auth-core, le moteur ne réimplémente rien.
- `/health` accepte toute identité signée (comme la liste blanche de l'admin).

## Demandes de contrat
- ~~Orchestrateur : `warnings?: string[]` dans `EngineHealth`~~ — **fait** (au contrat, vérifié le 2026-09-27).
