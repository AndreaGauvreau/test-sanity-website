# Espace de travail du moteur (`engine/src/workspace`) — LLM context

> Propriétaire : engine-core · Figma : — · Mis à jour : 2026-09-27

## Utilité
`npm run engine:setup` (mise en place idempotente) et `npm run engine:setup -- sync` (avancer sur la source), plus la
vérification au démarrage du moteur (`checkWorkspace`). Le dépôt source (celui du développeur) n'est JAMAIS écrit.

## Fichiers
- `setup.ts` — point d'entrée CLI (lit `engine/.env.local` par tsx) ; `pendingWork(config)` (ce qui bloque une sync).
- `workspace.ts` — `setupWorkspace`, `syncWorkspace`, `checkWorkspace`, `engineRunning`, `previewEnvFile`, `dotenvValue`, `npmInstall`, `readMeta`, `sourceBranchOf`, `sourceDirtyCount`, `shellArg`, `PID_FILE`, `META_FILE`.
- `workspace.test.ts` — dépôts git temporaires, installation simulée.

## Contrats
- Entrées : `EngineConfig` (config.ts) ; le dépôt source (lu, cloné, jamais écrit).
- Sorties : `<ENGINE_WORKSPACE>/{repo,data,claude,shots}` ; `repo/.env.local` (`PREVIEW_ENV_KEYS`) lu par le site en
  mode aperçu (proxy d'auth-core, `KZ_EDITOR_PREVIEW=1`) ; `data/workspace.json` (`WorkspaceMeta` : source, branche,
  commit de base) ; `data/engine.pid` (écrit par main.ts, lu par `engineRunning`).
- `checkWorkspace(config)` → `WorkRepo` (git/) ou `WorkspaceError` (« run npm run engine:setup »).
- Utilisé par : `main.ts` (démarrage), engine-publish (`readMeta`).

## Comportement
**setup** : dossiers `data/ claude/ shots/` ; branche = `ENGINE_SOURCE_BRANCH` ou branche courante de la source (HEAD
détaché refusé) ; avertissement « N uncommitted change(s) … NOT part of the engine's clone » ; si `repo/` manque :
`git clone --no-hardlinks --branch <b>`, `draft` créée et extraite, `main` au même commit, branche d'origine supprimée ;
si `repo/` existe : doit être un clone de la source (remote origin) et suivre la même branche (sinon refus clair) ;
identité locale du robot ; `.env.local`, `node_modules/`, `.next/` dans `.git/info/exclude` ; `repo/.env.local` de
l'aperçu réécrit (0600) avec `NEXT_PUBLIC_SANITY_PROJECT_ID`, `NEXT_PUBLIC_SANITY_DATASET`,
`NEXT_PUBLIC_SANITY_API_VERSION`, `SANITY_API_READ_TOKEN`, `KZ_EDITOR_PREVIEW=1`, `ENGINE_PREVIEW_SECRET` (le proxy
de l'aperçu en dérive les jetons qu'il vérifie), `ADMIN_ORIGIN`, `REACT_EDITOR=none` (SEC-06 : aucun éditeur ouvert par
`/__nextjs_launch-editor`, même pour un next dev lancé à la main) — valeurs de la config, jamais affichées ; jamais le
jeton d'écriture ni la clé Claude ; `npm ci` (ou `npm install`
sans lockfile) seulement si `node_modules` manque, environnement sans secrets ; `data/workspace.json` (source, branche,
commit de base).
**sync** : refusée si le moteur tourne (`data/engine.pid` vivant), si une demande / modification / modification validée
/ publication attend, si draft ≠ main, si la copie est sale ; `fetch` puis avance rapide de draft et main ; divergence
refusée avec les commandes exactes à lancer dans la source (`git fetch <clone> +main:refs/remotes/engine/main` puis
`git merge engine/main`) ; réinstallation si `package-lock.json` a changé.
Cas typique en local (ENGINE_GIT_PUSH=0) : une publication de code avance le `main` du clone, jamais la source ; la sync
suivante diverge tant que ces commits ne sont pas ramenés (vu le 2026-09-28 avec la publication-1).

## Forces
Idempotent et testé sur de vrais dépôts ; valeurs dotenv sûres (une ligne, guillemets choisis, refus sinon).

## Faiblesses et limites connues
- Seuls les COMMITS de la source vont dans le clone : un site modifié mais non commité n'est pas ce que l'aperçu montre.
- `sync` ne rebase jamais : une divergence demande une intervention humaine (le message donne les commandes).
- `npm ci` tourne en premier plan (sortie de npm affichée).

## Points sensibles
Ne jamais lancer `npm run engine:setup` en pointant `ENGINE_WORKSPACE` dans le dépôt source (refusé par la config) ;
ne jamais afficher le `.env.local` du clone.

## Pièges
- `.env.local` du clone EXCLU de git (`.env*` du site + `.git/info/exclude`) : sinon `git status` le verrait, le
  contrôle `scope` refuserait toute demande et un commit pourrait l'emporter.
- Une variable de `.env.local` n'écrase pas celle posée par le processus parent (Next) : l'environnement de
  `preview/process.ts` l'emporte (ex. `REACT_EDITOR`).
- `sync` est bloquée dès que quelque chose attend (demande, modification, publication) ou que draft ≠ main : c'est
  voulu (une avance sous une modification en cours la rendrait invalidable) ; publier ou annuler d'abord.
- `repo/.env.local` n'est réécrit QUE par `npm run engine:setup` (le démarrage du moteur ne le touche pas) : après un
  changement d'`engine/.env.local` (secret d'aperçu, dataset…), relancer le setup puis le moteur.

## Comment modifier
- Nouvelle variable d'aperçu : `PREVIEW_ENV_KEYS` + valeur dans `previewEnvFile` (jamais un secret du moteur) + compte
  et assertion dans `workspace.test.ts` ; relancer `npm run engine:setup`.
- Nouveau blocage de `sync` : `pendingWork(config)` de `setup.ts` + test.

## Tests
`npx vitest run engine/src/workspace`.

## Décisions et « À trancher »
- Clone des COMMITS seulement (un avertissement liste le non commité) : l'aperçu montre un état reproductible.
- `sync` en avance rapide seulement, jamais de rebase automatique (« a developer must reconcile »).

## Demandes de contrat
Aucune.
