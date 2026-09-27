# features/usage — LLM context

> Propriétaire : code-usage · Figma : B5 (docs/admin/figma/screens/B5.md), fiches AIUsage, ModelUsage · Mis à jour : 2026-09-27
> Possède aussi : `src/app/admin/(shell)/settings/usage/` (page, loading). Données : `src/admin/core/usage/` (même propriétaire).

## Utilité
B5 · Site Settings › Usage, pour Kuartz, le client admin et l'editor (toute session) : ce que l'IA a consommé sur le compte
Claude du site — par période, par fonctionnalité et par modèle, en jetons et en $. Lecture seule. Jamais de crédits,
de solde, de plafond ni d'alerte.

## Fichiers
- `UsageScreen.tsx` — Server Component : Page header, carte AI usage, carte Since launch (StatCard), carte Claude
  connection (si `claudeConnection`), carte Recent requests (Table).
- `ClaudeConnectionCard.tsx` + `ClaudeConnection.module.css` — client : carte « Claude connection » (accès du moteur à
  Claude, sans maquette) ; `ClaudeConnectionCard.test.tsx` (faux client du moteur).
- `UsagePeriodCard.tsx` — client : `AIUsage` du kit, période → `?period=` (router.replace), chargement pendant la transition.
- `UsageSkeleton.tsx` — état de chargement (route `loading.tsx`). `UsageLoadError.tsx` — journal illisible.
- `format.ts` — `formatWhen` (Today 14:12 · Yesterday · Sep 24), `formatDay`, `sinceLaunchHint`, `requestText`, `statusNote`.
- `Usage.module.css`. Tests : `format.test.ts`, `UsageScreen.test.tsx`.

## Contrats
- Entrées : `getUsageOverview({ period, limit })` de core/usage (résumé de la période, résumé all-time, lignes) ;
  `adminConfig.site.launchedAt` (contrat `AdminConfig.site`, facultatif, rempli par site-adapter) passé par la page à
  `UsageScreen` (`launchedAt`).
  URL : `?period=month|3-months|all-time` (month par défaut, valeur inconnue → month), `?limit=1..500` (50).
- Sorties : aucune écriture Sanity. Seules des données agrégées (nom et rôle de l'auteur, jamais d'e-mail ni de jeton) vont au client.
- Carte Claude connection : `engineClient.claude.{access, save, test, clear}` (relais, routes `/claude/access*` du contrat,
  droit `ai.access` = Kuartz et client). La page passe `claudeConnection = { adminLocal }` seulement avec `ai.access`
  (`adminLocal` = hôte 127.0.0.1 / localhost, `isLocalHost(requestHost(headers()))`).

## Comportement
- AI usage : totaux Input tokens / Output tokens / Cost, une ligne par fonctionnalité avec son modèle (ModelUsage),
  note « Billed on the site's own Claude API account. Kuartz doesn't resell AI. ». Vide : « No AI usage in this period. ».
- Since launch : coût total, « 4.9M input · 560k output tokens · online since Sep 2, 2026 » (date de mise en ligne du
  manifeste, `launchedAt`) ; sans `launchedAt` (ou invalide) : « … · since Sep 10, 2026 » (première demande). Sans
  demande : « $0.00 » et « No AI requests yet. » (« No AI requests yet · online since … » si la mise en ligne est connue).
  Une date seule (« 2026-09-02 ») est lue en UTC (jamais décalée d'un jour par le fuseau du serveur).
- Recent requests (période choisie, plus récente en haut) : When · Who (avatar bleu Kuartz / vert client) · Feature (Tag
  info « AI editor », neutre « Ask AI ») · Request (`AiUsageDoc.request`, ≤ 120 car., écrit par le moteur ; repli
  « Edit on / » / « Question » pour les demandes journalisées sans ce champ ; « · Failed » etc. si rien n'a changé) · Model · Input · Output · Cost (« ~$0.50 » + « (estimated) » lu si le coût est estimé). Vide : « No AI usage in this period. ».
  Plus de lignes que la limite : « Showing 50 of N requests » + « Show more » (+50, 500 au plus).
- Chargement : `loading.tsx` (cartes à « — ») ; changement de période : carte AI usage en chargement. Erreur Sanity : message dans l'écran.
- Claude connection (Kuartz et client ; l'editor ne la voit pas) : en-tête « Claude connection » + « Local engine » /
  « Production » + Tag d'état (Checking… · Not connected · Not tested · Testing… · Connected · Connection error).
  LOCAL (moteur `subscriptionAllowed` ET admin sur localhost) : rangée « Use my Claude subscription » (connexion Claude Code
  de la machine, rien à coller) ; machine non connectée : Callout avec la marche à suivre (`claude` puis `/login`) ;
  « Use an API key instead » ouvre le champ. PRODUCTION : champ « Anthropic API key » (password, vide, autocomplete off,
  vidé dès l'envoi ; `claudeApiKeyProblem` du contrat refuse `sk-ant-oat…` et les clés incomplètes AVANT l'envoi) →
  « Save and test ». Ensuite seulement « Connected · sk-ant-…XXXX » (« API key · … » si le test a échoué), Replace,
  Disconnect. ANTHROPIC_API_KEY dans l'env du moteur : Callout « takes priority ». Test automatique après chaque
  enregistrement + bouton « Test connection » ; pied « Last test: Today 14:12 — … » ; échec : Callout d'erreur lisible.
  Moteur injoignable : Callout d'erreur + Retry.

## Forces
- Rendu comparé au Figma B5 à 1440 × 900 (positions des cartes et des lignes identiques à quelques px) avec un jeu de
  données de test monté temporairement (jamais écrit dans Sanity).
- Une seule lecture du journal par affichage ; chiffres formatés par le contrat (mêmes qu'en B1, D, G4).

## Faiblesses et limites connues
- Colonne Request : vide (repli « Edit on … » / « Question ») tant que le moteur n'écrit pas `AiUsageDoc.request`
  (FOLLOWUPS #16 / #27, engine-publish) et que le schéma `aiUsage` n'a pas le champ (#28, site-adapter).
- « online since » absent tant que site-adapter n'a pas rempli `launchedAt` dans `admin.config.ts` (FOLLOWUPS #28).
- Heures affichées dans le fuseau du serveur qui rend la page (local : celui de la machine).
- Pagination simple par `?limit=` (pas de défilement infini).

## Points sensibles
- `requireSession()` EN PREMIER dans la page ; core/usage revérifie la session.
- Ne jamais ajouter de jauge, plafond, alerte ou « crédits » (règle Figma B5).
- Clé API : jamais pré-remplie, jamais gardée dans l'état après l'envoi, jamais affichée (seulement `keyHint`), jamais
  envoyée ailleurs qu'au relais `/admin/api/engine/claude/access` (POST).

## Pièges
- `searchParams` est une Promise (Next 16) ; `error.js` de Next 16 reçoit `retry` (pas `reset`) — ici les erreurs de
  lecture sont gérées dans la page (try/catch), sans error boundary.
- `AIUsage` est un composant client : les valeurs de période viennent du Server Component, pas du Select.
- `adminConfig.site` est typé par son littéral (sans `launchedAt` tant que site-adapter ne l'a pas écrit) : la page le lit
  à travers le type du contrat (`const site: AdminConfig['site'] = adminConfig.site`).

## Comment modifier
- Nouvelle colonne : `UsageRow` (core/usage/aggregate.ts, projection de `USAGE_QUERY`) puis `UsageScreen`.
- Changer le pas de « Show more » : `nextLimit` dans `UsageScreen`.
- Texte de la carte Since launch : `sinceLaunchHint` (format.ts) + `format.test.ts`.

## Tests
`npx vitest run src/admin/features/usage src/admin/core/usage` — carte Claude connection (local / production, abonnement,
clé envoyée une fois et jamais affichée, sk-ant-oat refusé avant envoi, échec du test, clé de l'environnement, moteur
injoignable) ; formats (fuseaux, années, « online since » avec ou sans
`launchedAt`), rendu (cartes, tableau, statut, coût estimé, état vide, Show more, changement de période → URL). À la main : `/admin/settings/usage` en kuartz et client
(le dataset development n'a pas de `aiUsage` : état vide).

## Décisions et « À trancher »
- Question 12 : journal = un document Sanity privé par demande (orchestrateur).
- En-tête : `PageHeader` du kit (le Figma B5 utilise un « Page header », pas un Section header) — `SectionHeader
  headingLevel={1}` ne s'applique qu'à B3 (FOLLOWUPS #40, vérifié le 2026-09-27).
- Accès : toute session (Kuartz, client, editor) — aucun droit dédié dans `roles.ts` pour la consommation ; la carte
  Claude connection exige `ai.access` (Kuartz et client), ajouté au contrat le 2026-09-27.
- Carte Claude connection placée entre les deux cartes du haut et Recent requests (pas de maquette : composants du kit).
- « Since launch » : le COÛT reste le cumul de toutes les demandes (y compris avant la mise en ligne) ; seule la date
  affichée vient de `launchedAt` (FOLLOWUPS #33).

## Demandes de contrat
- Aucune (contrats `AiUsageDoc.request` et `AdminConfig.site.launchedAt` faits). Reste chez les autres : écriture de
  `request` (engine-publish, #27), schéma `aiUsage.request` et valeur de `launchedAt` (site-adapter, #28).
