# core/usage — LLM context

> Propriétaire : code-usage · Figma : B5 (docs/admin/figma/screens/B5.md), sert aussi B1 (carte AI usage) et G4 (pied de Ask AI) · Mis à jour : 2026-09-27

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
  Champ facultatif lu en plus s'il existe : `request` (texte de la demande, hors contrat — voir Demandes de contrat).
- Sorties (signature STABLE, utilisée par settings/B1, ask-ai/G4, usage/B5) :
  - `getUsageSummary(period: 'month' | '3-months' | 'all-time', deps?) → Promise<UsageSummary>` avec
    `UsageSummary = { period, totals: { inputTokens, outputTokens, costUsd }, byFeature: [{ feature: 'editor'|'ask', label, usage }], byModel: [{ model, label, usage }], requests, since? }`
    et `usage: UsageAggregate = { model, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, costUsd, costKind, requests }`
    (compatible `ModelUsageValue` du kit : `<ModelUsage usage={f.usage} />`).
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
- `costKind` d'un cumul = `estimated` dès qu'une demande l'est. Coûts arrondis au millionième de $ (`roundCost`) ;
  jetons arrondis à l'entier. L'affichage passe par `formatTokens` / `formatCost` du contrat (« 1.2M », « $0.003 »).
- Documents mal formés (type, id, feature, date) ignorés ; nombres invalides → 0 ; rôle inconnu → `client`.
- Toutes les statuts comptent (une demande échouée a coûté). Jamais de crédits, plafond, solde ni alerte (Figma B5).

## Forces
- Toute la logique en fonctions pures testées (périodes, bornes, regroupements, arrondis sur 1 000 demandes, lecture défensive).
- Une seule lecture Sanity pour B5 (`getUsageOverview`) ; projection limitée aux champs utiles (jamais l'e-mail).

## Faiblesses et limites connues
- Agrégation en mémoire : tous les documents de la période sont lus (GROQ n'a pas de GROUP BY). Suffisant pour des
  milliers de demandes ; au-delà, prévoir des cumuls mensuels écrits par le moteur.
- Mois en UTC : une demande du 1er à 00:30 heure de Paris compte dans le mois précédent.
- « Since launch » = depuis la première demande IA, pas la date de mise en ligne du site (inconnue de l'admin).
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
- Afficher le texte de la demande : quand le moteur écrira `request`, rien à changer ici (déjà projeté et raccourci à 200 car.).

## Tests
`npx vitest run src/admin/core/usage` — 23 tests : lecture défensive, bornes des périodes (UTC, changement d'année),
totaux, regroupements, modèle le plus récent, coût estimé, arrondis, période vide, lignes (ordre, limite 1-500,
texte raccourci), requête (`path("aiUsage.**")`, perspective raw, `$since`), session exigée, une seule lecture pour B5.
À la main : `/admin/settings/usage` (le dataset `development` n'a aucun `aiUsage` : état vide).

## Décisions et « À trancher »
- Question 12 (tranchée par l'orchestrateur) : un document Sanity privé par demande.
- Mois calendaires UTC plutôt que 30/90 jours glissants (libellés « This month » / « Last 3 months »).

## Demandes de contrat
- **contracts/engine.ts (`AiUsageDoc`)** : ajouter `request?: string` (texte de la demande, ≤ 200 car.) écrit par le moteur,
  pour la colonne « Request » de B5 (Figma). Aujourd'hui repli : « Edit on / » ou « Question ».
- **contracts/manifest.ts (`AdminConfig.site`)** : `launchedAt?: string` (date de mise en ligne) pour « online since Sep 2, 2026 » (B5).
