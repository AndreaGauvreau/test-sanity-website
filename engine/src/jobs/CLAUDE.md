# File et cycle d'une demande (`engine/src/jobs`) — LLM context

> Propriétaire : engine-core · Figma : D1-D3, G1, G2 (états de la sidebar) · Mis à jour : 2026-09-27

## Utilité
Le cœur de l'éditeur IA : la file (UNE demande à la fois, toutes personnes confondues), le cycle complet d'une demande
(porté de `job.ts > runEdit` du POC et câblé sur engine-guards et engine-claude), la modification en attente (une demande
+ ses ajustements), ✓ Validate (un seul commit), Cancel (retour arrière de tout), Stop, réponses aux questions, reprise
après un redémarrage, et le verrou partagé avec la publication. Pas de route ici (voir `server/`).

## Fichiers
- `service.ts` — `createEditorService(deps)` : request, job, answer, stop, validate, cancel, state, shot, recover, shutdown, blocker, validatedDesign, idle.
- `run.ts` — `runEditJob(ctx)` : le cycle d'une demande ; `MAX_ATTEMPTS = 2` ; `timeoutMessage`.
- `request.ts` — `parseRequestShape` (zod, contrat EditRequest), `checkRequestAgainst` (zones.json), `isPagePath`, `ID_PATTERN`, `zoneLabel`.
- `lock.ts` — `createEngineLock()` : `PublishLock` (lu par l'éditeur) + `runPublish` / `acquirePublish` (engine-publish), `EditorGate`.
- `summary.ts` — `describeChanges` : résumé client calculé d'après les fichiers entiers (postcss) et les textes écrits.
- `site.ts` — `listPages` (routes de `src/app/(site)`), `typecheck` (`next typegen` puis `tsc --noEmit` dans le clone).
- `types.ts` — `EditorDeps`, `JobRunAgent`, `UsageRecorder`, messages finaux du contrat.
- `testing.ts` — banc d'essai (tests seulement) : espace temporaire façon Conduit, faux aperçu, faux signal, `makeBench`.
- Tests : `service.test.ts` (cycle complet), `units.test.ts`, `conduit.test.ts` (fumée sur le vrai design system).

## Contrats
- Entrées : `EditRequest`, `Answer` (contrat), `EngineUser` signé. Sorties : `EditJob`, `PendingChange`, `EditorState`,
  `PendingDesignItem` (engine-publish), PNG des captures.
- Dépend de : engine-claude (`resolveTextFields`, `editableFields`, `toolAccessFor`, `createTextTool`, `createAskTool`,
  `parseAnswers`, `hardcodedOf`, `acceptsLongerText`, `buildPrompt`, `buildRetryPrompt`, `systemAppend`, `addCall`,
  `totalCost`, `toUsage`, `clientMessage`), engine-guards (`loadDesignSystem`, `runStaticChecks`, `runRenderChecks`,
  `publicChecks`, `retryProblems`, `describeMeasures`, `lineSummary`, `Preview`), `git/`, `store/`, `content/`.
- Ports : `UsageRecorder.record({ job, change })` appelé à la fin de CHAQUE demande (sans `usage` si Claude n'a pas
  tourné) ; `pendingTotal()` (« Validated — added to Publish (N changes) ») ; `PublishLock.isPublishing()`.

## Comportement
**Refus d'une nouvelle demande** (synchrones, revérifiés juste avant l'inscription, aucune attente entre les deux) :
publication en cours → 409 `publishing` ; demande en file/en cours/en attente → 409 `busy` ; modification working ou
to-validate → 409 `awaiting_validation` (sauf ajustement de CETTE modification, `changeId`, même page) ; pas d'accès
Claude ou aperçu pas prêt → 503 `unavailable` ; texte Sanity demandé sans jeton d'écriture → 503 ; zone inconnue, note
vide ou > 600, > 8 éléments, périmètre impossible → 400. Le libellé d'un élément vient de zones.json.

**Cycle** (`run.ts`) : running → design system relu dans le clone (échec = failed) → copie sale nettoyée (étape warn) →
tête notée → champs Sanity résolus (`resolveTextFields` + `editableFields`), valeurs lues et **instantané enregistré dans
le magasin AVANT toute écriture** → captures d'avant (`preview.open(page, 1er élément)` ; échec = failed sans Claude) →
essai 1 (`buildPrompt` avec rendu d'avant, pages, textes de la page) → Stop ? retour arrière, `stopped` ; échec du SDK ?
retour arrière, `failed` (jamais de 2e essai sur `fatal`) ; rien de changé ? `rejected` (textes remis) → contrôles
statiques → si ok, attente du signal « aperçu à jour » (texte écrit visible ; échec = failed) puis contrôles du rendu →
tout passe : commit sur draft au nom du client, captures, résumé, `done` → sinon étapes warn (libellés anglais du contrat)
et essai 2 dans la session reprise (`buildRetryPrompt(retryProblems)`), sauf si le cumul atteint le plafond de la demande
→ 2e refus : retour arrière COMPLET, `failed`. Toute exception : retour arrière, `failed`. `session.close()` toujours.

**Coût** : `addCall(state, result, resumedSessionId)` (une session reprise rapporte le cumul : jamais additionné deux
fois) ; budget passé au SDK = min(`EDITOR_MAX_BUDGET_USD`, plafond de la demande − déjà dépensé) ; plus de 2e essai si
le cumul atteint `maxRequestUsd`. `EditJob.usage` = `toUsage` ; `PendingChange.usage` = somme de ses demandes.

**Modification en attente** : créée avec la demande (`working`) ; demande `done` → `to-validate` (résumé cumulé, contrôles
de la dernière) ; première demande sans effet → `cancelled` ; ajustement sans effet → reste `to-validate` telle qu'avant.
Validate : tête = dernier commit de la modification (sinon 409 conflict), `squashSince(base)` au nom de l'auteur de la
demande, message « Validated by … », statut `validated`, entrée de fil `validated`. Cancel : aucun texte retouché ailleurs
depuis (valeur actuelle = dernière écrite ou déjà remise, sinon 409 conflict), tête = dernier commit (sinon 409), puis
TEXTES d'abord (remis à leur valeur d'avant la PREMIÈRE demande qui les a écrits ; brouillon supprimé s'il n'existait pas
et redevient identique au publié ; échec Sanity → 503, rien d'autre n'a bougé, Cancel se retente), puis
`reset --hard base`, entrée de fil `cancelled`.

**Texte non remis** : si la restauration échoue au retour arrière d'une demande (Sanity injoignable), la demande garde
`restoreFailed` ; toute nouvelle demande retente d'abord la restauration et est refusée (503) tant qu'elle échoue — une
nouvelle demande prendrait sinon la valeur fausse pour « valeur d'avant ». Retentée aussi au démarrage.

**Questions** : `waiting` + `question { questions, askedAt, expiresAt }` ; réponse validée par `parseAnswers` (400 sinon,
409 si plus rien n'attend) ; au délai (`EDITOR_QUESTION_TIMEOUT_MS`, 15 min) : arrêt, retour arrière, `stopped`
« No answer for 15 minutes — stopped, nothing was changed. ». Stop : en file → `stopped` tout de suite ; en cours →
abandon (le service attend la remise en état 10 s au plus avant de répondre, sous le délai de 15 s du relais ; au-delà,
l'admin voit encore running/waiting et le sondage montrera `stopped`).

**Reprise au démarrage** (`recover`, piège 7 du POC corrigé) : demandes queued/running/waiting → textes restaurés
d'après l'instantané (champs écrits, sinon tous), commit orphelin retiré (`reset --hard headBefore`), copie de travail
nettoyée, `failed` « Interrupted: the AI engine restarted… » ; restauration impossible → `restoreFailed`, retentée au
prochain démarrage ; modification restée `working` → `to-validate` ou `cancelled`.

Messages finaux : `failed` « Couldn’t apply — nothing was changed. », `stopped` « Stopped — nothing was changed. ».

## Forces
- Refus 409 décidés sans `await` entre vérification et inscription ; `serial` pour request / validate / cancel.
- Tests sur un vrai dépôt git avec le vrai design system de test de Conduit, le vrai hook, les vrais contrôles statiques
  et le faux Claude : statuts, commits, retour arrière, textes, ajustement, validate, cancel, coût repris, 409, reprise.

## Faiblesses et limites connues
- Contrôles du rendu sur le PREMIER élément seulement (une session d'aperçu) ; les autres éléments visés ne comptent pas
  contre l'isolation (`alsoChanged`) mais leur cadre, leurs lignes et leur contraste ne sont pas relevés.
- Étapes du hook et de certains contrôles en français (textes d'engine-guards) dans le journal du client.
- `typecheck` lance `next typegen` puis `tsc` complet (lent, jusqu'à 3 min) ; seulement si un .ts/.tsx a changé.
- Le signal « aperçu à jour » compare le TEXTE rendu côté serveur ; un texte transformé par le rendu (découpé, remplacé)
  ne serait jamais « vu » → failed. CSS : on compte sur Turbopack qui recompile à la requête.
- Les captures (`shots/<jobId>`) ne sont jamais purgées.
- Stop/answer ouverts à toute personne qui a `ai.editor` (éditeur partagé), pas seulement à l'auteur.

## Points sensibles
- JAMAIS d'écriture Sanity avant que l'instantané soit dans le magasin ; jamais de 2e essai après `fatal`.
- JAMAIS un libellé ou un texte venu du navigateur dans le prompt (zones.json fait foi ; la note est citée par buildPrompt).
- Ne pas ajouter d'`await` entre `assertCanStart` et `store.transact` dans `request`.

## Comment modifier
- Nouveau refus d'entrée : `request.ts` (message anglais) + test dans `units.test.ts`.
- Nouvelle étape du cycle : `run.ts` (penser au retour arrière et à `signal.aborted`) + scénario dans `service.test.ts`
  avec `makeBench([...fakeScenarios])`.
- Nouveau statut de modification : contrat d'abord (orchestrateur), puis `afterJob` dans `service.ts`.

## Tests
`npx vitest run engine/src/jobs` (~8 s). Non couvert : Claude réel, Chrome réel (faux aperçu), next dev réel.

## Demandes de contrat
- (Aucune bloquante.) Suggestion : un `CheckId` `placement` si l'admin doit montrer le replacement des zones intérieures.
