# ai-editor/sidebar — LLM context

> Propriétaire : editor-sidebar · Figma : D1, D2, D3 (docs/admin/figma/screens/D1-3.md), G2 (states/G2.md, les 9 états),
> G1 scénario 2 · fiches EditorHeader, ModelUsage, ClaudeHeader, Message, Step, AnswerOption, ReviewCard, Composer,
> ElementChip · Mis à jour : 2026-09-28 (coût facturé / inclus dans l'abonnement Claude)
> Possède aussi : `src/admin/features/ai-editor/state/` (voir son CLAUDE.md) et `src/admin/core/engine/mock/editor.ts`
> (moteur simulé, section dédiée ci-dessous).

## Utilité

La conversation avec Claude dans l'éditeur IA plein écran (`/admin/editor?page=<id>`, route d'editor-canvas) : sidebar
gauche avec l'en-tête (« ‹ Admin », « Publish ↗ », consommation cumulée), le fil (messages, étapes, question 🟢 ⚪ 🔴,
résultat, carte de validation) et le Composer (éléments, Style / Text, demande, Apply / ⌘ ↵). Pour les trois rôles
(`ai.editor` : kuartz, client, editor ; la page vérifie le droit, le relais du moteur aussi). Ne dessine PAS l'aperçu,
la barre d'outils ni la barre flottante « Modified by Claude · to validate » (editor-canvas).

## Fichiers

- `index.tsx` — `<EditorSidebar />` (sans props) : assemble en-tête, fil, Composer, poignée ; largeur mémorisée
  (localStorage `kz-admin:editor-sidebar-width`, try/catch) ; défilement collé en bas ; focus ; zone `role=status`.
- `useConversation.ts` — contrôleur sans rendu : GET état, POST demande / ajustement / réponse / Stop / Validate /
  Cancel, sondage, écritures dans le magasin partagé, cumul d'usage. `errorMessage()`.
- `machine.ts` — PUR : `composerState`, `canApply`, `isValidNote`, `toggleScope`, `buildAnswers`, `headerView`,
  `stepView`, `summaryText`, `checksLine` / `checksSpoken`, `reviewTitle`, `validatedText`, `latestJobIndex`,
  `upsertJob`, `shouldRestoreRequest`, `adjustmentScope`, textes `UI` (anglais), constantes (600, 300, 8, 900 ms).
- `poller.ts` — PUR (minuteurs) : `startJobPolling` (900 ms, recul 5 s max, erreurs remontées, abort, 404 = fin).
- `usage.ts` — PUR : `usageByJob`, `cumulativeUsage` (cumul du moteur + écarts par demande, sans double compte ; coût
  séparé demande par demande : `ConversationUsage` = `costUsd` FACTURÉ + `includedUsd` abonnement Claude).
- `components/EditorHeader.tsx` — ‹ Admin (next/link) · Publish ↗ (lien, ou bouton désactivé pendant le travail) · ModelUsage small.
- `components/ClaudeHeader.tsx` — ✦ Claude + état (ready / working + loader / asking / done + usage / stopped).
- `components/Message.tsx` — bulle request (puces) / adjustment. `components/ElementChip.tsx` — puce + ✕ facultatif.
- `components/Step.tsx` — log / change / done / validated / stopped / error (+ `trailing`, `label` accessible).
- `components/AnswerOption.tsx` — option de réponse (point coloré, « prop: value » en code, `aria-pressed`).
- `components/ReviewCard.tsx` — « 1 change to validate » / « 1 change · adjusted once » + Cancel / ✓ Validate.
- `components/Composer.tsx` — champ (6 états Figma + `answer`), puces, portée, compteur, ⌘ ↵, Échap (answer).
- `components/Thread.tsx` — le fil : dernière demande détaillée, précédentes repliées ; animations d'entrée.
- `components/ResizeHandle.tsx` — poignée 260 → 480 px (APG window splitter), `clampWidth`, constantes.
- `*.module.css` — un module par composant, tokens `--k-*` seulement. `EditorSidebar.module.css` — cadre.
- `fixtures.ts` — données de test (demande, usage). Tests : `machine`, `usage`, `poller`, `components/Composer`,
  `EditorSidebar` (intégration jsdom sur le moteur simulé).

## Contrats

- Entrées : magasin de l'éditeur (`useEditorStore()` : pageId, path, selection, viewport, job, pending, deciding,
  backHref) ; moteur par `engineClient.editor.*` (relais `/admin/api/engine`, contrat `core/contracts/engine.ts` :
  `EditorState`, `EditJob`, `PendingChange`, `ThreadEntry`, `Question`, `Answer`, `Usage`).
- Sorties (magasin) : `setJob` (demande active ou dernière demande), `setPending` (modification de CETTE page
  seulement), `setPreview` (EditorState.preview), `clearSelection` à l'envoi, `setSelection` (demande rendue au champ),
  `refreshPreview` (un texte Sanity a changé ou a été remis en l'état), `registerDecisions({ validate, cancel })`,
  `setDeciding`. Export : `EditorSidebar` (signature figée, sans props).
- Dépend de : `core/engine/client`, `core/contracts`, `core/auth/next-path` (`sanitizeNextPath`, pur), kit `@/admin/ui`
  (Button, ButtonContent, buttonClassName, Chip, Kbd, Callout, ModelUsage, Icon, motion). Utilisé par :
  `features/ai-editor/page/EditorScreen.tsx` (editor-canvas).

## Comportement (G2, 9 états)

1. Rien de sélectionné : « Claude · Ready » + consigne ; Composer `empty` (« Select an element in the page (Shift +
   click for several) »), Apply grisé.
2. / 3. Un ou plusieurs éléments (sélection du canvas) : puces ✕, Style / Text rien de coché (remis à zéro à chaque
   nouvelle sélection quand le champ est vide), au moins une portée, 1-600 caractères, 8 éléments max.
4. Envoyé : POST `/editor/requests` ; la bulle monte dans le fil, le champ et la sélection se vident ; « Working… » +
   étapes ; Stop ; Publish grisé (`isLocked`) ; Composer « Claude is working… ».
5. Question : « Needs your answer », texte de la question, options (ton = couleur du point ; 🔴 affiche `prop: value`),
   « Other answer… » rouvre le champ (300 caractères, Échap revient). Un clic relance Claude dès que CHAQUE question a
   sa réponse (validation `buildAnswers`). Composer « Waiting for your answer above… ».
6. Terminé : « Done · 24 s » + tokens et coût de la demande, résumé (« … (Sanity draft) » pour un texte), valeurs en
   dur accordées, « Checks: contrast ✓ · mobile ✓ · tablet ✓ » (✕ en échec, ! avertissement ; phrase lue différente),
   carte « 1 change to validate », Composer `adjust` (« Adjust this change… », puces SANS ✕).
7. Ajustement : POST avec `changeId` et la portée de la demande d'origine ; « Adjusted · 12 s » ; « 1 change · adjusted
   once / twice / N times ».
8. Validé : « Validated — added to Publish (N changes) » (`pendingTotal` du moteur) ; tout le fil se replie ; retour à 1.
9. Arrêté / erreur : « Stopped — nothing was changed. » / « Couldn’t apply — nothing was changed. » (+ détail du
   moteur) ; la demande revient dans le champ (texte, portée, éléments) si le champ est vide. Refus (`rejected`) :
   message de Claude, demande rendue aussi.
- Fil : la dernière demande est détaillée seulement si elle termine le fil ; les autres sont repliées sur une ligne
  (« Done · 24 s » + tokens + coût) — G2 : « chaque demande garde sa durée, ses tokens et son coût ».
- En-tête : cumul de la conversation (`cumulativeUsage`) ; « 0 input · 0 output · $0.00 » au départ ; « ~ » si un
  coût FACTURÉ est estimé (demande interrompue). Demandes passées par l'abonnement Claude (`Usage.access`, moteur
  local) : jamais comptées comme facturées — « Opus 5.5 120k input · 2.8k output · Included » (« $0.02 + included » en
  cas de mélange), prix API dans l'infobulle et la ligne lue (« … included in your Claude subscription (≈ $0.39 at API
  prices) »). Même règle pour chaque demande du fil (« Done · 24 s » + usage, lignes repliées) : `ModelUsage` lit
  `access`. Le cumul du moteur (`sumUsage`) ne garde que l'accès de sa 1re demande : la séparation est refaite depuis le
  fil, jamais lue sur ce cumul.
- G1 scénario 2 : au chargement, `EditorState.pending` de la page → carte + Composer `adjust` ; demande active → sondage
  repris. Demande active ou modification en attente sur une AUTRE page → Callout + Composer inactif.
- Sondage : 900 ms après chaque réponse ; erreur affichée sous le fil (« … Retrying… », « (retrying — N attempts) ») ;
  arrêt au démontage (abort) ; à la fin de la demande → rechargement de l'état (fil, pending, cumul).
- Validate / Cancel : depuis la carte OU la barre de l'aperçu (`store.get().decisions`) ; si le canvas appelle le moteur
  lui-même et vide `pending`, la sidebar recharge l'état pour afficher la ligne de fin.
- Erreurs d'action (409 busy / awaiting_validation / conflict / publishing, 503 unavailable, 404, 400) : message du
  moteur sous le champ (`role=alert`), la demande reste dans le champ (vidé seulement après un envoi accepté), puis
  rechargement de l'état sur 409. Premier chargement impossible : Callout + « Try again ».
- Focus : jamais volé à l'aperçu (sélection) ; donné au champ pour « Other answer… » ou quand le focus s'est perdu
  (contrôle du fil disparu). Annonces : zone `role=status` (« Claude: Working… », « Claude needs your answer. »…).
- Redimensionnement : 320 px par défaut (UI Figma), 260 → 480, double-clic → 260, ← → 16 px, Maj 64, Home / End.

## Moteur simulé — `src/admin/core/engine/mock/editor.ts` (ENGINE_MOCK=1)

- Exports : `handleEditor: MockHandler` (signature gardée pour `mock/index.ts`), `editorMock()` (instance du
  processus), `createEditorMock({ now, scenario, holder, publish })` (tests), `EditRequestSchema` / `AnswersSchema`
  (zod, miroir du moteur), `MOCK_EDITOR_SCENARIOS`, `isMockEditorScenario`, `setEditorMockScenario()` /
  `editorMockScenario()`, `mockEditorHealth()` / `mockEditorHealthFor(scenario)`, `MOCK_EDITOR_MESSAGES` (messages du
  vrai moteur), `MOCK_PUBLISH_PORT`, `MOCK_CONTENT_DRAFTS`, `MOCK_QUESTION_TTL_MS`, et pour publish-ui (FOLLOWUPS #32)
  `listValidatedDesignChanges()` / `clearValidatedDesignChanges(ids?)`.
- Sans minuteur : l'état avance à chaque lecture d'après l'horloge. Chronologie : 0 queued → 0,5 s running
  (« Reading Hero.module.css » d'après zones.json) → 1,4 s tokens → 2,4 s selon la demande : question (Style + « big /
  bigger / smaller / size… »), refus (« already » / « nothing »), échec au 2e essai (« fail », 4,2 s), sinon suite
  directe. Après réponse : 0 étape de modification → 0,9 s mesure → 1,8 s contrôles → 2,7 s done (résumé, contrôles,
  textes, usage 20.9k / 1.6k / $0.09 ; ajustement 12.4k / 620 / $0.05 ; interrompu : estimé ; `access` = celui de la
  santé).
- Scénarios nommés (conditions du moteur, `ENGINE_MOCK_EDITOR=<id>` au démarrage, `setEditorMockScenario()` ensuite ;
  le fil et les modifications restent) : `ready` (défaut : accès Claude configuré — 'api-key' si `MOCK_HEALTH` dit
  'none' —, aperçu prêt, jeton Sanity, `ok: true`) ; `no-claude` (access 'none', `ok: false`, toute demande → 503) ;
  `preview-starting` (aperçu pas prêt, `ok: false`, → 503) ; `no-sanity-token` (`sanityWrite: false` : Style passe,
  Text sur une zone dont `text.source === 'sanity'` → 503, Cancel d'une modification avec textes → 503) ;
  `restore-pending` (toute nouvelle demande → 503, santé inchangée). `EditorState.health` = `mockEditorHealthFor`,
  `ok` calculé comme `engine/src/server/health.ts` (accès, aperçu prêt, branche draft).
- Refus d'une demande, dans l'ordre du vrai moteur (`engine/src/jobs/service.ts`, assertCanStart puis request) :
  400 (zod) → 409 publishing (publication simulée en cours) → 409 busy → sans `changeId` : 409 awaiting_validation ;
  avec : 404 (inconnue) / 409 conflict (plus ouverte) / 409 busy (pas `to-validate`) → 503 (texte à restaurer, accès,
  aperçu, texte Sanity sans jeton) → 400 (ajustement depuis une autre page). Messages = ceux du vrai moteur.
- Validate / Cancel : idempotents (déjà validée / annulée → 200 et la modification) ; `working` → 409 busy ; plus
  ouverte → 409 conflict ; demande active → 409 busy ; publication → 409 publishing ; Cancel avec textes sans jeton →
  503. Validate range `{ changeId, commit, title, validatedBy, validatedAt, files, page }` pour E1 « Design » (`page` =
  `change.page`, la page où la modification a été faite, pour le View ↗ — FOLLOWUPS #41, test « #41 ») et écrit
  `pendingTotal` = `pending.total` de la publication simulée (repli : 2 brouillons de démo + validées).
- Verrou et total lus par `MOCK_PUBLISH_PORT` : GET /publish/status de `publishMock()` (publish-ui), `state ===
  'publishing'` → 409. En test, `createEditorMock()` sans `publish` n'a aucun lien avec la publication.
- Autres règles : question expirée à 15 min → stopped ; Stop ; fil de 50 entrées par page ;
  `preview = { url: <origine du manifeste>/admin/editor/harness?page=<id>, origin }` (127.0.0.1:4040 par défaut).
- Le MONDE (fil, modifications, scénario) est sur `globalThis` (`Symbol.for('kz.admin.mock.editor.world')`) : il
  survit au rechargement à chaud, pas au redémarrage ; le code est celui du module courant. Aucune écriture Sanity ni git.

## Forces

- Logique pure séparée et testée (machine, cumul, sondage) ; intégration testée sur le VRAI moteur simulé (même code
  qu'`ENGINE_MOCK=1`) : les 9 états, reprise G1, 409 busy / publishing, 503, erreurs de sondage, démontage.
- Le moteur simulé suit le contrat du vrai moteur (refus, ordre, messages, idempotence des décisions, santé) : un écran
  qui marche en simulé n'est pas surpris par le vrai moteur (constat AI-04).
- Aucune dette du POC : erreurs de sondage visibles, pas de délai fixe (recharge sur signal : fin de demande,
  décision), pas de code orphelin, pas de setInterval (une requête en vol au plus).
- Tout le texte d'interface dans `UI` (machine.ts) ; composants purs sauf Composer / Thread / ResizeHandle.

## Faiblesses et limites connues

- Pas de flux temps réel : une demande lancée par un AUTRE utilisateur n'apparaît qu'au prochain chargement / action.
- `Stop` n'arrête la demande qu'au moment où le moteur le lit (dépend du moteur).
- Les tests d'intégration utilisent `fireEvent` (user-event se bloque sous les minuteurs simulés de Vitest) ; le clavier
  fin est couvert par `Composer.test.tsx` en temps réel.
- Captures d'écran (`/editor/jobs/:id/shots/*`) non affichées (hors Figma de la sidebar).
- Les 503 du moteur s'affichent comme toute erreur d'action (message sous le champ) : pas d'état dédié « éditeur
  indisponible » avant l'envoi, même quand `EditorState.health.ok` est faux (le Figma G2 n'en prévoit pas).
- Moteur simulé : ne vérifie pas que la zone existe dans zones.json (le vrai moteur → 400). Scénario : au démarrage
  (`ENGINE_MOCK_EDITOR`) ou à chaud par `/admin/editor/mock-scenario` (dev + `ENGINE_MOCK=1`).
- Écarts assumés au Figma : option 🔴 sur deux lignes (valeur `prop: value` exigée) ; puces d'un ajustement sans ✕ ;
  demandes repliées avec leur usage ; « Cancelled — the change was undone. » (texte non fourni par le Figma) ;
  bord du Composer en `border/focus` quand le champ a le focus.

## Points sensibles

- Aucune donnée sensible : le client ne parle qu'au relais same-origin ; jamais d'import de `core/engine/server` ni
  de `process.env` ici.
- Textes du moteur et du site (note, question, résumé, message) rendus en nœuds texte React, jamais en HTML.
- `backHref` passe par `sanitizeNextPath` (chemins `/admin…` seulement : pas de redirection ouverte).
- Ne jamais appeler Validate / Cancel ailleurs que par `decide()` (garde `deciding`, rechargement, refreshPreview).

## Pièges

- `latestJobIndex` : un fil qui finit par « validated » / « cancelled » n'a plus de demande détaillée (voulu, G2 état 8).
- `onJob` est le passage obligé de toute mise à jour d'une demande (sondage, POST, réponse, Stop) : la finalisation
  (rechargement, aperçu, demande rendue) n'a lieu qu'une fois par id (`finalized`).
- Le `pending` du magasin n'est posé que pour CETTE page (le canvas dessine l'anneau d'après lui).
- Un Chip « on » survolé devient illisible (règle `:hover` du kit plus forte que `[data-state='on']`) : bug du kit.
- Tests : `vi.useFakeTimers({ toFake: ['setTimeout', …, 'Date'] })` + `MotionGlobalConfig.skipAnimations = true` ;
  `next/link` simulé.
- `mock/editor.ts` ↔ `mock/publish.ts` s'importent l'un l'autre : ne JAMAIS appeler l'autre module au chargement
  (niveau supérieur) ; tout passe par des fonctions (`publishMock()`, `editorMock()` paresseux).
- `EditorMock.handle` doit rester SYNCHRONE : `MOCK_EDITOR_PORT.blocker` (publish.ts) lit GET /editor/state sans
  attendre et ignore une réponse différée. `getState` ne lit jamais la publication (sinon boucle publish ↔ éditeur).
- Ne pas ranger l'instance entière sur `globalThis` (ancienne clé `kz.admin.mock.editor`) : son code ne suivait plus
  le rechargement à chaud. Seul le monde y vit ; une nouvelle forme de monde exige un redémarrage du 4040.

## Comment modifier

- Changer un libellé : `UI` dans `machine.ts` (et les tests qui le citent).
- Ajouter un état de demande : `headerView` + `Thread.tsx` (LatestJob / CollapsedJob) + test machine.
- Nouvelle action du moteur : `engineClient` (auth-core) puis `useConversation` (passer par `onJob` pour une demande).
- Changer les bornes de largeur : `SIDEBAR_MIN/MAX/DEFAULT` (ResizeHandle.tsx) et la décision 14 de l'architecture.
- Nouveau refus du vrai moteur : le reproduire dans `refuseStart` / `unavailableFor` / `decide` de mock/editor.ts, au
  même rang et avec le même message (`MOCK_EDITOR_MESSAGES`), plus un test dans `mock/editor.test.ts`.
- Nouveau scénario simulé : entrée dans `MOCK_EDITOR_SCENARIOS`, effet dans `mockEditorHealthFor` et/ou
  `unavailableFor`, test ; le documenter ci-dessus.

## Tests

`npx vitest run src/admin/features/ai-editor/sidebar src/admin/core/engine/mock/editor.test.ts` — 61 + 24 tests :
machine d'états du Composer, `canApply`, réponses (`buildAnswers`), libellés, cumul (dont coût facturé / inclus :
abonnement seul, mélange, « ~ » du facturé seulement ; en-tête « Included » / « $0.02 + included »), sondage (intervalle, recul, 404,
abort), Composer (jsdom, user-event réel), sidebar complète (jsdom, moteur simulé : 1→8, Stop, échec, Other answer,
Cancel + reprise G1, décision par le magasin, 409 busy, 409 publishing, 503 « no-claude », erreur de sondage +
démontage, erreur de chargement, poignée), moteur simulé (enchaînement, gardes, idempotence, 5 scénarios, verrou de
publication, `pendingTotal`, instance du processus branchée sur `publishMock()`).
À la main : `ENGINE_MOCK=1`, http://127.0.0.1:4040/admin/editor?page=home ; « bigger » / « size » dans la demande
avec Style → question ; « fail » → échec ; « already » → refus ; sinon directement « Done ». 409 publishing : lancer
Publish (E1) puis envoyer une demande pendant « Publishing… », ou `POST /admin/publish/mock-scenario
{"scenario":"publishing"}` (route de publish-ui). 503 : `POST /admin/editor/mock-scenario {"scenario":"no-claude"}`
(à chaud, dev + `ENGINE_MOCK=1`) ou redémarrer avec `ENGINE_MOCK_EDITOR=no-claude` (ou `preview-starting`,
`no-sanity-token`, `restore-pending`).

## Décisions et « À trancher »

- Q14 : 260-480 px, double-clic 260 ; largeur par défaut 320 (UI Figma), mémorisée par navigateur.
- « Publish ↗ » ouvre E1 dans le même onglet (D0 « Revenir ») ; grisé pendant le travail.
- « Working… » aussi pour `queued` (le Figma n'a pas d'état « en file »).
- Portée d'un ajustement = portée de la demande d'origine (le Figma n'affiche pas Style / Text en `adjust`).
- Moteur simulé (AI-04, vague 3) : santé « configurée » par défaut pour pouvoir travailler ; les indisponibilités
  sont des scénarios nommés, pas des mots-clés dans la demande (la santé doit changer avec elles).

## Demandes de contrat

Toutes faites (vérifiées le 2026-09-27) :
- ~~editor-canvas (FOLLOWUPS #29)~~ : `ReviewBar` d'`EditorCanvas.tsx` appelle `store.get().decisions` (validate / cancel)
  et lit `deciding` ; `EditorScreen` passe `backHref` à `<EditorStoreProvider>` (G1 « même onglet »).
- ~~auth-core : GET /health simulé~~ : `mock/index.ts` renvoie `mockEditorHealth()` (suit le scénario, FOLLOWUPS #39).
- ~~editor-canvas ou publish-ui : route de scénario~~ : `src/app/admin/editor/mock-scenario/route.ts` (GET / POST,
  `setEditorMockScenario`, dev + `ENGINE_MOCK=1`, droit `ai.editor`) ; `ENGINE_MOCK_EDITOR` documenté dans `.env.example`.
- ~~ui-foundations (Chip, FOLLOWUPS #23)~~ : `.chip[data-state='on']:hover` garde le fond inversé (`Chip.module.css`).
- publish-ui (FOLLOWUPS #32, #41) : côté éditeur fait — `listValidatedDesignChanges()` (avec `page` pour View ↗) /
  `clearValidatedDesignChanges()`, et `pendingTotal` lu dans la publication simulée.

## En-tête : libellé du modèle

- `EditorHeader` reçoit `model = { id, label }` (EditorState.model) : le libellé du moteur prime sur `modelLabel(id)`
  (ex. « Fake Claude (auto) — no real call »). Faux Claude repéré par `isFakeModel` (/fake/i sur libellé ou id) et
  signalé en jaune (`data-fake`). Sans libellé : repli sur `ModelUsage` avec l'id. Test : `components/EditorHeader.test.tsx`.
- `usage` de l'en-tête : `ModelUsageValue` (le `ConversationUsage` de `cumulativeUsage`, forme « cumul » : `costUsd`
  facturé + `includedUsd`). Faux Claude : son coût simulé reste affiché dans le fil (marqué par le libellé jaune) mais
  le moteur ne l'écrit plus dans le journal aiUsage (B5, B1 et Ask AI ne le voient jamais).
