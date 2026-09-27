# Carte technique : `sanity-test` (site Conduit, page Dock Scheduling)

> Relevé en lecture seule le 2026-09-27, sur `/Users/andreagauvreau/Tools/sanity-test`.
> Git : branche `main`, **arbre propre**, à jour avec `origin/main` (`github.com/AndreaGauvreau/test-sanity-website`). Une seule branche locale (`main`) et une seule distante (`origin/main`).
> Tête : `589b221 getconduit` (2026-09-26 12:11 +0800). Historique complet : `2092d75 Initial commit from Create Next App` → `7c3d3bf first commit` → `882e7c8 push it` → `2b0554f Add GTM + GA4, distinct 404 titles, timezone on render stamp` → `589b221 getconduit`. Le dernier commit apporte toutes les sections, les schémas de la page, le seed et `docs/editeur-ia/`.
> Au moment du relevé, un serveur écoute déjà sur `127.0.0.1:4040` (PID 32740, sans doute `npm run dev`).
> `.env.local` n'a **pas** été ouvert : seuls les noms de ses variables ont été listés (`grep -o '^[A-Z_0-9]+'`).

---

## 1. Stack, scripts, ports, environnement, conventions, règles

### 1.1 Versions

Versions **installées**, lues dans `node_modules/*/package.json` ; déclarées dans `package.json:18-39`.

| Paquet | Déclaré | Installé | Rôle |
|---|---|---|---|
| `next` | `16.3.6` (exact) | 16.3.6 | App Router, Next 16 (`proxy.ts`, `updateTag`, `revalidateTag(tag, profile)`, `LayoutProps`/`PageProps` globaux) |
| `react` / `react-dom` | `19.2.8` | 19.2.8 | |
| `sanity` | `^6.16.0` | 6.16.0 | Studio (embarqué sur `/admin`) + CLI |
| `next-sanity` | `^13.3.4` | 13.3.4 | `defineLive`, `defineEnableDraftMode`, `VisualEditing`, `NextStudio`, `stegaClean`, `PortableText`, `Image` |
| ↳ `@sanity/client` imbriqué dans `next-sanity` | — | **7.27.0** | client réellement utilisé par `createClient` de `next-sanity` |
| ↳ `@sanity/visual-editing` imbriqué | — | 6.1.2 | overlays du clic-pour-éditer |
| `@sanity/client` (racine) | `^8.7.0` | 8.7.0 | utilisé par `sanity/cli` (scripts) |
| `@sanity/image-url` | `^2.1.1` | 2.1.1 | `createImageUrlBuilder` |
| `@sanity/vision` | `^6.16.0` | 6.16.0 | onglet GROQ du Studio |
| `@sanity/icons` | `^5.2.2` | 5.2.2 | icônes des schémas |
| `sanity-plugin-media` | `^6.3.0` | 6.3.0 | onglet Médias |
| `@sanity/preview-url-secret` | (transitif) | 4.1.5 | secret de Presentation |
| `@portabletext/react` | (transitif) | 7.0.1 | via `next-sanity` |
| `styled-components` | `^6.5.3` | 6.5.3 | exigé par le Studio |
| `@next/third-parties` | `^16.3.6` | 16.3.6 | `GoogleTagManager` |
| `server-only` | `^0.0.1` | — | garde de `src/sanity/lib/token.ts` |
| `typescript` (dev) | `^5` | 5.9.3 | |
| `sharp` (dev) | `^0.35.4` | 0.35.4 | optimiseur `next/image` des images statiques |

Node **v22.14.0**, npm 10.9.2 (la doc de l'éditeur IA exige Node ≥ 22.12 : OK).
**Absents** : aucun test (ni runner, ni fichier `*.test.*`), pas d'ESLint ni de Prettier, pas de Tailwind, pas de `@anthropic-ai/*`, `zod`, `playwright-core`, `postcss` en dépendance directe.

### 1.2 Scripts (`package.json:5-17`)

| Script | Commande | Note |
|---|---|---|
| `dev` | `next dev -H 127.0.0.1 -p ${PORT:-4040}` | site + Studio `/admin` |
| `build` | `rm -rf .next/cache/fetch-cache && next build` | vide le cache de données (qui survit aux builds, voir §7) |
| `start` | `next start -H 127.0.0.1 -p ${PORT:-4040}` | |
| `prod` | `npm run build && next start …` | |
| `studio` | `SANITY_STUDIO_STANDALONE=true sanity dev` | Studio seul sur :3333, aperçu live pointé sur :4040 |
| `deploy:studio` | `SANITY_STUDIO_STANDALONE=true SANITY_STUDIO_HOSTED=true sanity deploy` | `kuartz-sanity-test.sanity.studio`, sans Presentation |
| `seed` | `sanity exec scripts/seed.ts --with-user-token --` | `-- --force` réécrit la page, le témoignage et la FAQ |
| `cleanup:legacy` | `sanity exec scripts/cleanup-legacy.ts --with-user-token` | supprime la démo LyonDrive (**pas encore lancé**, voir §7) |
| `touch` | `sanity exec scripts/touch.ts --with-user-token --` | patch de `faq-1` hors Studio (`-- reset`) |
| `typegen` | `sanity schemas extract --force && sanity typegen generate` | → `schema.json` (ignoré par git) → `src/sanity/types.ts` (commité) |
| `typecheck` | `next typegen && tsc --noEmit` | |

### 1.3 Ports et URL

| Quoi | URL |
|---|---|
| Site | `http://localhost:4040` (écoute sur `127.0.0.1` seulement) |
| Studio embarqué | `http://localhost:4040/admin` (connexion Google) |
| Mesures | `http://localhost:4040/bench` |
| Aperçus de section (dev seulement) | `http://localhost:4040/preview/<section>` |
| Studio seul (option) | `http://localhost:3333` (`npm run studio`) |
| Studio hébergé | `https://kuartz-sanity-test.sanity.studio` (`sanity.cli.ts:12`, appId `txkcir5yb8f2ovcsta3rys19`) |
| Projet Sanity | `dwa2djm3` (« Kuartz Studio »), dataset **`production`, public** (README:20) |

`.claude/launch.json` : `sanity-test` (`npm run dev`, 4040), `sanity-test-prod` (`npm run prod`, 4040), `sanity-test-analytics` (`env ENABLE_ANALYTICS=true PORT=4041 npm run prod`, 4041). Le README (l. 23) rappelle que les tests Payload occupent 4000–4029.

### 1.4 Variables d'environnement (noms seulement)

`.env.example` (l. 4-22) : `NEXT_PUBLIC_SANITY_PROJECT_ID`, `NEXT_PUBLIC_SANITY_DATASET`, `SANITY_STUDIO_PROJECT_ID`, `SANITY_STUDIO_DATASET`, `SANITY_API_READ_TOKEN` (jeton **Viewer**), `SANITY_LIVE_MODE` (vide ou `swr`), `ENABLE_ANALYTICS`.

`.env.local` contient 5 noms : les 4 identifiants de projet/dataset et `SANITY_API_READ_TOKEN`. **Aucun jeton d'écriture** (`SANITY_API_WRITE_TOKEN` n'existe pas encore).

Lues par le code sans figurer dans `.env.example` : `NEXT_PUBLIC_SANITY_API_VERSION` (facultative, défaut `2026-09-01`, `src/sanity/env.ts:4`), `SANITY_STUDIO_STANDALONE` et `SANITY_STUDIO_HOSTED` (`sanity.config.ts:22-23`), `VERCEL_ENV` (`src/components/Analytics.tsx:12`), `NODE_ENV` (garde des pages `/preview/*`), `PORT` (scripts).

`.gitignore` ignore `.env*` sauf `.env.example` (l. 34 et 44), ainsi que `schema.json`, `/dist` (build du Studio) et `/.sanity` (runtime de `sanity dev`).

### 1.5 Conventions du code

- **CSS Modules**, un dossier par composant avec son `.module.css` et ses assets co-localisés (`src/components/sections/<Nom>/`, `src/components/ui/<Nom>/`). Pas de Tailwind, pas de CSS-in-JS côté site.
- **Tokens** : `src/styles/tokens.css`, écrit à la main (pas de `tokens.json`). Les composants n'utilisent que les **rôles**, jamais la palette (commentaire l. 4). Les styles de texte vont par paires `font` + `letter-spacing` (`--text-X` + `--text-X-tracking`).
- `src/styles/base.css` est en `@layer reset, base` (l. 5). Les CSS Modules, hors couche, l'emportent toujours. Classes globales : `.visually-hidden` (l. 66-73) et `.skip-link` (l. 76-96).
- Le CSS du site n'est chargé que par `src/app/(site)/layout.tsx:14-15`, pour ne pas toucher au Studio. Le layout racine ne pose que les polices next/font (`--font-geist`, `--font-geist-mono`) sur `<html lang="en">` (`src/app/layout.tsx:5-12`).
- **Mobile-first**, en `min-width` : **50.625rem (810 px)**, **64rem (1024)**, 80rem (1280), 90rem (1440). Une requête de conteneur `@container (min-width: 25rem)` dans `Faq.module.css:113`. Propriétés logiques (`inline-size`, `padding-block`…), `text-wrap: balance` sur les titres.
- Variables locales par section (`--gap`, `--card-pad`, `--scene-*`, `--tap`…) et quelques couleurs en dur : feux de fenêtre du Hero `#f05e57 #ffb728 #50be58`, fond du logo Capterra `#f2f2f2` (`Hero.module.css:70, 111-114`), masques `#000` de `GetStarted.module.css:19, 107`.
- **Sections** : `<section aria-labelledby="<nom>-title">`, `<hgroup>` + `Eyebrow` + `h2 id="<nom>-title"`. Les titres invisibles utilisent `.visually-hidden` ; `role="list"` pour Safari. Les décors sont des pseudo-éléments ou des `next/image` à `alt=""`.
- **Données Sanity typées** par `StegaBranded<XxxSection>` (types générés). Règle écrite dans chaque composant : `stegaClean()` avant tout usage autre que l'affichage (URL, classe, clé, attribut, calcul). `Button` nettoie lui-même son `href` (`src/components/ui/Button/Button.tsx:23`).
- Style TS : alias `@/*` → `src/*` (`tsconfig.json:21-23`), apostrophes simples, pas de point-virgule. **Commentaires en français, textes du site en anglais.**
- Chaque section a une page `/preview/<section>` qui l'affiche avec les données du seed, en `notFound()` en production (ex. `src/app/(site)/preview/hero/page.tsx:12-15`).

### 1.6 Règles à respecter

- `CLAUDE.md` ne contient que `@AGENTS.md`. `AGENTS.md` (bloc écrit par `next dev`) dit : « This is NOT the Next.js you know ». Il faut lire le guide concerné dans `node_modules/next/dist/docs/` (`01-app`, `02-pages`, `03-architecture`, `04-community`) **avant d'écrire du code** et tenir compte des dépréciations. `next dev` recrée ce bloc s'il disparaît d'un diff.
- `docs/editeur-ia/README.md:78-85` et `PROMPT.md:138-168` ajoutent ces règles :
  - tout en français ;
  - aucun secret affiché ni commité ;
  - l'utilisateur recopie lui-même le jeton Claude ;
  - prévenir avant tout appel réel à Claude (coût) ;
  - rien publié sans validation humaine ;
  - écrire dans un dataset de test ;
  - **pas de PM2** (l'utilisateur lance les serveurs) ;
  - runner côté serveur Node persistant ;
  - garder les garde-fous du POC ;
  - le POC est en lecture seule.
- Mémoire de l'utilisateur : ne jamais inscrire un test dans le PM2 de `~/Tools`, et répondre en français.

---

## 2. Arborescence commentée

```
sanity-test/
├─ AGENTS.md                 Règles agent Next 16 (lire node_modules/next/dist/docs avant de coder)
├─ CLAUDE.md                 « @AGENTS.md » seulement
├─ README.md                 Mode d'emploi du banc Sanity (partiellement périmé, voir §7)
├─ .env.example              Noms des variables (projet, dataset, jeton viewer, live mode, analytics)
├─ .claude/launch.json       3 configurations : dev 4040, prod 4040, analytics 4041
├─ package.json              Scripts et dépendances (Next 16.3.6, Sanity 6.16, next-sanity 13.3.4)
├─ next.config.ts            VIDE (aucune option : ni images, ni serverExternalPackages)
├─ sanity.config.ts          Studio : basePath /admin, structure, Presentation, Médias, Vision, singleton
├─ sanity.cli.ts             CLI : projet/dataset depuis l'env, appId du Studio hébergé, typegen
├─ tsconfig.json             strict, alias @/* → src/*
├─ schema.json               (ignoré) extraction du schéma pour le typegen
├─ .sanity/ dist/ .next/     (ignorés) runtime `sanity dev`, build du Studio, build Next
├─ docs/editeur-ia/          Dossier de portage de l'éditeur IA (8 fichiers .md, doc seulement)
├─ scripts/
│  ├─ seed.ts                Crée la page (setIfMissing / --force), le témoignage, les 9 questions de la FAQ
│  ├─ cleanup-legacy.ts      Supprime `home` + 6 articles LyonDrive + leurs images (définitif)
│  └─ touch.ts               Patch de `faq-1` hors Studio pour tester l'invalidation
└─ src/
   ├─ app/
   │  ├─ layout.tsx          Layout racine (site + admin) : polices Geist, <html lang="en">
   │  ├─ not-found.tsx       404 hors routes, styles en ligne (pas de CSS du site), GTM
   │  ├─ (site)/
   │  │  ├─ layout.tsx       CSS du site, Analytics, header/footer, <SanityLive>, VisualEditing en Draft Mode
   │  │  ├─ page.tsx         « / » = page Dock Scheduling : 3 sanityFetch, 11 sections conditionnelles
   │  │  ├─ not-found.tsx    404 « article introuvable » (+ .module.css)
   │  │  ├─ blog/page.tsx    Liste des articles (PostCard), RenderStamp
   │  │  ├─ blog/[slug]/     Article (Portable Text), generateStaticParams, metadata OG
   │  │  ├─ bench/           Mesures API CDN/directe/cache/sanityFetch, CDN d'images, bouton « Vider le cache »
   │  │  └─ preview/<11>/    Chaque section seule avec les textes du seed (dev seulement)
   │  ├─ admin/
   │  │  ├─ layout.tsx       <SanityLive includeDrafts={false} action={onPublishFromAdmin}>
   │  │  └─ [[...tool]]/page.tsx  <NextStudio config> en force-static
   │  └─ api/draft-mode/
   │     ├─ enable/route.ts  defineEnableDraftMode (client + jeton viewer)
   │     └─ disable/route.ts Sortie du Draft Mode, redirection 307 vers /
   ├─ components/
   │  ├─ sections/<11>/      Une section de la page par dossier : .tsx + .module.css + assets
   │  ├─ ui/Button           Lien-bouton (primary / secondary, tone default / inverse), href nettoyé
   │  ├─ ui/Eyebrow          Sur-titre à pastille (tone accent / inverse)
   │  ├─ ui/PostCard         Carte d'article (image CDN 760×716, catégorie, titre-lien, date, lecture)
   │  ├─ layout/SiteHeader   Emplacement gris, hauteur --header-height (pas dessiné)
   │  ├─ layout/SiteFooter   Emplacement gris, hauteur --footer-height (pas dessiné)
   │  ├─ Analytics.tsx       GTM-KK83GHRF, prod Vercel ou ENABLE_ANALYTICS, jamais en Draft Mode
   │  ├─ DraftModeBanner.tsx Bandeau « Brouillons visibles », masqué dans Presentation
   │  ├─ LiveStatus.tsx      Rappels de <SanityLive> + pastille « Live » (/bench)
   │  ├─ PortableTextBody.tsx Rendu Portable Text (images, liens nettoyés du stega)
   │  ├─ RenderStamp.tsx     Heure de génération du HTML (preuve du cache)
   │  └─ SanityImage.tsx     next-sanity/image + urlFor (crop/hotspot) + LQIP
   ├─ lib/
   │  ├─ site.ts             siteName « Conduit », openGraphDefaults
   │  └─ format.ts           formatDate « 04 Feb 2026 », formatReadingTime
   ├─ sanity/
   │  ├─ env.ts              apiVersion, projectId, dataset (asserts), studioUrl '/admin'
   │  ├─ lib/client.ts       createClient : useCdn, perspective published, stega { studioUrl }
   │  ├─ lib/token.ts        'server-only', SANITY_API_READ_TOKEN
   │  ├─ lib/live.ts         defineLive → sanityFetch, SanityLive (serverToken = browserToken = viewer)
   │  ├─ lib/live-action.ts  'use server' : onContentChange (updateTag), onPublishFromAdmin, purgeSiteCache
   │  ├─ lib/image.ts        urlFor, croppedDimensions
   │  ├─ lib/queries.ts      7 requêtes GROQ (defineQuery)
   │  ├─ presentation.ts     resolve de Presentation : mainDocuments + locations
   │  ├─ structure.ts        Colonne « Contenu » : page singleton, Blog, Témoignages, FAQ
   │  ├─ types.ts            GÉNÉRÉ par sanity typegen (668 l.) : types de schéma et *_QUERY_RESULT
   │  ├─ schemaTypes/        index, shared (alt, lien), dockSchedulingPage, post, testimonial, faq,
   │  │                      objects/cta, sections/<11 types de section>
   │  └─ seed/               Textes du Figma : page.ts, collections.ts, sections/<11>.ts (typés satisfies)
   └─ styles/
      ├─ tokens.css          Design tokens (palette, rôles, typo, mise en page)
      └─ base.css            Reset + base en @layer, .visually-hidden, .skip-link
```

---

## 3. Les sections de la page `/`

Page : `src/app/(site)/page.tsx`. `HomePage` lance trois `sanityFetch` en parallèle (`PAGE_QUERY`, `FAQS_QUERY`, `LATEST_POSTS_QUERY`, l. 35-39), renvoie `null` sans document (l. 40), puis rend chaque section **seulement si son champ existe** (l. 44-54). `generateMetadata` (l. 21-32) lit `seoTitle` et `seoDescription` avec `stega: false`.

Les 11 sections suivent l'ordre d'affichage. Toutes les textes éditables sont dans le document unique `dockSchedulingPage` (`_id` fixe `dockSchedulingPage`), un onglet (group) par section. Les tokens cités sont ceux de `tokens.css` ; les variables locales sont entre parenthèses.

| # | Section → composant | Champ → type | Données Sanity (champs) | En dur dans le code | Classes du CSS Module | Tokens principaux | Figma |
|---|---|---|---|---|---|---|---|
| 1 | `Hero/Hero.tsx` | `hero` → `heroSection` | `title` (h1, requis), `lede` (text), `primaryCta`, `secondaryCta` (`cta`), `ratings[]` ≤ 2 {`platform` g2\|capterra → **choisit une classe**, `label`, `href`} | fenêtre visuelle vide (`.visual .window`, `pattern.svg`, feux en `box-shadow`), logos `g2.svg` et `capterra.svg` en `::before` | hero, title, lede, actions, ratings, rating, g2, capterra, visual, window | --text-display(+tracking), --color-text-muted, --text-caption, --color-surface-dark, --section-space, --page-inset (--gap, --gap-visual, --u) | 269:177 |
| 2 | `Features/Features.tsx` | `features` → `featuresSection` | `title` (**h2 masqué**), `items[]` = exactement 3 {`title`, `text`} | illustration de carte en `::before` | features, list, card, cardTitle, text | --section-space-lg, --color-surface-muted, --text-title-sm, --color-text-muted (--title-trim-*) | 269:216 |
| 3 | `ConduitSystem/ConduitSystem.tsx` | `system` → `systemSection` | `eyebrow`, `title`, `lede`, `cta`, `modules[]` = 3 {`title`, `text`, `link` (cta)} ; `_key` nettoyée sert d'id | emplacement du visuel (cadre pointillé, `triangle.svg`) | system, heading, eyebrow, title, lede, cta, visual, modules, module, moduleTitle, moduleText, more | --text-title-xl, --text-title-md, --text-label-strong, --color-placeholder-*, --color-surface-subtle (--tap) | 269:232 |
| 4 | `Performance/Performance.tsx` | `performance` → `performanceSection` | `eyebrow`, `title`, `benefits[]` = 3 {`icon` chartPieSlice\|speedometer\|calendarDots → **choisit une classe**, `title` (text, 2 lignes, `white-space: pre-line`), `text`} | photo `warehouse.jpg` (next/image), flèches `arrows.svg`, pictogrammes SVG, dégradés | performance, photo, heading, title, benefits, benefit, chartPieSlice, speedometer, calendarDots, benefitTitle, benefitText | --section-space-lg, --text-title-xl, --text-title-sm, --color-text-inverse(-muted) (--scene-*, --shade-*) | 269:272 |
| 5 | `CustomerStory/CustomerStory.tsx` | `customerStory` → `customerStorySection` | `eyebrow`, `title`, `cta`, `summary`, `stats[]` 1–2 {`value`, `label`} (en `<dl>`), `results[]` 1–5 {`label`} | cadre d'illustration vide | customerStory, heading, title, illustration, summary, stats, stat, value, label, results, result | --text-stat, --text-label, --color-accent, --color-border, --color-placeholder-* (--rule, --gap-rule, --text-result-*) | 269:305 |
| 6 | `Testimonial/Testimonial.tsx` | `testimonial` → `testimonialSection` | `item` (**référence** vers `testimonial`, sinon le plus récent, via `coalesce` dans `PAGE_QUERY`), `cta`, `title` (**h2 masqué**). Citation, nom, rôle, entreprise et `caseStudyUrl` viennent du **document `testimonial`** | photo `warehouse.jpg` + passant `person-motion-blur.png`, `warehouse-blur-ramp.svg`, `warehouse-shade.svg` ; guillemets “ ” ajoutés par le code ; section masquée sans `item` | testimonial, scene, photo, person, quote, text, author, cta | --text-quote, --color-surface-dark, --color-text-inverse (--focus, --scene-blur, --text-attribution, --cta-gap) | 269:333 |
| 7 | `Integrations/Integrations.tsx` | `integrations` → `integrationsSection` | `eyebrow`, `title`, `body`, `cta`, `statValue`, `statLabel` (fieldset « Chiffre clé », ≤ 45 car. en avertissement) | **8 logos en dur** (tableau `logos`, l. 21-30 ; Figma deux fois) | integrations, heading, title, body, action, stat, statValue, statLabel, logos, logo, pfizer, americanAirlines | --text-title-xl, --text-stat, --text-label, --color-surface-subtle (--gap, --gap-stat, --title-tracking) | 269:347 |
| 8 | `Tour/Tour.tsx` | `tour` → `tourSection` | `title`, `lede`, `cta` (requis) | carte bleue en `::before`, `line-screen.svg` | tour, title, lede, cta | --color-surface-brand, --color-text-on-brand-muted, --text-title-xl (--card-pad, --space-before, --lede-tracking) | 269:420 |
| 9 | `Faq/Faq.tsx` | `faq` → `faqSection` | `eyebrow`, `title`, `supportText` (retour à la ligne respecté, `pre-line` sous `@container 25rem`), `supportCta` ; **questions** : collection `faq` (`FAQS_QUERY`, réponse en **Portable Text**) | accordéon natif `<details name="faq">` (1re ouverte), `plus.svg`/`minus.svg`, **JSON-LD FAQPage** généré | faq, heading, title, questions, item, question, answer, support, supportText | --text-title-lg, --text-body-strong, --color-surface-brand, --color-border | 269:456 |
| 10 | `Insights/Insights.tsx` | `insights` → `insightsSection` | `eyebrow`, `title` ; **cartes** = 4 derniers `post` (`LATEST_POSTS_QUERY`) via `PostCard` | ruban de cartes qui défile (`role="group"`, `tabIndex=0`) ; section masquée sans article | insights, heading, title, scroller, cards, card | --text-title-xl, --color-text-muted, --gutter | 269:511 (carte 269:518) |
| 11 | `GetStarted/GetStarted.tsx` | `getStarted` → `getStartedSection` | `eyebrow`, `title`, `titleMuted` (facultatif, suite en blanc à demi transparent), `text`, `primaryCta`, `secondaryCta` | photo `distribution-center-night.jpg`, aplat bleu nuit en `::before`, masque en dégradé | getStarted, photo, heading, title, muted, text, actions | --color-surface-brand(-deep), --color-text-on-brand-muted, --text-title-xl (--card-pad, --photo-fade, --card-fill) | 269:543 |

Hors page : `SiteHeader` et `SiteFooter` sont des **emplacements gris** (`--header-height` 66 px, `--footer-height` 740 px ; Figma 269:828 et 269:561). Le blog (`/blog`, `/blog/[slug]`) n'est pas dessiné : il réutilise `PostCard` et les styles de texte.

Composants partagés :

- `Button` (`ui/Button`) : `Link`, variantes `primary` (pavé gris et carré orange fléché en `::after`) et `secondary` (souligné orange), `tone="inverse"` sur fond sombre.
- `Eyebrow` : `<p>` à pastille `::before`, `tone` `accent` ou `inverse`.
- `PostCard` : image du CDN 760×716, `stegaClean` sur le slug et la date.

Aucun élément ne porte d'attribut `data-edit`, `data-edit-doc`, `data-edit-key` ou `data-sanity` : la recherche dans `src`, `scripts` et les fichiers de configuration ne renvoie rien. Le clic-pour-éditer repose entièrement sur le stega.

---

## 4. Sanity : schémas, requêtes, client, Draft Mode, Presentation, Visual Editing, stega

### 4.1 Types (`src/sanity/schemaTypes/index.ts:20-41`)

| Type | Genre | Champs (requis en gras) | Notes |
|---|---|---|---|
| `dockSchedulingPage` | document **singleton** | 11 champs de section (`hero`…`getStarted`, groupes de l'onglet, `collapsible: false`), **`seoTitle`** (max 60 en avertissement), **`seoDescription`** (max 160 en avertissement) | `dockSchedulingPage.ts:5-17` liste les sections [champ, type, onglet] ; `singletonTypes` = `{dockSchedulingPage}` (l. 41) |
| `post` | document | **`title`**, **`slug`** (source title, 96), **`category`** (liste fermée Operations / Buyer's guide / Analysis), **`publishedAt`**, **`image`** (hotspot, `alt` requis si l'asset existe, `assetRequired`), **`excerpt`** (max 160 en avertissement), **`content`** (Portable Text : normal/h2/h3/blockquote, puces et numéros, strong/em, lien ; images avec alt et légende) | tri `publishedAtDesc` |
| `testimonial` | document | **`quote`** (text, sans guillemets), **`name`**, `role`, **`company`**, `caseStudyUrl` (url) | |
| `faq` | document | **`question`**, **`answer`** (Portable Text, paragraphes seulement, strong/em, lien), **`order`** (entier ≥ 1) | tri `orderAsc` |
| `cta` | objet | **`label`** (« casse normale : les capitales viennent du style »), `href` (url relative ou http/https/mailto/tel ; vide → `#`) | `objects/cta.ts` |
| `heroSection` | objet | **title**, **lede**, primaryCta, secondaryCta, ratings[`rating`: **platform**, **label**, href] max 2 | `sections/hero.ts` |
| `featuresSection` | objet | **title** (masqué), **items**[`feature`: **title**, **text**] longueur 3 | |
| `systemSection` | objet | **eyebrow**, **title**, **lede**, cta, **modules**[`module`: **title**, **text**, link] longueur 3 | |
| `performanceSection` | objet | **eyebrow**, **title**, **benefits**[`benefit`: **icon**, **title** (≤ 2 lignes en avertissement), **text**] longueur 3 | |
| `customerStorySection` | objet | **eyebrow**, **title**, cta, **summary**, **stats**[`stat`: **value**, **label**] 1–2, **results**[`result`: **label**] 1–5 | |
| `testimonialSection` | objet | item (référence → testimonial), cta, **title** (masqué) | |
| `integrationsSection` | objet | **eyebrow**, **title**, **body**, cta, **statValue**, **statLabel** (max 45 en avertissement) | fieldset `stat` |
| `tourSection` | objet | **title**, **lede**, **cta** | |
| `faqSection` | objet | **eyebrow**, **title**, **supportText**, supportCta | fieldset `support` |
| `insightsSection` | objet | **eyebrow**, **title** | |
| `getStartedSection` | objet | **eyebrow**, **title**, titleMuted, **text**, primaryCta, secondaryCta | |

Aides partagées (`shared.ts`) : `altField` (alt obligatoire dès qu'une image est choisie) et `linkAnnotation`.

Studio (`sanity.config.ts`) :

- `title: 'Conduit'`, `basePath` `/admin` (ou `/` en mode seul, l. 27) ;
- le singleton est retiré des modèles et du menu « + » (l. 33, 36-39), et ses actions sont réduites à publish, discardChanges et restore (l. 41-44) ;
- plugins : `structureTool`, `presentationTool` (sauf Studio hébergé), `media()`, `visionTool`.

Structure (`structure.ts`) : « Page Dock Scheduling » (document `dockSchedulingPage`), séparateur, Blog, Témoignages, FAQ (triée par `order`).

### 4.2 Requêtes GROQ (`src/sanity/lib/queries.ts`, toutes en `defineQuery`)

| Requête | Lignes | Contenu |
|---|---|---|
| `PAGE_QUERY` | 8-21 | `*[_type=="dockSchedulingPage" && _id=="dockSchedulingPage"][0]{..., testimonial{..., "item": coalesce(item->, *[_type=="testimonial"] \| order(_createdAt desc)[0]){_id, quote, name, role, company, caseStudyUrl}}}` |
| `FAQS_QUERY` | 25-29 | `*[_type=="faq" && defined(answer)] \| order(order asc){_id, question, answer}` |
| `LATEST_POSTS_QUERY` | 32-45 | 4 derniers `post` avec slug : titre, slug, catégorie, date, `readingTime = round(length(pt::text(content))/5/180)`, image (alt, crop, hotspot, asset→lqip et dimensions) |
| `POSTS_QUERY` | 49-62 | même projection, tous les articles |
| `POST_QUERY` | 64-85 | un article par `$slug`, plus `excerpt` et `content[]` (images déréférencées) |
| `POST_SLUGS_QUERY` | 87-89 | slugs, pour `generateStaticParams` |
| `BENCH_QUERY` | 93-100 | pour `/bench` (URL et taille brute de l'image) |

Types des résultats dans `src/sanity/types.ts` (`PAGE_QUERY_RESULT` l. 454, `FAQS_QUERY_RESULT` l. 490…). **Ce fichier est généré** : on n'y touche pas à la main, on relance `npm run typegen`. Les fichiers du seed sont typés `satisfies HeroSection`, etc. : un changement de schéma se répercute sur eux au `typecheck`.

### 4.3 Client, live, cache

- `client.ts:5-14` : `createClient({ projectId, dataset, apiVersion, useCdn: true, perspective: 'published', stega: { studioUrl: '/admin' } })`. `apiVersion` vaut `2026-09-01` par défaut (`env.ts:4`) ; les scripts l'écrivent en dur aussi.
- `live.ts:8-12` : `defineLive({ client, serverToken: token, browserToken: token })`, avec le même jeton **Viewer** pour le serveur et le navigateur.
- Comportement de `sanityFetch`, vérifié dans `node_modules/next-sanity/dist/live/conditions/react-server/index.js:27-33` :
  - le stega ne s'active que si le Draft Mode est actif, qu'un `serverToken` existe et que `studioUrl` est défini ;
  - la perspective vient du cookie de Presentation, en Draft Mode seulement ;
  - le jeton n'est utilisé que pour une perspective autre que `published` ou pour le stega.
- `(site)/layout.tsx:39-45` : `<SanityLive action={SANITY_LIVE_MODE === 'swr' ? undefined : onContentChange} …/>`. `onContentChange` (`live-action.ts:18-28`) renvoie `'refresh'` en Draft Mode, sinon fait `updateTag` sur chaque tag.
- `admin/layout.tsx:6-13` : `<SanityLive includeDrafts={false} action={onPublishFromAdmin}>`. `revalidateTag(tag, {expire: 0})` (ou `'max'` en mode `swr`) vide le cache même si aucun onglet du site n'est ouvert.
- `purgeSiteCache` (`live-action.ts:47-50`) fait `revalidatePath('/', 'layout')`. C'est le bouton de `/bench` (`bench/page.tsx:211`).
- Limite documentée : une publication faite ailleurs (Studio hébergé, API, `npm run touch`) alors qu'aucun onglet n'est ouvert **ne vide pas** le cache. Il faudrait un webhook ou une Sanity Function en production (README:72-77, `live-action.ts:35-37`).

### 4.4 Draft Mode, Presentation, Visual Editing, stega : ce qui existe réellement

| Brique | État | Où |
|---|---|---|
| Route d'entrée du Draft Mode | ✅ `defineEnableDraftMode({ client: client.withConfig({ token }) })` | `src/app/api/draft-mode/enable/route.ts:8-10` |
| Route de sortie | ✅ `draftMode().disable()` puis 307 vers `/` | `src/app/api/draft-mode/disable/route.ts:5-8` |
| Presentation (« Aperçu live ») | ✅ `presentationTool({ resolve, previewUrl: { origin: standalone ? 'http://localhost:4040' : undefined, previewMode: { enable: '/api/draft-mode/enable' } } })`. Pas d'`initial` ni d'`allowOrigins` | `sanity.config.ts:50-61` |
| `resolve` : documents principaux | ✅ `/` → `dockSchedulingPage` ; `/blog/:slug` → `post` | `src/sanity/presentation.ts:8-11` |
| `resolve` : emplacements | ✅ `dockSchedulingPage`, `post`, `testimonial` et `faq` pointent vers `/` (et `/blog/…` pour un article) | `presentation.ts:12-29` |
| `<VisualEditing />` (overlays du clic-pour-éditer) | ✅ monté **seulement en Draft Mode** | `(site)/layout.tsx:47-53` |
| Bandeau du Draft Mode | ✅ affiché hors de Presentation (`useIsPresentationTool() === false`) | `src/components/DraftModeBanner.tsx:9-17` |
| Stega | ✅ activé en Draft Mode (client `stega.studioUrl`) ; `stega: false` explicite pour les métadonnées et les slugs | `client.ts:13`, `page.tsx:22`, `blog/[slug]/page.tsx:17, 23` |
| `stegaClean` | ✅ sur les href, les classes, les clés, les dates, le JSON-LD, les alt et les LQIP | `Button.tsx:23`, `Hero.tsx:38-39`, `Performance.tsx:39`, `ConduitSystem.tsx:37, 49`, `Faq.tsx:23, 42`, `PostCard.tsx:24, 33`, `SanityImage.tsx:43, 50`, `PortableTextBody.tsx:16` |
| `data-sanity` / `createDataAttribute` | ❌ absent (stega seul) | — |
| `proxy.ts` / middleware | ❌ absent | — |
| Jeton d'écriture | ❌ absent (seul le viewer est présent) | `.env.local` (noms) |
| Analytics hors Draft Mode | ✅ | `Analytics.tsx:20-21` |

### 4.5 Contenu réel du dataset `production` (lecture publique de l'API CDN, perspective `published`)

- `dockSchedulingPage` publié, avec les 11 sections remplies (`hero.title` = « Automate scheduling for maximum capacity control », `_updatedAt` 2026-09-25T16:46:33Z).
- 1 `testimonial` (`testimonial-produce-services`, Teresa Nelson).
- 1 `faq` publiée (`faq-1`, avec réponse). Les 8 autres sont en brouillon, sans réponse, selon le seed.
- **Encore présents, contenu LyonDrive** :
  - un document `home` (type absent du schéma) ;
  - **6 articles `post` en français sans `category`** (`post-road-trips-depuis-lyon`…). `npm run cleanup:legacy` n'a donc pas été lancé, et ce sont ces articles qui remplissent la section Insights de la page Conduit.
- Types présents : `dockSchedulingPage`, `faq`, `home`, `post`, `sanity.imageAsset`, `testimonial`.
- Un **dataset de test** n'a pas pu être vérifié (il faudrait une authentification). Seul `production` est documenté.

---

## 5. Design tokens (`src/styles/tokens.css`)

Relevés sur le Figma « Get Conduit — client », qui n'a pas de variables Figma : ce sont des valeurs brutes (l. 1-5). Toutes sont sur `:root`, avec `color-scheme: light` (pas de thème sombre).

**Palette** (l. 11-25) :

- `--color-orange-500` #ff5100 ;
- bleus `--color-blue-100` #d1d8e6, `-700` #193c80, `-900` #0c2a62 ;
- neutres `--color-neutral-0` #fff, `-50` #f9f9f9, `-100` #f5f5f5, `-200` #e7e7e7, `-400` #b3b3b3, `-600` #717278, `-800` #34353e, `-900` #232325, `-1000` #000 ;
- `--color-slate-50` #f8fafb.

**Rôles** (l. 29-50), seuls autorisés dans les composants :

| Groupe | Tokens |
|---|---|
| Texte | `--color-text`, `--color-text-muted`, `--color-text-accent`, `--color-text-inverse`, `--color-text-inverse-muted`, `--color-text-on-brand-muted` |
| Surfaces | `--color-surface`, `--color-surface-subtle`, `--color-surface-muted`, `--color-surface-dark`, `--color-surface-brand`, `--color-surface-brand-deep` |
| Divers | `--color-border`, `--color-placeholder-surface`, `--color-placeholder-border`, `--color-accent`, `--color-action-text`, `--color-action-surface` |

**Typographie** (l. 55-90) :

- Familles : `--font-sans` (Geist), `--font-mono` (Geist Mono), `--font-display` (« Suisse Int'l » si installée, sinon Geist ; hero seulement).
- Styles en raccourci `font`, chacun avec son `-tracking` :

| Token | Valeur | Taille Figma |
|---|---|---|
| `--text-display` | 400, clamp 2→2.5rem, /1 | 40 |
| `--text-title-xl` | 500, clamp 1.75→2.25rem | 36 |
| `--text-title-lg` | 1.5rem | 24 |
| `--text-title-md` | 1.125rem | 18 |
| `--text-title-sm` | 1rem | 16 |
| `--text-quote` | 1.25rem | 20 |
| `--text-stat` | clamp 2.5→3rem | 48 |
| `--text-body`, `--text-body-strong` | 0.875rem / 1.2857 | 14/18 |
| `--text-label`, `--text-label-strong` | 0.875rem / 1.4 | sur-titres, « See more » |
| `--text-caption` | 0.75rem, tracking 0.04em | notes G2/Capterra |
| `--text-button` | mono 0.75rem, 500 | capitales par CSS |

**Mise en page** (l. 94-103) :

- `--page-max` 80rem (1280) ;
- `--gutter` clamp(1.5rem, 5.5556vw, 5rem) ;
- `--page-inset` max(gutter, (100% − page-max)/2) ;
- `--section-space` clamp 4→6.25rem ;
- `--section-space-lg` clamp 4.5→7.5rem ;
- `--header-height` 4.125rem ;
- `--footer-height` 46.25rem.

**Absents** : pas de tokens d'espacement génériques (`--space-*`), de rayon, d'ombre ni de graisse ; les espacements fins sont des valeurs en `rem` commentées en px dans chaque module. Les 404 hors site (`app/not-found.tsx`) recopient les valeurs en ligne (commentaire l. 12).

---

## 6. L'éditeur IA dans ce projet

### 6.1 Code : rien

Aucune trace d'éditeur :

- rien ne correspond à `data-edit|data-sanity|createDataAttribute|claude|anthropic|agent-sdk|editor-api|zones.json|tokens.json` dans `src`, `scripts` ni dans les fichiers de configuration ;
- aucune dépendance (Agent SDK, zod, playwright-core, postcss, pixelmatch) ;
- pas de runner, pas de route `/editor-api`, pas d'outil de Studio ;
- `next.config.ts` est vide (pas de `serverExternalPackages`) ;
- pas de tests, pas de `ORIGINE.md` ni de `plan.md`.

L'existant se limite à la **documentation** : `docs/editeur-ia/` (8 fichiers, 2 939 lignes, commité dans `589b221`).

### 6.2 La documentation, et l'état qu'elle décrit

Le dossier est une photographie du **2026-09-25 à 21:05** (tâche 12 mise à jour à 21:35). POC de référence : `payloadjs-test/payload-ai-editor-test`, branche `batterie-tests`, tête `888d165` ; site `site@main` = `3a0af03`.

Légende :

| Marque | Sens |
|---|---|
| ✅ | validé en passage réel |
| 🟡 | approuvé, pas encore repassé |
| 🔧 | en cours |
| 📋 | prévu |
| 📚 | documentation externe, non testée |
| 💡 | proposition du dossier |

| Fichier | Lignes | Contenu | Marques (✅/🟡/🔧/📋/📚/💡) |
|---|---|---|---|
| `README.md` | 85 | Rôle du dossier, légende, état au 25/09, ordre de lecture, règles | 2/2/2/2/1/1 |
| `01-architecture.md` | 344 | Cycle d'une demande (`runEdit`), modules du runner et du site, états, sécurité par construction, transposition Sanity (§7) | 57/18/6/5/6/1 |
| `02-installation-claude.md` | 395 | Paquets exacts, binaire natif, `serverExternalPackages`, modèle et réglages, variables (noms), recopie du jeton, Chrome, coût | 17/5/1/4/13/2 |
| `03-garde-fous.md` | 383 | 4 couches, hook `PreToolUse`, périmètre, `runChecks`, rendu Playwright, décisions 1 à 18, 14 règles, limites, « Pour Sanity » | 20/40/13/11/3/1 |
| `04-consignes-outils-dialogue.md` | 591 | Prompt système et de demande, outils MCP (`set_text`, `measure`, `ask_client`), `RULES.md`, questions 🟢⚪🔴, `zones.json`, `tokens.json`, interface de l'éditeur | 31/15/3/11/3/1 |
| `05-banc-essai.md` | 380 | Banc de 50 cas, verdicts, passage de référence, construction d'un banc Sanity | 15/12/2/17/1/1 |
| `06-adaptation-sanity.md` | 516 | Transposition bloc par bloc (détail ci-dessous) | 22/8/3/4/**35**/**25** |
| `PROMPT.md` | 245 | Prompt à coller dans une nouvelle conversation, avec le chemin de ce projet | 1/3/3/3/2/2 |

**Ce qui est validé dans le POC (✅)** :

- runner Agent SDK `@anthropic-ai/claude-agent-sdk` 0.3.281, modèle `claude-opus-5-5`, effort `medium` ;
- `env` minimal : `PATH`, `HOME`, un identifiant, `CLAUDE_CONFIG_DIR`, `CLAUDE_AGENT_SDK_CLIENT_APP`, `MCP_TOOL_TIMEOUT` ;
- `ANTHROPIC_API_KEY` prioritaire ; `CLAUDE_CODE_OAUTH_TOKEN` accepté sous `NODE_ENV=development` seulement ;
- cycle complet : file → Claude → contrôles → commit sur `draft` → « à valider » → valider ou annuler → publier (`merge --ff-only`, tag `publication-N`) ;
- outils `set_text`, `measure`, `ask_client`, hook `PreToolUse`, 2e essai ;
- passage de référence : 50 cas, 3,83 $, médiane 0,070 $ et 24 s, avec 2 violations (L05 `@import`, R09 marge négative) sous l'ancien lint.

**Approuvé, pas encore repassé (🟡)** :

- corrections 1 à 11 : liste blanche CSS avec postcss sur le fichier entier, arbre TSX figé (aucune `className` ne change), `zones.json` enrichi, isolation, contraste seulement affiché, mesure unique ;
- 262 tests verts.

**En cours (🔧)** :

- tâche 12 (`frameCheck`, texte recouvert, états `:hover`/`:focus`), **non approuvée** à `888d165`, essai 3 avec les décisions 17 et 18 ;
- ne pas figer `visual.ts` ni `checks.ts` ;
- refonte non commitée de l'interface dans `site/src/editor` : copier depuis `site@main` seulement.

**Prévu (📋)** : tâches 13 à 25 (lignes à 375 px, contraste, `ask_client` élargi, `RULES.md` réécrit, outils à définition fixe, coût d'un essai en échec, banc), scan de sécurité, phase 6.

**`06-adaptation-sanity.md` en bref** :

- **4 points de contact** avec le CMS, à réécrire : `ContentStore`, `TextTarget`/`resolveTextTarget`, identité, stockage `Edits`/`Publications`. Tout le reste se garde.
- **Architecture cible** 💡 :
  - runner Node persistant, jamais dans le Studio, en serverless ou dans une Sanity Function ;
  - une seule instance ;
  - clone dédié `site/` (`main`) + worktree `site-draft/` (`draft`) servi par `next dev` ;
  - jeton d'écriture côté runner seulement.
- **Interface** : outil personnalisé du Studio recommandé (A) ; plugin d'overlay de Presentation (`unstable_`) plus tard (B) ; overlay Next du POC (C) seulement avec une authentification propre.
- **Marquage** : `data-edit` (zone de code), `data-edit-doc` (`_id` publié, nettoyé du stega) et `data-edit-key` (`_key`) 💡 coexistent avec le stega. **Un seul système d'overlays actif** dans l'iframe. Preview sans stega recommandée.
- **Textes** : `validateText` gardé (l'API n'applique pas les règles du schéma).
- **`createSanityContentStore`** 💡📚 (non testé) :
  - `sanity.action.document.edit` sur `drafts.<id>`, puis `document.publish` avec `ifDraftRevisionId`, `document.version.discard` pour annuler ;
  - garder le `_rev`, noter `draftExistedBefore`, jamais `createOrReplace` ;
  - comportement de `edit` sans brouillon existant non documenté.
- **Publication** : Sanity d'abord (actions atomiques entre elles), puis git ; numéroter par `max + 1`. Content Releases est réservé à Enterprise, pas de dépendance. Le bouton Publier natif publie le texte sans le code.
- **Rôles** : à concevoir (jeton Sanity vérifié côté serveur, ou authentification propre, ou local seulement pour le socle). Jetons proposés : `SANITY_API_READ_TOKEN` (Viewer, déjà là) et `SANITY_API_WRITE_TOKEN` (Editor, runner seulement).
- **Étapes 0 à 10** (§12), **17 pièges** (§13), **doutes** (§14).

**`PROMPT.md`** :

- jalons 1 (socle texte seul, `EDITOR_VISUAL_CHECKS=off`), 2 (preview et contrôles visuels), 3 (styles), 4 (dialogue et interface dans un outil du Studio), 5 (durcissement) ;
- méthode superpowers imposée : brainstorming, writing-plans, subagent-driven-development, TDD, vérification ;
- critères d'acceptation mesurables du jalon 1 : tests `createSanityContentStore`, `resolveTextTarget`, `validateText`, `env` exact, refus au démarrage…

### 6.3 Écarts entre la documentation et ce projet (à trancher)

1. **Document cible** : la doc suppose un singleton `home`/`home` avec des champs à plat (`features[_key==…].title`). Le projet a `dockSchedulingPage`/`dockSchedulingPage` avec des sections **imbriquées** : `hero.title`, `features.items[_key==…].title`, `system.modules[_key==…].link.label`, `performance.benefits[_key==…].title`, etc.
2. **Contenus hors page** : la citation vient d'un document `testimonial` **référencé ou choisi par défaut** (cible dynamique). Les questions de la FAQ sont des documents `faq` à **réponse en Portable Text**, hors `set_text` simple. Les cartes Insights sont des `post`.
3. **Tokens** : la doc suppose un `tokens.json` → `--groupe-nom` (`var(--color-night)`, `--space-*`, `--radius-*`…) et un lint qui compare `var(--groupe-nom)`. Le projet a un `tokens.css` écrit à la main, en palette + rôles, avec des **raccourcis `font`** (`--text-title-xl`) appariés à `-tracking`, sans échelle d'espacement, de rayon ni d'ombre. Il faut produire un `tokens.json` équivalent ou adapter `css-policy`.
4. **Points de rupture** : la doc (03 §7) attend 48rem/64rem dans `ALLOWED_MEDIA`. Le projet utilise **50.625rem**, 64rem, 80rem, 90rem et `@container 25rem`.
5. **Mise en avant** : le POC utilise des `*…*` (`withAccent`). Le projet n'a pas d'accent en texte : c'est un **champ séparé** (`getStarted.titleMuted`).
6. **Champs à valeur fermée** qui choisissent une classe CSS : `rating.platform`, `benefit.icon`, `post.category`. Ils ne doivent pas être « réécrits » comme du texte libre.
7. **Titres masqués** (`features.title`, `testimonial.title`) : pas de surface cliquable dans la preview.
8. **Retours à la ligne significatifs** (`pre-line`) : `performance.benefits[].title` (2 lignes au plus) et `faq.supportText`.
9. **Stega et `<VisualEditing/>`** sont déjà actifs en Draft Mode. Il faudra une preview de l'éditeur IA **sans stega et sans overlays**, par exemple un mode dédié du `site-draft`.
10. **Même application** pour le Studio (`/admin`) et le site (4040). Or le runner exige un **clone dédié**, distinct de cette copie de travail, pour `site/` et `site-draft/`.
11. **Pas de jeton d'écriture**, pas de dataset de test connu, `production` public.
12. **Pas d'infrastructure de test** (`npm test` inexistant), pas de `proxy.ts`.

---

## 7. Points sensibles

**À ne pas casser**

- **Studio embarqué** :
  - `src/app/admin/[[...tool]]/page.tsx` (`force-static`) et `sanity.config.ts` (`'use client'`, `basePath` tiré de `studioUrl`) ;
  - le layout racine ne doit **jamais** importer le CSS du site (il est partagé avec le Studio) ;
  - `app/not-found.tsx` est en styles en ligne pour la même raison.
- **Singleton** `dockSchedulingPage` :
  - `_id` fixe, utilisé dans `PAGE_QUERY` (l. 8), `presentation.ts:9`, `structure.ts:17` et `scripts/seed.ts:25` ;
  - les actions du Studio sont limitées (publish, discard, restore) ;
  - le champ `testimonial.item` est **à garder** : `PAGE_QUERY` le déréférence (`sections/testimonial.ts:5`).
- **Chaîne live et cache** :
  - `sanityFetch`/`SanityLive` (`live.ts`), `onContentChange`, et `onPublishFromAdmin` dans `admin/layout.tsx` ;
  - `npm run build` vide `.next/cache/fetch-cache` exprès : le cache de données survit aux builds (README:79-81).
- **Draft Mode** : la route `/api/draft-mode/enable` est appelée par Presentation ; `VisualEditing` et `DraftModeBanner` ne sont montés qu'en Draft Mode ; `Analytics` est coupé en Draft Mode.
- **Discipline stega** : `stegaClean()` partout où une valeur sert d'URL, de classe, de clé, d'id, de date ou de JSON-LD. Sans elle, les classes `styles[platform]` et `styles[icon]` deviennent `undefined` en Draft Mode et les liens sont faux. `stega: false` sur les métadonnées.
- **Types générés** : `src/sanity/types.ts` est régénéré par `npm run typegen`. Tout changement de schéma passe par `typegen` puis `typecheck`, et les seeds (`satisfies`) doivent rester valides.
- **Accessibilité voulue** : ids `<section>-title` et `aria-labelledby` (unicité à préserver si une section est dupliquée), `role="list"`, `hgroup`, `<details name>`, nom accessible des liens « See more » (`ConduitSystem.tsx:44-52`).
- **SEO** : le JSON-LD FAQPage (`Faq.tsx:60-64, 76-86`) ignore les questions sans réponse ; `seoTitle` et `seoDescription` sont requis ; le titre distinct des 404 sert au suivi GA4.

**Pièges**

- **Contenu LyonDrive encore en production** : 6 articles français sans catégorie et un document `home` de type inconnu. La section Insights de la page Conduit affiche ces articles français. `npm run cleanup:legacy` (suppression **définitive**) n'a pas été lancé.
- **README en partie périmé** :
  - l. 9-11 : « seules trois collections… le reste de la page est dans le code », alors que toute la page est dans Sanity ;
  - l. 127 : le seed « supprime l'ancienne démo », alors que c'est `cleanup:legacy` ;
  - l. 137 : `post = Blog, testimonial, faq` sans la page ;
  - l. 160 : résidu `# test-sanity-website`.
- **Section vide = section absente** (`page.tsx:44-54`) : un champ vidé dans un brouillon fait disparaître la section de la preview. Sans `page`, la page rend `null`.
- **Validation du schéma** : elle ne s'exécute que dans le Studio. Les `max` (60, 160, 45), les longueurs de tableau (3, 1–2, 1–5, ≤ 2) et la règle des « 2 lignes » sont **en avertissement ou dans le Studio seulement**. Une écriture par l'API les contourne.
- **Stega actif en Draft Mode** : il fausse les longueurs, les comparaisons et les mesures pour un futur éditeur IA.
- **Limite du cache** : une publication faite par l'API sans onglet ouvert laisse l'ancienne version en cache (pas de webhook).
- **Publication du seed** : `npm run seed` crée les 8 questions en `drafts.faq-N` ; `-- --force` **écrase** la page, le témoignage et la FAQ.
- **Jeton Viewer en navigateur** : `browserToken` est le même jeton, exposé au navigateur **en Draft Mode seulement** (`includeDrafts`). Un jeton d'écriture ne doit jamais prendre ce chemin.

**Dettes**

- Header et footer non dessinés. Visuels du Hero, de Features, de ConduitSystem et de CustomerStory encore en emplacements. Blog et article sans design.
- **Pas de tests**, pas de lint ni de formatage configurés.
- **Pas de Consent Mode v2** ni de bandeau cookies (README:105-106, `Analytics.tsx:14-15`).
- **`/bench` public**, y compris en production (pas de garde `NODE_ENV`, `robots: noindex` seulement). Il expose le formulaire `purgeSiteCache`.
- Les fonctions de `live-action.ts` (`'use server'`) sont des **server actions** appelables sans authentification. `onPublishFromAdmin` invalide des tags arbitraires.
- `next.config.ts` vide ; `--font-display` (« Suisse Int'l ») sans webfont sous licence ; logos d'intégrations en dur ; un seul dataset (`production`, public), sans dataset de test.
