# Connexion à Claude depuis l'admin (`engine/src/access`) — LLM context

> Propriétaire : engine-core · Figma : B5 (carte « Claude connection », pas de maquette) · Mis à jour : 2026-09-27

## Utilité
Régler l'accès du moteur à Claude depuis l'admin (B5 · Usage) au lieu d'éditer `engine/.env.local`, et le RECHARGER À
CHAUD (éditeur au début de chaque demande, Ask AI à chaque question, /health) :
- moteur local (ENGINE_MODE=local écrit) + admin sur localhost : « Use my Claude subscription » = la connexion Claude
  Code de la machine (`/login`), sans clé à coller ;
- ailleurs : clé API Anthropic, chiffrée sur disque, jamais renvoyée ;
- test de connexion (`POST /claude/access/test`).
Ne fait pas : lancer Claude pour une demande (engine-claude), l'écran (features/usage), le relais (core/engine).

## Fichiers
- `service.ts` — `createClaudeAccessService(deps)` → `current()` (synchrone), `refresh({ machine? })`, `state()`,
  `save(body)` (zod), `clear()`, `test()` (un seul à la fois), `watch(ms)` (sonde de l'abonnement, 60 s) ; `testConfigDirOf`.
- `resolve.ts` — `resolveEngineAccess` (PUR : ordre des sources), messages `NO_ACCESS`, `NOT_SIGNED_IN`, `SUBSCRIPTION_HOSTED`.
- `store.ts` — `openAccessStore({ dataDir, secret })` : `<ENGINE_WORKSPACE>/data/claude-access.json` (0600, atomique),
  clé AES-256-GCM (clé HKDF-SHA256 d'ENGINE_SECRET, sel 16 o par enregistrement, IV 12 o, AAD) ; `seal` / `unseal`.
- `machine.ts` — `detectMachineLogin`, `systemProbe` (`claude auth status --json` du binaire de l'Agent SDK, repli
  trousseau / fichier), `machineLoginOf`, `keychainService`, `keychainAccount`, `claudeBinary`.
- `connection-test.ts` — `testApiKey` (GET /v1/models, gratuit), `testSubscription` (un tour `complete`, Haiku, 16 jetons).
- `index.ts` — `accessModule` (routes, sonde démarrée/arrêtée), `registerAccessRoutes`, exports.
- `access.test.ts` — 23 tests (magasin, ordre, machine, tests de connexion, service, routes et droits).

## Contrats
- Routes (`core/contracts/engine.ts`, droit `ai.access` = Kuartz et client, revérifié par le routeur) :
  `GET /claude/access` → `ClaudeAccessState` ; `POST /claude/access` `{ kind: 'api-key', apiKey } | { kind: 'subscription' }`
  (400 clé refusée / sk-ant-oat, 403 abonnement hors local) ; `POST /claude/access/test` ; `POST /claude/access/clear`.
- `EngineContext.claudeAccess` (le service) et `EngineContext.access` (ACCESSEUR sur `current()`), posés par `startEngine`
  AVANT l'éditeur. Validation partagée avec l'admin : `claudeApiKeyProblem`, `cleanClaudeApiKey`, `claudeKeyHint` (contrat).
- Dépend de : engine-claude (`resolveClaudeAccess`, `credentialEnv`, `createComplete`), `server/errors`.

## Comportement
Ordre (`resolveEngineAccess`) : 1. `ANTHROPIC_API_KEY` de l'environnement (toujours prioritaire, `envApiKey: true`, un
`sk-ant-oat` y reste refusé) ; 2. clé enregistrée ; 3. abonnement enregistré, moteur local écrit : connexion de la
machine si `auth status` dit connecté, sinon repli `CLAUDE_CODE_OAUTH_TOKEN`, sinon `NOT_SIGNED_IN` (marche à suivre :
`claude` puis `/login`) ; 4. `CLAUDE_CODE_OAUTH_TOKEN` (local écrit) ; 5. rien. Jamais d'abonnement en hébergé.
Un seul accès enregistré à la fois : enregistrer l'un remplace l'autre et efface le dernier test. Dernier test gardé dans
le fichier (ou en mémoire si l'accès vient de l'environnement). La machine n'est sondée que si l'abonnement est choisi,
ou pour l'écran (GET/POST) ; sonde périodique de 60 s quand l'abonnement est choisi (un `/login` sert sans passer par B5).

## Forces
- La clé ne sort du moteur que vers Anthropic : ni réponse (seulement `keyHint` « sk-ant-…XXXX »), ni journal, ni message
  d'erreur (masquage `sk-ant-…` en défense), ni Sanity, ni git ; testée sur disque, dans les réponses et les journaux.
- Présence de la connexion de la machine dite par Claude Code lui-même, avec l'env EXACT du vrai appel (aucun modèle appelé).

## Faiblesses et limites connues
- Test d'une clé API : `GET /v1/models` vérifie la clé et le réseau, PAS le crédit (un compte sans crédit passe).
- Test de l'abonnement : un vrai tour (Haiku, ≈ 30 jetons) décompté de l'abonnement.
- ENGINE_SECRET changé → clé enregistrée illisible (message clair, à ressaisir).
- Rejeu d'une identité signée (60 s) : un client pourrait rejouer un POST de clé pendant ce délai (canal local).

## Points sensibles
- Ne JAMAIS journaliser le corps de `POST /claude/access`, ni `current()` ; ne jamais ajouter la clé à `ClaudeAccessState`.
- `context.access` se lit AU MOMENT de l'appel (accesseur) : ne jamais le copier à l'enregistrement d'un module.
- La sonde `auth status` et le test passent l'env minimal (`credentialEnv`) : jamais `...process.env`.

## Pièges
- L'élément « Claude Code-credentials » du trousseau peut exister sans connexion utilisable : ne pas s'y fier (repli seulement).
- Le relais de l'admin refuse `{ kind: 'subscription' }` si l'admin n'est pas sur localhost (`requiresLocalAdmin`) ; le
  moteur, lui, le refuse hors ENGINE_MODE=local écrit : les deux contrôles sont voulus.

## Comment modifier
- Nouvelle source d'accès : `resolveEngineAccess` + cas dans `access.test.ts` + `ClaudeAccessSource` (contrat, orchestrateur).
- Autre test de clé : `testApiKey` (garder un appel sans coût) + messages `TEST_MESSAGES`.

## Tests
`npx vitest run engine/src/access` (23 tests, < 1 s, aucun réseau : faux fetch, faux `complete`, fausse sonde, faux
binaire `claude` pour `auth status`). Rechargement à chaud de bout en bout : `engine/src/main.test.ts`.

## Décisions et « À trancher »
- Clé stockée par le moteur (fichier chiffré 0600 dans data/), jamais dans Sanity (demande de l'utilisatrice, 2026-09-27).
- ANTHROPIC_API_KEY de l'environnement reste prioritaire (l'écran le dit).

## Demandes de contrat
- Aucune (contrat et droit `ai.access` ajoutés sur autorisation de l'orchestrateur, 2026-09-27).
