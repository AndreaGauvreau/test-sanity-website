# core/engine — LLM context

> Propriétaire : auth-core · Figma : — (sert D1-D3, G1-G4, E1, E2, B5) · Mis à jour : 2026-09-27 (vague 3b-2, FOLLOWUPS #39 ; routes `/claude/access*`)
> Possède aussi : `src/app/admin/api/engine/[...path]/route.ts` (relais). Voir « Propriété des mocks ».

## Utilité

Canal entre l'admin (Next) et le moteur IA (`engine/`, 127.0.0.1:4043) : signature Ed25519 de l'identité, appel
serveur typé, relais navigateur en LISTE BLANCHE, client navigateur typé, jeton d'accès court à l'aperçu, et moteur
SIMULÉ (`ENGINE_MOCK=1`) pour construire les écrans sans moteur. Aucun accès à Claude ici : seul le moteur le détient.

## Fichiers

- `signature.ts` — PUR, Web Crypto, imports relatifs : `toEngineUser`, `signEngineUser`, `verifyEngineUser`,
  `engineIdentityHeaders`, `encodeEngineIdentity`, `decodeEngineIdentity`, `verifyEngineBearer`, `constantTimeEqual`,
  constantes `ENGINE_IDENTITY_TTL_SECONDS` (60), `ENGINE_IDENTITY_CLOCK_SKEW_SECONDS` (30),
  `ENGINE_IDENTITY_MAX_LIFETIME_SECONDS` (120). Importé tel quel par le moteur.
- `preview-token.ts` — PUR, Web Crypto : `signPreviewToken`, `verifyPreviewToken`, `renewPreviewToken`,
  `PREVIEW_TOKEN_TTL_SECONDS` (15 min).
  Jeton `v1.<exp>.<uid>.<sig>` (HMAC-SHA256 de ENGINE_PREVIEW_SECRET). Émis par le moteur, vérifié par le proxy
  (core/auth/proxy-rules.ts). Écrit par l'orchestrateur, propriété d'auth-core depuis la vague 3 (SEC-09).
- `routes.ts` — liste blanche `ENGINE_ROUTES` (méthode, segments, droit, type, paramètres de requête, délai), `matchEngineRoute`, `filterEngineQuery`, `isSafeSegment`, `MAX_ENGINE_BODY_BYTES` (64 Kio),
  `requiresLocalAdmin` (« Use my Claude subscription » : le relais le refuse en 403 si l'hôte n'est pas 127.0.0.1 / localhost).
- `errors.ts` — `ENGINE_MESSAGES` (anglais), `EngineRequestError`, `engineErrorBody`, `engineErrorResponse`, `isEngineErrorBody`.
- `transport.ts` — `callEngine(call, deps)` (sans Next, dépendances injectées), `useMockEngine`, `readBodyCapped`.
- `server.ts` — SERVEUR : `engineFetch`, `relayEngineRequest` (lient `transport` à `process.env` et au mock).
- `client.ts` — NAVIGATEUR : `engineClient` (appels au relais), `EngineClientError`, `ENGINE_RELAY_BASE`.
- `mock/index.ts` — répartiteur du moteur simulé ; GET /health y répond `mockEditorHealth()` (editor.ts, FOLLOWUPS #39).
  `mock/health.ts` — `MOCK_HEALTH`, santé de BASE (corrigée par le scénario de l'éditeur simulé). `mock/types.ts` — `MockEngineRequest`,
  `MockEngineResponse`, `MockHandler`. `mock/not-implemented.ts` — réponse 501 (segment inconnu du répartiteur).
- `mock/editor.ts`, `mock/publish.ts`, `mock/ask.ts`, `mock/claude.ts` (+ leurs tests) — IMPLÉMENTÉS par d'autres agents (voir ci-dessous).
- `*.test.ts` — signature, liste blanche, transport, client, jeton d'aperçu ; `mock/index.test.ts` (GET /health simulé).

## Contrats

- Applique `core/contracts/engine.ts` (routes, `EngineErrorBody`, en-têtes `x-kz-user` / `x-kz-user-sig`, identité
  Ed25519 avec iat/exp) et `roles.ts` (droits).
- Variables serveur : `ENGINE_URL`, `ENGINE_SECRET` (Bearer de transport), `ENGINE_IDENTITY_PRIVATE_KEY` (Ed25519
  PKCS#8 base64, admin seulement), `ENGINE_MOCK`. Le moteur a `ENGINE_SECRET` et `ENGINE_IDENTITY_PUBLIC_KEY` (SPKI).
- Exports serveur (`@/admin/core/engine/server`) :
  - `engineFetch<T>(session: Session, method: 'GET' | 'POST', path: string, options?: { body?: unknown; query?: Record<string, string> }): Promise<T>`
    — ex. `await engineFetch<PublishStatus>(session, 'GET', 'publish/status')` ; lève `EngineRequestError { status, code, message }`.
  - `relayEngineRequest({ session, method, segments, search?, body? }): Promise<Response>`.
- Exports navigateur (`@/admin/core/engine/client`) : `engineClient.health()`, `.editor.{state(page), request(req),
  job(id), answer(id, answers), stop(id), validate(changeId), cancel(changeId), shotUrl(jobId, file)}`,
  `.publish.{status(), run(expected), retry(), discard(item), stage({ kind: 'unpublish' | 'delete', id }), unstage(id),
  diff(changeId)}`, `.versions.{list(), rollback(number)}`, `.ask(request)`, `.claude.{access(), save(input), test(),
  clear()}` (B5 · Claude connection : la clé part une fois en POST, seule `keyHint` revient) ; chaque appel accepte
  `{ signal?, fetchImpl? }` et lève `EngineClientError { status, code, message }`.
- Exports pour le moteur (`src/admin/core/engine/signature.ts`, import relatif) :
  - `verifyEngineUser(headers: { get(name): string | null } | Record<string, string | string[] | undefined>, publicKeySpkiB64: string, nowSeconds?: number): Promise<EngineUser | null>`
  - `verifyEngineBearer(authorization, secret): boolean`
  - (tests du moteur) `signEngineUser(user, privateKeyPkcs8B64, nowSeconds?): Promise<{ header; signature }>` et
    `engineIdentityHeaders({ header, signature })` → `{ 'x-kz-user', 'x-kz-user-sig' }`.
- Exports pour le moteur et le proxy (`preview-token.ts`) : `signPreviewToken(secret, userId, nowSeconds?, ttl?)`,
  `verifyPreviewToken(secret, token, nowSeconds?) → { exp, userId } | null`,
  `renewPreviewToken(secret, { exp, userId }, nowSeconds?, ttl?) → { token, exp }` (re-signé pour le même utilisateur,
  exp = max(exp, maintenant + ttl) ; utilisé par le proxy de l'aperçu à chaque requête acceptée).
- Route HTTP : `GET|POST /admin/api/engine/<route du contrat>`.

## Comportement

Chaque appel (relais ou `engineFetch`) : `requireSession('route')` (relais) → `matchEngineRoute` (sinon 404
`not_found`, sans appel) → droit du rôle (`publish.diff` et `versions.rollback` : Kuartz ; `ai.access` : Kuartz et client ; `ai.editor`, `ai.ask`,
`publish.run` : tous ; `health` : toute session ; sinon 403) → POST : même origine (sinon 403), corps ≤ 64 Kio lu en
flux (sinon 413), JSON valide re-sérialisé (sinon 400) → paramètres de requête filtrés (`page` pour `editor/state`
seulement) → moteur simulé ou réseau.
Réseau : `ENGINE_URL/<segments>` avec `Authorization: Bearer ENGINE_SECRET`, `x-kz-user` = base64url du JSON
`{ id, name, email, role, iat, exp = iat + 60 }` et `x-kz-user-sig` = base64url(Ed25519) signé avec
ENGINE_IDENTITY_PRIVATE_KEY (constat SEC-10 : la clé d'identité est distincte du Bearer ; le moteur ne détient que la
clé publique, donc qui vole ENGINE_SECRET ne peut pas forger un rôle). Vérification : signature, `exp` non dépassé,
`iat` ≤ maintenant + 30 s, 0 < exp − iat ≤ 120 s ; sinon null (401 côté moteur).
`redirect: 'manual'`, délai 15 s (30 s publication / retour arrière, 60 s Ask, 75 s test de connexion à Claude). Aucun cookie ni en-tête du navigateur
n'est transmis ; aucun en-tête du moteur ne revient.
Réponses : JSON `no-store` ; captures PNG seulement (`image/png`, `private, max-age=300`) ; erreurs du moteur au format
du contrat relayées avec leur statut ; réponse illisible, redirection ou 2xx vide → 502 ; injoignable → 502 ; délai → 504 ;
401 du moteur → 503 « not configured » + log (Bearer différent, clés d'identité qui ne vont pas ensemble ou horloges
décalées : jamais présenté comme une session expirée) ; `ENGINE_URL`/`ENGINE_SECRET`/`ENGINE_IDENTITY_PRIVATE_KEY`
absents ou clé illisible → 503 sans appel.
Moteur simulé : `ENGINE_MOCK=1` et `NODE_ENV !== 'production'` (en production : ignoré + log). Même liste blanche et mêmes
droits ; le gestionnaire reçoit segments, paramètres validés, corps parsé et `EngineUser`. Santé simulée (GET /health)
= `mockEditorHealth()` : la même que `EditorState.health`, qui suit le scénario de l'éditeur simulé (`ready` par défaut :
`ok: true`, `claude.access: 'api-key'` ; `no-claude`, `preview-starting` → `ok: false`), même règle que le vrai moteur
(`ok = access !== 'none' && preview.ready && branche draft`, constat AI-06).

## Propriété des mocks

| Fichier | Propriétaire | État au 2026-09-27 |
|---|---|---|
| `mock/index.ts`, `mock/health.ts`, `mock/types.ts`, `mock/not-implemented.ts` | auth-core | répartiteur par premier segment ; GET /health = `mockEditorHealth()` (scénario de l'éditeur simulé) |
| `mock/editor.ts` | **editor-sidebar** | implémenté : `handleEditor` (routes `/editor/*`), cycle d'une demande rejoué à l'horloge, scénarios `ENGINE_MOCK_EDITOR` / `setEditorMockScenario()` (défaut « ready ») ; monde sur `globalThis` |
| `mock/publish.ts` | **publish-ui** | implémenté : `handlePublish` (routes `/publish/*`, dont `stage` / `unstage`, et `/versions/*`), scénarios `pending`, `content-only`, `idle`, `publishing`, `published`, `failed`, `pending-fails`, `hosted`, `empty`, `offline` (`ENGINE_MOCK_PUBLISH` ou `POST /admin/publish/mock-scenario`) |
| `mock/claude.ts` | **code-usage** | implémenté : `handleClaude` (routes `/claude/access*`), mêmes règles que le moteur (validation du contrat, clé jamais renvoyée), scénarios `ENGINE_MOCK_CLAUDE` = `local` (défaut), `logged-out`, `hosted`, `env-key` ; une clé finissant par `FAIL0` échoue au test |
| `mock/ask.ts` | **ask-ai** | implémenté : `handleAsk` (route `/ask`), réponses et liens du catalogue du rôle, déclencheurs `[mock:error]`, `[mock:slow]` |

Un gestionnaire peut garder un état en mémoire (redémarrage du serveur = remise à zéro). Aucun n'écrit dans Sanity ni git.

## Forces

- Liste blanche + droits appliqués AVANT tout appel, pour le vrai moteur comme pour le simulé ; testés route par route.
- Identité asymétrique (Ed25519) et bornée dans le temps : interopérable avec `node:crypto`, testée avec une paire de
  clés générée dans le test ; le vol du Bearer seul ne donne aucun rôle.
- Transport sans Next (dépendances injectées) : tous les cas d'erreur testés sans réseau.

## Faiblesses et limites connues

- Une identité signée reste rejouable pendant sa minute de validité (pas de nonce) : acceptable (canal serveur à serveur).
- Horloges admin / moteur décalées de plus de 30 s → 401 moteur → 503 « not configured » dans l'admin.
- Le client navigateur ne fait pas de reprise automatique ni de sondage : c'est aux features (sondage 900 ms en G2).
- Les captures sont mises en cache 5 min côté navigateur (`private`) : un nom de fichier ne doit jamais être réutilisé.

## Points sensibles

- `ENGINE_SECRET` et `ENGINE_IDENTITY_PRIVATE_KEY` ne quittent jamais le serveur : `client.ts` ne doit JAMAIS importer
  `server.ts` / `transport.ts` ni lire `process.env`. La clé PRIVÉE n'est jamais copiée côté moteur.
- JAMAIS de route relayée hors de `ENGINE_ROUTES` ; ajouter une route = contrat `engine.ts` (orchestrateur) d'abord.
- JAMAIS le jeton Sanity de l'utilisateur vers le moteur : `toEngineUser` ne garde que id, name, email, role.
- `signature.ts` et `preview-token.ts` doivent rester sans alias `@/`, sans Node, sans Next (le moteur les importe tels quels).
- Le moteur DOIT revérifier les droits d'après le rôle signé (la liste blanche de l'admin n'est pas une garantie pour lui).
- JAMAIS le secret racine ENGINE_PREVIEW_SECRET vers le navigateur : seulement des jetons `signPreviewToken`.

## Pièges

- Next 16 : `params` d'une route dynamique est une Promise (`await context.params`).
- Pas de `export const dynamic` dans le relais : interdit si `cacheComponents` est activé (Next 16).
- `fetch` avec `redirect: 'manual'` renvoie le 3xx tel quel : il est converti en 502, jamais suivi.
- `Content-Length` peut manquer ou mentir : le corps est compté en flux (`readBodyCapped`).
- Un 2xx vide du moteur est traité comme une erreur (toutes les routes du contrat renvoient du JSON).
- En-têtes Node (`IncomingHttpHeaders`) : noms en minuscules, valeur parfois tableau ; `verifyEngineUser` accepte cet
  objet tel quel (pas besoin d'adaptateur `get`).
- Les clés acceptent le base64 brut ou une armure PEM ; une clé publique passée comme privée lève une erreur à
  l'import (→ 503 dans le transport, jamais une signature vide).

## Comment modifier

- Nouvelle route du moteur : (1) contrat `engine.ts` par l'orchestrateur ; (2) entrée dans `ENGINE_ROUTES` (droit,
  paramètres permis, délai) ; (3) méthode dans `engineClient` ; (4) test dans `routes.test.ts` (le test compte les routes).
- Nouveau paramètre de segment typé : `PARAM_PATTERNS` dans `routes.ts`.
- Nouveau gestionnaire simulé : fichier dans `mock/`, branché dans `mock/index.ts` (auth-core).
- Changer de paire de clés d'identité : générer une paire Ed25519 (`crypto.generateKeyPairSync('ed25519')`, export DER
  pkcs8 / spki en base64), clé privée dans `.env.local` de l'admin, clé publique dans `engine/.env.local`, redémarrer les deux.

## Tests

`npx vitest run src/admin/core/engine` — Ed25519 (signature / vérification, en-têtes `Headers` et Node, interopérabilité
`node:crypto`, HMAC du Bearer refusé (SEC-10), autre clé, rôle retouché, signature altérée, dates : exp, iat futur,
durée > 120 s, marge de 30 s, clé PEM, clé absente) ; les 23 routes du contrat reconnues dont `publish/stage`,
`publish/unstage` et `claude/access*` (droit `ai.access`, abonnement réservé à un admin local), routes / méthodes / segments hostiles refusés ; transport (en-têtes signés avec la clé d'identité,
filtrage, 404/403 sans appel, 400/413, relais d'erreur, 401 → 503, 502/504, PNG, configuration ou clé absente → 503) ;
moteur simulé (santé cohérente, GET /health = `mockEditorHealth()` selon le scénario de l'éditeur, publication simulée
relayée, droits, refus en production) ; client navigateur (URL, POST, stage / unstage, erreurs). Jeton d'aperçu :
`preview-token.test.ts` (userId rendu, renouvellement glissant jamais raccourci) et `core/auth/proxy-rules.test.ts`.
À la main : avec `ENGINE_MOCK=1` dans `.env.local`, `curl http://127.0.0.1:4040/admin/api/engine/health` → santé
simulée ; sans moteur lancé → 502 `unavailable`. Vérifié le 2026-09-27 : la clé privée de `.env.local` et la clé
publique de `engine/.env.local` forment une paire (script local, sans afficher les clés).

## Décisions et « À trancher »

- Les droits sont vérifiés deux fois (relais et moteur) ; le relais renvoie 403 sans appeler le moteur.
- `health` ouvert à toute session (la Top bar et l'éditeur en ont besoin).
- `GET /versions` exige `publish.run` (tous les rôles), le retour arrière `versions.rollback` (Kuartz).
- `publish/stage` et `publish/unstage` exigent `publish.run`, comme `publish/discard`.
- SEC-10 (orchestrateur) : identité Ed25519 à clé distincte, iat/exp (remplace FOLLOWUPS #4).

## Demandes de contrat

- Aucune.
