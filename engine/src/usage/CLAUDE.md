# Journal de consommation IA (`engine/src/usage`) — LLM context

> Propriétaire : engine-publish · Figma : B5 (docs/admin/figma/screens/B5.md), pied de G4 · Mis à jour : 2026-09-27 (corrections vague 3)

## Utilité
Écrit UN document Sanity PRIVÉ `aiUsage.<requestId>` (`_type: 'aiUsage'`, champs `AiUsageDoc`) par demande IA
terminée — éditeur (port `ports.usage` d'engine-core) et Ask AI (port `askUsageRecorderOf(context)`) — avec le jeton
robot. Lu par B5 et le pied de Ask AI (code-usage, `src/admin/core/usage`). Jamais de perte silencieuse : journal local
de secours rejoué plus tard.
Ne fait pas : lire ni agréger le journal (code-usage), calculer le coût (engine-claude, `Usage`), déclarer le schéma
Sanity `aiUsage` (site-adapter).

## Fichiers
- `journal.ts` — `createUsageJournal({ sanity, dataDir, log?, now? })` → `{ recorder, record, flush, pendingCount }` ; `usageDocFromJob`, `askUsageDoc`, `askRecorderFor`, `requestText`, `REQUEST_MAX` (120), `usageDocId`, `isAiUsageDoc`, `PENDING_FILE`, types `UsageJournal`, `AskUsageInput`.
- `index.ts` — `usageModule` / `createUsageModule` (pose `ports.usage`, rejeu au démarrage), `getUsageJournal(context)`, `askUsageRecorderOf(context)`.
- `journal.test.ts` — documents, `request`, port Ask AI, secours local, rejeu, double échec.

## Contrats
- Port `UsageRecorder` d'engine-core : `record({ job, change })`, appelé à la fin de CHAQUE demande de l'éditeur.
- Document (`AiUsageDoc`, `core/contracts/engine.ts`) : `{ _id: 'aiUsage.<id>', _type: 'aiUsage', feature:
  'editor'|'ask', requestId, status (statut final), page?, request? (≤ 120 caractères), user: { id, name, role }
  (jamais l'e-mail), createdAt (fin de la demande), ...Usage }`.
- `request` : éditeur = `job.request.note` ; Ask AI = `request` de l'entrée si ask-ai le fournit (la question). Espaces
  réunis, tronqué à 120 caractères avec « … » ; absent si vide.
- Pour ask-ai : `askUsageRecorderOf(context)` renvoie un objet `{ recordAsk(entry) }` de même forme que
  `AskUsageRecorder` (`engine/src/ask/usage.ts`, vérifié par le typage du test) ; ou directement
  `getUsageJournal(context)?.record(askUsageDoc({ requestId, user, usage, status?, screen?, at?, request? }))`. Le
  module `usage` est enregistré AVANT `ask` dans `MODULES`.
- Dépend de : `content/sanity.ts` (port, `createIfNotExists`), `store/json-file.ts` (`writeFileAtomic`),
  `jobs/types.ts` (`UsageRecorder`). Utilisé par : `main.ts` (MODULES), ask-ai (à brancher, voir Demandes).

## Comportement
`job.usage` absent (Claude n'a pas tourné : refus avant l'appel, aperçu indisponible) → rien n'est écrit (rien
consommé). Sinon `createIfNotExists` : id déterministe, donc rejouer ne crée jamais de doublon. Échec de Sanity ou pas
de jeton → une ligne JSON ajoutée à `<ENGINE_WORKSPACE>/data/usage-pending.jsonl` (0600) + ligne de journal ; si
l'ajout échoue aussi, l'erreur remonte (l'éditeur la journalise : « usage not recorded »). Rejeu : au démarrage (en
arrière-plan, le démarrage n'attend pas Sanity) et après chaque écriture réussie (sans faire attendre l'appelant) ; il
s'arrête au premier échec ; le fichier est réécrit atomiquement avec le reste, supprimé quand il est vide ; une ligne
illisible (ou non conforme à `isAiUsageDoc`, dont `request` > 120) est gardée telle quelle. Toutes les opérations sur
le fichier sont sérialisées.

## Forces
Idempotent, sans perte, testé : Sanity OK, en panne → secours → rejeu, sans jeton, ligne corrompue, double échec,
`request` tronqué, port Ask AI (secours compris) ; câblage réel (aiUsage avec `request` après une vraie demande de
l'éditeur) dans `engine/src/publish/module.test.ts`.

## Faiblesses et limites connues
- Pas de minuterie : si Sanity revient et qu'aucune demande n'a lieu, le rejeu attend la demande suivante ou le
  redémarrage.
- Ask AI passe par le journal commun (`askUsageRecorderOf(context)`, FOLLOWUPS #34) ; il n'écrit EN DIRECT
  (`sanityAskUsageRecorder` d'ask-ai : sans secours local ni rejeu, id non assaini `aiUsage.${requestId}`) que si le
  journal commun est absent.
- Jamais exécuté contre le vrai Sanity (faux client dans les tests).

## Points sensibles
- L'id DOIT garder le point (`aiUsage.`) : sans lui le document serait lisible sans jeton sur un dataset public.
- Jamais de secret ni d'e-mail dans le document ; le journal local n'est jamais affiché.
- `request` est le texte du client : une DONNÉE citée par l'admin, jamais une instruction ; ne jamais y mettre autre
  chose que la note (ni prompt, ni réponse de Claude).
- Jamais d'écriture dans le dataset `production` pendant les tests (faux Sanity seulement).

## Pièges
- `usageDocId` remplace tout caractère hors `[A-Za-z0-9_-]` par `_` : un id avec un point (« job.x ») deviendrait
  `aiUsage.job_x`, et `isAiUsageDoc` refuse un `_id` dont la partie après `aiUsage.` n'est pas sûre (« aiUsage.../x »).
- Le rejeu s'ARRÊTE au premier échec de Sanity (le reste attend, dans l'ordre) : un seul document refusé en boucle
  bloque ceux d'après jusqu'à ce que Sanity l'accepte (pas de mise à l'écart automatique).
- `record()` rejette un document non conforme AVANT tout envoi (« Invalid aiUsage document. ») : un `request` de plus
  de 120 caractères passé à la main est refusé ; passer par `requestText`.
- Le rejeu après une écriture réussie est lancé sans être attendu : dans un test, appeler `flush()` ou
  `pendingCount()` (sérialisés) avant de lire le fichier.

## Comment modifier
- Nouveau champ du document : contrat `AiUsageDoc` (orchestrateur), puis `usageDocFromJob` / `askUsageDoc`,
  `isAiUsageDoc` (lignes relues), le test, et le schéma `aiUsage` (site-adapter).
- Nouvelle fonction IA qui consomme : un `feature` de plus dans le contrat, un constructeur de document comme
  `askUsageDoc`, écrit par `getUsageJournal(context)?.record(...)`.
- Minuterie de rejeu : dans `createUsageModule` (intervalle + `journal.flush()`), arrêtée à l'arrêt du moteur.

## Tests
`npx vitest run engine/src/usage` (~1 s) ; câblage (aiUsage écrit après une vraie demande) :
`engine/src/publish/module.test.ts`. À la main : moteur lancé, une demande de l'éditeur terminée, puis document
`aiUsage.<jobId>` dans le dataset development (Studio, perspective raw).

## Décisions et « À trancher »
- Un document par demande (pas d'agrégat) : B5 agrège à la lecture (code-usage).
- Id déterministe + `createIfNotExists` plutôt qu'un verrou : le rejeu est sûr par construction.
- Secours dans un fichier local plutôt qu'en mémoire : survit à un redémarrage du moteur.
- `request` = note de la demande (FOLLOWUPS #16), tronquée à 120 caractères côté moteur.

## Demandes de contrat
1. ~~ask-ai (`engine/src/ask/routes.ts`, FOLLOWUPS #34) : repli sur `askUsageRecorderOf(context)`~~ — **fait** (vérifié
   le 2026-09-27). Reste facultatif : passer la question tronquée en `request` dans `recordAsk` (`ask/service.ts`).
2. ~~site-adapter (FOLLOWUPS #28) : champ `request` du schéma `aiUsage`~~ — **fait** (`src/sanity/schemaTypes/aiUsage.ts`,
   ≤ 120 caractères).
