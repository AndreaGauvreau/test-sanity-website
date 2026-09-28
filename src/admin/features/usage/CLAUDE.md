# features/usage — LLM context

> Propriétaire : code-usage · Figma : B5 (docs/admin/figma/screens/B5.md), fiches AIUsage, ModelUsage · Mis à jour : 2026-09-28 (carte AI settings pour toute l'IA du site + Haiku 4.5, FOLLOWUPS #47 ; coût facturé / inclus dans l'abonnement Claude)
> Possède aussi : `src/app/admin/(shell)/settings/usage/` (page, loading). Données : `src/admin/core/usage/` (même propriétaire).

## Utilité
B5 · Site Settings › Usage, pour Kuartz, le client admin et l'editor (toute session) : ce que l'IA a consommé sur le compte
Claude du site — par période, par fonctionnalité et par modèle, en jetons et en $. Lecture seule. Jamais de crédits,
de solde, de plafond ni d'alerte.

## Fichiers
- `UsageScreen.tsx` — Server Component : Page header, carte AI usage, carte Since launch (StatCard), carte Claude
  connection (si `claudeConnection`), carte AI settings (si `aiSettings`), carte Recent requests (Table).
- `ClaudeConnectionCard.tsx` + `ClaudeConnection.module.css` — client : carte « Claude connection » (accès du moteur à
  Claude, sans maquette) ; `ClaudeConnectionCard.test.tsx` (faux client du moteur).
- `AiSettingsCard.tsx` + `AiSettings.module.css` — client : carte « AI settings » (modèle et niveau de réflexion de
  TOUTE l'IA du site : éditeur IA et Ask AI ; sans maquette) ; `AiSettingsCard.test.tsx` (faux client du moteur).
  Exporte `AI_SETTINGS_TEXT`, `EFFORT_HELP`, `noEffortHelp`, `priceHint`, `settingsLabel`.
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
- Carte AI settings : `engineClient.claude.{settings, saveSettings}` (routes `/claude/settings`, droit `ai.access`) ; la page
  passe `aiSettings = can(role, 'ai.access')`. Modèles, capacité et phrase : `AI_MODELS` (`supportsEffort`, `hint`),
  `aiModelOf`, `modelSupportsEffort` ; niveaux : `AI_EFFORTS` du contrat ; prix : `priceOf` de
  `core/contracts/pricing.ts` (même table que le coût estimé du moteur) ; libellés : `modelLabel`.

## Comportement
- Coût FACTURÉ / INCLUS (partout dans B5) : une demande passée par l'abonnement Claude (`access: 'subscription'`, moteur
  local) n'est pas facturée ; son coût (prix de l'API) n'est JAMAIS additionné à « Cost » ni à « Since launch ». Ancien
  document sans `access` : facturé, comme avant.
- AI usage : totaux Input tokens / Output tokens (tout) / Cost (facturé seulement) ; s'il y a de l'abonnement, une ligne
  sous les totaux « ≈ $0.30 at API prices — included in your Claude subscription » ; une ligne par fonctionnalité avec
  son modèle (ModelUsage : « $4.30 », « Included », « $0.10 + included ») ; note selon le cas (`aiUsageNote` du kit) :
  facturé « Billed on the site's own Claude API account. Kuartz doesn't resell AI. », abonnement seul « Used through
  your Claude subscription on the local engine: not billed. Kuartz doesn't resell AI. », mélange « Cost is billed on
  the site's own Claude API account; use through your Claude subscription isn't. Kuartz doesn't resell AI. ».
  Vide : « No AI usage in this period. ».
- Since launch : coût FACTURÉ total, « 4.9M input · 560k output tokens · online since Sep 2, 2026 » (date de mise en ligne du
  manifeste, `launchedAt`) ; sans `launchedAt` (ou invalide) : « … · since Sep 10, 2026 » (première demande). Sans
  demande : « $0.00 » et « No AI requests yet. » (« No AI requests yet · online since … » si la mise en ligne est connue).
  Une date seule (« 2026-09-02 ») est lue en UTC (jamais décalée d'un jour par le fuseau du serveur). Part abonnement :
  seconde ligne « ≈ $0.30 at API prices — included in your Claude subscription » (text/secondary).
- Recent requests (période choisie, plus récente en haut) : When · Who (avatar bleu Kuartz / vert client) · Feature (Tag
  info « AI editor », neutre « Ask AI ») · Request (`AiUsageDoc.request`, ≤ 120 car., écrit par le moteur ; repli
  « Edit on / » / « Question » pour les demandes journalisées sans ce champ ; « · Failed » etc. si rien n'a changé) · Model · Input · Output · Cost (« ~$0.50 » + « (estimated) » lu si le coût est estimé ;
  abonnement : « Included » + « ≈ $0.18 » en secondaire (Caption, text/muted), infobulle « ≈ $0.18 at API prices —
  included in your Claude subscription », phrase lue « included in your Claude subscription (≈ $0.18 at API prices) »). Vide : « No AI usage in this period. ».
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
- AI settings (Kuartz et client ; l'editor ne la voit pas), sous Claude connection — UN choix pour TOUTE l'IA du site
  (éditeur IA ET Ask AI, FOLLOWUPS #47) : en-tête « AI settings » + « AI editor · Ask AI » + Tag « Default » (rien
  d'enregistré : EDITOR_MODEL / EDITOR_EFFORT du moteur, sinon Opus 5.5 / Medium) ou « Saved ».
  « Model » (Select du kit : Opus 5.5 · Fable 5.1 · Sonnet 5 · Haiku 4.5, prix « $4 / $20 », « $10 / $50 »,
  « $2 / $10 », « $1 / $5 » en méta et « Haiku 4.5 · $1 / $5 per M tokens » dans le champ ; aide = phrase du modèle +
  « Price per million tokens, input / output (Anthropic API pricing). », ex. « Fastest and cheapest. For simple changes
  and questions. … » ; un modèle hors liste venu d'EDITOR_MODEL est montré « (engine default) », désactivé, et Save exige
  un modèle de la liste) ; « Thinking effort » (SegmentedControl du kit : Low · Medium · High · Extra high · Max, une
  phrase d'aide par niveau). Modèle sans effort (Haiku 4.5) : niveau affiché mais DÉSACTIVÉ, aide remplacée par
  « Haiku 4.5 doesn’t use a thinking effort. The level stays saved for the other models. » (Save envoie l'effort gardé ;
  un autre modèle le réactive). Ligne « Used by the AI editor and Ask AI. » (+ « Engine default: Opus 5.5 · Medium. »
  si rien d'enregistré ; « Haiku 4.5 » seul pour un modèle sans effort). Pied : « Changes apply to the next AI editor
  request and the next Ask AI question. A request already running keeps its settings. » + Save (primaire, désactivé tant
  que rien n'a changé, chargement pendant l'envoi) ; après succès « Saved. The next AI editor request and Ask AI
  question use Fable 5.1 · Extra high. » (« … use Haiku 4.5. ») ; échec : Callout d'erreur lisible (message du moteur),
  choix gardé. Animations sobres du kit : corps en fondu (`fade`), message et erreur en `slideDown` (AnimatePresence,
  `useMotionVariants` → rien en mouvement réduit). Moteur injoignable : Callout + Retry.

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
`npx vitest run src/admin/features/usage src/admin/core/usage` (6 fichiers, 63 tests) — carte AI settings (8 tests : rendu
et textes « AI editor · Ask AI » / « Used by the AI editor and Ask AI. », prix des quatre modèles depuis la table unique,
menu à quatre modèles, Haiku 4.5 : effort désactivé et expliqué, effort gardé à l'envoi, réactivé par un autre modèle ;
Save désactivé sans changement, envoi, « Saved », erreur lisible, moteur injoignable + Retry, modèle hors
liste), placement sous Claude connection et absence sans `aiSettings` (UsageScreen) ; carte Claude connection (local / production, abonnement,
clé envoyée une fois et jamais affichée, sk-ant-oat refusé avant envoi, échec du test, clé de l'environnement, moteur
injoignable) ; formats (fuseaux, années, « online since » avec ou sans
`launchedAt`), rendu (cartes, tableau, statut, coût estimé, état vide, Show more, changement de période → URL), coût
facturé / inclus (mélange : Cost et Since launch = facturé, ligne « included », note ; abonnement seul : $0.00 +
« Included » ; cellule Cost « Included » + « ≈ $0.18 » + phrase lue ; anciens documents sans `access` inchangés). À la
main : `/admin/settings/usage` en kuartz et client (dataset development au 28/09 : 5 documents du faux Claude facturés
0,02 $ — antérieurs à la correction du moteur, à retirer avec l'utilisatrice — et 2 demandes par l'abonnement).

## Décisions et « À trancher »
- Question 12 : journal = un document Sanity privé par demande (orchestrateur).
- En-tête : `PageHeader` du kit (le Figma B5 utilise un « Page header », pas un Section header) — `SectionHeader
  headingLevel={1}` ne s'applique qu'à B3 (FOLLOWUPS #40, vérifié le 2026-09-27).
- Accès : toute session (Kuartz, client, editor) — aucun droit dédié dans `roles.ts` pour la consommation ; la carte
  Claude connection exige `ai.access` (Kuartz et client), ajouté au contrat le 2026-09-27.
- Carte Claude connection placée entre les deux cartes du haut et Recent requests (pas de maquette : composants du kit).
- Carte AI settings (2026-09-28, demande de l'utilisatrice) juste sous Claude connection, même droit ; choix appliqué à la
  demande SUIVANTE de l'éditeur (le moteur relit ses réglages au départ de chaque demande) ET à la question suivante
  d'Ask AI : le même jour, l'utilisatrice a jugé « Ask AI isn’t affected » comme une erreur (le modèle affiché dans Ask
  AI doit être celui qu'elle a choisi) et demandé Haiku 4.5 pour le coût minimal (FOLLOWUPS #47).
- « Since launch » : le COÛT reste le cumul de toutes les demandes FACTURÉES (y compris avant la mise en ligne) ; seule
  la date affichée vient de `launchedAt` (FOLLOWUPS #33).
- Abonnement Claude (2026-09-28, constat de l'orchestrateur sur le dataset development) : le contrat disait déjà que son
  coût n'est pas facturé (`Usage.access`) ; B5 l'additionnait au facturé sous la note « Billed on … ». Désormais
  « Cost » / « Since launch » = facturé seulement, part incluse montrée à part (« ≈ $X at API prices — included in your
  Claude subscription »), cellule « Included ». Pas de changement de schéma Sanity (`access` est dans chaque document).

## Demandes de contrat
- Aucune (contrats `AiUsageDoc.request` et `AdminConfig.site.launchedAt` faits). Reste chez les autres : écriture de
  `request` (engine-publish, #27), schéma `aiUsage.request` et valeur de `launchedAt` (site-adapter, #28).
