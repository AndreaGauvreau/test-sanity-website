# Git du moteur (`engine/src/git`) — LLM context

> Propriétaire : engine-core · Figma : — (E1 « ‹/› Diff » via engine-publish) · Mis à jour : 2026-09-27

## Utilité
Porté de `batterie-tests:cms/src/editor/git.ts` (POC) : fichiers modifiés (`status -z`), versions ENTIÈRES HEAD / copie
de travail pour les contrôles, commit au nom du client (`--author`) avec un committer robot, retour arrière, réunion des
commits d'une modification en un seul, diff d'un commit. Toute ÉCRITURE passe par un `WorkRepo` vérifié.

## Fichiers
- `git.ts` — lectures (`changedFiles`, `fileVersions`, `isClean`, `head`, `currentBranch`, `isAncestor`, `commitsAhead`, `branchExists`, `commitFiles`, `showCommitDiff`, `workingDiff`, `readGit`), `gitAuthor`, `openWorkRepo` / `assertWorkRepoPath`, `WorkRepo`, `GitError`, `WorkRepoError`, `BOT_NAME`/`BOT_EMAIL`.
- `git.test.ts` — vrais dépôts temporaires.

## Contrats
`openWorkRepo(dir, workspace)` → `WorkRepo` : `changedFiles`, `fileVersions`, `changes`, `isClean`, `head`, `branch`,
`isAncestor`, `commitsAhead`, `commitFiles`, `showCommitDiff`, `workingDiff`, `commitAll(message, author)`,
`discardWorkingChanges()` (reset --hard HEAD + clean -fd), `resetHard(ref)`, `squashSince(base, message, author)`,
`run(args)` (commande brute réservée aux modules du moteur : engine-publish pour ff main ← draft, tag, push).
`ChangedFile` = type d'engine-guards (`{ file, before, after }`, null = absent).

## Comportement
`openWorkRepo` refuse tout dossier qui n'est pas EXACTEMENT `<workspace>/repo` (chemin vide, relatif, autre dossier) ET
qui n'est pas la racine de son dépôt (`--show-toplevel` résolu). git tourne avec `GIT_TERMINAL_PROMPT=0`, `LC_ALL=C`,
committer `Kuartz AI editor <ai-editor@kuartz.invalid>` ; commits `--no-verify --no-gpg-sign`. `squashSince` exige une
copie propre et une base ancêtre de HEAD ; en cas d'échec du commit, la branche est remise où elle était.

## Forces
Chemins avec espaces, guillemets et accents gérés (`-z`, jamais de trim de la sortie) ; tests sur de vrais dépôts.

## Faiblesses et limites connues
`run(args)` ne filtre pas les arguments (réservé au code du moteur, jamais à une donnée venue de l'admin ou de Claude).

## Points sensibles
Ne JAMAIS appeler `reset`/`clean`/`commit` via `readGit` sur un autre dossier ; ne jamais passer une donnée de
l'utilisateur comme référence git sans validation (`resetHard` refuse ce qui ne ressemble pas à une référence).

## Pièges
- Piège 5 du POC : un chemin vide ou relatif résolu vers le dossier du moteur a fait `git reset --hard` + `git clean -fd`
  au mauvais endroit. Parade : `openWorkRepo` exige EXACTEMENT `<workspace>/repo`, racine de son propre dépôt
  (`--show-toplevel` comparé après `realpath` : sous macOS `/tmp` est `/private/tmp`).
- `git status --porcelain` sans `-z` cite les chemins avec espaces ou accents entre guillemets échappés : toujours `-z`,
  et ne JAMAIS `trim()` la sortie (la première entrée commence souvent par une espace : « ␠M chemin ») ; un renommage
  ou une copie occupe deux entrées (nouveau chemin, puis l'ancien).
- Un dossier non suivi apparaît comme un seul chemin (`dir/`) sans `--untracked-files=all` : les contrôles veulent les
  fichiers, d'où l'option.
- Les crochets de commit du site (husky…) ne doivent pas tourner dans le clone : `--no-verify` ; pas de signature GPG
  (aucune clé côté robot) : `--no-gpg-sign`.
- `GIT_TERMINAL_PROMPT=0` : un fetch qui demanderait un mot de passe échoue au lieu de bloquer le moteur.

## Comment modifier
- Nouvelle lecture : fonction dans `git.ts` basée sur `readGit(dir, args)` (aucune écriture) + test sur un dépôt
  temporaire dans `git.test.ts`.
- Nouvelle écriture : méthode de `WorkRepo` (jamais une fonction libre qui prend un dossier), avec validation de toute
  référence reçue et remise en état en cas d'échec.

## Tests
`npx vitest run engine/src/git`.

## Décisions et « À trancher »
- Auteur du commit = le client qui a fait la demande (ou l'auteur de la modification au Validate) ; committer = robot
  (`Kuartz AI editor <ai-editor@kuartz.invalid>`) : l'historique dit qui a demandé, et que c'est l'IA qui a écrit.
- Un commit par demande sur `draft`, réunis en UN commit au Validate (`squashSince`).

## Demandes de contrat
Aucune.
