# ai-editor/state — LLM context

> Propriétaire : editor-sidebar (créé par l'orchestrateur, extensions ADDITIVES seulement) · Figma : D1-D3, G1, G2 ·
> Mis à jour : 2026-09-27

## Utilité

Magasin partagé de l'écran de l'éditeur IA (un par écran) entre la sidebar Claude (editor-sidebar) et l'aperçu
(editor-canvas). Petit magasin externe + `useSyncExternalStore`, fourni par contexte. Aucune donnée sensible.

## Fichiers

- `store.ts` — `createEditorStore`, `EditorState`, `EditorStore`, `EditorDecisions`, `isLocked`, `useEditorState`.
- `context.tsx` — `EditorStoreProvider({ pageId, path, backHref?, children })`, `useEditorStore()`.

## Contrats

- État : `pageId`, `path`, `mode`, `viewport`, `selection`, `job`, `pending`, `bridgeReady`, `previewNonce` (d'origine) ;
  ajouts editor-sidebar : `backHref` (écran d'origine, chemin `/admin…`), `preview` (EditorState.preview du moteur),
  `decisions` (Validate / Cancel enregistrés par la sidebar), `deciding` ('validate' | 'cancel' | null).
- Actions : `setMode`, `setViewport`, `select(target, additive)` (8 max), `removeTarget`, `clearSelection`, `setJob`,
  `setPending`, `setBridgeReady`, `refreshPreview` (d'origine) ; ajouts : `setSelection(targets)`, `setPreview`,
  `registerDecisions(decisions) → désinscription`, `setDeciding`.
- `isLocked(state)` : une demande est active (queued / running / waiting, toutes pages) → sélection, mode, saisie et
  Publish bloqués ; Desktop / Tablet / Mobile et Stop restent actifs.
- Qui écrit : canvas → mode, viewport, selection, bridgeReady ; sidebar → job, pending (de CETTE page), preview,
  selection (demande rendue au champ, vidée à l'envoi), previewNonce, decisions, deciding.

## Comportement

- Les actions de sélection et de mode ne font rien quand `isLocked` (G2 « pendant que Claude travaille »).
- `useEditorState(store, select)` re-rend seulement quand la tranche change par référence : sélectionner des valeurs
  existantes (pas d'objet recréé dans le sélecteur).

## Forces / faiblesses

- Simple, sans dépendance, testable sans React. Pas de persistance : un rechargement repart de l'état du moteur.

## Points sensibles / pièges

- Extensions ADDITIVES seulement (editor-canvas l'utilise en même temps) : ne jamais renommer ni changer une signature.
- `registerDecisions` : la désinscription ne vide `decisions` que si ce sont encore les mêmes (remontage en StrictMode).

## Comment modifier

- Nouveau champ : type dans `EditorState` + valeur par défaut dans `createEditorStore` + action ; documenter ici.

## Tests

Couvert indirectement par `sidebar/EditorSidebar.test.tsx` (sélection, verrou, decisions, previewNonce, pending).

## Demandes de contrat

- Aucune.
