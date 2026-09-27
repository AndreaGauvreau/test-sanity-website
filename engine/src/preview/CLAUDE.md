# Aperçu du brouillon (`engine/src/preview`) — LLM context

> Propriétaire : engine-core · Figma : D1-D3 (iframe de l'éditeur) · Mis à jour : 2026-09-27

## Utilité
Lance et surveille `next dev -H 127.0.0.1 -p ENGINE_PREVIEW_PORT` dans le clone de travail (branche draft, mode
`KZ_EDITOR_PREVIEW=1` lu dans son `.env.local`), pour l'iframe de l'éditeur et les contrôles du rendu (Chrome).
Tourne en réel sur 127.0.0.1:4042 (lancé par `npm run engine`) : 403 sans jeton d'aperçu.

## Fichiers
- `process.ts` — `createPreviewProcess(settings)` → `start`, `stop`, `stopSync`, `status`, `waitReady`, `logs` ; `previewEnv` ; `INERT_EDITOR_ENV`.
- `process.test.ts` — faux processus, fausse sonde.

## Contrats
`status()` → `{ state: stopped|starting|ready|crashed|failed, ready, url (origine sans secret), pid, restarts, lastExit,
error }` ; exposé dans `GET /health` (`preview.ready`) et utilisé par l'éditeur (503 tant que pas prêt).
`settings.secret` : valeur du cookie `kz_preview` de la sonde — en production le jeton du moteur
(`createPreviewCredential` de `content/visible.ts`, dérivé de ENGINE_PREVIEW_SECRET), une chaîne fixe dans les tests.

## Comportement
Environnement MINIMAL (PATH, HOME, TMPDIR, LANG, LC_ALL, USER, TZ + `NEXT_TELEMETRY_DISABLED`, `FORCE_COLOR=0`) et
éditeur INERTE (`REACT_EDITOR=none`, `VISUAL=true`, `EDITOR=true`, SEC-06) : jamais la clé Claude, le jeton d'écriture
Sanity ni ENGINE_SECRET. Processus détaché (groupe) ; sonde HTTP chaque seconde avec le cookie `kz_preview` (toute
réponse < 500 = prêt), puis toutes les 10 s une fois prêt. Plantage → redémarrage après 1, 2, 5, 10, 30 s ; au-delà de
5 plantages en 5 min → `failed`. Arrêt : SIGTERM au groupe, SIGKILL après 5 s ; `stopSync` à la sortie du moteur.
Lignes de next dev gardées (200) ; erreurs et « ready » reprises au journal du moteur. Sans `node_modules/.bin/next`
dans le clone : `failed` « run npm run engine:setup ».

## Forces
Aucune dépendance au vrai next dev dans les tests ; arrêt propre, redémarrage et environnement testés.

## Faiblesses et limites connues
- La sonde ne distingue pas une page d'erreur 404 d'un site sain (seul le 5xx compte) ; elle n'a pas de délai maximal
  (`waitReady(timeout)` pour l'appelant). Premier rendu : compilation Turbopack de plusieurs secondes (non mesurée ici).
- next dev tourne avec les droits de l'utilisateur (disque, réseau) : pas d'isolation système (à faire en hébergé).
- Les routes internes de next dev (`/__nextjs_*`, `/_next/*`, HMR) passent AVANT le proxy de l'app : sans jeton, seules
  la boucle locale et le blocage cross-site de Next (qui laisse passer une requête sans Origin et les origines
  `localhost`) les protègent. `REACT_EDITOR=none` retire le lancement d'éditeur ; restent un oracle d'existence de
  fichiers (`/__nextjs_launch-editor` répond 204/404) et des extraits de source (`/__nextjs_original-stack-frames`).

## Points sensibles
- Ne jamais passer `...process.env` à next dev (le code du site est modifiable par Claude) ; ne jamais journaliser le
  cookie ; ne jamais retirer `INERT_EDITOR_ENV`.
- **Mode hébergé** : next dev ne doit JAMAIS être exposé tel quel. Un frontal (le moteur ou un reverse proxy) doit
  exiger le jeton d'aperçu sur TOUS les chemins, `/_next` et `/__nextjs` compris, avant de relayer, et
  `allowedDevOrigins` doit se limiter à l'origine de l'admin (SEC-06).

## Pièges
- `launch-editor` de Next (`next/dist/next-devtools/server/launch-editor.js`, `guessEditor`) : REACT_EDITOR d'abord
  (« none » → rien), sinon il DEVINE l'éditeur d'après `ps x` (VS Code, Cursor… ouverts sur la machine), sinon
  VISUAL / EDITOR. Un environnement « vide » ne suffit donc pas : il faut REACT_EDITOR=none.
- Chrome « Local Network Access » (FOLLOWUPS #35) : une iframe `http://127.0.0.1:4042` dans une page d'une autre
  origine peut être bloquée ou demander une permission ; à surveiller au premier test réel dans le navigateur.
- Le proxy du clone est celui du COMMIT cloné : après une évolution du proxy (auth-core), `npm run engine:setup -- sync`
  puis redémarrage, sinon l'aperçu garde l'ancienne règle d'accès.
- `detached: true` + SIGTERM au groupe (`-pid`) : next dev lance des processus enfants qui survivraient sinon.

## Comment modifier
- Nouvelle variable pour next dev : jamais un secret ; l'ajouter à `previewEnv` (ou au `.env.local` du clone via
  `workspace/`), et à l'assertion des clés de `process.test.ts`.
- Changer la politique de redémarrage : `backoffMs`, `maxRestarts`, `windowMs` (réglables, défauts dans `process.ts`).

## Tests
`npx vitest run engine/src/preview`. À la main : `curl -sI http://127.0.0.1:4042/` → 403 sans jeton.

## Décisions et « À trancher »
- Éditeur inerte par l'environnement (SEC-06, correctif 1) ; le frontal devant next dev (correctif 2) est reporté au
  mode hébergé ; le matcher du proxy est à auth-core (correctif 3).
- À trancher (hébergé) : frontal de l'aperçu, isolation de next dev (utilisateur système ou conteneur).

## Demandes de contrat
Aucune.
