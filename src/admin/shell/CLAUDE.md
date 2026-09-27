# shell — coque de l'admin et connexion A1 — LLM context

> Propriétaire : shell · Figma : A1 (docs/admin/figma/screens/A1.md), coque en situation B1 (B1.md, B1.ui.png),
> README « ÉLÉMENTS COMMUNS À TOUS LES ÉCRANS » et « L'admin d'un site selon le rôle », fiches Sidebar, TopBar, NavItem,
> NavSection (docs/admin/figma/design-system/components/) · Mis à jour : 2026-09-27

## Utilité

Tout ce qui entoure les écrans de l'admin, pour les trois rôles (kuartz, client, editor) :
- la racine de tout `/admin` (tokens, polices, thème sombre, `<ToastProvider>` unique, garde « This admin is designed for a
  computer. » sous 1 024 px, métadonnées noindex) ;
- la coque des écrans B, C, E : Sidebar (navigation selon le rôle, entrée active selon l'URL, comptes des collections,
  Ask AI, hub Kuartz, utilisateur, Log out, sélecteur de rôle de dev), Top bar (`<PublishStatusBar>` de publish-ui), zone
  de contenu qui défile ; états chargement / erreur / introuvable ;
- la page de connexion A1 `/admin/login`.
Ne fait pas : la page `/admin` (B1, settings), les écrans, `/admin/editor` (plein écran, editor-canvas),
`/admin/auth/callback` et les routes `/admin/api/auth/*` (auth-core), le contenu de la Top bar (publish-ui), le panneau
Ask AI (ask-ai).

## Fichiers

- `nav.ts` — PUR : `buildShellNav(config, role, counts)` (sections de la sidebar selon le rôle), `resolveShellLocation(pathname, routes)`
  (entrée active + nom de l'écran), `toShellRouteConfig`, `articleCollection`, `pageNavLabel`, `resolveHubUrl`, `isExternalHref`, `ADMIN_BASE`.
- `counts.ts` — SERVEUR (`server-only`) : `getCollectionCounts(collections)` (une requête GROQ, perspective `drafts`, 2,5 s max),
  `fetchCollectionCounts(client, …)` (client injectable), `buildCountQuery`.
- `sidebar-props.ts` — PUR : `buildShellSidebarProps({ config, session, counts, hubUrlEnv, devState })` → props client minimales.
- `ShellSidebar.tsx` — CLIENT : `Sidebar` du kit câblée (`usePathname`, `useAskAi().open`, formulaire Log out, `DevRoleMenu`) ; `LOGOUT_ENDPOINT`.
- `ShellLink.tsx` — CLIENT : composant de lien passé au kit (`linkAs`) : next/link, ou `<a target="_blank">` pour un lien externe.
- `DevRoleMenu.tsx` — CLIENT : menu « Development role » (POST `/admin/api/auth/dev-role`, puis `router.refresh()`).
- `ShellFrame.tsx` — cadre serveur : lien « Skip to content », sidebar, top bar, `<main id="kz-main">` qui défile.
- `Shell.module.css` — mise en page de la coque (100dvh, seule la zone de contenu défile).
- `AdminRoot.tsx` + `AdminRoot.module.css` — racine de /admin (`data-kz-admin`, `data-theme="dark"`, polices, ToastProvider, garde < 1024 px en CSS pur).
- `login/LoginScreen.tsx` + `.module.css` — A1 (composant serveur, liens sans JavaScript), connexion de dev hors de la carte.
- `login/providers.ts` — PUR : `providerButtonLabel`, `sortProviders`, `firstParam`.
- `states/ShellSkeleton.tsx`, `states/ShellError.tsx` (client), `states/ShellNotFound.tsx`, `states/ShellStates.module.css`.
- Tests : `nav.test.ts`, `counts.test.ts`, `sidebar-props.test.ts`, `ShellSidebar.test.tsx`, `AdminRoot.test.tsx`,
  `login/providers.test.ts`, `login/LoginScreen.test.tsx`, `login/page.test.ts` (route A1), `states/states.test.tsx`.
- Routes (minces) : `src/app/admin/layout.tsx` (racine), `src/app/admin/not-found.tsx` (404 hors coque),
  `src/app/admin/(shell)/{layout,loading,error,not-found}.tsx`, `src/app/admin/login/page.tsx`.

## Contrats

- Entrées : `adminConfig` (`src/admin.config.ts` : site, pages, collections), `Session` / `PublicSession` et `ROLE_LABEL`,
  `can()` (`core/contracts`), auth-core (`requireSession`, `getSession`, `getLoginProviders`, `getDevLoginState`,
  `loginErrorMessage`, `sanitizeNextPath`), `getReadClient({ perspective: 'drafts' })` (core/sanity), `process.env.KUARTZ_HUB_URL`.
- Jonctions utilisées telles quelles : `<AskAiProvider>` / `useAskAi()` (ask-ai), `<PublishStatusBar siteUrl />` (publish-ui).
- Sorties : les layouts ; routes HTTP appelées (pas exposées) : `POST /admin/api/auth/logout` (formulaire), `POST /admin/api/auth/dev-role`
  (JSON depuis la coque, formulaire depuis A1), `GET /admin/api/auth/login?provider=…&next=…` (liens des fournisseurs).
- Pour les écrans : la coque fournit `<main>` qui défile ; chaque écran pose SON `<ContentArea>` (gap, marges, largeur).
  Portails (Menu, Modal, Toast…) : ils se montent dans le `[data-kz-admin]` de la racine.

## Comportement

**Racine (`src/app/admin/layout.tsx`)** : importe `tokens.css` puis `base.css` (seul endroit, avec la galerie), pose
`data-kz-admin` + `data-theme="dark"` + `adminFontClassName` sur le même élément, `<ToastProvider>` une fois. Métadonnées :
titre « Conduit — Admin » (modèle « %s · Conduit Admin »), `robots: noindex, nofollow, nocache`, `referrer: same-origin`.
Ne rend ni `<html>` ni `<body>`. Garde : sous 1 024 px (`max-width: 1023.98px`), `.app` en `display: none` et message
« This admin is designed for a computer. » (Body Large, icône desktop) — le Figma n'a pas d'écran pour ce message.

**Coque (`(shell)/layout.tsx`)** : `requireSession()` d'abord ; comptes + état de dev en parallèle ; `<AskAiProvider>` autour.
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
  session de dev seulement le menu « Development role » (icône user).
Entrée active (`aria-current="page"`) d'après l'URL : les sous-routes gardent leur entrée (C2 `…/seo` → la page, C4
`/admin/cms/<c>/<id>` → la collection, C6 → « slug: »). Overview, Publish, Versions : aucune entrée active.
Top bar : `<PublishStatusBar siteUrl={adminConfig.site.url} />`. Contenu : `<main id="kz-main" tabIndex=-1>` qui défile seul
(la page fait 100dvh) ; « Skip to content » au premier Tab.

**États** : `loading.tsx` = squelette dans la zone de contenu (en-tête, 4 cartes, bloc), fondu après 150 ms, `role="status"` ;
`error.tsx` = « Something went wrong » + « Try again » (`retry` de Next 16) + « Reference: <digest> », jamais le message
technique ; `not-found.tsx` = « Page not found » + « Back to Overview », DANS la coque (sert aussi au refus d'un droit en page :
`requireCapability` → 404) ; `src/app/admin/not-found.tsx` = même message en plein écran pour un `notFound()` hors coque.

**A1 (`/admin/login`)** : page publique. Session présente (vraie ou autologin de dev) → `redirect(sanitizeNextPath(next))`.
Sinon : carte Figma (logo globe, « Conduit — Admin », « conduit.com/admin · Sign in with your Sanity account », un lien par
fournisseur : Google, GitHub, « Continue with email » pour `sanity`, puis les autres ; note « Access is managed in Sanity by
the site owner. »). Erreurs : `?error=` → `loginErrorMessage` ; Sanity injoignable → message de `getLoginProviders` +
« Try again » (même page, même `next`) ; aucun fournisseur → « No sign-in method is available right now. Ask the site owner. ».
Refus de rôle / non-membre : affichés par la page de retour (auth-core). Connexion de dev (autologin permis mais suspendu par
Log out) : barre « DEV ONLY · Sign in as Kuartz / Client admin / Editor » en bas de l'écran, HORS de la carte (formulaire
POST dev-role avec `next`). Entrée de la carte : fondu + échelle 0.98 → 1, 200 ms ease-out, coupée en mouvement réduit.

## Forces

- Logique en fonctions pures testées (navigation par rôle, actif selon l'URL, comptes, props client) ; 77 tests.
- Fidélité mesurée : A1 = 0,26 % de pixels différents du Figma (anticrénelage du texte seulement, carte identique au pixel) ;
  en-tête de sidebar 0,6 % (texte de l'écran courant) ; sidebar Kuartz / client conforme aux deux variantes de la fiche.
- Aucune donnée sensible vers le client : la sidebar reçoit nom, libellé du rôle, image https ; ni e-mail, ni id, ni jeton,
  ni définitions de champs (forme réduite `toShellRouteConfig`).
- Garde < 1024 px en CSS pur : pas d'écart d'hydratation, aucun JS. Log out et A1 fonctionnent sans JavaScript.
- Les comptes ne font jamais tomber la coque (erreur ou délai → comptes masqués + `console.warn` serveur).

## Faiblesses et limites connues

- **URL inconnue sous /admin** (`/admin/xyz`) : 404 blanc du SITE (`src/app/not-found.tsx`), pas celui de l'admin. La parade
  (`src/app/admin/(shell)/[...missing]/page.tsx` : `await requireSession(); notFound()`) a été essayée puis RETIRÉE : le serveur
  de dev en cours croit encore à l'ancien `src/app/admin/[[...tool]]` (Studio supprimé) et refuse « required and optional
  catch-all at the same level », ce qui cassait tout le routage de /admin. À remettre après un redémarrage du serveur (voir Demandes).
- Comptes de la sidebar calculés par le layout : un layout ne se recalcule pas à la navigation. Une feature qui crée ou
  supprime un élément doit appeler `router.refresh()` (ou `revalidatePath('/admin', 'layout')` dans sa server action).
- En session de dev, le nom (« Dev · Client admin ») + le libellé du rôle + le bouton du menu de dev tronquent la ligne
  utilisateur (« Dev · Client admin · Client admin » → ellipse). Sans effet en vraie session.
- Un `notFound()` streamé (écran avec `loading.tsx`) répond 200 et non 404 (comportement documenté de Next 16).
- Pas de repli d'aperçu pour le logo du site : icône globe (le manifeste n'a pas de logo ; `siteSettings.favicon*` vides).
- Titre des pages : le modèle « %s · Conduit Admin » s'ajoute aussi au titre de la galerie du kit (« Kit — Kuartz Admin · Conduit Admin »).

## Points sensibles

- JAMAIS la session complète (`sanityToken`) dans un composant client : passer par `buildShellSidebarProps` (ou `toPublicSession`).
- Le layout de la coque n'est pas une garde suffisante : chaque page, server action et route garde son `requireSession` /
  `requireCapability` (un layout ne se rejoue pas à chaque navigation).
- Le sélecteur de rôle ne s'affiche qu'en session de dev ET si auth-core le permet ; la route dev-role répond 404 ailleurs.
  Ne jamais l'afficher sur une vraie session.
- `KUARTZ_HUB_URL` : seulement http(s), sans identifiants dans l'URL (sinon repli) ; le lien s'ouvre avec `noopener noreferrer`.
- `tokens.css` / `base.css` ne s'importent que sous `src/app/admin/` (jamais dans le site).
- Les comptes passent les types Sanity en PARAMÈTRES GROQ, jamais dans le texte de la requête.

## Pièges

- Next 16 : `error.tsx` reçoit `retry` (refait la requête) en plus de `reset` ; `searchParams` d'une page est une Promise.
- `not-found.tsx` d'un segment ne sert qu'aux `notFound()` : une URL qui ne correspond à rien prend le `not-found` RACINE (site).
- Serveur de dev lancé avant le déplacement du Studio : il garde `[[...tool]]` en mémoire (voir Faiblesses) — redémarrer
  avant d'ajouter une route attrape-tout sous /admin.
- Dossier de travail partagé entre agents (scratchpad) : ne pas nommer ses scripts de capture `shoot.mjs` à la racine.
- Kit sans `@testing-library/jest-dom` : pas de `toHaveAttribute` dans les tests, lire `getAttribute` / `textContent`.
- `ShellSidebar` importe `useAskAi` : dans un test, simuler `@/admin/features/ask-ai/AskAiProvider` (le stub ne fait rien).

## Comment modifier

- **Nouvelle entrée de SITE SETTINGS** : `buildShellNav` (id `settings.<x>`, icône du kit, droit éventuel) + libellé dans
  `resolveShellLocation` (`labels`) + test dans `nav.test.ts`.
- **Nouvelle page ou collection** : rien ici — elles viennent de `src/admin.config.ts` (le comptage suit `collections`).
- **Nouvelle zone de l'admin** (ex. `/admin/help`) : `case` dans `resolveShellLocation` (entrée active + nom d'écran), entrée dans une section.
- **Changer un texte de A1** : `LoginScreen.tsx` (constantes exportées) ; textes des fournisseurs : `login/providers.ts`.
- **Changer le seuil de la garde** : `AdminRoot.module.css` (`max-width: 1023.98px`) + test `AdminRoot.test.tsx`.
- **Écran hors coque** : le placer hors de `(shell)` (il reçoit quand même tokens, police, toasts et garde de la racine).

## Tests

`npx vitest run src/admin/shell` — 77 tests : navigation par rôle (kuartz / client / editor), sections et libellés du Figma,
pages et page article « slug: N », comptes (null si inconnu), actif selon l'URL (22 routes), hub, liens externes ; comptes
(requête paramétrée, erreurs, délai) ; props client sans données sensibles ; ShellSidebar en jsdom (tags, comptes,
aria-current, écran courant, chevron, Ask AI, Log out, menu de rôle de dev + erreur) ; garde < 1024 px (balisage + CSS) ;
A1 (ordre et libellés des fournisseurs, erreurs, « Try again », dev) ; route A1 (redirection si connecté, `next` nettoyé,
`?error=`, Sanity injoignable) ; états (erreur + retry + digest, introuvable, chargement).
`npx tsc --noEmit -p .` : zéro erreur dans ces fichiers.
À la main (dev 4040) : `/admin` en kuartz et client (POST `/admin/api/auth/dev-role {"role":"client"}`), fenêtre < 1024 px,
Log out → A1 avec la barre DEV ONLY, `/admin/login?error=provider`, `/admin/settings/team` en kuartz → 404 dans la coque.
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

## Demandes de contrat

- **orchestrateur** (après redémarrage du serveur de dev) : autoriser `src/app/admin/(shell)/[...missing]/page.tsx`
  (`await requireSession(); notFound()`) pour qu'une URL inconnue sous /admin affiche le 404 de l'admin dans la coque.
  Retiré pour l'instant : conflit avec l'ancien `[[...tool]]` encore en mémoire du serveur.
- **orchestrateur / `.env.example`** : documenter `KUARTZ_HUB_URL=` (lien « ↗ Kuartz hub », Kuartz seulement).
- **features qui créent / suppriment des éléments de collection** (cms-media) : `router.refresh()` après l'écriture pour mettre
  à jour les comptes de la sidebar.
