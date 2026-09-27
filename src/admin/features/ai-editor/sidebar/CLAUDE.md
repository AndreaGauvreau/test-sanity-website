# ai-editor/sidebar — LLM context

> Propriétaire : editor-sidebar · Figma : D1, D2, D3 (docs/admin/figma/screens/D1-3.md), G2 (states/G2.md, les 9 états),
> G1 scénario 2 · fiches EditorHeader, ModelUsage, ClaudeHeader, Message, Step, AnswerOption, ReviewCard, Composer,
> ElementChip · Mis à jour : 2026-09-27
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
- `usage.ts` — PUR : `usageByJob`, `cumulativeUsage` (cumul du moteur + écarts par demande, sans double compte).
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
  coût est estimé (demande interrompue).
- G1 scénario 2 : au chargement, `EditorState.pending` de la page → carte + Composer `adjust` ; demande active → sondage
  repris. Demande active ou modification en attente sur une AUTRE page → Callout + Composer inactif.
- Sondage : 900 ms après chaque réponse ; erreur affichée sous le fil (« … Retrying… », « (retrying — N attempts) ») ;
  arrêt au démontage (abort) ; à la fin de la demande → rechargement de l'état (fil, pending, cumul).
- Validate / Cancel : depuis la carte OU la barre de l'aperçu (`store.get().decisions`) ; si le canvas appelle le moteur
  lui-même et vide `pending`, la sidebar recharge l'état pour afficher la ligne de fin.
- Erreurs d'action (409 busy / awaiting_validation / conflict, 400…) : message du moteur sous le champ (`role=alert`),
  puis rechargement de l'état sur 409. Premier chargement impossible : Callout + « Try again ».
- Focus : jamais volé à l'aperçu (sélection) ; donné au champ pour « Other answer… » ou quand le focus s'est perdu
  (contrôle du fil disparu). Annonces : zone `role=status` (« Claude: Working… », « Claude needs your answer. »…).
- Redimensionnement : 320 px par défaut (UI Figma), 260 → 480, double-clic → 260, ← → 16 px, Maj 64, Home / End.

## Moteur simulé — `src/admin/core/engine/mock/editor.ts` (ENGINE_MOCK=1)

- `handleEditor: MockHandler` (signature gardée pour `mock/index.ts`), `createEditorMock({ now })` (tests),
  `EditRequestSchema` / `AnswersSchema` (zod, miroir du moteur), `MOCK_CONTENT_DRAFTS`, `MOCK_QUESTION_TTL_MS`,
  `listValidatedDesignChanges()` / `clearValidatedDesignChanges(ids?)` pour publish-ui.
- Sans minuteur : l'état avance à chaque lecture d'après l'horloge. Chronologie : 0 queued → 0,5 s running
  (« Reading Hero.module.css » d'après zones.json) → 1,4 s tokens → 2,4 s selon le scénario : question (Style + « big /
  bigger / smaller / size… »), refus (« already » / « nothing »), échec au 2e essai (« fail », 4,2 s), sinon suite
  directe. Après réponse : 0 étape de modification → 0,9 s mesure → 1,8 s contrôles → 2,7 s done (résumé, contrôles,
  textes, usage 20.9k / 1.6k / $0.09 ; ajustement 12.4k / 620 / $0.05 ; interrompu : estimé).
- Règles : 409 busy / awaiting_validation / conflict ; 400 (zod) ; 404 ; question expirée à 15 min → stopped ; Stop ;
  Validate (`pendingTotal` = 2 brouillons de démo + validées) ; Cancel ; fil de 50 entrées par page ;
  `preview = { url: <origine du manifeste>/admin/editor/harness?page=<id>, origin }` (127.0.0.1:4040 par défaut).
- État sur `globalThis` (survit au rechargement à chaud, pas au redémarrage). Aucune écriture Sanity ni git.

## Forces

- Logique pure séparée et testée (machine, cumul, sondage) ; intégration testée sur le VRAI moteur simulé (même code
  qu'`ENGINE_MOCK=1`) : les 9 états, reprise G1, 409, erreurs de sondage, démontage.
- Aucune dette du POC : erreurs de sondage visibles, pas de délai fixe (recharge sur signal : fin de demande,
  décision), pas de code orphelin, pas de setInterval (une requête en vol au plus).
- Tout le texte d'interface dans `UI` (machine.ts) ; composants purs sauf Composer / Thread / ResizeHandle.

## Faiblesses et limites connues

- Pas de flux temps réel : une demande lancée par un AUTRE utilisateur n'apparaît qu'au prochain chargement / action.
- `Stop` n'arrête la demande qu'au moment où le moteur le lit (dépend du moteur).
- Les tests d'intégration utilisent `fireEvent` (user-event se bloque sous les minuteurs simulés de Vitest) ; le clavier
  fin est couvert par `Composer.test.tsx` en temps réel.
- Captures d'écran (`/editor/jobs/:id/shots/*`) non affichées (hors Figma de la sidebar).
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

## Comment modifier

- Changer un libellé : `UI` dans `machine.ts` (et les tests qui le citent).
- Ajouter un état de demande : `headerView` + `Thread.tsx` (LatestJob / CollapsedJob) + test machine.
- Nouvelle action du moteur : `engineClient` (auth-core) puis `useConversation` (passer par `onJob` pour une demande).
- Changer les bornes de largeur : `SIDEBAR_MIN/MAX/DEFAULT` (ResizeHandle.tsx) et la décision 14 de l'architecture.

## Tests

`npx vitest run src/admin/features/ai-editor/sidebar src/admin/core/engine/mock` — 49 + 10 tests : machine d'états du
Composer, `canApply`, réponses (`buildAnswers`), libellés, cumul, sondage (intervalle, recul, 404, abort), Composer
(jsdom, user-event réel), sidebar complète (jsdom, moteur simulé : 1→8, Stop, échec, Other answer, Cancel + reprise G1,
décision par le magasin, 409 busy, erreur de sondage + démontage, erreur de chargement, poignée), moteur simulé.
À la main : `ENGINE_MOCK=1`, http://127.0.0.1:4040/admin/editor?page=home ; « bigger » / « size » dans la demande
avec Style → question ; « fail » → échec ; « already » → refus ; sinon directement « Done ».

## Décisions et « À trancher »

- Q14 : 260-480 px, double-clic 260 ; largeur par défaut 320 (UI Figma), mémorisée par navigateur.
- « Publish ↗ » ouvre E1 dans le même onglet (D0 « Revenir ») ; grisé pendant le travail.
- « Working… » aussi pour `queued` (le Figma n'a pas d'état « en file »).
- Portée d'un ajustement = portée de la demande d'origine (le Figma n'affiche pas Style / Text en `adjust`).

## Demandes de contrat

- **editor-canvas** : la barre flottante « Modified by Claude · to validate » devrait appeler
  `store.get().decisions?.validate() / .cancel()` et lire `store.get().deciding` (un seul chemin, boutons synchronisés)
  plutôt que `engineClient` en direct ; la sidebar se resynchronise déjà dans les deux cas. Passer
  `backHref` (écran d'origine, ex. `/admin/pages/home/seo`) à `<EditorStoreProvider>` pour G1 (« même onglet »).
- **auth-core / proxy** : l'iframe de l'aperçu (`/admin/editor/harness`, et `/` en simulé) est refusée par
  `frame-ancestors 'none'` sur `/admin/**` : à régler avec editor-canvas.
- **ui-foundations** (Chip) : `[data-state='on']:hover` doit garder le fond inversé (texte illisible aujourd'hui).
- **publish-ui** : `listValidatedDesignChanges()` / `clearValidatedDesignChanges()` (mock/editor.ts) donnent les
  modifications validées pour E1 « Design » en mode simulé.
