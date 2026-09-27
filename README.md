# sanity-test — Next.js + Sanity, sans Payload

Banc d'essai Sanity, passé de la démo LyonDrive (le même site que
`../payloadjs-test/payload-car-test`) à un vrai cas : la page « Dock Scheduling » de Conduit,
intégrée section par section depuis le Figma
[Get Conduit — client](https://www.figma.com/design/8kB82qwpBhg1uykFYdmdG0/Get-Conduit---client?node-id=269-176).
Deux outils d'édition, dans la même app Next :
- **l'admin du client**, sur `/admin` (`src/admin/`, en construction : voir `docs/admin/ARCHITECTURE.md`),
  avec l'éditeur IA ;
- **le Studio Sanity**, déplacé sur `/studio` : l'outil de Kuartz. Son bouton « Publish » publie un
  texte sans le code de l'éditeur IA qui va avec : le client publie depuis l'admin.

Tous les textes de la page sont dans Sanity (document unique `dockSchedulingPage`, une section par
champ), ainsi que les réglages du site (`siteSettings` : SEO par défaut, favicons, scripts), la page
Blog et le SEO des articles. Modèle de contenu et migrations : `src/sanity/CLAUDE.md`. Header et
footer sont des emplacements gris, pas encore dessinés.

| | |
| --- | --- |
| Site | http://localhost:4040 |
| Admin du client | http://localhost:4040/admin |
| Studio Sanity embarqué (Kuartz) | http://localhost:4040/studio |
| Mesures de lecture | http://localhost:4040/bench |
| Studio en ligne (mobile) | https://kuartz-sanity-test.sanity.studio |
| Studio séparé en local (optionnel) | `npm run studio` → http://localhost:3333 |
| Projet Sanity | `dwa2djm3` (« Kuartz Studio »), datasets `production` (public) et `development` (copie de travail, utilisée en local) |

Connexion au Studio : **Google** (le compte du projet), pas GitHub.
Port 4040, lié à `127.0.0.1` comme le reste de `~/Tools` (les tests Payload occupent 4000–4029).

## Démarrer

```bash
npm install          # déjà fait
npm run dev          # http://localhost:4040
```

Première fois seulement (déjà fait lors du setup) :

```bash
npx sanity login                                             # CLI connectée au compte du projet
npx sanity cors add http://localhost:4040 --credentials      # le navigateur a le droit de parler à Sanity
npx sanity tokens create "Next.js preview" --role viewer     # → SANITY_API_READ_TOKEN dans .env.local
npx sanity exec scripts/migrate-admin.ts --with-user-token -- --demo   # dataset development seulement
```

## Ce qu'il y a à tester

**Studio** — `/studio`, connexion Google (outil de Kuartz ; le client utilise `/admin`).
- *Contenu* : Blog, Témoignages, FAQ. Brouillon ↔ publié, historique, collaboration en
  temps réel (ouvre deux onglets sur le même document).
- *Aperçu live* : le site dans l'admin. Les brouillons s'affichent pendant la frappe,
  survol + clic sur un texte du site → le bon champ s'ouvre.
- *Médias* : tous les assets, réutilisables d'un article à l'autre (≈ collection `media` de Payload).
- *GROQ* : bac à sable de requêtes.

Le Studio en ligne (`*.sanity.studio`, pour le téléphone) a tout sauf l'aperçu live : il ne
peut pas afficher un site qui tourne sur `localhost`.

**Mise à jour du site** — ouvre un article dans un onglet, publie une modif dans l'admin :
la page ouverte se met à jour seule en quelques secondes (pastille « Live » sur `/bench`).
`npm run touch` publie une modif sans passer par l'admin (comme depuis le téléphone) sur la
première question de la FAQ, `npm run touch -- reset` l'annule.

Le cache se voit mieux en build de prod :

```bash
npm run prod     # build + start sur le même port
```

En prod, la ligne « HTML généré par le serveur à … » en bas de page ne bouge plus quand
on recharge (la page sort du cache), puis change juste après une publication.

`SANITY_LIVE_MODE=swr` dans `.env.local` rebranche le comportement par défaut de
next-sanity 13, pour comparer (en `npm run prod` seulement, en dev il est instantané aussi) :
l'onglet ouvert ne bouge pas, et le rechargement suivant montre la nouvelle version.

**À savoir sur le cache** — les pages gardent leurs données jusqu'à ce qu'une publication
les invalide, et l'invalidation passe par un onglet ouvert : un onglet du site, ou le Studio
embarqué `/studio` (qui écoute aussi). Une publication faite ailleurs (Studio en ligne depuis
le téléphone, `npm run touch`, API) alors qu'aucun onglet n'est ouvert laisse l'ancienne
version en cache, sauf appel à **`POST /api/revalidate`** (en-tête `x-kz-revalidate` =
`REVALIDATE_SECRET` ; c'est ce que fait le moteur de l'admin après Publish, et ce que ferait un
webhook Sanity) ; sinon bouton **« Vider le cache du site »** sur `/bench`.

Autre piège : ce cache de données (`.next/cache/fetch-cache`) survit aux builds. Un build
peut donc reprendre des lectures d'un build précédent (vécu pendant le setup : blog vide
après l'import du contenu). `npm run build` le vide avant chaque build.

**Images** — les visuels de démo sont en 2400×1600 (3:2), le site les affiche en 1200×630 :
- déplace le point focal (hotspot) d'une image dans l'admin : le cadrage du site suit ;
- `/bench` compare le poids de l'original et des versions transformées par le CDN (AVIF/WebP, 800/1600 px) ;
- le flou pendant le chargement (LQIP) est calculé par Sanity à l'upload.

**Vitesse de lecture** — `/bench` mesure à chaque chargement, depuis le serveur :
API CDN, API directe, cache de données Next et `sanityFetch` ; plus un bouton pour mesurer
depuis ton navigateur.

## Analytics (GTM + GA4)

Google Tag Manager `GTM-KK83GHRF`, qui charge GA4 `G-DE4VPDJ8CS` (Google Tag sur
« Initialization - All Pages », mesure améliorée activée). Code : `src/components/Analytics.tsx`.

- Chargé seulement sur le **déploiement de production Vercel** (`VERCEL_ENV=production`) :
  rien en dev, rien sur les previews. Pour tester en local : `ENABLE_ANALYTICS=true` puis
  `npm run prod` (la valeur est lue au build).
- Seulement sur le **site** : ni sur `/admin` ni `/studio`, ni dans l'aperçu live (Draft Mode), ni dans l'aperçu de l'éditeur IA (`KZ_EDITOR_PREVIEW=1`).
- Pas de gtag.js en plus de GTM (sinon chaque `page_view` compte double). Les navigations
  internes de Next sont comptées par la mesure améliorée de GA4 (changements d'historique) :
  un `page_view` par page, vérifié.
- Les 404 remontent avec un titre distinct (« Page introuvable » / « Article introuvable »).
- **Pas encore de bandeau cookies ni de Consent Mode v2** : obligatoire avant un vrai site
  public en France (CNIL). Le consentement par défaut devra être posé avant GTM, dans `Analytics.tsx`.

## Mesuré pendant le setup (25/09/2026, Mac en local, Sanity depuis la France)

| | |
| --- | --- |
| Page servie depuis le cache Next (`npm run prod`) | ~15 ms (TTFB) |
| Page régénérée après une publication (1re visite) | ~0,7–0,9 s, puis de nouveau ~15 ms |
| Publication → page ouverte à jour (sans recharger) | 2 à 5 s |
| Requête du blog, API CDN (médiane, depuis le serveur) | ~45 ms |
| Même requête, API directe | ~260 ms (dont ~6 ms d'exécution chez Sanity) |
| Image 2400×1600 : original JPEG → AVIF 800 px | ~600 Ko → ~6 Ko |

## Scripts

| Script | Rôle |
| --- | --- |
| `npm run dev` | site + admin + Studio en dev, port 4040 |
| `npm run prod` | build de production (cache de données vidé) + serveur |
| `npm run studio` | le même Studio hors de Next (port 3333), aperçu live sur le site local |
| `npm run deploy:studio` | met en ligne le Studio sur `kuartz-sanity-test.sanity.studio` (login Sanity requis pour y accéder) |
| `npm run seed` | ajoute le contenu tiré du Figma (page, témoignage, FAQ) ; `-- --force` écrase tes modifs sur ces documents. Refuse le dataset production |
| `npx sanity exec scripts/migrate-admin.ts --with-user-token` | migration du modèle pour l'admin (SEO, ordre manuel, réglages) ; `-- --demo` ajoute le blog de démonstration ; `-- --dry-run`. Refuse le dataset production |
| `npm run cleanup:legacy` | supprime la démo LyonDrive. Refuse le dataset production |
| `npm run touch` | publie une modif de test hors du Studio (`-- reset` pour annuler). Refuse le dataset production |
| `npm run typegen` | schéma → types TypeScript des requêtes GROQ (`src/sanity/types.ts`) |
| `npm run typecheck` | vérification TypeScript |

## Où est quoi

```
sanity.config.ts            Studio (/studio) : outils, aperçu live
sanity.cli.ts               CLI : projet, déploiement, typegen
src/sanity/schemaTypes/     modèle de contenu (réglages, pages, SEO, post, testimonial, faq, aiUsage) — src/sanity/CLAUDE.md
src/sanity/lib/             client, live (sanityFetch + SanityLive), images, requêtes GROQ
src/app/(site)/             le site + /bench — src/app/(site)/CLAUDE.md (métadonnées, scripts, aperçu de l'éditeur)
src/styles/                 tokens (couleurs, styles de texte, mise en page) et base CSS
src/components/sections/    les sections de la page, une par dossier (CSS Module + assets)
src/components/ui/          composants partagés (Button, Eyebrow, PostCard)
src/admin/ · src/app/admin/ l'admin du client (docs/admin/ARCHITECTURE.md)
src/admin.config.ts         manifeste du site pour l'admin (pages, sections, collections)
src/editor/                 zones de l'éditeur IA (zones.json) et ses règles
src/app/studio/             le Studio embarqué (+ son écoute des publications)
src/app/api/draft-mode/     entrée/sortie du mode brouillon (aperçu live)
src/app/api/revalidate/     POST protégé : vide le cache après une publication
scripts/                    seed, migration de l'admin, démo, touch, captures de référence (site-baseline)
```

## Différences avec le test Payload

| | Payload (payload-admin-test) | Sanity (ce projet) |
| --- | --- | --- |
| Données | SQLite locale, dans l'app | Content Lake hébergé par Sanity (API + CDN) |
| Admin | `/admin`, rendu par Payload | `/studio`, Sanity Studio (app React côté navigateur) ; aussi hébergeable à part. `/admin` : admin propre du client |
| Schéma | collections TS, migrations DB | schémas TS, aucune migration : le contenu est du JSON |
| Texte riche | Lexical → HTML | Portable Text (JSON), rendu par des composants React |
| Images | fichiers + sharp côté serveur | CDN d'images, transformations par l'URL, hotspot |
| Lecture du site | `fetch` REST en `no-store` à chaque requête | pages en cache Next, invalidées par le Live Content API |
| Aperçu | live preview Payload | Presentation : brouillons + clic-pour-éditer |
| Multi-site | plugin multi-tenant (`Sites`) | pas fait ici : un dataset par site, ou plusieurs *workspaces* dans le Studio |
