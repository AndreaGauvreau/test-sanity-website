# core/usage — LLM context

> Propriétaire : code-usage · Figma : B5 (docs/admin/figma/screens/B5.md), sert aussi B1 (carte AI usage) et G4 (pied de Ask AI) · Mis à jour : 2026-09-28 (coût facturé / inclus dans l'abonnement Claude)

## Utilité
Lecture du journal de consommation IA (documents Sanity PRIVÉS `aiUsage.<id>`, un par demande, écrits par le moteur)
et agrégats par période. Côté serveur seulement. Ne rend rien, n'écrit jamais dans Sanity, n'appelle pas le moteur.

## Fichiers
- `aggregate.ts` — PUR : types (`UsagePeriod`, `UsageSummary`, `UsageAggregate`, `UsageRow`), libellés (`USAGE_PERIOD_LABELS`, `USAGE_FEATURE_LABELS`), lecture défensive (`parseUsageDocs`, zod), `periodStart`, `summarizeUsage`, `usageRows`, `roundCost`.
- `index.ts` — SERVEUR (`server-only`) : `getUsageSummary(period)`, `getUsageOverview({ period, limit })`, `listUsage({ period, limit })`, `USAGE_QUERY` ; réexporte les types et libellés.
- `aggregate.test.ts`, `index.test.ts` — tests (jeux de données en mémoire, faux client, fausse session).

## Contrats
- Entrées : documents `AiUsageDoc` (`core/contracts/engine.ts`) lus avec `getReadClient({ perspective: 'raw' })` (jeton Viewer),
  requête `*[_type == "aiUsage" && _id in path("aiUsage.**") && ($since == null || createdAt >= $since)] | order(createdAt desc)`.
  Champ facultatif `request` (texte de la demande, contrat `AiUsageDoc.request`, ≤ 120 car., écrit par le moteur).
  Champ `access` projeté (`api-key` | `subscription` | `none`, absent des anciens documents) : sépare le facturé de
  l'inclus.
- Sorties (signature STABLE, utilisée par settings/B1, ask-ai/G4, usage/B5) :
  - `getUsageSummary(period: 'month' | '3-months' | 'all-time', deps?) → Promise<UsageSummary>` avec
    `UsageSummary = { period, totals: { inputTokens, outputTokens, costUsd, includedUsd }, byFeature: [{ feature: 'editor'|'ask', label, usage }], byModel: [{ model, label, usage }], requests, since? }`
    et `usage: UsageAggregate = { model, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, costUsd, includedUsd, costKind, requests }`
    (compatible `ModelUsageValue` du kit : `<ModelUsage usage={f.usage} />`). Dans un cumul, `costUsd` = part FACTURÉE
    seulement, `includedUsd` = part passée par l'abonnement Claude (prix de l'API, non facturée).
  - `UsageRow` (une demande) : `costUsd` = son coût au prix de l'API + `access?` (`isIncluded` du contrat décide).
  - `getUsageOverview({ period, limit }) → { summary, allTime, rows }` : tout B5 en UNE lecture.
  - `listUsage({ period, limit = 50 }) → { items: UsageRow[], total }`.
  - `deps` (tests) : `{ fetch?(query, params), now? }`.
- Dépend de : `core/auth/session` (requireSession), `core/sanity/clients`, `core/contracts` (engine, format, roles), zod.

## Comportement
- Périodes en mois calendaires **UTC** : `month` = depuis le 1er du mois ; `3-months` = mois courant + 2 précédents ;
  `all-time` = sans borne. `since` = début de la période (ISO) ; pour `all-time`, date de la première demande
  (absent s'il n'y en a aucune). Borne basse incluse ; une date future est comptée.
- `byFeature` : AI editor puis Ask AI, seulement celles qui ont servi ; `usage.model` = modèle de la demande la plus
  RÉCENTE de la fonctionnalité. `byModel` : du plus coûteux au moins coûteux, `label` = `modelLabel()` du contrat.
- Coût FACTURÉ / INCLUS : une demande `access: 'subscription'` (abonnement Claude, moteur local) n'entre JAMAIS dans
  `costUsd` d'un cumul (« Cost », « Since launch », B1, pied de Ask AI) mais dans `includedUsd` ; tout autre accès, ou
  un ancien document sans `access` (ou inconnu), est facturé comme avant. Les jetons comptent tout. `byModel` est trié
  au prix de l'API (facturé + inclus).
- `costKind` d'un cumul = `estimated` dès qu'une demande FACTURÉE l'est. Coûts arrondis au millionième de $ (`roundCost`) ;
  jetons arrondis à l'entier. L'affichage passe par `formatTokens` / `formatCost` / `formatCostShort` du contrat (« 1.2M », « $0.003 », « Included »).
- Documents mal formés (type, id, feature, date) ignorés ; nombres invalides → 0 ; rôle inconnu → `client`.
- `UsageRow.request` : espaces et retours à la ligne réduits, recoupé à `REQUEST_MAX` = 120 caractères (longueur du
  contrat), absent s'il est vide ou mal typé.
- Toutes les statuts comptent (une demande échouée a coûté). Jamais de crédits, plafond, solde ni alerte (Figma B5).

## Forces
- Toute la logique en fonctions pures testées (périodes, bornes, regroupements, arrondis sur 1 000 demandes, lecture défensive).
- Une seule lecture Sanity pour B5 (`getUsageOverview`) ; projection limitée aux champs utiles (jamais l'e-mail).

## Faiblesses et limites connues
- Agrégation en mémoire : tous les documents de la période sont lus (GROQ n'a pas de GROUP BY). Suffisant pour des
  milliers de demandes ; au-delà, prévoir des cumuls mensuels écrits par le moteur.
- Mois en UTC : une demande du 1er à 00:30 heure de Paris compte dans le mois précédent.
- `UsageSummary.since` (all-time) = date de la première demande IA ; la date de mise en ligne du site
  (`adminConfig.site.launchedAt`) est lue par B5 (features/usage), pas ici.
- Pas de cache : chaque rendu de B5 relit le journal (jeton Viewer, sans CDN).

## Points sensibles
- Documents PRIVÉS (id avec un point) : ne jamais les lire avec un client sans jeton, ni exposer le client de lecture au navigateur.
- `getUsageSummary` exige une session (`requireSession('route')` → `AdminAuthError(401)`, pas de redirection) : défense
  en profondeur, les pages appelantes font leur propre `requireSession()` en premier.
- Ne JAMAIS écrire de données de test dans Sanity : les jeux de données vivent dans les tests.

## Pièges
- `$since` doit être passé (`null` pour all-time) : GROQ refuse un paramètre manquant.
- `z.enum(ADMIN_ROLES)` accepte le tuple `readonly` du contrat (zod 4).

## Comment modifier
- Nouvelle période : `UsagePeriod` + `USAGE_PERIODS` + `USAGE_PERIOD_LABELS` + `periodStart` (et `AI_USAGE_PERIODS` du kit).
- Nouvelle fonctionnalité IA : contrat `AiUsageDoc.feature` (orchestrateur), puis `USAGE_FEATURE_LABELS` + `FEATURE_ORDER`.
- Texte de la demande : déjà projeté (`PROJECTION`) et recoupé à 120 car. ; changer la longueur = contrat d'abord.

## Tests
`npx vitest run src/admin/core/usage` — 29 tests : lecture défensive, bornes des périodes (UTC, changement d'année),
totaux, regroupements, modèle le plus récent, coût estimé, arrondis, période vide, lignes (ordre, limite 1-500,
texte raccourci à 120 car.), coût facturé / inclus (abonnement seul, mélange, ancien document sans `access`, accès
inconnu, `estimated` du facturé seulement, tri des modèles), requête (`path("aiUsage.**")`, `access` projeté,
perspective raw, `$since`), session exigée, une seule lecture pour B5.
À la main : `/admin/settings/usage` (dataset `development` au 28/09 : 5 documents du faux Claude — clé API, 0,02 $,
d'avant la correction du moteur — et 2 vraies demandes par l'abonnement : Cost = 0,10 $, « ≈ $0.30 … included »).

## Décisions et « À trancher »
- Question 12 (tranchée par l'orchestrateur) : un document Sanity privé par demande.
- Mois calendaires UTC plutôt que 30/90 jours glissants (libellés « This month » / « Last 3 months »).

## Demandes de contrat
- Aucune : `AiUsageDoc.request` (≤ 120 car.) et `AdminConfig.site.launchedAt` sont au contrat. Reste l'écriture de
  `request` par le moteur (engine-publish, FOLLOWUPS #27) et le schéma `aiUsage.request` (site-adapter, #28).
