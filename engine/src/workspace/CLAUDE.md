# Espace de travail du moteur (`engine/src/workspace`) — LLM context

> Propriétaire : engine-core · Figma : — · Mis à jour : 2026-09-27

## Utilité
`npm run engine:setup` (mise en place idempotente) et `npm run engine:setup -- sync` (avancer sur la source), plus la
vérification au démarrage du moteur (`checkWorkspace`). Le dépôt source (celui du développeur) n'est JAMAIS écrit.

## Fichiers
- `setup.ts` — point d'entrée CLI (lit `engine/.env.local` par tsx) ; `pendingWork(config)` (ce qui bloque une sync).
- `workspace.ts` — `setupWorkspace`, `syncWorkspace`, `checkWorkspace`, `engineRunning`, `previewEnvFile`, `dotenvValue`, `npmInstall`, `readMeta`, `sourceBranchOf`, `sourceDirtyCount`, `PID_FILE`, `META_FILE`.
- `workspace.test.ts` — dépôts git temporaires, installation simulée.

## Comportement
**setup** : dossiers `data/ claude/ shots/` ; branche = `ENGINE_SOURCE_BRANCH` ou branche courante de la source (HEAD
détaché refusé) ; avertissement « N uncommitted change(s) … NOT part of the engine's clone » ; si `repo/` manque :
`git clone --no-hardlinks --branch <b>`, `draft` créée et extraite, `main` au même commit, branche d'origine supprimée ;
si `repo/` existe : doit être un clone de la source (remote origin) et suivre la même branche (sinon refus clair) ;
identité locale du robot ; `.env.local`, `node_modules/`, `.next/` dans `.git/info/exclude` ; `repo/.env.local` de
l'aperçu réécrit (0600) avec `NEXT_PUBLIC_SANITY_PROJECT_ID`, `NEXT_PUBLIC_SANITY_DATASET`,
`NEXT_PUBLIC_SANITY_API_VERSION`, `SANITY_API_READ_TOKEN`, `KZ_EDITOR_PREVIEW=1`, `ENGINE_PREVIEW_SECRET`, `ADMIN_ORIGIN`
(valeurs de la config, jamais affichées ; jamais le jeton d'écriture ni la clé Claude) ; `npm ci` (ou `npm install`
sans lockfile) seulement si `node_modules` manque, environnement sans secrets ; `data/workspace.json` (source, branche,
commit de base).
**sync** : refusée si le moteur tourne (`data/engine.pid` vivant), si une demande / modification / modification validée
/ publication attend, si draft ≠ main, si la copie est sale ; `fetch` puis avance rapide de draft et main ; divergence
refusée (« a developer must reconcile ») ; réinstallation si `package-lock.json` a changé.

## Forces
Idempotent et testé sur de vrais dépôts ; valeurs dotenv sûres (une ligne, guillemets choisis, refus sinon).

## Faiblesses et limites connues
- Seuls les COMMITS de la source vont dans le clone : un site modifié mais non commité n'est pas ce que l'aperçu montre.
- `sync` ne rebase jamais : une divergence demande une intervention humaine.
- `npm ci` tourne en premier plan (sortie de npm affichée).

## Points sensibles
Ne jamais lancer `npm run engine:setup` en pointant `ENGINE_WORKSPACE` dans le dépôt source (refusé par la config) ;
ne jamais afficher le `.env.local` du clone.

## Tests
`npx vitest run engine/src/workspace`.

## Demandes de contrat
Aucune.
