# core/engine — LLM context

> Propriétaire : auth-core · Figma : — (sert D1-D3, G1-G4, E1, E2) · Mis à jour : 2026-09-27
> Possède aussi : `src/app/admin/api/engine/[...path]/route.ts` (relais). Voir « Propriété des mocks ».

## Utilité

Canal entre l'admin (Next) et le moteur IA (`engine/`, 127.0.0.1:4043) : signature de l'identité, appel serveur typé,
relais navigateur en LISTE BLANCHE, client navigateur typé, et moteur SIMULÉ (`ENGINE_MOCK=1`) pour construire les
écrans sans moteur. Aucun accès à Claude ici : seul le moteur le détient.

## Fichiers

- `signature.ts` — PUR, Web Crypto, imports relatifs : `toEngineUser`, `encodeEngineUser`, `decodeEngineUser`,
  `hmacSha256Hex`, `signEngineUser`, `verifyEngineUser`, `verifyEngineBearer`, `constantTimeEqual`. Importé tel quel par le moteur.
- `routes.ts` — liste blanche `ENGINE_ROUTES` (méthode, segments, droit, type, paramètres de requête, délai), `matchEngineRoute`, `filterEngineQuery`, `isSafeSegment`, `MAX_ENGINE_BODY_BYTES` (64 Kio).
- `errors.ts` — `ENGINE_MESSAGES` (anglais), `EngineRequestError`, `engineErrorBody`, `engineErrorResponse`, `isEngineErrorBody`.
- `transport.ts` — `callEngine(call, deps)` (sans Next, dépendances injectées), `useMockEngine`, `readBodyCapped`.
- `server.ts` — SERVEUR : `engineFetch`, `relayEngineRequest` (lient `transport` à `process.env` et au mock).
- `client.ts` — NAVIGATEUR : `engineClient` (appels au relais), `EngineClientError`, `ENGINE_RELAY_BASE`.
- `mock/index.ts` — répartiteur du moteur simulé (auth-core). `mock/health.ts` — santé simulée (auth-core).
- `mock/types.ts` — `MockEngineRequest`, `MockEngineResponse`, `MockHandler` (auth-core). `mock/not-implemented.ts` — réponse 501.
- `mock/editor.ts`, `mock/publish.ts`, `mock/ask.ts` — PLACEHOLDERS 501 (voir ci-dessous).
- `*.test.ts` — signature, liste blanche, transport, client.

## Contrats

- Applique `core/contracts/engine.ts` (routes, `EngineErrorBody`, en-têtes `x-kz-user` / `x-kz-user-sig`) et `roles.ts` (droits).
- Exports serveur (`@/admin/core/engine/server`) :
  - `engineFetch<T>(session: Session, method: 'GET' | 'POST', path: string, options?: { body?: unknown; query?: Record<string, string> }): Promise<T>`
    — ex. `await engineFetch<PublishStatus>(session, 'GET', 'publish/status')` ; lève `EngineRequestError { status, code, message }`.
  - `relayEngineRequest({ session, method, segments, search?, body? }): Promise<Response>`.
- Exports navigateur (`@/admin/core/engine/client`) : `engineClient.health()`, `.editor.{state(page), request(req),
  job(id), answer(id, answers), stop(id), validate(changeId), cancel(changeId), shotUrl(jobId, file)}`,
  `.publish.{status(), run(expected), retry(), discard(item), diff(changeId)}`, `.versions.{list(), rollback(number)}`,
  `.ask(request)` ; chaque appel accepte `{ signal?, fetchImpl? }` et lève `EngineClientError { status, code, message }`.
- Exports pour le moteur (`src/admin/core/engine/signature.ts`, import relatif) : `verifyEngineUser(headers, secret)`,
  `verifyEngineBearer(authorization, secret)`, `hmacSha256Hex`, `constantTimeEqual`.
- Route HTTP : `GET|POST /admin/api/engine/<route du contrat>`.

## Comportement

Chaque appel (relais ou `engineFetch`) : `requireSession('route')` (relais) → `matchEngineRoute` (sinon 404
`not_found`, sans appel) → droit du rôle (`publish.diff` et `versions.rollback` : Kuartz ; `ai.editor`, `ai.ask`,
`publish.run` : tous ; `health` : toute session ; sinon 403) → POST : même origine (sinon 403), corps ≤ 64 Kio lu en
flux (sinon 413), JSON valide re-sérialisé (sinon 400) → paramètres de requête filtrés (`page` pour `editor/state`
seulement) → moteur simulé ou réseau.
Réseau : `ENGINE_URL/<segments>` avec `Authorization: Bearer ENGINE_SECRET`, `x-kz-user` (base64url du JSON
`{ id, name, email, role }`), `x-kz-user-sig` (hex HMAC-SHA256), `redirect: 'manual'`, délai 15 s (30 s publication /
retour arrière, 60 s Ask). Aucun cookie ni en-tête du navigateur n'est transmis ; aucun en-tête du moteur ne revient.
Réponses : JSON `no-store` ; captures PNG seulement (`image/png`, `private, max-age=300`) ; erreurs du moteur au format
du contrat relayées avec leur statut ; réponse illisible, redirection ou 2xx vide → 502 ; injoignable → 502 ; délai → 504 ;
401 du moteur → 503 « not configured » + log (secret différent des deux côtés, jamais présenté comme une session expirée) ;
`ENGINE_URL`/`ENGINE_SECRET` absents → 503.
Moteur simulé : `ENGINE_MOCK=1` et `NODE_ENV !== 'production'` (en production : ignoré + log). Même liste blanche et mêmes
droits ; le gestionnaire reçoit segments, paramètres validés, corps parsé et `EngineUser`.

## Propriété des mocks (transfert en vague 2)

| Fichier | Propriétaire après la vague 1 | Signature à garder |
|---|---|---|
| `mock/index.ts`, `mock/health.ts`, `mock/types.ts`, `mock/not-implemented.ts` | auth-core | — |
| `mock/editor.ts` | **editor-sidebar** | `export const handleEditor: MockHandler` (routes `/editor/*`) |
| `mock/publish.ts` | **publish-ui** | `export const handlePublish: MockHandler` (routes `/publish/*` et `/versions/*`) |
| `mock/ask.ts` | **ask-ai** | `export const handleAsk: MockHandler` (route `/ask`) |

Les trois fichiers transférés répondent aujourd'hui 501 `not_implemented` (« Mock engine: "editor" is not implemented yet. »).
Un gestionnaire peut garder un état en mémoire de module (redémarrage du serveur = remise à zéro).

## Forces

- Liste blanche + droits appliqués AVANT tout appel, pour le vrai moteur comme pour le simulé ; testés route par route.
- Signature pure, vérifiée contre RFC 4231 et `node:crypto` : le moteur peut vérifier avec le même fichier.
- Transport sans Next (dépendances injectées) : tous les cas d'erreur testés sans réseau.

## Faiblesses et limites connues

- Identité signée sans horodatage ni nonce : une paire d'en-têtes interceptée resterait rejouable tant que le secret ne
  change pas (le canal est local 127.0.0.1 ; à revoir pour un moteur hébergé : ajouter `iat` au contrat).
- Le client navigateur ne fait pas de reprise automatique ni de sondage : c'est aux features (sondage 900 ms en G2).
- Les captures sont mises en cache 5 min côté navigateur (`private`) : un nom de fichier ne doit jamais être réutilisé.

## Points sensibles

- `ENGINE_SECRET` ne quitte jamais le serveur : `client.ts` ne doit JAMAIS importer `server.ts` / `transport.ts` ni lire `process.env`.
- JAMAIS de route relayée hors de `ENGINE_ROUTES` ; ajouter une route = contrat `engine.ts` (orchestrateur) d'abord.
- JAMAIS le jeton Sanity de l'utilisateur vers le moteur : `toEngineUser` ne garde que id, name, email, role.
- `signature.ts` doit rester sans alias `@/`, sans Node, sans Next (le moteur l'importe tel quel).
- Le moteur DOIT revérifier les droits d'après le rôle signé (la liste blanche de l'admin n'est pas une garantie pour lui).

## Pièges

- Next 16 : `params` d'une route dynamique est une Promise (`await context.params`).
- Pas de `export const dynamic` dans le relais : interdit si `cacheComponents` est activé (Next 16).
- `fetch` avec `redirect: 'manual'` renvoie le 3xx tel quel : il est converti en 502, jamais suivi.
- `Content-Length` peut manquer ou mentir : le corps est compté en flux (`readBodyCapped`).
- Un 2xx vide du moteur est traité comme une erreur (toutes les routes du contrat renvoient du JSON).

## Comment modifier

- Nouvelle route du moteur : (1) contrat `engine.ts` par l'orchestrateur ; (2) entrée dans `ENGINE_ROUTES` (droit,
  paramètres permis, délai) ; (3) méthode dans `engineClient` ; (4) test dans `routes.test.ts` (le test compte les routes).
- Nouveau paramètre de segment typé : `PARAM_PATTERNS` dans `routes.ts`.
- Nouveau gestionnaire simulé : fichier dans `mock/`, branché dans `mock/index.ts` (auth-core).

## Tests

`npx vitest run src/admin/core/engine` — vecteurs HMAC, encodage/décodage de l'identité, retouche de rôle refusée,
Bearer ; les 17 routes du contrat reconnues et les routes / méthodes / segments hostiles refusés ; transport (en-têtes
signés, filtrage, 404/403 sans appel, 400/413, relais d'erreur, 401 → 503, 502/504, PNG, configuration absente) ;
moteur simulé (santé, 501, droits, refus en production) ; client navigateur (URL, POST, erreurs).
À la main : avec `ENGINE_MOCK=1` dans `.env.local` (redémarrage requis), `curl http://127.0.0.1:4040/admin/api/engine/health`
→ santé simulée ; sans moteur lancé → 502 `unavailable`.

## Décisions et « À trancher »

- Les droits sont vérifiés deux fois (relais et moteur) ; le relais renvoie 403 sans appeler le moteur.
- `health` ouvert à toute session (la Top bar et l'éditeur en ont besoin).
- `GET /versions` exige `publish.run` (tous les rôles), le retour arrière `versions.rollback` (Kuartz).

## Demandes de contrat

- (Suggestion, non bloquante) Ajouter `iat` (horodatage) à l'identité signée de `engine.ts` pour borner le rejeu quand le
  moteur sera hébergé (mode `hosted`).
