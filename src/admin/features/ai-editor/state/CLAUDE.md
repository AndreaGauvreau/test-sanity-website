# ai-editor/state — LLM context

> Propriétaire : editor-sidebar (créé par l'orchestrateur, extensions ADDITIVES seulement) · Figma : D1-D3, G1, G2 ·
> Mis à jour : 2026-09-28 (formats de l'aperçu du contrat, largeur relue ramenée à son format)

## Utilité

Magasin partagé de l'écran de l'éditeur IA (un par écran, `/admin/editor?page=<id>`) entre la sidebar Claude
(editor-sidebar) et l'aperçu (editor-canvas). Petit magasin externe + `useSyncExternalStore`, fourni par contexte.
Aucune donnée sensible, aucun appel réseau : il ne fait que porter l'état entre les deux moitiés de l'écran.

## Fichiers

- `store.ts` — `createEditorStore`, types `EditorState`, `EditorStore`, `EditorDecisions`, `EditorMode`, `isLocked`,
  `useEditorState`.
- `context.tsx` — `EditorStoreProvider({ pageId, path, backHref?, children })` (crée le magasin une fois),
  `useEditorStore()` (lève une erreur hors du fournisseur).

## Contrats

- État : `pageId`, `path`, `mode` ('select' | 'view'), `viewport` (`Viewport` du contrat, `EDITOR_VIEWPORTS` : 1280 | 810
  | 375, toujours un format actuel), `selection` (`ElementTarget[]`,
  8 max), `job` (`EditJob | null`), `pending` (`PendingChange | null`), `bridgeReady`, `previewNonce` (d'origine) ;
  ajouts editor-sidebar : `backHref` (écran d'origine, chemin `/admin…`), `preview` (`EditorState.preview` du moteur),
  `decisions` (Validate / Cancel enregistrés par la sidebar), `deciding` ('validate' | 'cancel' | null).
- Actions : `setMode`, `setViewport`, `select(target, additive)`, `removeTarget`, `clearSelection`, `setJob`,
  `setPending`, `setBridgeReady`, `refreshPreview` (d'origine) ; ajouts : `setSelection(targets)`, `setPreview`,
  `registerDecisions(decisions) → désinscription`, `setDeciding`. Lecture : `get()`, `subscribe(listener)`.
- `isLocked(state)` : une demande est active (queued / running / waiting, toutes pages) → sélection, mode et saisie
  bloqués ; Desktop / Tablet / Mobile, Stop et les décisions restent possibles.
- Qui écrit : canvas → mode, viewport, selection, bridgeReady ; sidebar → job, pending (de CETTE page), preview,
  selection (demande rendue au champ, vidée à l'envoi), previewNonce, decisions, deciding.
- Utilisé par : `features/ai-editor/page/EditorScreen.tsx` (fournisseur, avec `backHref`), `canvas/`, `sidebar/`.
- Types : `ElementTarget`, `EditJob`, `PendingChange`, `Viewport` de `core/contracts/engine.ts`.

## Comportement

- `setMode`, `select`, `removeTarget`, `clearSelection`, `setSelection` ne font rien quand `isLocked` (G2 « pendant que
  Claude travaille »). `setViewport` n'est jamais bloqué.
- `viewport` passe par `viewportOf` (contrat) à la création (`createEditorStore({ viewport })`, Desktop par défaut) et dans
  `setViewport` : une largeur relue d'une version précédente (768, le Tablet d'avant le 2026-09-28) devient Tablet (810),
  jamais une valeur que la barre d'outils ne connaît pas.
- `select(target)` remplace la sélection ; `select(target, true)` (Maj + clic) ajoute ou retire l'élément ; 8 max
  (`setSelection` tronque aussi à 8). Deux cibles sont égales si zone, index, key et doc sont égaux.
- `refreshPreview()` incrémente `previewNonce` : l'aperçu se recharge (texte Sanity changé ou remis en l'état).
- `registerDecisions` : la barre flottante de l'aperçu appelle `store.get().decisions?.validate() / .cancel()` et lit
  `deciding` ; un seul chemin pour les deux boutons (FOLLOWUPS #29).
- `useEditorState(store, select)` re-rend seulement quand la tranche change par référence.

## Forces

- Simple, sans dépendance, testable sans React ; une seule source de vérité pour l'écran.
- Le verrou `isLocked` est appliqué dans le magasin, pas dans chaque composant : impossible de l'oublier.

## Faiblesses et limites connues

- Pas de persistance : un rechargement repart de l'état du moteur (GET /editor/state) ; seule la largeur de la sidebar
  est mémorisée (localStorage, côté sidebar).
- Pas de test unitaire propre : couvert par les tests d'intégration de la sidebar et du canvas.
- Chaque `set` notifie tous les abonnés (les sélecteurs filtrent) ; suffisant pour un écran, pas pour un gros arbre.

## Points sensibles

- Aucune donnée sensible ni secret. `backHref` n'est qu'une valeur ici : la sidebar le passe par `sanitizeNextPath`
  avant d'en faire un lien (pas de redirection ouverte).
- `pending` ne doit porter que la modification de CETTE page (le canvas dessine l'anneau d'après lui).

## Pièges

- Extensions ADDITIVES seulement (editor-canvas l'utilise en même temps) : ne jamais renommer un champ ni changer une
  signature.
- Sélecteurs de `useEditorState` : renvoyer des valeurs existantes, jamais un objet recréé (`(s) => ({ a: s.a })`
  re-rend en boucle avec `useSyncExternalStore`).
- `registerDecisions` : la désinscription ne vide `decisions` que si ce sont encore les mêmes (remontage en StrictMode).

## Comment modifier

- Nouveau champ : type dans `EditorState` + valeur par défaut dans `createEditorStore` + action ; documenter ici
  (Contrats, « Qui écrit »). Le rendre facultatif dans `EditorStoreProvider` s'il vient de la page.
- Nouvelle action bloquée pendant le travail : la garder derrière `isLocked(state)` comme `select`.

## Tests

Pas de fichier propre. Couvert par `sidebar/EditorSidebar.test.tsx` (sélection, verrou, decisions, previewNonce,
pending, backHref), `canvas/EditorCanvas.test.tsx` (barre flottante par `decisions`) et `canvas/logic.test.ts` (largeur
768 relue → Tablet, à la création et par `setViewport`, même verrouillé). Commande :
`npx vitest run src/admin/features/ai-editor`.

## Décisions et « À trancher »

- Magasin créé par l'orchestrateur avant la vague 2 et confié à editor-sidebar ; extensions additives seulement
  (décision de l'orchestrateur : partage avec editor-canvas).
- FOLLOWUPS #29 : Validate / Cancel passent par le magasin (`decisions`, `deciding`) pour que la carte de la sidebar et
  la barre de l'aperçu restent synchronisées ; `backHref` est fourni par la page (G1 « même onglet »).
- Pas de persistance locale : le moteur est la source de vérité (G1 scénario 2 : reprise au chargement).
- À trancher : rien.

## Demandes de contrat

- Aucune.
