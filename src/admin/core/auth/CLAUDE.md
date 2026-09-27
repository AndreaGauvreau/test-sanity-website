# core/auth — LLM context

> Propriétaire : auth-core · Figma : A1 (docs/admin/figma/screens/A1.md) · Mis à jour : 2026-09-27
> Possède aussi : `src/proxy.ts`, `src/app/admin/api/auth/**`, `src/app/admin/auth/callback/**`.

## Utilité

Accès à l'admin pour les trois rôles (kuartz, client, editor) : connexion avec le compte Sanity (flux « token » du
Studio), session chiffrée dans le cookie `kz_admin`, gardes `requireSession` / `requireCapability`, déconnexion,
connexion automatique de développement et sélecteur de rôle de dev, proxy Next 16 (garde optimiste de `/admin`, mode
aperçu de l'éditeur). La page visuelle A1 `/admin/login` n'est PAS ici (agent shell) : ce module lui fournit les
données (`getLoginProviders`, `getDevLoginState`, `loginErrorMessage`).

## Fichiers

- `constants.ts` — noms de cookies, chemins, TTL (12 h), version d'API d'auth Sanity, messages anglais, `loginErrorMessage`. Pur.
- `roles.ts` — `resolveAdminRole(sanityRoles)` : rôles du projet → rôle de l'admin (le plus fort l'emporte). Pur.
- `crypto.ts` — `sealSession` / `openSession` : JWE `dir` + `A256GCM`, clé = SHA-256(« kz-admin-session: » + secret), validation zod. Pur.
- `sanity-auth.ts` — appels HTTP Sanity (fetch injectable) : `fetchProviders`, `buildProviderLoginUrl`, `exchangeSid`, `fetchSanityMe`, `revokeSanityToken`, `isPlausibleSid`. Pur.
- `login.ts` — `signInWithSid` : sid → jeton → `/users/me` → rôle ; refus (et révocation du jeton) sinon. Pur.
- `dev.ts` — `decideDevAutologin`, `warnIfDevAutologinRefused`, `buildDevSession`, `isLocalHost`, `parseAdminRole`. Pur.
- `next-path.ts` — `sanitizeNextPath` (anti-redirection ouverte, anti-boucle), `loginUrlFor`. Pur.
- `request.ts` — `requestOrigin`, `shouldUseSecureCookies`, `isSameOriginRequest` (CSRF). Pur.
- `proxy-rules.ts` — `decideProxy` (décision du proxy en fonction pure), `timingSafeEqualString`, `previewFrameAncestors`, `PREVIEW_COOKIE`.
- `session.ts` — SERVEUR (`server-only`, Next) : `getSession`, `getPublicSession`, `requireSession`, `requireCapability`, `AdminAuthError`, `authErrorResponse`, `jsonError`, `writeSessionCookie`, `clearSessionCookie`, `logout`, `getLoginProviders`, `providerRedirectUrl`, `getDevLoginState`, `writeDevRoleCookie`.
- `*.test.ts` — tests Vitest (voir « Tests »).
- `src/proxy.ts` — applique `decideProxy` (NextResponse). Aucune logique propre.
- `src/app/admin/api/auth/login/route.ts` — GET `?provider=&next=` → 307 vers le fournisseur Sanity (URL construite côté serveur).
- `src/app/admin/api/auth/session/route.ts` — POST `{ sid, next? }` → cookie `kz_admin` + `{ ok, redirect, session: PublicSession }`.
- `src/app/admin/api/auth/logout/route.ts` — POST → révocation Sanity + cookie effacé ; 303 vers A1 (ou JSON si `Accept: application/json`).
- `src/app/admin/api/auth/dev-role/route.ts` — POST `{ role | 'off', next? }` (JSON ou formulaire), dev seulement, sinon 404.
- `src/app/admin/auth/callback/{page.tsx,AuthCallback.tsx,callback.module.css}` — retour du fournisseur : lit `#sid=`, l'efface de l'URL, POST session, puis `location.replace(redirect)`.

## Contrats

- Implémente `core/contracts/session.ts` (Session, PublicSession, toPublicSession) et applique `core/contracts/roles.ts`
  (SANITY_ROLE_TO_ADMIN, ROLE_PRIORITY, CAPABILITIES, can).
- Exporte pour les autres modules (tous côté serveur, depuis `@/admin/core/auth/session`) :
  - `getSession(): Promise<Session | null>` — mis en cache par rendu (`react.cache`).
  - `getPublicSession(): Promise<PublicSession | null>` — seule forme à passer à un composant client.
  - `requireSession(ctx?: 'page' | 'action' | 'route'): Promise<Session>` — défaut `'page'`.
  - `requireCapability(cap: Capability, ctx?: 'page' | 'action' | 'route'): Promise<Session>`.
  - `authErrorResponse(err): Response` (route handler), `jsonError(status, code, message): Response`.
  - `logout(): Promise<void>`.
  - Pour A1 (shell) : `getLoginProviders(next?): Promise<{ providers: { name; title; href }[]; error?: string }>`,
    `getDevLoginState(): Promise<{ available; activeRole; roles }>` ; depuis `constants.ts` : `loginErrorMessage(code)`,
    `ADMIN_LOGIN_PATH`, `AUTH_MESSAGES` ; depuis `next-path.ts` : `sanitizeNextPath`.
- Routes HTTP exposées : ci-dessus (Fichiers). Réponses d'erreur : `{ error: { code, message } }` (même forme que EngineErrorBody).
- Dépend de : `jose`, `zod`, `core/contracts`. Utilisé par : toutes les pages / actions / routes de l'admin, `core/sanity`
  (session), `core/engine` (identité), shell (A1, menu utilisateur).

## Comportement

**Connexion A1** (vérifiée dans `node_modules/sanity/lib/WorkspaceLoader-*.js`, sanity 6.16, `createHrefForProvider`,
`consumeSessionId`, `exchangeSessionForToken`) :
1. `GET https://api.sanity.io/v2021-06-07/auth/providers` → `{ providers: [{ name, title, url }] }` (mis en cache 10 min ;
   seules les URL https en `*.sanity.io` sont gardées).
2. Bouton « Continue with … » → `/admin/api/auth/login?provider=<name>&next=<chemin>` → 307 vers
   `<provider.url>?origin=<origine>/admin/auth/callback?next=<chemin nettoyé>&projectId=<id>&withSid=true`.
   ATTENTION : en mode token, le Studio 6.16 envoie `withSid=true`, PAS `type=token` (`type=<méthode>` n'est utilisé qu'en
   mode cookie/dual). La consigne initiale disait `type=token` : le code suit le Studio installé.
3. Retour sur `/admin/auth/callback?next=…#sid=<≥ 20 car.>` : le sid est lu au chargement du module client et retiré de
   l'URL (`history.replaceState`), envoyé UNE fois (garde StrictMode) à `POST /admin/api/auth/session`.
4. Serveur : `GET https://<projectId>.api.sanity.io/v2021-06-07/auth/fetch?sid=` → `{ token }`, puis `/users/me` sur
   l'hôte du PROJET (`roles: [{ name }]` et/ou `role`) → `resolveAdminRole`. Administrator → client, Developer → kuartz,
   Editor → editor. Aucun rôle : « Your Sanity account isn't a member of this project. Ask the site owner to invite you. » ;
   Viewer / rôle personnalisé : « Your role in this Sanity project (Viewer) doesn't give access to the admin… ». Dans les
   deux cas 403 et le jeton est révoqué aussitôt (`POST /auth/logout`).
5. Cookie `kz_admin` posé, réponse `{ ok, redirect: sanitizeNextPath(next), session: PublicSession }`.

**Session** : JWE, 12 h (`SESSION_TTL_SECONDS`), `httpOnly`, `SameSite=Lax`, `path=/admin`, `Secure` sauf sur
127.0.0.1/localhost/[::1]. Un changement de rôle dans Sanity prend effet à la connexion suivante (ou à l'expiration).
Cookie expiré/retouché/autre secret → `null` → redirection vers A1 puis retour à l'écran demandé (`x-kz-path` posé par le proxy).

**Gardes** : `requireSession('page')` sans session → `redirect('/admin/login?next=…')` ; `'action' | 'route'` →
`AdminAuthError(401)`. `requireCapability` sans le droit : page → `notFound()` (404 : ne révèle pas une page Kuartz ;
`forbidden()` exigerait `experimental.authInterrupts`), action/route → `AdminAuthError(403)`.

**Développement** : `ADMIN_DEV_AUTOLOGIN=kuartz|client|editor` n'est accepté que si `NODE_ENV === 'development'` ET hôte
(Host et X-Forwarded-Host) local. Sinon ignoré + `console.error` « ADMIN_DEV_AUTOLOGIN is set but IGNORED because … »
(une fois par cause et par processus). Session dev : `dev: true`, `sanityToken: null`, user `dev-<role>`. Une vraie
session reste prioritaire. `kz_dev_role` choisit le rôle (sélecteur) ; `off` suspend l'autologin (posé par `logout()`
pour que « Log out » ramène vraiment sur A1 ; choisir un rôle le réactive).

**Proxy** (`decideProxy`) :
- Mode normal : hors `/admin` → aucun changement (site public intact). `/admin/**` → `X-Frame-Options: DENY` +
  `Content-Security-Policy: frame-ancestors 'none'`, en-tête de requête `x-kz-path` réécrit. Sans cookie `kz_admin` et
  hors autologin : `/admin/api/**` → 401 JSON ; GET/HEAD de page → 307 `/admin/login?next=…` ; autre méthode (server
  action POST) → laissé passer (`requireSession('action')` répond). Publics : `/admin/login`, `/admin/auth/**`, `/admin/api/auth/**`.
- Mode aperçu (`KZ_EDITOR_PREVIEW=1`, serveur 4042 du moteur) : secret `ENGINE_PREVIEW_SECRET` (≥ 16 car., sinon 503 +
  log) exigé partout : cookie `kz_preview` (comparaison à temps constant) ou `?kz_preview=<secret>` → pose le cookie
  (httpOnly ; local : Lax ; hébergé : `SameSite=None; Secure; Partitioned`) et redirige sans le paramètre. `/admin`,
  `/studio`, `/api/draft-mode` → 404. `frame-ancestors <ADMIN_ORIGIN>` (origine stricte, sinon `'none'`),
  `X-Robots-Tag: noindex`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store`.
- Matcher : tout sauf `_next/static`, `_next/image`, `_next/webpack-hmr`, `__nextjs`.

## Forces

- Toute la logique sensible est en fonctions pures testées (crypto, rôles, autologin, next, proxy, flux Sanity avec faux fetch).
- Jeton chiffré (pas seulement signé), cookie non lisible en JS, `PublicSession` sans jeton, jeton révoqué dès un refus.
- Redirections ouvertes impossibles (`sanitizeNextPath` n'accepte que `/admin…`, hors pages de connexion et API).
- CSRF : SameSite=Lax + `isSameOriginRequest` (Origin / Sec-Fetch-Site) sur toutes les routes POST.

## Faiblesses et limites connues

- Pas de révocation côté serveur d'un cookie volé avant son expiration (session sans état) ; `logout` révoque le jeton
  Sanity, ce qui fait échouer ses écritures, mais le cookie resterait déchiffrable jusqu'à 12 h.
- Rôle figé pour la durée de la session (pas de relecture de `/users/me` à chaque requête).
- Cache des fournisseurs en mémoire du processus (10 min) ; aucune limite de débit sur `POST /admin/api/auth/session`.
- `requestOrigin` fait confiance à `X-Forwarded-Host/Proto` (correct derrière Vercel ; à revoir derrière un autre proxy).
- Flux de connexion non testé de bout en bout contre le vrai Sanity (pas de compte de test dans ce build).

## Points sensibles

- JAMAIS le jeton Sanity (`session.sanityToken`) dans une prop client, un JSON renvoyé au navigateur, un log ou le
  moteur. Passer `getPublicSession()` / `toPublicSession()` aux composants client.
- JAMAIS élargir l'autologin (hôte non local, NODE_ENV ≠ development) ni l'activer par défaut ; jamais
  `ADMIN_DEV_AUTOLOGIN` dans un `.env` commité.
- Le proxy n'est qu'un contrôle optimiste : chaque page, server action et route handler de l'admin appelle
  `requireSession` / `requireCapability` EN PREMIER (un POST de server action n'est pas redirigé par le proxy).
- `ADMIN_SESSION_SECRET` ≥ 32 caractères (sinon exception) ; le changer déconnecte tout le monde.
- Ne pas relâcher `isPlausibleSid`, `sanitizeNextPath`, `isSameOriginRequest` ni le filtre des URL de fournisseur.

## Pièges

- Next 16 : le middleware s'appelle `proxy.ts` et tourne en runtime Node (pas d'option `runtime`) ; un cookie ne peut
  pas être écrit pendant le rendu d'une page → `writeSessionCookie` / `logout` seulement en route handler ou server action.
- Le routeur Next peut réécrire le fragment à l'hydratation : le sid est consommé AU CHARGEMENT du module client
  (comme `clearHashSessionId` du Studio, workaround vercel/next.js#91819).
- Sanity n'accepte `origin` que si l'origine de l'admin est dans les origines CORS du projet (manage.sanity.io → API →
  CORS origins, avec « Allow credentials » inutile ici). À ajouter pour http://127.0.0.1:4040 et le domaine de prod,
  sinon le fournisseur refuse le retour. (Non vérifié en réel dans ce build.)
- `/users/me` sur `api.sanity.io` (global) ne donne pas les rôles du projet : toujours l'hôte `<projectId>.api.sanity.io`.
- Tant que le Studio est encore sur `/admin` (avant le déplacement vers `/studio` par site-adapter), le proxy s'applique
  au Studio : sans autologin de dev, `/admin` redirige vers `/admin/login`.
- `react.cache` ne met en cache que dans un rendu serveur ; dans les tests, `getSession` est réévaluée à chaque appel.

## Comment modifier

- Ajouter un rôle Sanity reconnu : demande de contrat (`roles.ts`), puis rien ici (`resolveAdminRole` suit le contrat).
- Changer la durée de session : `SESSION_TTL_SECONDS` (constants.ts) ; le cookie et le JWE suivent.
- Ajouter un chemin public de l'admin : `isPublicAdminPath` (proxy-rules.ts) + test dans `proxy-rules.test.ts`.
- Ajouter un message d'erreur de A1 : `loginErrorMessage` (constants.ts) et le code dans la route qui redirige.
- Protéger une nouvelle page : `const session = await requireCapability('settings.code')` en première ligne.
- Protéger une server action : `await requireCapability('content.write', 'action')` puis capturer `AdminAuthError`.

## Tests

`npx vitest run src/admin/core/auth` — crypto (aller-retour, expiration, retouche, autre secret, secret court),
rôles et droits, autologin (dev/prod/test, hôte, X-Forwarded-Host, sélecteur, `off`, log bruyant), `next`, origine /
CSRF, flux Sanity (URL exactes, `withSid`, sid mal formé sans appel réseau, 404/401/réseau, `/users/me`, révocation),
`signInWithSid` (Administrator, Developer, Viewer, non-membre, 401), proxy (site public intact, redirections,
en-têtes, 401 API, autologin, aperçu : secret, cookie, paramètre, chemins fermés, 503, SameSite hébergé), et `session.ts`
avec un faux Next (page → redirect / 404, action / route → 401 / 403, PublicSession, cookie, logout).
Non couvert : la page `AuthCallback` (composant client) et un vrai aller-retour Sanity.
À la main : `curl -i http://127.0.0.1:4040/admin/api/engine/health` (en-têtes anti-iframe) ; POST avec
`Origin: https://evil.com` → 403 ; `POST /admin/api/auth/session {"sid":"short"}` → 401 sans appel Sanity.

## Décisions et « À trancher »

- `withSid=true` (flux token du Studio installé) plutôt que `type=token`.
- 404 (et non 403) quand une PAGE est refusée faute de droit.
- `logout()` en dev pose `kz_dev_role=off` pour sortir vraiment de l'autologin.
- Question 2 du Figma (interface propre) : tranchée par l'orchestrateur, connexion par jeton gardé côté serveur.

## Demandes de contrat

- Aucune bloquante. Suggestion : exposer `forbidden()` (Next `authInterrupts`) si l'on veut une vraie page 403 pour les
  pages Kuartz — décision de l'orchestrateur (next.config.ts n'est pas à auth-core).
