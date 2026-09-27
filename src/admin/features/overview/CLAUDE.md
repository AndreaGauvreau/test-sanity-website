# features/overview (B1 · Overview) — LLM context

> Propriétaire : settings · Figma : B1 (docs/admin/figma/screens/B1.md, B1.ui.png) · Mis à jour : 2026-09-27

## Utilité

Page d'arrivée de l'admin (`/admin`, `src/app/admin/(shell)/page.tsx`), pour les trois rôles : état de production, contenus
en attente, consommation IA du mois, équipe, et le site publié dans un cadre de navigateur. Pas d'analytics ni d'alertes.
Le bouton « ✦ Ask AI » (G4) est dans la sidebar (shell / ask-ai), pas ici.

## Fichiers

- `Overview.tsx` — Server Component : en-tête, 4 cartes (Suspense par source), aperçu du site.
- `data.ts` — `server-only` : `loadPublishStatus` (engineFetch `publish/status`), `loadMonthUsage` (`getUsageSummary('month')`),
  `loadTeamCard` (features/team), `loadFrameability` (en-têtes du site public).
- `format.ts` — textes des cartes (`productionCard`, `contentCard`, `usageCard`), heures (`formatAgo`, `formatDayTime`),
  `publishFingerprint`. Pur.
- `frame.ts` — `canFrame(headers, parentOrigin, siteOrigin)` : X-Frame-Options et CSP frame-ancestors. Pur.
- `SitePreview.tsx` — client : barre de navigateur + iframe (chargement, chargé, indisponible, délai 15 s).
- `TimeText.tsx` — client : heure recalculée dans le fuseau du navigateur, chaque minute.
- `AutoRefresh.tsx` — client : sonde `engineClient.publish.status()` toutes les 20 s (onglet visible) → `router.refresh()` si l'état change.
- `overview.module.css`. Tests : `format.test.ts`, `frame.test.ts`, `SitePreview.test.tsx`.

## Contrats

- Entrées : `PublishStatus` (contracts/engine) via `engineFetch(session, 'GET', 'publish/status')` (moteur simulé en local) ;
  `UsageSummary.totals` de `core/usage` ; `loadTeamSummary` (features/team) ; `adminConfig.site` (domaine, URL publique).
- Sorties : aucune action ; composant `Overview({ session })` (la session reste côté serveur).

## Comportement (LLM context B1)

- Production (→ E2 Versions) : « Ready » + « Vercel · deployed today 14:02 » (« Local mode · … » sans hook Vercel) ;
  publication en cours « Building… » ; échec « Error » (rouge) + « Publish failed · the previous version is still live » ;
  moteur injoignable « Unavailable ».
- Content (→ E1 Publish) : « 3 changes » + « Unpublished · last publish 5 min ago » ; rien en attente « Up to date » +
  « Last publish 5 min ago ». N = `pending.total` (brouillons Sanity + modifications IA validées).
- AI usage this month (→ B5) : « $4.80 » + « 1.2M input · 147k output tokens » ; mois vide « $0.00 » + « 0 input · 0 output tokens ».
- Team (→ B4, client seulement ; Kuartz / editor : carte non cliquable) : « 4 members » + « 2 from Kuartz » ; session de
  dev : « — » + « Sign in with Sanity to see the team » ; refus Sanity : « Managed in Sanity ».
- Aperçu : iframe du site public (`adminConfig.site.url`), barre « conduit.com » + « Published site » ; le serveur lit les
  en-têtes du site (HEAD, GET si refusé, 4 s) : refus d'iframe → « Preview unavailable » + « Open conduit.com ↗ ».
  Placeholder « Live preview of conduit.com » pendant le chargement, fondu 250 ms ease-out à l'arrivée.
- Rafraîchi à l'ouverture et après une publication (AutoRefresh). Chaque carte a son squelette et échoue seule.

## Forces

- Aucune source ne bloque les autres (Suspense + erreurs converties en cartes « muted »).
- Heures testées dans un fuseau fixe ; en-têtes d'iframe testés (CSP prioritaire, jokers, 'self').
- Rendu comparé au Figma à 1440 × 900 : cartes 268 × 110, aperçu jusqu'à 40 px du bas.

## Faiblesses et limites connues

- Production ne lit pas l'API Vercel (le Figma le propose) : elle déduit l'état du moteur (`deploy.mode`, `lastPublishedAt`,
  `state`, `run`). Un déploiement Vercel lancé hors de l'admin n'apparaît pas.
- L'aperçu charge la page d'accueil entière à chaque ouverture ; en local il montre le site de dev (l'indicateur Next y
  apparaît) et `favicon.ico` du site répond 404 (FOLLOWUPS n° 9, hors module).
- Pas de `sandbox` sur l'iframe : même origine que l'admin en production, `allow-scripts allow-same-origin` ne protégerait
  rien et Chrome l'affiche en avertissement.
- AutoRefresh sonde le relais toutes les 20 s tant que l'écran est ouvert.

## Points sensibles

- `requireSession()` en première ligne de la page ; la `Session` (avec le jeton) ne va qu'aux Server Components ; les
  composants client ne reçoivent que des textes, des URL et l'empreinte de publication.
- `loadFrameability` ne contacte que `adminConfig.site.url` (configuration), jamais une URL venue de la requête.

## Pièges

- Une fonction exportée d'un fichier `'use client'` n'est pas appelable côté serveur (`publishFingerprint` vit dans format.ts).
- `Date.now()` au rendu serveur puis `TimeText` côté client : `suppressHydrationWarning` sur `<time>` (fuseaux différents).

## Comment modifier

- Nouvelle carte : modèle dans `format.ts` (+ test), chargement dans `data.ts`, `<Card>` sous Suspense dans `Overview.tsx`.
- Changer les cibles des cartes : `href` dans `Overview.tsx`.

## Tests

`npx vitest run src/admin/features/overview` — heures, 4 cartes et leurs états, empreinte, `canFrame`, aperçu jsdom
(chargement, chargé, refus, délai). À la main : `/admin` dans les trois rôles (`POST /admin/api/auth/dev-role`),
scénarios du moteur simulé de publish-ui pour Building / Error.

## Décisions et « À trancher »

- Cartes cliquables (proposé par le Figma) : Production → E2, Content → E1, AI usage → B5, Team → B4 (client seulement).
- « Up to date » : aide courte « Last publish … » (la phrase longue passait sur deux lignes à 1440 px).

## Demandes de contrat

- **orchestrateur (contrat `engine.ts`)** : pour la carte Production fidèle au Figma (API Vercel), ajouter à `PublishStatus.deploy`
  un `lastDeployment?: { state: 'ready' | 'building' | 'error'; at: string; url?: string }` fourni par le moteur.
