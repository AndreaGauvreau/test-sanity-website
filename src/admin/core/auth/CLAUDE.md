# core/auth — LLM context

> Propriétaire : auth-core · Figma : A1 (docs/admin/figma/screens/A1.md) · Mis à jour : 2026-09-27 (vague 3b-2, FOLLOWUPS #39)
> Possède aussi : `src/proxy.ts`, `src/app/admin/api/auth/**`, `src/app/admin/auth/**` (callback, denied).

## Utilité

Accès à l'admin pour les trois rôles (kuartz, client, editor) : connexion avec le compte Sanity (flux « token » du
Studio), session chiffrée dans le cookie `kz_admin`, gardes `requireSession` / `requireCapability`, déconnexion,
connexion automatique de développement et sélecteur de rôle de dev, proxy Next 16 (garde optimiste de `/admin`, vraie
404 des pages réservées par un droit, mode aperçu de l'éditeur avec jeton court). La page visuelle A1 `/admin/login` n'est PAS ici (agent shell) : ce module lui fournit les
données (`getLoginProviders`, `getDevLoginState`, `loginErrorMessage`).

## Fichiers

- `constants.ts` — noms de cookies, chemins, TTL (12 h), version d'API d'auth Sanity, messages anglais, `loginErrorMessage`. Pur.
- `roles.ts` — `resolveAdminRole(sanityRoles, user, allowlist)` (nettoie puis applique le contrat : kuartz exige la liste
  blanche KUARTZ_ALLOWLIST, SEC-05), `kuartzAllowlistFromEnv()`, `reconcileSessionRole(session, allowlist)` (rôle
  recalculé à chaque lecture du cookie). Pur.
- `crypto.ts` — `sealSession` / `openSession` : JWE `dir` + `A256GCM`, clé = SHA-256(« kz-admin-session: » + secret), validation zod. Pur.
- `sanity-auth.ts` — appels HTTP Sanity (fetch injectable) : `fetchProviders`, `buildProviderLoginUrl`, `exchangeSid`, `fetchSanityMe`, `revokeSanityToken`, `isPlausibleSid`. Pur.
- `login.ts` — `signInWithSid({ projectId, sid, allowlist, fetchImpl? })` : sid → jeton → `/users/me` → rôle ; refus (et révocation du jeton) sinon. Pur.
- `dev.ts` — `decideDevAutologin`, `warnIfDevAutologinRefused`, `buildDevSession`, `isLocalHost` (forme stricte, SEC-03), `hostnameOf`, `isAdminClosed` (aperçu), `parseAdminRole`. Pur.
- `next-path.ts` — `sanitizeNextPath` (anti-redirection ouverte, anti-boucle), `loginUrlFor`. Pur.
- `request.ts` — `requestOrigin`, `shouldUseSecureCookies`, `isSameOriginRequest` (CSRF). Pur.
- `proxy-rules.ts` — `decideProxy` (async, décision du proxy en fonction pure), `PAGE_CAPABILITIES` / `pageCapabilityFor`,
  `ADMIN_DENIED_PATH`, `HARNESS_PATH` / `HARNESS_FRAME_HEADERS`, `PREVIEW_CLOSED_PREFIXES`, `PREVIEW_COOKIE`,
  `timingSafeEqualString`, `previewFrameAncestors`. Importe `core/engine/preview-token.ts` (`verifyPreviewToken`,
  `renewPreviewToken`). Décision `next` ou `redirect` avec `setCookies` (cookie `kz_preview` de l'aperçu).
- `session.ts` — SERVEUR (`server-only`, Next) : `getSession`, `getPublicSession`, `requireSession`, `requireCapability`, `AdminAuthError`, `authErrorResponse`, `jsonError`, `writeSessionCookie`, `clearSessionCookie`, `logout`, `getLoginProviders`, `providerRedirectUrl`, `getDevLoginState`, `writeDevRoleCookie`.
- `*.test.ts` — tests Vitest (voir « Tests ») ; `proxy-matcher.test.ts` passe le matcher de `src/proxy.ts` dans la vraie conversion de Next.
- `src/proxy.ts` — applique `decideProxy` (NextResponse : next, rewrite, redirect, respond ; `setCookies` posés sur
  toute réponse qui en porte) et calcule le rôle pour les pages réservées (`openSession` + `reconcileSessionRole`,
  sinon session de dev). Matcher littéral à préfixes exacts.
- `src/app/admin/api/auth/login/route.ts` — GET `?provider=&next=` → 307 vers le fournisseur Sanity (URL construite côté serveur).
- `src/app/admin/api/auth/session/route.ts` — POST `{ sid, next? }` → cookie `kz_admin` + `{ ok, redirect, session: PublicSession }`.
- `src/app/admin/api/auth/logout/route.ts` — POST → révocation Sanity + cookie effacé ; 303 vers A1 (ou JSON si `Accept: application/json`).
- `src/app/admin/api/auth/dev-role/route.ts` — POST `{ role | 'off', next? }` (JSON ou formulaire), dev seulement, sinon 404.
- `src/app/admin/auth/callback/{page.tsx,AuthCallback.tsx,callback.module.css}` — retour du fournisseur : lit `#sid=`, l'efface de l'URL, POST session, puis `location.replace(redirect)`.
- `src/app/admin/auth/denied/page.tsx` — cible INTERNE de la réécriture du proxy : `notFound()` immédiat, hors de tout
  loading.tsx → vraie 404 avec `app/admin/not-found.tsx` (plein écran).

## Contrats

- Implémente `core/contracts/session.ts` (Session, PublicSession, toPublicSession) et applique `core/contracts/roles.ts`
  (`resolveAdminRole` + `parseKuartzAllowlist` du contrat, CAPABILITIES, can).
- Variables serveur lues : `ADMIN_SESSION_SECRET`, `KUARTZ_ALLOWLIST` (ids Sanity, e-mails exacts, domaines « @… »,
  séparés par des virgules ; absente = personne n'est kuartz), `ADMIN_DEV_AUTOLOGIN`, `KZ_EDITOR_PREVIEW`,
  `ENGINE_PREVIEW_SECRET`, `ADMIN_ORIGIN`, `NEXT_PUBLIC_SANITY_PROJECT_ID`.
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
   l'hôte du PROJET (`roles: [{ name }]` et/ou `role`) → `resolveAdminRole(roles, me, kuartzAllowlistFromEnv())`.
   Administrator → client, Editor → editor, Developer → editor ; kuartz = Developer ou Administrator ET membre de
   KUARTZ_ALLOWLIST (id, e-mail exact ou domaine), constat SEC-05 : le client peut donner Developer lui-même. Aucun rôle : « Your Sanity account isn't a member of this project. Ask the site owner to invite you. » ;
   Viewer / rôle personnalisé : « Your role in this Sanity project (Viewer) doesn't give access to the admin… ». Dans les
   deux cas 403 et le jeton est révoqué aussitôt (`POST /auth/logout`).
5. Cookie `kz_admin` posé, réponse `{ ok, redirect: sanitizeNextPath(next), session: PublicSession }`.

**Session** : JWE, 12 h (`SESSION_TTL_SECONDS`), `httpOnly`, `SameSite=Lax`, `path=/admin`, `Secure` sauf sur
127.0.0.1/localhost/[::1]. À CHAQUE lecture, `getSession` recalcule le rôle d'après `sanityRoles`, l'identité et
KUARTZ_ALLOWLIST (`reconcileSessionRole`) : retirer quelqu'un de la liste (ou un cookie scellé avant SEC-05) prend effet
tout de suite ; un rôle devenu inconnu = plus de session. Les rôles Sanity eux-mêmes restent ceux de la connexion.
Serveur d'aperçu (`KZ_EDITOR_PREVIEW=1`) : `getSession` renvoie toujours null (l'admin y est fermé, même pour les
routes hors du matcher du proxy).
Cookie expiré/retouché/autre secret → `null` → redirection vers A1 puis retour à l'écran demandé (`x-kz-path` posé par le proxy).

**Gardes** : `requireSession('page')` sans session → `redirect('/admin/login?next=…')` ; `'action' | 'route'` →
`AdminAuthError(401)`. `requireCapability` sans le droit : page → `notFound()` (404 : ne révèle pas une page Kuartz ;
`forbidden()` exigerait `experimental.authInterrupts`), action/route → `AdminAuthError(403)`. Sous le `loading.tsx` de
`(shell)`, ce notFound() part en 200 (streaming) : c'est pourquoi le PROXY refuse d'abord les pages de
`PAGE_CAPABILITIES` (voir Proxy).

**Développement** : `ADMIN_DEV_AUTOLOGIN=kuartz|client|editor` n'est accepté que si `NODE_ENV === 'development'` ET hôte
(Host et X-Forwarded-Host) local, reconnu par la forme STRICTE `^(127\.0\.0\.1|localhost|\[::1\])(:\d{1,5})?$` après
passage en minuscules (SEC-03 : `[::1]evil.com` est refusé). Sinon ignoré + `console.error` « ADMIN_DEV_AUTOLOGIN is set but IGNORED because … »
(une fois par cause et par processus). Session dev : `dev: true`, `sanityToken: null`, user `dev-<role>`. Une vraie
session reste prioritaire. `kz_dev_role` choisit le rôle (sélecteur) ; `off` suspend l'autologin (posé par `logout()`
pour que « Log out » ramène vraiment sur A1 ; choisir un rôle le réactive).

**Proxy** (`decideProxy`) :
- Mode normal : hors `/admin` → aucun changement (site public intact). `/admin/**` → `X-Frame-Options: DENY` +
  `Content-Security-Policy: frame-ancestors 'none'`, en-tête de requête `x-kz-path` réécrit. Sans cookie `kz_admin` et
  hors autologin : `/admin/api/**` → 401 JSON ; GET/HEAD de page → 307 `/admin/login?next=…` ; autre méthode (server
  action POST) → laissé passer (`requireSession('action')` répond). Publics : `/admin/login`, `/admin/auth/**`, `/admin/api/auth/**`.
- Pages réservées (`PAGE_CAPABILITIES` : `/admin/settings/code` → `settings.code`, `/admin/settings/team` →
  `settings.team`) : en GET/HEAD avec session, le proxy calcule le rôle (`resolveRole`) ; sans le droit → réécriture
  interne vers `/admin/auth/denied` (URL affichée inchangée) → vraie 404 (FOLLOWUPS #21). Rôle illisible → laissé à la
  page (redirection A1). La page garde son `requireCapability` (défense en profondeur).
- Page d'essai de l'éditeur `/admin/editor/harness` : en développement seulement, `X-Frame-Options: SAMEORIGIN` +
  `frame-ancestors 'self'` (affichée dans l'iframe de l'éditeur, FOLLOWUPS #19) ; sinon DENY comme le reste.
- Mode aperçu (`KZ_EDITOR_PREVIEW=1`, serveur 4042 du moteur) : `ENGINE_PREVIEW_SECRET` (≥ 16 car., sinon 503 + log)
  n'est JAMAIS accepté brut du navigateur (SEC-09). Accès par jeton court `v1.<exp>.<uid>.<sig>` émis par le moteur
  (`signPreviewToken`, 15 min) : `?kz_preview=<jeton>` vérifié par `verifyPreviewToken` → cookie `kz_preview`, puis
  redirection sans le paramètre ; ensuite le cookie est revérifié à chaque requête. À CHAQUE requête acceptée
  (paramètre ou cookie, FOLLOWUPS #39), le cookie est RENOUVELÉ : jeton re-signé (`renewPreviewToken`) pour le même
  utilisateur (`userId` rendu par `verifyPreviewToken`), échéance = max(échéance reçue, maintenant + 15 min) — un
  utilisateur actif n'est pas coupé au bout de 15 min, le jeton de 2 h du moteur n'est jamais raccourci —,
  `Max-Age = exp − maintenant` (le cookie meurt avec le jeton). Échu (même dans la marge d'horloge de 30 s) → 403,
  jamais ranimé ; refus = aucun cookie. httpOnly, local : Lax, hébergé : `SameSite=None; Secure; Partitioned`.
  `/admin`, `/studio`, `/api/draft-mode`, `/api/revalidate` → 404 (FOLLOWUPS #1). `frame-ancestors <ADMIN_ORIGIN>`
  (origine stricte, sinon `'none'`), `X-Robots-Tag: noindex`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store`.
- Matcher (préfixes EXACTS, SEC-06 / FOLLOWUPS #39) : tout sauf `/_next/static/…`, `/_next/image`,
  `/_next/webpack-hmr`, et les route handlers d'ENVOI `/admin/media/upload` et `/admin/pages/<id>/image`. Plus de
  préfixe ouvert : `/__nextjs_*` (launch-editor, stack frames, source maps) et `/_next/staticX` passent par le proxy,
  donc par le jeton en mode aperçu. (QA-1 pour les envois : sous le proxy, Next tronque le corps à 10 Mo,
  `proxyClientMaxBodySize`). Ces deux routes appellent `requireCapability('content.write', 'route')` en premier, vérifient
  l'origine et bornent leur corps (vérifié le 2026-09-27 : `features/media/server/upload-route.ts`, `features/pages/server/upload.ts`).

## Forces

- Toute la logique sensible est en fonctions pures testées (crypto, rôles, autologin, next, proxy, flux Sanity avec faux fetch).
- Jeton chiffré (pas seulement signé), cookie non lisible en JS, `PublicSession` sans jeton, jeton révoqué dès un refus.
- Redirections ouvertes impossibles (`sanitizeNextPath` n'accepte que `/admin…`, hors pages de connexion et API).
- CSRF : SameSite=Lax + `isSameOriginRequest` (Origin / Sec-Fetch-Site) sur toutes les routes POST.

## Faiblesses et limites connues

- Pas de révocation côté serveur d'un cookie volé avant son expiration (session sans état) ; `logout` révoque le jeton
  Sanity, ce qui fait échouer ses écritures, mais le cookie resterait déchiffrable jusqu'à 12 h.
- Rôles Sanity figés pour la durée de la session (pas de relecture de `/users/me` à chaque requête) ; seule la liste
  blanche Kuartz est réappliquée à chaque lecture.
- Le rôle kuartz par domaine d'e-mail suppose que Sanity a vérifié l'e-mail du compte ; préférer les ids Sanity dans
  KUARTZ_ALLOWLIST pour les comptes sensibles.
- Une page refusée pour une ressource absente (id inconnu) sous `(shell)` répond encore 200 (streaming) : seules les
  pages de `PAGE_CAPABILITIES` sont refusées avant le rendu.
- Cache des fournisseurs en mémoire du processus (10 min) ; aucune limite de débit sur `POST /admin/api/auth/session`.
- `requestOrigin` fait confiance à `X-Forwarded-Host/Proto` (correct derrière Vercel ; à revoir derrière un autre proxy).
- Flux de connexion non testé de bout en bout contre le vrai Sanity (pas de compte de test dans ce build).

## Points sensibles

- JAMAIS le jeton Sanity (`session.sanityToken`) dans une prop client, un JSON renvoyé au navigateur, un log ou le
  moteur. Passer `getPublicSession()` / `toPublicSession()` aux composants client.
- JAMAIS élargir l'autologin (hôte non local, NODE_ENV ≠ development) ni l'activer par défaut ; jamais
  `ADMIN_DEV_AUTOLOGIN` dans un `.env` commité.
- Le proxy n'est qu'un contrôle optimiste : chaque page, server action et route handler de l'admin appelle
  `requireSession` / `requireCapability` EN PREMIER (un POST de server action n'est pas redirigé par le proxy ; les
  routes d'envoi sont même HORS du matcher).
- JAMAIS déduire kuartz du seul rôle Sanity : toujours `resolveAdminRole(roles, user, allowlist)`.
- JAMAIS remettre le secret racine d'aperçu dans une URL ou un cookie : seulement des jetons courts (renouvelés par le
  proxy, jamais au-delà de maintenant + 15 min sauf jeton reçu plus long).
- JAMAIS rouvrir un préfixe dans le matcher (`__nextjs`, `_next/static` sans « / ») : tout chemin hors matcher échappe
  au jeton d'aperçu (SEC-06).
- `ADMIN_SESSION_SECRET` ≥ 32 caractères (sinon exception) ; le changer déconnecte tout le monde.
- Ne pas relâcher `isPlausibleSid`, `sanitizeNextPath`, `isSameOriginRequest` ni le filtre des URL de fournisseur.

## Pièges

- Next 16 : le middleware s'appelle `proxy.ts` et tourne en runtime Node (pas d'option `runtime`) ; un cookie ne peut
  pas être écrit pendant le rendu d'une page → `writeSessionCookie` / `logout` seulement en route handler ou server action.
- `config.matcher` doit rester un LITTÉRAL (analyse statique) ; un matcher que Next ne sait pas convertir fait QUITTER
  `next dev` (`process.exit(1)` dans get-page-static-info). Toujours lancer `proxy-matcher.test.ts` avant d'enregistrer.
- Sous le proxy, Next met le corps de la requête en mémoire et le TRONQUE à `proxyClientMaxBodySize` (10 Mo) : un envoi
  plus gros doit être hors du matcher (QA-1).
- Sous un `loading.tsx`, un `notFound()` de page répond 200 (la réponse a commencé à streamer). Le statut d'une
  réécriture du proxy n'est pas conservé (Next remet 200 avant le rendu) : d'où la page interne `/admin/auth/denied`.
- Next retire les en-têtes RSC (`RSC`, `Next-Router-State-Tree`…) avant le proxy : une navigation côté client vers une
  page réservée reçoit aussi la 404 plein écran de `/admin/auth/denied` (la sidebar n'affiche pas ces liens).
- Le routeur Next peut réécrire le fragment à l'hydratation : le sid est consommé AU CHARGEMENT du module client
  (comme `clearHashSessionId` du Studio, workaround vercel/next.js#91819).
- Sanity n'accepte `origin` que si l'origine de l'admin est dans les origines CORS du projet (manage.sanity.io → API →
  CORS origins, avec « Allow credentials » inutile ici). À ajouter pour http://127.0.0.1:4040 et le domaine de prod,
  sinon le fournisseur refuse le retour. (Non vérifié en réel dans ce build.)
- `/users/me` sur `api.sanity.io` (global) ne donne pas les rôles du projet : toujours l'hôte `<projectId>.api.sanity.io`.
- `react.cache` ne met en cache que dans un rendu serveur ; dans les tests, `getSession` est réévaluée à chaque appel.

## Comment modifier

- Ajouter un rôle Sanity reconnu : demande de contrat (`roles.ts`), puis rien ici (`resolveAdminRole` suit le contrat).
- Changer la durée de session : `SESSION_TTL_SECONDS` (constants.ts) ; le cookie et le JWE suivent.
- Ajouter un chemin public de l'admin : `isPublicAdminPath` (proxy-rules.ts) + test dans `proxy-rules.test.ts`.
- Réserver une nouvelle page par un droit : `requireCapability(cap)` dans la page ET une ligne dans `PAGE_CAPABILITIES`
  (+ test) pour une vraie 404.
- Sortir une route d'envoi du proxy : étendre le littéral du matcher de `src/proxy.ts` (chemin exact, ancré par `$`
  ou `/`), compléter `proxy-matcher.test.ts`, vérifier que la route appelle `requireCapability` en premier et borne son corps.
- Changer la durée glissante de l'aperçu : `PREVIEW_TOKEN_TTL_SECONDS` (core/engine/preview-token.ts), utilisé par
  `renewPreviewToken` et par le moteur.
- Donner le rôle kuartz à quelqu'un : l'ajouter à `KUARTZ_ALLOWLIST` (serveur ; id Sanity de préférence) ET lui donner
  Developer ou Administrator dans Sanity. Effet immédiat (rôle recalculé à chaque requête).
- Ajouter un message d'erreur de A1 : `loginErrorMessage` (constants.ts) et le code dans la route qui redirige.
- Protéger une nouvelle page : `const session = await requireCapability('settings.code')` en première ligne.
- Protéger une server action : `await requireCapability('content.write', 'action')` puis capturer `AdminAuthError`.

## Tests

`npx vitest run src/admin/core/auth` — crypto (aller-retour, expiration, retouche, autre secret, secret court),
rôles et droits, autologin (dev/prod/test, hôte, X-Forwarded-Host, sélecteur, `off`, log bruyant), `next`, origine /
CSRF, flux Sanity (URL exactes, `withSid`, sid mal formé sans appel réseau, 404/401/réseau, `/users/me`, révocation),
`signInWithSid` (Administrator, Developer sur la liste / hors liste, Viewer, non-membre, 401), rôles (liste blanche :
id, e-mail, domaine, domaines voisins refusés ; `reconcileSessionRole`), hôte local strict (SEC-03), proxy (site public
intact, redirections, en-têtes, 401 API, autologin, pages réservées → réécriture 404, harness en iframe, aperçu : jeton
court, cookie re-signé de même échéance, renouvellement à chaque requête (même utilisateur, 15 min glissantes, jeton
de 2 h du moteur non raccourci, échu non ranimé, aucun cookie sur refus), secret racine refusé, autre secret,
expiration, chemins fermés dont /api/revalidate, 503, SameSite hébergé), matcher réel de Next 16 (routes d'envoi
exclues, préfixes exacts : `/__nextjs_*`, `/_next/staticx`, `/_next/imagex` passent par le proxy), et `session.ts`
avec un faux Next (page →
redirect / 404, action / route → 401 / 403, cookie « kuartz » hors liste lu comme editor, aperçu sans session,
PublicSession, cookie, logout).
Non couvert : la page `AuthCallback` (composant client) et un vrai aller-retour Sanity.
À la main : `curl -i http://127.0.0.1:4040/admin/api/engine/health` (en-têtes anti-iframe) ; POST avec
`Origin: https://evil.com` → 403 ; `POST /admin/api/auth/session {"sid":"short"}` → 401 sans appel Sanity.
Vérifié le 2026-09-27 sur 4040 : `curl -H 'Cookie: kz_dev_role=client' /admin/settings/code` → 404 (« Page not found ·
Conduit Admin ») ; kuartz → 200 ; editor → 404 sur code et team ; `Host: [::1]evil.com` → 401 ; envoi de 12 Mo sur
`/admin/media/upload` → corps lu en entier (refus du type, plus de « Invalid upload. »).

## Décisions et « À trancher »

- `withSid=true` (flux token du Studio installé) plutôt que `type=token`.
- 404 (et non 403) quand une PAGE est refusée faute de droit ; vraie 404 HTTP par le proxy pour `PAGE_CAPABILITIES`
  (FOLLOWUPS #21, décision auth-core : pas d'`authInterrupts`, expérimental).
- SEC-05 (orchestrateur) : kuartz = Developer/Administrator + KUARTZ_ALLOWLIST ; Developer hors liste = editor.
- QA-1 : routes d'envoi hors du matcher (plutôt que `proxyClientMaxBodySize`, qui garderait tout le corps en mémoire).
- `logout()` en dev pose `kz_dev_role=off` pour sortir vraiment de l'autologin.
- Question 2 du Figma (interface propre) : tranchée par l'orchestrateur, connexion par jeton gardé côté serveur.

## Demandes de contrat

- Aucune.
