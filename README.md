# sanity-test — Next.js + Sanity, sans Payload

Le même site que `../payloadjs-test/payload-car-test` (LyonDrive : accueil + blog), mais
avec Sanity à la place de Payload : l'admin est un Sanity Studio monté **dans** l'app Next,
sur `/admin`, comme l'admin de Payload.

| | |
| --- | --- |
| Site | http://localhost:4040 |
| Admin (Studio embarqué) | http://localhost:4040/admin |
| Mesures de lecture | http://localhost:4040/bench |
| Admin en ligne (mobile) | https://kuartz-sanity-test.sanity.studio |
| Admin séparé en local (optionnel) | `npm run studio` → http://localhost:3333 |
| Projet Sanity | `dwa2djm3` (« Kuartz Studio »), dataset `production` (public) |

Connexion à l'admin : **Google** (le compte du projet), pas GitHub.
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
npm run seed                                                 # contenu de démo
```

## Ce qu'il y a à tester

**Admin** — `/admin`, connexion Google.
- *Contenu* : la page d'accueil (document unique) et les articles. Brouillon ↔ publié,
  historique, collaboration en temps réel (ouvre deux onglets sur le même article).
- *Aperçu live* : le site dans l'admin. Les brouillons s'affichent pendant la frappe,
  survol + clic sur un texte du site → le bon champ s'ouvre.
- *Médias* : tous les assets, réutilisables d'un article à l'autre (≈ collection `media` de Payload).
- *GROQ* : bac à sable de requêtes.

L'admin en ligne (`*.sanity.studio`, pour le téléphone) a tout sauf l'aperçu live : il ne
peut pas afficher un site qui tourne sur `localhost`.

**Mise à jour du site** — ouvre un article dans un onglet, publie une modif dans l'admin :
la page ouverte se met à jour seule en quelques secondes (pastille « Live » dans l'en-tête).
`npm run touch` publie une modif sans passer par l'admin (comme depuis le téléphone),
`npm run touch -- reset` l'annule.

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
les invalide, et l'invalidation passe par un onglet ouvert : un onglet du site, ou l'admin
embarqué `/admin` (qui écoute aussi). Une publication faite ailleurs (admin en ligne depuis
le téléphone, `npm run touch`, API) alors qu'aucun onglet n'est ouvert laisse l'ancienne
version en cache : bouton **« Vider le cache du site »** sur `/bench`. En production, c'est le
rôle d'une Sanity Function ou d'un webhook qui appelle le site.

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
- Seulement sur le **site** : ni sur `/admin`, ni dans l'aperçu live (Draft Mode).
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
| `npm run dev` | site + admin en dev, port 4040 |
| `npm run prod` | build de production (cache de données vidé) + serveur |
| `npm run studio` | le même admin hors de Next (port 3333), aperçu live sur le site local |
| `npm run deploy:studio` | met en ligne l'admin sur `kuartz-sanity-test.sanity.studio` (login Sanity requis pour y accéder) |
| `npm run seed` | remet le contenu de démo (écrase tes modifs et brouillons sur ces documents) |
| `npm run touch` | publie une modif de test hors de l'admin (`-- reset` pour annuler) |
| `npm run typegen` | schéma → types TypeScript des requêtes GROQ (`src/sanity/types.ts`) |
| `npm run typecheck` | vérification TypeScript |

## Où est quoi

```
sanity.config.ts            admin : outils, singleton, aperçu live
sanity.cli.ts               CLI : projet, déploiement, typegen
src/sanity/schemaTypes/     modèles de contenu (home, post)
src/sanity/lib/             client, live (sanityFetch + SanityLive), images, requêtes GROQ
src/app/(site)/             le site (même CSS que payload-car-test) + /bench
src/app/admin/              l'admin embarqué (+ son écoute des publications)
src/app/api/draft-mode/     entrée/sortie du mode brouillon (aperçu live)
scripts/                    seed (contenu de démo), touch (publication de test)
```

## Différences avec le test Payload

| | Payload (payload-admin-test) | Sanity (ce projet) |
| --- | --- | --- |
| Données | SQLite locale, dans l'app | Content Lake hébergé par Sanity (API + CDN) |
| Admin | `/admin`, rendu par Payload | `/admin`, Sanity Studio (app React côté navigateur) ; aussi hébergeable à part |
| Schéma | collections TS, migrations DB | schémas TS, aucune migration : le contenu est du JSON |
| Texte riche | Lexical → HTML | Portable Text (JSON), rendu par des composants React |
| Images | fichiers + sharp côté serveur | CDN d'images, transformations par l'URL, hotspot |
| Lecture du site | `fetch` REST en `no-store` à chaque requête | pages en cache Next, invalidées par le Live Content API |
| Aperçu | live preview Payload | Presentation : brouillons + clic-pour-éditer |
| Multi-site | plugin multi-tenant (`Sites`) | pas fait ici : un dataset par site, ou plusieurs *workspaces* dans l'admin |
# test-sanity-website
