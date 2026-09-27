# features/usage — LLM context

> Propriétaire : code-usage · Figma : B5 (docs/admin/figma/screens/B5.md), fiches AIUsage, ModelUsage · Mis à jour : 2026-09-27
> Possède aussi : `src/app/admin/(shell)/settings/usage/` (page, loading). Données : `src/admin/core/usage/` (même propriétaire).

## Utilité
B5 · Site Settings › Usage, pour Kuartz, le client admin et l'editor (toute session) : ce que l'IA a consommé sur le compte
Claude du site — par période, par fonctionnalité et par modèle, en jetons et en $. Lecture seule. Jamais de crédits,
de solde, de plafond ni d'alerte.

## Fichiers
- `UsageScreen.tsx` — Server Component : Page header, carte AI usage, carte Since launch (StatCard), carte Recent requests (Table).
- `UsagePeriodCard.tsx` — client : `AIUsage` du kit, période → `?period=` (router.replace), chargement pendant la transition.
- `UsageSkeleton.tsx` — état de chargement (route `loading.tsx`). `UsageLoadError.tsx` — journal illisible.
- `format.ts` — `formatWhen` (Today 14:12 · Yesterday · Sep 24), `formatDay`, `requestText`, `statusNote`.
- `Usage.module.css`. Tests : `format.test.ts`, `UsageScreen.test.tsx`.

## Contrats
- Entrées : `getUsageOverview({ period, limit })` de core/usage (résumé de la période, résumé all-time, lignes).
  URL : `?period=month|3-months|all-time` (month par défaut, valeur inconnue → month), `?limit=1..500` (50).
- Sorties : aucune écriture. Seules des données agrégées (nom et rôle de l'auteur, jamais d'e-mail ni de jeton) vont au client.

## Comportement
- AI usage : totaux Input tokens / Output tokens / Cost, une ligne par fonctionnalité avec son modèle (ModelUsage),
  note « Billed on the site's own Claude API account. Kuartz doesn't resell AI. ». Vide : « No AI usage in this period. ».
- Since launch : coût total, « 4.9M input · 560k output tokens · since Sep 2, 2026 » (date de la première demande) ;
  sans demande : « $0.00 » et « No AI requests yet. ».
- Recent requests (période choisie, plus récente en haut) : When · Who (avatar bleu Kuartz / vert client) · Feature (Tag
  info « AI editor », neutre « Ask AI ») · Request (texte, ou repli « Edit on / » / « Question », « · Failed » etc. si rien
  n'a changé) · Model · Input · Output · Cost (« ~$0.50 » + « (estimated) » lu si le coût est estimé). Vide : « No AI usage in this period. ».
  Plus de lignes que la limite : « Showing 50 of N requests » + « Show more » (+50, 500 au plus).
- Chargement : `loading.tsx` (cartes à « — ») ; changement de période : carte AI usage en chargement. Erreur Sanity : message dans l'écran.

## Forces
- Rendu comparé au Figma B5 à 1440 × 900 (positions des cartes et des lignes identiques à quelques px) avec un jeu de
  données de test monté temporairement (jamais écrit dans Sanity).
- Une seule lecture du journal par affichage ; chiffres formatés par le contrat (mêmes qu'en B1, D, G4).

## Faiblesses et limites connues
- Colonne Request : le journal ne porte pas le texte de la demande (voir core/usage, Demandes de contrat).
- Heures affichées dans le fuseau du serveur qui rend la page (local : celui de la machine).
- Pagination simple par `?limit=` (pas de défilement infini).

## Points sensibles
- `requireSession()` EN PREMIER dans la page ; core/usage revérifie la session.
- Ne jamais ajouter de jauge, plafond, alerte ou « crédits » (règle Figma B5).

## Pièges
- `searchParams` est une Promise (Next 16) ; `error.js` de Next 16 reçoit `retry` (pas `reset`) — ici les erreurs de
  lecture sont gérées dans la page (try/catch), sans error boundary.
- `AIUsage` est un composant client : les valeurs de période viennent du Server Component, pas du Select.

## Comment modifier
- Nouvelle colonne : `UsageRow` (core/usage/aggregate.ts, projection de `USAGE_QUERY`) puis `UsageScreen`.
- Changer le pas de « Show more » : `nextLimit` dans `UsageScreen`.

## Tests
`npx vitest run src/admin/features/usage src/admin/core/usage` — formats (fuseaux, années), rendu (cartes, tableau, statut,
coût estimé, état vide, Show more, changement de période → URL). À la main : `/admin/settings/usage` en kuartz et client
(le dataset development n'a pas de `aiUsage` : état vide).

## Décisions et « À trancher »
- Question 12 : journal = un document Sanity privé par demande (orchestrateur).
- Accès : toute session (Kuartz, client, editor) — aucun droit dédié dans `roles.ts`.

## Demandes de contrat
- Voir `src/admin/core/usage/CLAUDE.md` (`AiUsageDoc.request`, `AdminConfig.site.launchedAt`).
