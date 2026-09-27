# Journal de consommation IA (`engine/src/usage`) — LLM context

> Propriétaire : engine-publish · Figma : B5 (docs/admin/figma/screens/B5.md), pied de G4 · Mis à jour : 2026-09-27

## Utilité
Écrit UN document Sanity PRIVÉ `aiUsage.<requestId>` (`_type: 'aiUsage'`, champs `AiUsageDoc`) par demande IA
terminée (éditeur ; Ask AI via `getUsageJournal`), avec le jeton robot. Lu par B5 et le pied de Ask AI (code-usage,
`src/admin/core/usage`). Jamais de perte silencieuse : journal local de secours rejoué plus tard.
Ne fait pas : lire ni agréger le journal (code-usage), calculer le coût (engine-claude, `Usage`).

## Fichiers
- `journal.ts` — `createUsageJournal({ sanity, dataDir, log? })` → `{ recorder, record, flush, pendingCount }` ; `usageDocFromJob`, `askUsageDoc`, `usageDocId`, `isAiUsageDoc`, `PENDING_FILE`.
- `index.ts` — `usageModule` / `createUsageModule` (pose `ports.usage`, rejeu au démarrage), `getUsageJournal(context)`.
- `journal.test.ts`.

## Contrats
- Port `UsageRecorder` d'engine-core : `record({ job, change })`, appelé à la fin de CHAQUE demande.
- Document : `{ _id: 'aiUsage.<id>', _type: 'aiUsage', feature: 'editor'|'ask', requestId, status (statut final),
  page?, user: { id, name, role } (jamais l'e-mail), createdAt (fin de la demande), ...Usage }`.
- Pour ask-ai : `getUsageJournal(context)?.record(askUsageDoc({ requestId, user, usage, status?, screen?, at? }))`
  (le module `usage` est enregistré AVANT dans `MODULES`).

## Comportement
`job.usage` absent (Claude n'a pas tourné : refus avant l'appel, aperçu indisponible) → rien n'est écrit (rien
consommé). Sinon `createIfNotExists` : id déterministe, donc rejouer ne crée jamais de doublon. Échec de Sanity ou pas
de jeton → une ligne JSON ajoutée à `<ENGINE_WORKSPACE>/data/usage-pending.jsonl` (0600) + ligne de journal ; si
l'ajout échoue aussi, l'erreur remonte (l'éditeur la journalise : « usage not recorded »). Rejeu : au démarrage (en
arrière-plan, le démarrage n'attend pas Sanity) et après chaque écriture réussie (sans faire attendre l'éditeur) ; il
s'arrête au premier échec ; le fichier est réécrit atomiquement avec le reste, supprimé quand il est vide ; une ligne
illisible est gardée telle quelle. Toutes les opérations sur le fichier sont sérialisées.

## Forces
Idempotent, sans perte, testé : Sanity OK, en panne → secours → rejeu, sans jeton, ligne corrompue, double échec.

## Faiblesses et limites connues
- Pas de minuterie : si Sanity revient et qu'aucune demande n'a lieu, le rejeu attend la demande suivante ou le
  redémarrage.
- Le texte de la demande (colonne « Request » de B5) n'est pas dans `AiUsageDoc` (voir Demandes de contrat).
- Jamais exécuté contre le vrai Sanity (faux client dans les tests).

## Points sensibles
- L'id DOIT garder le point (`aiUsage.`) : sans lui le document serait lisible sans jeton sur un dataset public.
- Jamais de secret ni d'e-mail dans le document ; le journal local n'est jamais affiché.
- Jamais d'écriture dans le dataset `production` pendant les tests (faux Sanity seulement).

## Tests
`npx vitest run engine/src/usage` (~1 s) ; câblage (aiUsage écrit après une vraie demande) : `engine/src/publish/module.test.ts`.

## Demandes de contrat
1. **Orchestrateur (`AiUsageDoc`)** : champ facultatif `request?: string` (note du client, 120 caractères, citée comme
   donnée) pour la colonne « Request » de B5 ; site-adapter l'ajouterait au schéma `aiUsage`.
