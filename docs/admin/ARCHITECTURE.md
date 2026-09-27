# Admin du site + moteur IA — architecture

> Rédigé le 2026-09-27 par l'orchestrateur, avant la construction. Source de vérité pour tous les agents.
> Spécification fonctionnelle : `docs/admin/figma/` (extraction du Figma « Kuartz — Carte système »).
> Leçons du POC : `docs/admin/research/poc-editeur-ia.md`. Carte du site : `docs/admin/research/site-conduit.md`.

## 1. Ce qu'on construit

L'admin livré avec chaque site client (`conduit.com/admin`), d'après le Figma : connexion (A1), réglages (B1-B5),
pages et CMS (C1-C6), éditeur IA plein écran (D0-D3), publication (E1-E2), états détaillés (G1-G6) et Ask AI (G4).
Interface en **anglais**, pour ordinateur (sous 1024 px : « This admin is designed for a computer. »),
**thème sombre** du Design System Figma. Le hub Kuartz (K0-K2) est hors périmètre.

Le site Conduit reste tel quel : il n'est adapté que là où l'admin en a besoin (§ 7), à rendu identique.

## 2. Processus et ports (local)

| Processus | Commande | Adresse | Rôle |
|---|---|---|---|
| Site + admin + Studio | `npm run dev` | 127.0.0.1:4040 | Le site public (`/`), l'admin (`/admin`), le Studio Sanity déplacé sur `/studio` (outil de Kuartz). |
| Moteur IA (`engine/`) | `npm run engine` | 127.0.0.1:4043 | Processus Node persistant : Claude (Agent SDK), garde-fous, git, publication, Ask AI, journal de consommation. |
| Aperçu du brouillon | lancé et surveillé par le moteur | 127.0.0.1:4042 | `next dev` dans le clone de travail du moteur, branche `draft`, mode `KZ_EDITOR_PREVIEW=1`. |

Aucun de ces processus n'est inscrit dans le PM2 de `~/Tools` : l'utilisateur les lance à la main.
Tout écoute sur `127.0.0.1`. Pas de port en dur dans le code : tout vient de l'environnement (§ 9).

```
Navigateur ── /admin (4040) ──► Next : pages de l'admin, server actions, relais /admin/api/engine/*
                 │                         │  jeton Sanity de l'UTILISATEUR (lecture/écriture des brouillons)
                 │                         └──► Moteur 4043 (Bearer ENGINE_SECRET + identité signée)
                 │                                   ├─ Claude (Agent SDK / API), seul détenteur de l'accès
                 │                                   ├─ clone git de travail (branche draft), commits, ff → main
                 │                                   ├─ Sanity : jeton d'écriture « robot » (textes IA, publication, journal)
                 │                                   └─ aperçu 4042 (next dev du clone) + Playwright (contrôles)
                 └── iframe de l'éditeur ──► aperçu 4042 (cookie de secret d'aperçu) ⇄ postMessage (origines vérifiées)
```

## 3. Arborescence et propriétaires

```
src/admin/                          ← tout le code de l'admin, isolé du site (prêt à devenir un paquet commun, question 2)
  CLAUDE.md                         carte des modules (orchestrateur)
  core/contracts/                   CONTRATS PARTAGÉS (orchestrateur) : rôles, session, manifeste, zones, API du moteur, formats
  core/auth/                        connexion Sanity, cookie chiffré, rôles, requireSession/requireCapability (auth-core)
  core/sanity/                      clients serveur (lecture, écriture au nom de l'utilisateur), requêtes communes (auth-core)
  core/engine/                      client serveur du moteur + relais signé (auth-core)
  core/usage/                       lecture des documents aiUsage, agrégats par période (code-usage)
  ui/                               kit du Design System : tokens, polices, icônes, composants (ui-foundations, ui-composites)
  shell/                            coque : Sidebar, Top bar, garde < 1024 px, navigation (shell)
  features/<feature>/               une feature = un dossier = un CLAUDE.md
     overview · general · team      (settings)          code · usage (code-usage)
     pages (C1, C2, C6)             (pages)             cms · media (cms-media)
     publish (E1, E2, G3)           (publish-ui)        ask-ai (ask-ai)
     ai-editor/sidebar (D, G2)      (editor-sidebar)    ai-editor/canvas (D, G1) (editor-canvas)
  editor-bridge/                    pont de l'aperçu, monté dans le SITE en mode aperçu seulement (editor-canvas)
src/app/admin/                      routes Next minces : elles importent les features (chaque agent possède ses routes)
src/app/studio/                     Studio Sanity déplacé (site-adapter)
src/admin.config.ts                 manifeste du site pour l'admin (site-adapter), type AdminConfig
src/editor/zones.json · RULES.md    zones et règles de l'éditeur IA (site-adapter + engine-claude pour RULES.md)
src/styles/tokens.json              tokens du site pour les garde-fous (site-adapter)
engine/                             moteur IA, processus séparé, jamais importé par Next
  CLAUDE.md
  src/server/ · store/ · jobs/ · git/ · workspace/ · preview/ · content/   (engine-core)
  src/publish/ · versions/ · usage/                                        (engine-publish)
  src/claude/ (agent, prompts, outils MCP, hook)                           (engine-claude)
  src/guards/ (css-policy, css-lint, tsx-lint, contrast, measure, visual, checks, questions, quote) (engine-guards)
  src/ask/                                                                 (ask-ai)
docs/admin/                         ARCHITECTURE (ce fichier), AGENTS-PLAN, CONTEXT-TEMPLATE, figma/, research/
```

Règle d'or : **un fichier a un seul propriétaire**. Un agent qui a besoin d'un changement ailleurs l'écrit dans la section
« Demandes de contrat » de son `CLAUDE.md` ; l'orchestrateur tranche. Les contrats (`core/contracts/`) ne changent que par lui.

### Routes de l'admin (reprises du Figma, `docs/admin/figma/README.md` § 4)

| Écran | Route |
|---|---|
| A1 | `/admin/login` (+ retour `/admin/auth/callback`) |
| B1 · B2 · B3 · B4 · B5 | `/admin` · `/admin/settings/general` · `/admin/settings/code` · `/admin/settings/team` · `/admin/settings/usage` |
| C1 · C2 | `/admin/pages/<page>` · `/admin/pages/<page>/seo` (`<page>` = `PageDef.id`, ex. `home`) |
| C6 | `/admin/pages/<page>/slug/seo` (page article d'une page listing, ex. `/admin/pages/blog/slug/seo`) |
| C3 · C4 | `/admin/cms/<collection>` · `/admin/cms/<collection>/<id>` (panneau par-dessus la liste, URL partageable ; `<collection>` = `CollectionDef.id`) |
| C5 | `/admin/media` |
| D1-D3 | `/admin/editor?page=<page>` (plein écran, hors de la coque) |
| E1 · E2 | `/admin/publish` · `/admin/publish/versions` |
| Galerie du kit (dev) | `/admin/kit` |

Groupes de routes : `src/app/admin/(shell)/…` pour les écrans dans la coque (Sidebar + Top bar), `src/app/admin/login`,
`src/app/admin/auth/callback` et `src/app/admin/editor` hors coque. `src/app/admin/layout.tsx` (propriété de shell) pose
les tokens, la police et `data-theme="dark"` pour tout `/admin`.

## 4. Données : qui possède quoi

| Donnée | Où | Écrite par |
|---|---|---|
| Textes des pages (`dockSchedulingPage`, `blogPage`), SEO, réglages (`siteSettings`, scripts), modèles SEO d'article, collections (`post`, `testimonial`, `faq`, ordre `orderRank`), médias (`sanity.imageAsset`, `altText` sur l'asset) | Sanity du client, **brouillons** `drafts.<id>` | l'admin, au nom de l'utilisateur (son jeton) ; les textes de l'éditeur IA par le moteur (jeton robot) |
| Styles modifiés par l'éditeur IA | git, branche `draft` du clone du moteur | le moteur seulement |
| Demandes IA, fil de conversation, modification en attente, publications | magasin du moteur (`<ENGINE_WORKSPACE>/data/`, fichiers JSON écrits atomiquement) | le moteur |
| Journal de consommation IA (B5) | Sanity, documents **privés** `aiUsage.<id>` | le moteur |
| Membres et rôles (B4) | projet Sanity (API de gestion) | l'admin, avec le jeton de l'utilisateur administrateur |
| JSON-LD | code de chaque page, écrit par Kuartz | jamais l'admin (lecture seule en C2) |

Rien n'est en ligne avant **Publish** (E1). Publier = (1) publier les brouillons Sanity concernés (`ifDraftRevisionId`),
(2) si du code a changé : `main` ← `draft` en avance rapide + tag `publication-N` (+ push si configuré),
(3) build/déploiement (hook Vercel si configuré, sinon « local mode »), (4) en ligne, puis revalidation du cache du site
(`POST /api/revalidate`). La suite n'est pas atomique : le contenu part d'abord ; une reprise (`retry`) repart de l'étape en échec.

Le bouton Publish natif du Studio publierait un texte sans le code qui va avec : il n'est pas proposé au client
(le Studio est réservé à Kuartz, sur `/studio`).

## 5. Authentification et droits

- **A1** : la page liste les fournisseurs Sanity (`/auth/providers`), renvoie vers le fournisseur avec
  `origin=<site>/admin/auth/callback` et `type=token`, reçoit `#sid=…`, et le serveur l'échange (`/auth/fetch?sid=`) contre
  le jeton de l'utilisateur. `/users/me` sur l'hôte du projet donne l'identité et les rôles du projet → rôle de l'admin
  (`core/contracts/roles.ts`). Viewer ou rôle inconnu : accès refusé avec un message clair.
- **Session** : cookie `kz_admin` chiffré (JWE, `ADMIN_SESSION_SECRET`), httpOnly, SameSite=Lax, `path=/admin`, Secure en
  production. Le jeton Sanity de l'utilisateur ne quitte jamais le serveur (`PublicSession` côté client).
- **Garde** : `src/proxy.ts` (Next 16) redirige vers `/admin/login` sans cookie ; la vraie vérification est
  `requireSession()` / `requireCapability()` au début de CHAQUE page serveur, server action et route handler de l'admin.
- **Développement** : `ADMIN_DEV_AUTOLOGIN=kuartz|client|editor` (seulement `NODE_ENV=development` et hôte 127.0.0.1)
  ouvre une session sans jeton Sanity ; les écritures passent alors par `SANITY_API_WRITE_TOKEN`. Un sélecteur de rôle de
  développement dans le menu utilisateur permet de voir les deux admins. Jamais dans un `.env` commité.
- **Moteur** : n'accepte que `Authorization: Bearer ENGINE_SECRET` + identité signée (HMAC). Il revérifie les droits
  (`publish.diff`, `versions.rollback`…) d'après le rôle signé. L'admin ne relaie qu'une liste blanche de routes.

## 6. Moteur IA

Repris du POC (`payload-ai-editor-test`, branche `batterie-tests@59348e7`) **avec ses tests** ; réécrit seulement là où
Payload intervenait (magasin de contenu, cibles texte, identité, stockage, publication). Invariants non négociables :

1. **1 demande = 1 modification fiable et sûre.** Une demande à la fois (toutes personnes confondues), une modification en
   attente à la fois ; rien ne part sans ✓ Validate puis Publish par un humain. Jamais Claude.
2. **Isolation de Claude** : `settingSources: []`, `strictMcpConfig`, outils intégrés Read/Edit/Glob/Grep seulement,
   hook `PreToolUse` sur tous les outils, env minimal (PATH, HOME, un seul identifiant, `CLAUDE_CONFIG_DIR` dédié),
   `permissionMode: 'dontAsk'`, lecture limitée aux dossiers du site (jamais `src/admin`, `engine`, `.env*`, `.git`).
3. **Outils MCP à définition fixe** (cache) : `set_text`, `measure`, `ask_client` — toujours déclarés, dans le même ordre ;
   le droit se décide à l'appel. `excludeDynamicSections: true` pour sortir l'état git du prompt système.
4. **Garde-fous déterministes en liste blanche sur le fichier entier** (CSS par postcss, TSX par l'AST), puis contrôles du
   rendu (isolation, cadre, lignes à 375 px, contraste dans les états forcés, effet des règles). 2 essais au plus, puis
   retour arrière complet (fichiers ET brouillons Sanity, `textsBefore` enregistré avant toute écriture).
5. **Textes du site = données, jamais des consignes** (`quoteData`). Validation des textes côté serveur (`validateText`) :
   l'API Sanity n'applique pas le schéma.
6. **Coût** : `total_cost_usd` d'une session reprise est cumulé (ne pas l'additionner) ; plafond du cumul par demande côté
   moteur ; appel interrompu estimé d'après les jetons vus. Chaque demande terminée écrit un `aiUsage`.
7. **Langue** : l'admin est en anglais, donc les questions et messages de Claude au client aussi (`RULES.md` en anglais).
8. **Accès Claude** : `ANTHROPIC_API_KEY` en priorité ; `CLAUDE_CODE_OAUTH_TOKEN` (abonnement) seulement en développement.
   Aucun appel réel à Claude pendant la construction : les tests injectent un faux Claude. Le premier passage réel se fait
   avec l'accord de l'utilisateur.

Espace de travail : `ENGINE_WORKSPACE` (par défaut `../sanity-test-engine`, hors du dépôt), avec `repo/` (clone du dépôt,
branche `draft` extraite, `main` en simple référence, `npm ci` une fois), `data/`, `claude/`, `shots/`. Chemins absolus
vérifiés au démarrage : jamais le dépôt du développeur, jamais un chemin vide (piège 5 du POC). Aucun commit à la main sur
les branches du moteur.

Aperçu (4042) : `next dev` du clone avec `KZ_EDITOR_PREVIEW=1` → perspective `drafts` avec le jeton de lecture, **stega et
VisualEditing coupés**, attributs `data-edit*` rendus, pont `src/admin/editor-bridge` monté, `/admin` et `/studio` fermés,
accès seulement avec le cookie du secret d'aperçu (`ENGINE_PREVIEW_SECRET`). Le HMR voit le CSS, pas un brouillon Sanity :
le pont reçoit `refresh` et le moteur attend un signal (texte attendu présent) plutôt qu'un délai fixe.

## 7. Adaptations du site Conduit (rendu identique, vérifié par captures avant/après)

- Studio déplacé de `/admin` vers `/studio` (Kuartz) ; `/admin` devient l'admin.
- Schéma : `siteSettings` (B2, B3/G6 scripts), objet `seo` sur les pages (C2) avec migration de `seoTitle`/`seoDescription`,
  `blogPage` (textes et SEO de `/blog`), modèle SEO d'article `articleSeo-post` (C6), `orderRank` sur les collections (G5),
  type `aiUsage` (privé, caché du Studio). `npm run typegen` après chaque changement.
- Site : métadonnées, favicons, indexation et scripts lus dans `siteSettings` ; texte alternatif de l'asset en repli ;
  route `POST /api/revalidate` protégée par `REVALIDATE_SECRET` ; mode `KZ_EDITOR_PREVIEW` (§ 6) et `data-edit*`.
- Données de développement : dataset `development` (copie de `production`), démo LyonDrive retirée de ce dataset seulement,
  blog de démonstration en anglais (le Figma prévoit 12 articles). `production` n'est pas touché.

## 8. Conventions de code

- Next 16.3 (lire `node_modules/next/dist/docs/` avant de coder : `proxy.ts`, `LayoutProps`/`PageProps`, `updateTag`…),
  React 19, TypeScript strict, alias `@/*`. Apostrophes simples, pas de point-virgule. **Commentaires en français, textes
  de l'interface en anglais.**
- Server Components par défaut ; `'use client'` seulement pour l'interactivité. Mutations = server actions qui commencent
  par `requireSession()`/`requireCapability()` et valident leurs entrées (zod). Aucune donnée sensible dans les props client.
- CSS Modules + custom properties `--k-*` du Design System (`src/admin/ui/tokens.css`), jamais de valeur en dur quand un
  token existe. Le CSS de l'admin ne fuit pas dans le site (et inversement) : il n'est importé que par `src/app/admin/`.
  Police Inter (next/font), thème sombre par défaut (`data-theme="dark"` sur la racine de l'admin).
- Animations : `motion` (`motion/react`) pour les entrées/sorties et les listes, CSS pour le reste ; skills
  `web-animation-design` et `motion` ; `prefers-reduced-motion` respecté partout (JS compris).
- Accessibilité : navigation clavier complète, focus visible, rôles ARIA des composites (tabs, menu, dialog, listbox),
  Échap ferme les fenêtres, contrastes AA.
- Tests : Vitest (`npm test`) ; tests à côté du code (`*.test.ts`). Le moteur garde ses tests portés du POC.
- Pas de nouvelle dépendance sans passer par l'orchestrateur (elles sont installées en vague 0).

## 9. Environnement (noms seulement)

`.env.local` (site + admin) : `NEXT_PUBLIC_SANITY_PROJECT_ID`, `NEXT_PUBLIC_SANITY_DATASET` (= `development` en local),
`SANITY_API_READ_TOKEN`, `SANITY_API_WRITE_TOKEN` (robot, rôle Editor — créé par l'utilisateur ; dev autologin seulement
côté admin), `ADMIN_SESSION_SECRET`, `ADMIN_DEV_AUTOLOGIN` (dev), `ENGINE_URL`, `ENGINE_SECRET`, `REVALIDATE_SECRET`,
`KZ_EDITOR_PREVIEW` (aperçu seulement), `ENGINE_PREVIEW_SECRET` (aperçu seulement), `ADMIN_ORIGIN` (aperçu : origine
autorisée du pont).

`engine/.env.local` : `ENGINE_MODE` (`local` | `hosted` ; le jeton d'abonnement Claude n'est accepté qu'en `local`),
`ENGINE_PORT`, `ENGINE_SECRET`, `ENGINE_WORKSPACE`, `ENGINE_PREVIEW_PORT`, `ENGINE_PREVIEW_SECRET`,
`ENGINE_SOURCE_REPO`, `ENGINE_SOURCE_BRANCH` (facultatif, sinon la branche courante de la source), `ENGINE_GIT_PUSH` (0 par défaut),
`EDITOR_MAX_REQUEST_USD` (facultatif : plafond du cumul d'une demande, 2 essais compris ; défaut = `EDITOR_MAX_BUDGET_USD`), `VERCEL_DEPLOY_HOOK_URL` (facultatif), `SITE_REVALIDATE_URL`,
`REVALIDATE_SECRET`, `NEXT_PUBLIC_SANITY_PROJECT_ID`, `NEXT_PUBLIC_SANITY_DATASET`, `SANITY_API_READ_TOKEN`,
`SANITY_API_WRITE_TOKEN`, `ANTHROPIC_API_KEY` ou `CLAUDE_CODE_OAUTH_TOKEN`, `EDITOR_MODEL` (claude-opus-5-5),
`EDITOR_EFFORT` (medium), `EDITOR_MAX_TURNS` (24), `EDITOR_MAX_BUDGET_USD` (1.5), `ASK_MODEL` (claude-haiku-4-5-20251001).

Aucun secret n'est affiché, collé dans une conversation ni commité. Les jetons Claude et Sanity sont recopiés par
l'utilisateur lui-même.

## 10. Décisions prises pour les « À trancher » du Figma (réversibles, rappelées dans les CLAUDE.md concernés)

| # | Décision pour ce build |
|---|---|
| 2 | Interface propre (celle du Figma), isolée dans `src/admin` pour devenir un paquet commun ; Studio gardé sur `/studio` pour Kuartz. |
| 3 | Publier seulement via Publish (E1 / Top bar). |
| 4 | Les deux chemins : formulaire (C1) et éditeur IA (D). |
| 5 | Code (B3), diff et retour arrière (E2) réservés à Kuartz. |
| 6 | Team : liste et invitation par l'API Sanity si l'utilisateur en a le droit, sinon lien vers la gestion Sanity. |
| 7 | Moteur local persistant ; Vercel Sandbox ou VM plus tard (mode `hosted` prévu dans les contrats). |
| 9 | Pas d'ouverture de l'éditeur depuis le site public dans ce build. |
| 10 | Images des pages dans Sanity quand le schéma les porte ; les visuels décoratifs du code restent dans le code. |
| 11 | Rôle Editor : l'admin du client sans Team. |
| 12 | Journal IA : un document Sanity privé par demande. |
| 13 | Texte alternatif sur l'asset (`altText`), repli sur l'`alt` existant. |
| 14 | Sidebar de l'éditeur : 260 à 480 px, double-clic → 260. |
| 15 | Pas de pages /testimonials ni /faq (elles n'existent pas sur Conduit) : les pages viennent de `admin.config.ts`. |
