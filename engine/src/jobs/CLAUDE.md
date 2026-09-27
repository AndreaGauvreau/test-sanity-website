# File et cycle d'une demande (`engine/src/jobs`) — LLM context

> Propriétaire : engine-core · Figma : D1-D3, G1, G2 (états de la sidebar) · Mis à jour : 2026-09-27 (journal en fond, résumé final)

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
- `summary.ts` — `describeChanges` : résumé client calculé d'après les fichiers entiers (postcss) et les textes écrits ;
  `mergeSummary` : résumé cumulé d'une modification à l'état FINAL (clé = élément + nature + lieu + propriété).
- `site.ts` — `listPages` (routes PUBLIQUES de `src/app/(site)`, sans `DEV_ROUTES` : `/bench`, `/preview/*`), `isDevRoute`, `typecheck` (`next typegen` puis `tsc --noEmit` dans le clone), `siteDomainsOf` / `loadSiteDomains` (domaines du site, SEC-08).
- `fake-claude.ts` — `createEngineFakeClaude(scenario)` : faux Claude du démarrage (`ENGINE_FAKE_CLAUDE`, FOLLOWUPS #12), scénarios css / text / ask / fail / budget / auto construits sur `createFakeAgent` / `fakeScenarios` d'engine-claude.
- `types.ts` — `EditorDeps`, `JobRunAgent`, `UsageRecorder`, messages finaux du contrat.
- `testing.ts` — banc d'essai (tests seulement) : espace temporaire façon Conduit, faux aperçu, faux signal, `makeBench`
  (options `runAgent`, `listPages`, `fakeClaude`, `siteDomains`, `usageDelayMs` = journal de consommation lent), `TEST_IDENTITY` (paire Ed25519 de test) et
  `signedIdentity(user)` (en-têtes signés comme l'admin), `LEDE_MUTED` / `ledeColor(valeur)` (old_string UNIQUE de la
  couleur de `.lede` du Hero de test : `color: var(--color-text-muted);` seul y figure deux fois et l'outil Edit, le faux
  Claude et le hook refusent un old_string ambigu) — utilisés aussi par engine-publish et ask-ai.
- Tests : `service.test.ts` (cycle complet), `run.test.ts` (measure bloqué SEC-07, AI-07), `wiring.test.ts` (branchements
  FOLLOWUPS #36 : lint dans le hook du vrai cycle, domaines du site), `fake-claude.test.ts` (dont ENGINE_FAKE_CLAUDE sous
  pré-validation), `units.test.ts`, `conduit.test.ts` (fumée sur le vrai design system).

## Contrats
- Entrées : `EditRequest`, `Answer` (contrat), `EngineUser` signé. Sorties : `EditJob`, `PendingChange`, `EditorState`
  (`state(page, user)` : l'URL d'aperçu vient de `deps.previewUrl(page, user)`, jeton court émis pour CET utilisateur,
  SEC-09), `PendingDesignItem` (engine-publish), PNG des captures.
- Dépend de : engine-claude (`resolveTextFields`, `editableFields`, `toolAccessFor`, `createTextTool`, `createAskTool`,
  `parseAnswers`, `hardcodedOf`, `acceptsLongerText`, `buildPrompt`, `buildRetryPrompt`, `systemAppend`, `addCall`,
  `totalCost`, `toUsage`, `clientMessage`), engine-guards (`loadDesignSystem`, `runStaticChecks`, `runRenderChecks`,
  `publicChecks`, `retryProblems`, `describeMeasures`, `lineSummary`, `lintChanges`, `lintContextFor`, `outOfScope`,
  `Preview`, `ToolAccess`), `git/`, `store/`, `content/`. Manifeste du site (`<ENGINE_SOURCE_REPO>/src/admin.config.ts`,
  `site.domain` et `site.url`) lu au démarrage par `loadSiteDomains` → `EditorDeps.siteDomains`.
- Ports : `UsageRecorder.record({ job, change })` appelé à la fin de CHAQUE demande (sans `usage` si Claude n'a pas
  tourné), en TÂCHE DE FOND SUIVIE (copie figée, erreur journalisée ; `idle()` l'attend, `shutdown` aussi dans son délai) :
  la demande est libérée (`running = null`) sans attendre l'écriture aiUsage dans Sanity ; `pendingTotal()` (« Validated — added to Publish (N changes) ») ; `PublishLock.isPublishing()`.

## Comportement
**Refus d'une nouvelle demande** (synchrones, revérifiés juste avant l'inscription, aucune attente entre les deux) :
publication en cours → 409 `publishing` ; demande en file/en cours/en attente → 409 `busy` ; modification working ou
to-validate → 409 `awaiting_validation` (sauf ajustement de CETTE modification, `changeId`, même page) ; pas d'accès
Claude ou aperçu pas prêt → 503 `unavailable` ; texte Sanity demandé sans jeton d'écriture → 503 ; zone inconnue, note
vide ou > 600, > 8 éléments, périmètre impossible → 400. Le libellé d'un élément vient de zones.json.

**Cycle** (`run.ts`) : running → design system relu dans le clone (échec = failed) → copie sale nettoyée (étape warn) →
tête notée → champs Sanity résolus (`resolveTextFields` + `editableFields`), valeurs lues et **instantané enregistré dans
le magasin AVANT toute écriture** → périmètre des outils `toolAccess = { ...toolAccessFor(…), lint: lintContextFor({ ds,
scope, zones, hardcoded }) }` (voir « Pré-validation ») → captures d'avant (`preview.open(page, 1er élément)` ; échec = failed sans Claude) →
essai 1 (`buildPrompt` avec rendu d'avant, pages PUBLIQUES — échec de lecture : étape warn + journal, la demande
continue sans liste, AI-07 —, textes de la page) → Stop ? retour arrière, `stopped` ; échec du SDK ?
retour arrière, `failed` (jamais de 2e essai sur `fatal`) ; rien de changé ? `rejected` (textes remis) → contrôles
statiques → si ok, contrôle statique revérifié puis attente du signal « aperçu à jour » (texte écrit visible ; échec =
failed) puis contrôles du rendu →
tout passe : commit sur draft au nom du client, captures, résumé, `done` → sinon étapes warn (libellés anglais du contrat)
et essai 2 dans la session reprise (`buildRetryPrompt(retryProblems)`), sauf si le cumul atteint le plafond de la demande
→ 2e refus : retour arrière COMPLET, `failed`. Toute exception : retour arrière, `failed`. `session.close()` toujours.

**Coût** : `addCall(state, result, resumedSessionId)` (une session reprise rapporte le cumul : jamais additionné deux
fois) ; budget passé au SDK = min(`EDITOR_MAX_BUDGET_USD`, plafond de la demande − déjà dépensé) ; plus de 2e essai si
le cumul atteint `maxRequestUsd`. `EditJob.usage` = `toUsage` ; `PendingChange.usage` = somme de ses demandes.

**Modification en attente** : créée avec la demande (`working`) ; demande `done` → `to-validate` (résumé cumulé à l'état
FINAL par `mergeSummary` : la ligne d'un ajustement remplace celle de la même propriété du même élément ; contrôles de la
dernière) ; première demande sans effet → `cancelled` ; ajustement sans effet → reste `to-validate` telle qu'avant.
Validate, Cancel et nouvelle demande attendent d'abord (`settleFinished`) la fin d'inscription d'une demande dont le
statut est déjà final (sinon 409 busy pendant la mise à jour de la modification). Titre de publication
(`validatedDesign`, E1 / Diff) : « <éléments> — <1re ligne du résumé FINAL> (+N more) », résumé ancien replié par
`mergeSummary([], …)`. Validate : tête = dernier commit de la modification (sinon 409 conflict), `squashSince(base)` au nom de l'auteur de la
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

**Pré-validation dans le hook (SEC-07, FOLLOWUPS #36)** : `toolAccess.lint` porte le contexte du lint de la demande
(zones de la demande, périmètre, politique du design system, tableau `hardcoded` VIVANT : les valeurs accordées par le
client via ask_client y entrent aussitôt). Le hook (`checkToolUse` d'engine-guards, par `createGuardHook` pour le vrai
Claude et par `createFakeAgent` pour le faux) juge le fichier FUTUR de chaque Edit contre HEAD AVANT l'écriture : import
ajouté, `process.env`, valeur en dur, `@import`… → refus (`Edit refused (<fichier>): the file after this edit breaks…`,
étape warn), le fichier reste intact sur le disque, ni next dev ni la mesure ne le voient. Un vrai changement de texte
(composant d'une zone au texte écrit dans le code, en T) ou de token (CSS de la zone, en 🖌) passe. Le même contexte
`lint` sert à `violationsNow` ; `runStaticChecks` le recalcule à l'identique. Chaque Edit doit laisser le fichier
conforme à lui seul, et old_string doit être UNIQUE dans le fichier (sinon refus, comme l'outil Edit).

**Adresses montrées au client (SEC-08)** : `deps.siteDomains` (domaines du site : `site.domain` + hôte de `site.url` du
manifeste ; adresse locale ou littéral IP exclus) va à `createAskTool({ allowedDomains })` (questions), à
`clientMessage(message, allowedDomains)` (message final, tous statuts) et à `AgentRun.allowedDomains` (journal de Claude,
motifs d'outils). Absent ou vide : TOUTE adresse devient `[link removed]`, y compris celle du site.

**Outil measure pendant un essai (SEC-07, défense en profondeur)** : avant de faire rafraîchir l'aperçu, la copie de travail repasse le
périmètre (`outOfScope`) et le lint CSS/TSX (`lintChanges`, mêmes zones, politique et valeurs accordées que
`runStaticChecks`). Violation → next dev n'est PAS sollicité (ni signal, ni mesure), étape warn « Measure refused… », et
Claude lit `MEASURE_BLOCKED` « Measure refused: fix the reported violations first. » suivi de 8 violations au plus.

**Faux Claude** (`deps.fakeClaude`, ENGINE_FAKE_CLAUDE) : première étape `warn` « FAKE Claude (<scénario>): scripted
local test, no real call. » et libellé du modèle « Fake Claude (<scénario>) — no real call » dans `EditorState.model`.

Messages finaux : `failed` « Couldn’t apply — nothing was changed. », `stopped` « Stopped — nothing was changed. ».

## Forces
- Refus 409 décidés sans `await` entre vérification et inscription ; `serial` pour request / validate / cancel.
- Tests sur un vrai dépôt git avec le vrai design system de test de Conduit, le vrai hook, les vrais contrôles statiques
  et le faux Claude : statuts, commits, retour arrière, textes, ajustement, validate, cancel, coût repris, 409, reprise.

## Faiblesses et limites connues
- Contrôles du rendu sur le PREMIER élément seulement (une session d'aperçu) ; les autres éléments visés ne comptent pas
  contre l'isolation (`alsoChanged`) mais leur cadre, leurs lignes et leur contraste ne sont pas relevés.
- `typecheck` lance `next typegen` puis `tsc` complet (lent, jusqu'à 3 min) ; seulement si un .ts/.tsx a changé.
- Le signal « aperçu à jour » compare le TEXTE rendu côté serveur ; un texte transformé par le rendu (découpé, remplacé)
  ne serait jamais « vu » → failed. CSS : on compte sur Turbopack qui recompile à la requête.
- Les captures (`shots/<jobId>`) ne sont jamais purgées.
- Le faux Claude lit le prompt réel (sélecteurs de la zone, champs modifiables) : un changement de format du prompt
  (engine-claude) casse `fake-claude.test.ts`, pas le vrai Claude.

## Points sensibles
- JAMAIS d'écriture Sanity avant que l'instantané soit dans le magasin ; jamais de 2e essai après `fatal`.
- JAMAIS un libellé ou un texte venu du navigateur dans le prompt (zones.json fait foi ; la note est citée par buildPrompt).
- Ne pas ajouter d'`await` entre `assertCanStart` et `store.transact` dans `request` (`settleFinished` vient AVANT le
  premier `assertCanStart`).
- Ne jamais remettre `await deps.usage.record` dans `afterJob` : `running` resterait pris le temps de l'écriture Sanity
  (~1 s de 409 busy après done, vu en vérification réelle).
- Ne jamais faire rendre l'aperçu (measure, `signal.waitFresh`) sans passer par `waitFreshChecked` (SEC-07).
- `toolAccess` toujours avec `lint` (SEC-07) ; `hardcoded` passé par RÉFÉRENCE (jamais une copie).
- Tout texte de Claude montré au client passe par `toClient` (= `clientMessage(…, allowedDomains)`, SEC-08).

## Pièges
- `await` entre `assertCanStart` et `transact` : deux demandes simultanées passeraient toutes deux (d'où les trois
  vérifications et l'inscription synchrone).
- Le signal d'aperçu compare le TEXTE rendu côté serveur, pas le CSS : pour un changement de style seul, il ne prouve
  que la réponse de next dev (Turbopack recompile à la requête).
- SEC-07 : bloquer measure et le signal n'empêche pas next dev de recompiler un fichier écrit — une page déjà ouverte
  (session Chrome des contrôles, iframe de l'admin) reçoit le HMR. La barrière effective est la pré-validation du CONTENU
  dans le hook, ACTIVE depuis que `toolAccess.lint` est passé (rien d'interdit n'est écrit) ; ne jamais construire un
  `toolAccess` sans `lint` (un composant serait alors refusé, un CSS jugé seulement après l'essai). L'isolation de next
  dev reste à faire (mode hébergé).
- Tests : un Edit du faux Claude dont `find` apparaît plusieurs fois est REFUSÉ (hook et faux Claude, comme l'outil
  réel) : utiliser `LEDE_MUTED` / `ledeColor` de testing.ts pour la couleur de `.lede`. Une valeur en dur n'atteint plus
  le disque : pour un 2e essai, faire échouer les contrôles du rendu (`preview.verdicts`), pas le lint.
- `runAgent` du banc reçoit la fonction du faux Claude : une enveloppe (`makeBench({ runAgent })`) peut observer les
  outils (ex. la réponse de measure) sans toucher au cycle.

## Comment modifier
- Nouveau refus d'entrée : `request.ts` (message anglais) + test dans `units.test.ts`.
- Nouvelle étape du cycle : `run.ts` (penser au retour arrière et à `signal.aborted`) + scénario dans `service.test.ts`
  avec `makeBench([...fakeScenarios])`.
- Route de développement du site à cacher à Claude : `DEV_ROUTES` de `site.ts` + test dans `run.test.ts`.
- Scénario du faux Claude : `FAKE_CLAUDE_SCENARIOS` (config.ts) puis `callFor` de `fake-claude.ts` + `fake-claude.test.ts`.
- Nouveau statut de modification : contrat d'abord (orchestrateur), puis `afterJob` dans `service.ts`.

## Tests
`npx vitest run engine/src/jobs` (~10 s). Non couvert : Claude réel, Chrome réel (faux aperçu), next dev réel, HMR.
À la main : `ENGINE_FAKE_CLAUDE=css` dans `engine/.env.local`, relancer `npm run engine`, faire une demande Style dans
l'éditeur (`/admin/editor?page=/`), puis Validate ou Cancel.

## Décisions et « À trancher »
- Stop et réponses aux questions : ouverts à toute personne qui a `ai.editor`, pas seulement à l'auteur — DÉCIDÉ,
  accepté (orchestrateur, FOLLOWUPS #17) : un seul admin partagé, une demande à la fois ; `stop(_user)` et
  `answer(_user)` ignorent volontairement l'utilisateur.
- Pages citées à Claude : routes de `src/app/(site)` moins `DEV_ROUTES` (AI-07), plutôt que le manifeste
  `admin.config.ts` (qui décrit les pages éditables dans l'admin, pas forcément toutes les routes publiques).
- À trancher : purge des captures ; contrôles du rendu sur chaque élément d'une demande multiple.

## Demandes de contrat
- (Aucune bloquante.) Suggestion : un `CheckId` `placement` si l'admin doit montrer le replacement des zones intérieures.
