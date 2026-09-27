# shell — coque de l'admin et connexion A1 — LLM context

> Propriétaire : shell · Figma : A1 (docs/admin/figma/screens/A1.md), coque en situation B1 (B1.md, B1.ui.png),
> README « ÉLÉMENTS COMMUNS À TOUS LES ÉCRANS » et « L'admin d'un site selon le rôle », fiches Sidebar, TopBar, NavItem,
> NavSection (docs/admin/figma/design-system/components/) · Mis à jour : 2026-09-27 (tour de corrections)

## Utilité

Tout ce qui entoure les écrans de l'admin, pour les trois rôles (kuartz, client, editor) :
- la racine de tout `/admin` (tokens, polices, thème sombre, `<ToastProvider>` unique, garde « This admin is designed for a
  computer. » sous 1 024 px, métadonnées noindex) ;
- la coque des écrans B, C, E : Sidebar (navigation selon le rôle, entrée active selon l'URL, comptes des collections,
  Ask AI, hub Kuartz, utilisateur, Log out, sélecteur de rôle de dev), Top bar (`<PublishStatusBar>` de publish-ui), zone
  de contenu qui défile ; états chargement / erreur / introuvable ; 404 de l'admin (URL inconnue sous /admin, page refusée
  au rôle : vraie 404, dans la coque) ;
- la page de connexion A1 `/admin/login`.
Ne fait pas : la page `/admin` (B1, settings), les écrans, `/admin/editor` (plein écran, editor-canvas),
`/admin/auth/callback` et les routes `/admin/api/auth/*` (auth-core), le contenu de la Top bar (publish-ui), le panneau
Ask AI (ask-ai).

## Fichiers

- `admin-icon.ts` — PUR : `ADMIN_ICON_SVG` (copie exacte de l'icône DS `admin.svg`) et `ADMIN_ICON_URL` (URL `data:`),
  déclarée dans `metadata.icons` du layout /admin (plus de 404 /favicon.ico ; pas de `icon.svg` : le proxy redirigerait
  vers A1 sans cookie). Test : `admin-icon.test.ts` (dérive contre le DS + métadonnées du layout).
- `nav.ts` — PUR : `buildShellNav(config, role, counts)` (sections de la sidebar selon le rôle), `resolveShellLocation(pathname, routes)`
  (entrée active + nom de l'écran), `toShellRouteConfig`, `articleCollection`, `pageNavLabel`, `resolveHubUrl`, `isExternalHref`, `ADMIN_BASE`.
- `counts.ts` — SERVEUR (`server-only`) : `getCollectionCounts(collections)` (une requête GROQ, perspective `drafts`, 2,5 s max),
  `fetchCollectionCounts(client, …)` (client injectable), `buildCountQuery`.
- `sidebar-props.ts` — PUR : `buildShellSidebarProps({ config, session, counts, hubUrlEnv, devState })` → props client minimales
  (nom de dev sans le rôle répété).
- `access.ts` — PUR : `SHELL_ROUTE_CAPABILITIES` (préfixe d'URL → droit), `requiredShellCapability(path)`, `isShellPathRefused(role, path)`.
- `ShellChrome.tsx` — SERVEUR : `loadShellSidebarProps(session)` (comptes + état de dev → props de la sidebar) et
  `<ShellChrome sidebar>` (AskAiProvider + ShellFrame + ShellSidebar + PublishStatusBar), partagés par le layout et le 404.
- `ShellSidebar.tsx` — CLIENT : `Sidebar` du kit câblée (`usePathname`, `useAskAi().open`, formulaire Log out, `DevRoleMenu`) ; `LOGOUT_ENDPOINT`.
- `ShellLink.tsx` — CLIENT : composant de lien passé au kit (`linkAs`) : next/link, ou `<a target="_blank">` pour un lien externe.
- `DevRoleMenu.tsx` — CLIENT : menu « Development role » (POST `/admin/api/auth/dev-role`, puis `router.refresh()`).
- `ShellFrame.tsx` — cadre serveur : lien « Skip to content », sidebar, top bar, `<main id="kz-main">` qui défile.
- `Shell.module.css` — mise en page de la coque (100dvh, seule la zone de contenu défile).
- `AdminRoot.tsx` + `AdminRoot.module.css` — racine de /admin (`data-kz-admin`, `data-theme="dark"`, polices, ToastProvider, garde < 1024 px
  en CSS pur, `--kz-sidebar-width` / `--kz-topbar-height`).
- `login/LoginScreen.tsx` + `.module.css` — A1 (composant serveur, liens sans JavaScript), connexion de dev hors de la carte.
- `login/providers.ts` — PUR : `providerButtonLabel`, `sortProviders`, `firstParam`.
- `states/ShellSkeleton.tsx`, `states/ShellError.tsx` (client), `states/ShellNotFound.tsx`, `states/ShellStates.module.css`.
- Tests : `nav.test.ts`, `counts.test.ts`, `sidebar-props.test.ts`, `access.test.ts` (table + dérive contre les pages),
  `routes.test.ts` (layout de la coque, attrape-tout, 404 de l'admin), `ShellSidebar.test.tsx`, `AdminRoot.test.tsx`,
  `login/providers.test.ts`, `login/LoginScreen.test.tsx`, `login/page.test.ts` (route A1), `states/states.test.tsx`.
- Routes (minces) : `src/app/admin/layout.tsx` (racine), `src/app/admin/not-found.tsx` (404 de l'admin, dans la coque si
  session), `src/app/admin/[...missing]/page.tsx` (URL inconnue → 404 de l'admin), `src/app/admin/(shell)/{layout,loading,error,not-found}.tsx`,
  `src/app/admin/login/page.tsx`.

## Contrats

- Entrées : `adminConfig` (`src/admin.config.ts` : site, pages, collections), `Session` / `PublicSession` et `ROLE_LABEL`,
  `can()` (`core/contracts`), auth-core (`requireSession`, `getSession`, `getLoginProviders`, `getDevLoginState`,
  `loginErrorMessage`, `sanitizeNextPath`, `REQUEST_PATH_HEADER` = `x-kz-path`, toujours réécrit par le proxy sous /admin),
  `getReadClient({ perspective: 'drafts' })` (core/sanity), `process.env.KUARTZ_HUB_URL`.
- Jonctions utilisées telles quelles : `<AskAiProvider>` / `useAskAi()` (ask-ai), `<PublishStatusBar siteUrl />` (publish-ui).
- Sorties : les layouts ; routes HTTP appelées (pas exposées) : `POST /admin/api/auth/logout` (formulaire), `POST /admin/api/auth/dev-role`
  (JSON depuis la coque, formulaire depuis A1), `GET /admin/api/auth/login?provider=…&next=…` (liens des fournisseurs).
- Pour les écrans : la coque fournit `<main>` qui défile ; chaque écran pose SON `<ContentArea>` (gap, marges, largeur).
  Portails (Menu, Modal, Toast…) : ils se montent dans le `[data-kz-admin]` de la racine.
- Variables CSS sur `[data-kz-admin]` (donc lisibles aussi dans les portails) : `--kz-sidebar-width: 240px`,
  `--kz-topbar-height: 48px` (géométrie de la coque, ex. position du panneau Ask AI). La coque s'en sert pour sa sidebar.

## Comportement

**Racine (`src/app/admin/layout.tsx`)** : importe `tokens.css` puis `base.css` (seul endroit, avec la galerie), pose
`data-kz-admin` + `data-theme="dark"` + `adminFontClassName` sur le même élément, `<ToastProvider>` une fois. Métadonnées :
titre « Conduit — Admin » (modèle « %s · Conduit Admin »), `robots: noindex, nofollow, nocache`, `referrer: same-origin`, `icons` = icône DS « admin » en `data:` (favicon du site public intact).
Ne rend ni `<html>` ni `<body>`. Garde : sous 1 024 px (`max-width: 1023.98px`), `.app` en `display: none` et message
« This admin is designed for a computer. » (Body Large, icône desktop) — le Figma n'a pas d'écran pour ce message.

**Coque (`(shell)/layout.tsx`)** : `requireSession()` d'abord ; puis droit de la page d'après l'URL (`x-kz-path`,
`isShellPathRefused`) : refusé → `notFound()` lancé par le LAYOUT, avant la frontière `<Suspense>` de `loading.tsx`, donc
vraie 404 (rendue par `src/app/admin/not-found.tsx`, dans la coque) ; puis comptes + état de dev en parallèle
(`loadShellSidebarProps`) ; `<ShellChrome>` (`<AskAiProvider>` autour). Pages concernées (table `SHELL_ROUTE_CAPABILITIES`) :
Code (`settings.code`), Team (`settings.team`), Publish et Versions (`publish.run`), CMS et Media (`content.write`).
Sidebar (Figma 333:1247, README « éléments communs ») :
- en-tête : nom du site, « domaine · écran courant » (Overview, General, Code, Team, Usage, Home, Blog, « Blog article page »,
  collection, Media, Publish, Versions), « ✦ Ask AI » (droit `ai.ask`) → `useAskAi().open()` ;
- SITE SETTINGS : General · Code (tag KUARTZ bleu, `settings.code`) ou Team (tag CLIENT vert, `settings.team`) · Usage ;
  editor : General · Usage (question 11) ;
- PAGES : une entrée par `PageDef` (racine « Home » icône maison, autres pages = leur chemin « /blog » icône page) ; une page
  listing (`article`) se déplie (chevron, dépliée par défaut) sur sa page article « slug: N » (icône base de données,
  N = éléments de la collection, lien `/admin/pages/<id>/slug/seo`) ;
- CMS : une ligne par collection (icône du manifeste, repli database) avec son nombre d'éléments ; ASSETS : Media ;
- pied : « Kuartz hub » (droit `hub.link`, `KUARTZ_HUB_URL` http(s), repli https://kuartz.studio, nouvel onglet), avatar
  (bleu Kuartz, vert client, neutre editor), « nom · ROLE_LABEL », Log out (formulaire POST, marche sans JS), et en
  session de dev seulement le menu « Development role » (icône user). En session de dev, le nom « Dev · <rôle> » donné
  par auth-core perd son suffixe : la ligne affiche « Dev · Client admin » et non « Dev · Client admin · Client admin ».
Entrée active (`aria-current="page"`) d'après l'URL : les sous-routes gardent leur entrée (C2 `…/seo` → la page, C4
`/admin/cms/<c>/<id>` → la collection, C6 → « slug: »). Overview, Publish, Versions : aucune entrée active.
Top bar : `<PublishStatusBar siteUrl={adminConfig.site.url} />`. Contenu : `<main id="kz-main" tabIndex=-1>` qui défile seul
(la page fait 100dvh) ; « Skip to content » au premier Tab.

**États** : `loading.tsx` = squelette dans la zone de contenu (en-tête, 4 cartes, bloc), fondu après 150 ms, `role="status"` ;
`error.tsx` = « Something went wrong » + « Try again » (`retry` de Next 16) + « Reference: <digest> », jamais le message
technique ; `(shell)/not-found.tsx` = « Page not found » + « Back to Overview » dans la zone de contenu, pour un `notFound()`
lancé par une PAGE de la coque (ressource absente, ou refus de `requireCapability` à la navigation côté client) : réponse
streamée, donc 200 + `noindex`. `src/app/admin/not-found.tsx` (async) = même message, dans `<ShellChrome>` quand une session
existe (sinon, ou si l'habillage lève, plein écran + `console.warn`) : sert au refus par le layout (404), à l'attrape-tout
`/admin/[...missing]` (`requireSession()` puis `notFound()`, 404 ; sans session → A1), à l'éditeur plein écran et à la galerie.
Statuts mesurés sur 4040 (session de dev Kuartz) : `/admin/settings/team` 404, `/admin/xyz` 404, `/admin/settings/code` 200.

**A1 (`/admin/login`)** : page publique. Session présente (vraie ou autologin de dev) → `redirect(sanitizeNextPath(next))`.
Sinon : carte Figma (logo globe, « Conduit — Admin », « conduit.com/admin · Sign in with your Sanity account », un lien par
fournisseur : Google, GitHub, « Continue with email » pour `sanity`, puis les autres ; note « Access is managed in Sanity by
the site owner. »). Erreurs : `?error=` → `loginErrorMessage` ; Sanity injoignable → message de `getLoginProviders` +
« Try again » (même page, même `next`) ; aucun fournisseur → « No sign-in method is available right now. Ask the site owner. ».
Refus de rôle / non-membre : affichés par la page de retour (auth-core). Connexion de dev (autologin permis mais suspendu par
Log out) : barre « DEV ONLY · Sign in as Kuartz / Client admin / Editor » en bas de l'écran, HORS de la carte (formulaire
POST dev-role avec `next`). Entrée de la carte : fondu + échelle 0.98 → 1, 200 ms ease-out, coupée en mouvement réduit.

## Forces

- Logique en fonctions pures testées (navigation par rôle, actif selon l'URL, comptes, props client, droit par URL) ; 109 tests.
- Une page refusée répond une vraie 404 (layout, avant tout streaming) sans dépendre des `loading.tsx` des autres écrans ;
  la table des droits est vérifiée contre les `requireCapability` réels des pages (test de dérive).
- Fidélité mesurée : A1 = 0,26 % de pixels différents du Figma (anticrénelage du texte seulement, carte identique au pixel) ;
  en-tête de sidebar 0,6 % (texte de l'écran courant) ; sidebar Kuartz / client conforme aux deux variantes de la fiche.
- Aucune donnée sensible vers le client : la sidebar reçoit nom, libellé du rôle, image https ; ni e-mail, ni id, ni jeton,
  ni définitions de champs (forme réduite `toShellRouteConfig`).
- Garde < 1024 px en CSS pur : pas d'écart d'hydratation, aucun JS. Log out et A1 fonctionnent sans JavaScript.
- Les comptes ne font jamais tomber la coque (erreur ou délai → comptes masqués + `console.warn` serveur).

## Faiblesses et limites connues

- `notFound()` d'une ressource DANS une page de la coque (élément CMS supprimé, collection ou page article inconnue) : 200 +
  `noindex` (streaming sous `loading.tsx`, comportement documenté de Next 16). Seuls les refus de droit et les URL inconnues
  répondent 404. Le refus découvert à la navigation côté client (layout non rejoué) s'affiche aussi dans la coque, sans statut.
- Page refusée par le layout : le HTML porte « Page not found · Conduit Admin » (curl), mais dans le navigateur le titre
  d'onglet a été vu à « Conduit — Admin » (défaut) et une fois à « Team · Conduit Admin » (métadonnées streamées). Non corrigé.
- Comptes de la sidebar calculés par le layout : un layout ne se recalcule pas à la navigation. Une feature qui crée ou
  supprime un élément doit appeler `router.refresh()` (ou `revalidatePath('/admin', 'layout')` dans sa server action).
- Table `SHELL_ROUTE_CAPABILITIES` = deuxième copie des gardes des pages ; le test de dérive la tient alignée, mais une page
  réservée ajoutée sans entrée ferait encore un 404 « mou » (200) jusqu'à ce que le test échoue.
- Pas de repli d'aperçu pour le logo du site : icône globe (le manifeste n'a pas de logo ; `siteSettings.favicon*` vides).
- Titre des pages : le modèle « %s · Conduit Admin » s'ajoute aussi au titre de la galerie du kit (« Kit — Kuartz Admin · Conduit Admin »).

## Points sensibles

- JAMAIS la session complète (`sanityToken`) dans un composant client : passer par `buildShellSidebarProps` (ou `toPublicSession`).
- Le layout de la coque n'est pas une garde suffisante : chaque page, server action et route garde son `requireSession` /
  `requireCapability` (un layout ne se rejoue pas à chaque navigation). Le refus par URL du layout ne sert qu'au STATUT 404 ;
  un en-tête `x-kz-path` absent ou illisible ne refuse rien (la garde de la page reste).
- Le sélecteur de rôle ne s'affiche qu'en session de dev ET si auth-core le permet ; la route dev-role répond 404 ailleurs.
  Ne jamais l'afficher sur une vraie session.
- `KUARTZ_HUB_URL` : seulement http(s), sans identifiants dans l'URL (sinon repli) ; le lien s'ouvre avec `noopener noreferrer`.
- `tokens.css` / `base.css` ne s'importent que sous `src/app/admin/` (jamais dans le site).
- Les comptes passent les types Sanity en PARAMÈTRES GROQ, jamais dans le texte de la requête.

## Pièges

- Next 16 : `error.tsx` reçoit `retry` (refait la requête) en plus de `reset` ; `searchParams` d'une page est une Promise.
- `not-found.tsx` d'un segment ne sert qu'aux `notFound()` : une URL qui ne correspond à rien prend le `not-found` RACINE (site),
  d'où l'attrape-tout `/admin/[...missing]`.
- Un `notFound()` lancé par un LAYOUT est rendu par le `not-found` du segment PARENT : celui du layout `(shell)` tombe sur
  `src/app/admin/not-found.tsx`, pas sur `(shell)/not-found.tsx` (d'où l'habillage de la coque dans le 404 de l'admin).
- `loading.tsx` = frontière `<Suspense>` : tout `notFound()` rendu dessous part en 200. L'attrape-tout est donc HORS de
  `(shell)` (essayé dedans : 200) ; ne pas l'y déplacer.
- Le serveur de dev refuse une route attrape-tout voisine d'un ancien `[[...tool]]` gardé en mémoire (« required and optional
  catch-all at the same level ») : après suppression d'une route attrape-tout, redémarrer avant d'en ajouter une autre.
- Dossier de travail partagé entre agents (scratchpad) : ne pas nommer ses scripts de capture `shoot.mjs` à la racine.
- Kit sans `@testing-library/jest-dom` : pas de `toHaveAttribute` dans les tests, lire `getAttribute` / `textContent`.
- `ShellSidebar` importe `useAskAi` : dans un test, simuler `@/admin/features/ask-ai/AskAiProvider` (le vrai fournisseur appelle
  une server action et le relais du moteur).
- Tests de routes (`routes.test.ts`, `login/page.test.ts`) : simuler `server-only`, `next/navigation` (notFound/redirect lèvent),
  `next/headers` et `@/admin/shell/ShellChrome` ; les composants rendus sont lus comme éléments React (`type`, `props`).

## Comment modifier

- **Nouvelle entrée de SITE SETTINGS** : `buildShellNav` (id `settings.<x>`, icône du kit, droit éventuel) + libellé dans
  `resolveShellLocation` (`labels`) + test dans `nav.test.ts`.
- **Nouvelle page ou collection** : rien ici — elles viennent de `src/admin.config.ts` (le comptage suit `collections`).
- **Nouvelle zone de l'admin** (ex. `/admin/help`) : `case` dans `resolveShellLocation` (entrée active + nom d'écran), entrée dans une section.
- **Nouvelle page réservée à un droit** (sous `(shell)`) : `requireCapability` dans la page ET une entrée dans
  `SHELL_ROUTE_CAPABILITIES` (`access.ts`) ; `npx vitest run src/admin/shell/access.test.ts` échoue tant que les deux divergent.
- **Largeur de la sidebar / hauteur de la top bar** : changer le composant du kit ET `--kz-sidebar-width` / `--kz-topbar-height`
  (`AdminRoot.module.css`) + test `AdminRoot.test.tsx`.
- **Changer un texte de A1** : `LoginScreen.tsx` (constantes exportées) ; textes des fournisseurs : `login/providers.ts`.
- **Changer le seuil de la garde** : `AdminRoot.module.css` (`max-width: 1023.98px`) + test `AdminRoot.test.tsx`.
- **Écran hors coque** : le placer hors de `(shell)` (il reçoit quand même tokens, police, toasts et garde de la racine).

## Tests

`npx vitest run src/admin/shell` — 109 tests : navigation par rôle (kuartz / client / editor), sections et libellés du Figma,
pages et page article « slug: N », comptes (null si inconnu), actif selon l'URL (22 routes), hub, liens externes ; comptes
(requête paramétrée, erreurs, délai) ; props client sans données sensibles, nom de dev sans rôle répété ; droit par URL
(préfixes, requête, décodage) + dérive contre chaque `page.tsx` de `(shell)` ; routes (refus par le layout avant l'habillage,
attrape-tout, 404 dans la coque / plein écran) ; géométrie CSS exposée ; ShellSidebar en jsdom (tags, comptes,
aria-current, écran courant, chevron, Ask AI, Log out, menu de rôle de dev + erreur) ; garde < 1024 px (balisage + CSS) ;
A1 (ordre et libellés des fournisseurs, erreurs, « Try again », dev) ; route A1 (redirection si connecté, `next` nettoyé,
`?error=`, Sanity injoignable) ; états (erreur + retry + digest, introuvable, chargement).
`npx tsc --noEmit -p .` : zéro erreur dans ces fichiers.
À la main (dev 4040) : `/admin` en kuartz et client (POST `/admin/api/auth/dev-role {"role":"client"}`), fenêtre < 1024 px,
Log out → A1 avec la barre DEV ONLY, `/admin/login?error=provider`, `curl -w '%{http_code}'` : `/admin/settings/team` en kuartz
→ 404 dans la coque, `/admin/xyz` → 404 dans la coque (pas la page du site).
Captures faites : A1 (et son état d'erreur), coque kuartz / client sur B1 et B2, garde à 900 px, 1 024 px, menu de dev,
lien d'évitement, 404 dans la coque.

## Décisions et « À trancher »

- Libellé utilisateur = `ROLE_LABEL` du contrat (« Client admin ») et non « Client » du Figma (consigne de l'orchestrateur).
- Pages de la sidebar = celles du manifeste (Home, /blog) : pas de /page-x, /page-y, /testimonials, /faq, /404 (question 15).
- Écran courant affiché (le Figma montre toujours « · Overview », valeur par défaut du composant).
- Page article de /blog → C6 `/admin/pages/blog/slug/seo` (seule route de la page article).
- Comptes en perspective `drafts` : un élément créé en brouillon compte déjà (il apparaît dans la liste C3).
- Hub : `KUARTZ_HUB_URL`, repli https://kuartz.studio (question 8 du Figma ouverte).
- Menu de rôle de dev dans le pied de la sidebar (le Figma n'a pas de menu utilisateur) ; A1 : barre de dev hors de la carte.
- Écran < 1024 px : message seul, sans lien ni action (Figma : « un seul message »).
- Vraie 404 pour une page refusée (FOLLOWUPS #21) : contrôle par URL dans le layout plutôt que retirer `loading.tsx` (on garde le
  squelette à la navigation, et `settings/team`, `publish` ont leur propre `loading.tsx` que retirer celui de la coque ne
  couvrirait pas) ; pas d'`authInterrupts` (expérimental). Le proxy (auth-core) ne déchiffre pas la session : pas de refus là.
- Attrape-tout à `src/app/admin/[...missing]` et non `(shell)/[...missing]` comme demandé par FOLLOWUPS #25 : dans `(shell)`,
  il répondait 200 (mesuré). Le 404 de l'admin porte l'habillage de la coque, le rendu reste le même pour l'utilisateur.
- Variables de géométrie posées sur la racine (portails) et non sur `.frame`.

## Demandes de contrat

- ~~ask-ai : remplacer `240px` / `48px` recopiés dans `AskAiProvider.module.css`~~ — **fait** (vérifié le 2026-09-27) :
  le panneau lit `var(--kz-sidebar-width)` / `var(--kz-topbar-height)` (exposées sur `[data-kz-admin]`).
- **orchestrateur** : prendre acte de l'emplacement `src/app/admin/[...missing]/page.tsx` (hors de `(shell)`, voir Décisions).
- ~~features qui créent / suppriment des éléments de collection (cms-media) : `router.refresh()` après l'écriture~~ —
  **fait** (vérifié le 2026-09-27) : `CollectionScreen.tsx` et `ItemDrawer.tsx` appellent `router.refresh()` après
  création et suppression.
