# Magasin persistant du moteur (`engine/src/store`) — LLM context

> Propriétaire : engine-core · Figma : — · Mis à jour : 2026-09-28 (relecture d'un magasin d'une version précédente)

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
Relecture : seule la forme générale est vérifiée (`version`, collections) ; les demandes, modifications et entrées ne
sont PAS revalidées contre le contrat du jour. Un magasin d'une version précédente se relit donc tel quel, et le fichier
n'est pas réécrit à l'ouverture (ex. demandes faites en Tablet à 768 avant le 2026-09-28 : largeur gardée dans
l'historique, affichée en Tablet par l'admin ; `store.test.ts`, démarrage complet dans `../main.test.ts`).

## Forces
Atomicité (rename), ordre garanti, relecture testée, clés lues avec `Object.hasOwn`.

## Faiblesses et limites connues
Fichier réécrit en entier à chaque changement (chaque étape du journal) : suffisant en local, à remplacer par une base
si le volume grandit. Pas de migration au-delà de la version 1.

## Points sensibles
Ne jamais modifier la valeur de `get()` directement (passer par `update`/`transact`) ; ne jamais y mettre de secret
(ni jeton d'aperçu, ni en-tête d'identité : seuls `EngineUser` et les données du contrat y entrent).

## Pièges
- `get()` / `data()` renvoient la valeur VIVANTE : la modifier en place change la mémoire sans rien écrire sur disque,
  et le prochain `update` l'écrira par surprise. Toujours `update(fn)` ou `transact(fn)`.
- La mise à jour en mémoire est SYNCHRONE, l'écriture disque ne l'est pas : c'est ce qui permet à la file de l'éditeur
  de décider ses 409 sans `await` ; attendre la promesse seulement quand l'écriture doit être sur disque (avant d'agir).
- `flush()` avant de quitter : sinon la dernière écriture peut manquer (l'arrêt du moteur l'appelle).
- Un fichier illisible (JSON cassé, `version` inconnue) fait échouer le démarrage : le réparer ou le déplacer à la main,
  jamais l'effacer en silence.

## Comment modifier
- Nouveau champ interne d'une demande : `JobInternal` (facultatif, pour relire les anciens fichiers) ; l'écrire par
  `updateJob` ; ne jamais le renvoyer à l'admin.
- Nouveau format : passer `version` à 2, faire convertir la version 1 par `migrateEditor` / `migratePublications`
  (lecture), et tester la relecture d'un fichier version 1 dans `store.test.ts`.
- Une valeur du contrat change (ex. formats de l'aperçu) : ne PAS réécrire l'historique à la relecture ; le lecteur la
  normalise à l'affichage (`viewportOf`), et un test relit un fichier de l'ancienne version.
- Nouvelle collection : l'ajouter à `EditorData` avec sa valeur initiale et sa normalisation dans `migrateEditor`.

## Tests
`npx vitest run engine/src/store`.

## Décisions et « À trancher »
- Fichiers JSON atomiques plutôt qu'une base (décision de la construction : local, un seul processus, `engine.pid`).
- À trancher (mode hébergé) : base de données si le volume grandit.

## Demandes de contrat
Aucune.
