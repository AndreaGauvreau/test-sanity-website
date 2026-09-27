# Magasin persistant du moteur (`engine/src/store`) — LLM context

> Propriétaire : engine-core · Figma : — · Mis à jour : 2026-09-27

## Utilité
État durable du moteur dans `<ENGINE_WORKSPACE>/data/` : demandes (EditJob + état interne), modifications en attente
(PendingChange + commits), fils par page (ThreadEntry), publications (pour engine-publish). Fichiers JSON écrits
ATOMIQUEMENT. Tout ce qu'il faut pour remettre en état après un crash y est écrit AVANT d'agir.

## Fichiers
- `json-file.ts` — `openJsonFile(file, initial, migrate)` : valeur en mémoire + écritures sérialisées (temporaire, fsync, rename) ; `writeFileAtomic`.
- `store.ts` — `openEngineStore(dataDir)` → `{ editor: EditorStore, publications: PublicationsStore }` ; types stockés.
- `store.test.ts`.

## Contrats
- `editor.json` : `{ version: 1, jobs: { [id]: { job: EditJob, internal: JobInternal } }, changes: { [id]: { change:
  PendingChange, internal: { baseCommit, commits[] } } }, threads: { [page]: StoredThreadEntry[] } }`.
  `JobInternal` : `headBefore`, `commit`, `sessionId`, `texts` (TextSnapshot = textsBefore : par document, `draftExisted`
  et valeur d'avant de chaque champ, null = absent), `textsDirty`, `written` (dernière valeur écrite par champ), `asked`,
  `resolved`, `restoreFailed`. Rien de `internal` ne sort vers l'admin.
- `publications.json` : `{ version: 1, publications: Publication[], run: PublishRun | null, lastPublishedAt, extra }` —
  à engine-publish (`update`, `nextNumber`). `extra` : état libre sans type de contrat.
- API éditeur : `job`, `change`, `activeJobs`, `openChange`, `validatedChanges`, `thread(page, 50)`, `putJob`, `updateJob`,
  `putChange`, `updateChange`, `appendThread`, `transact`, `flush`, `data`.

## Comportement
`update` applique le changement à une COPIE, remplace la valeur en mémoire tout de suite (synchrone : la file de
l'éditeur s'en sert pour ses refus 409), puis écrit ; les écritures partent dans l'ordre. Un fichier illisible fait
échouer le démarrage (jamais écrasé en silence). Fils : 200 entrées gardées par page, 50 montrées ; une demande qui
n'est plus citée par un fil ni par une modification ouverte ou validée est retirée (sauf restauration en échec).

## Forces
Atomicité (rename), ordre garanti, relecture testée, clés lues avec `Object.hasOwn`.

## Faiblesses et limites connues
Fichier réécrit en entier à chaque changement (chaque étape du journal) : suffisant en local, à remplacer par une base
si le volume grandit. Pas de migration au-delà de la version 1.

## Points sensibles
Ne jamais modifier la valeur de `get()` directement (passer par `update`/`transact`) ; ne jamais y mettre de secret.

## Tests
`npx vitest run engine/src/store`.

## Demandes de contrat
Aucune.
