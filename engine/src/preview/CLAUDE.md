# Aperçu du brouillon (`engine/src/preview`) — LLM context

> Propriétaire : engine-core · Figma : D1-D3 (iframe de l'éditeur) · Mis à jour : 2026-09-27

## Utilité
Lance et surveille `next dev -H 127.0.0.1 -p ENGINE_PREVIEW_PORT` dans le clone de travail (branche draft, mode
`KZ_EDITOR_PREVIEW=1` lu dans son `.env.local`), pour l'iframe de l'éditeur et les contrôles du rendu (Chrome).

## Fichiers
- `process.ts` — `createPreviewProcess(settings)` → `start`, `stop`, `stopSync`, `status`, `waitReady`, `logs` ; `previewEnv`.
- `process.test.ts` — faux processus, fausse sonde.

## Contrats
`status()` → `{ state: stopped|starting|ready|crashed|failed, ready, url (origine sans secret), pid, restarts, lastExit,
error }` ; exposé dans `GET /health` (`preview.ready`) et utilisé par l'éditeur (503 tant que pas prêt).

## Comportement
Environnement MINIMAL (PATH, HOME, TMPDIR, LANG, LC_ALL, USER, TZ + `NEXT_TELEMETRY_DISABLED`, `FORCE_COLOR=0`) :
jamais la clé Claude, le jeton d'écriture Sanity ni ENGINE_SECRET. Processus détaché (groupe) ; sonde HTTP chaque seconde
avec le cookie `kz_preview` (toute réponse < 500 = prêt), puis toutes les 10 s une fois prêt. Plantage → redémarrage
après 1, 2, 5, 10, 30 s ; au-delà de 5 plantages en 5 min → `failed`. Arrêt : SIGTERM au groupe, SIGKILL après 5 s ;
`stopSync` à la sortie du moteur. Lignes de next dev gardées (200) ; erreurs et « ready » reprises au journal du moteur.
Sans `node_modules/.bin/next` dans le clone : `failed` « run npm run engine:setup ».

## Forces
Aucune dépendance au vrai next dev dans les tests ; arrêt propre et redémarrage testés.

## Faiblesses et limites connues
- Jamais lancé en réel pendant la construction (interdit) : le premier démarrage réel vérifiera le temps de compilation
  (la sonde attend sans délai maximal ; `waitReady(timeout)` pour l'appelant).
- La sonde ne distingue pas une page d'erreur 404 d'un site sain (seul le 5xx compte).

## Points sensibles
Ne jamais passer `...process.env` à next dev (le code du site est modifiable par Claude) ; ne jamais journaliser le cookie.

## Tests
`npx vitest run engine/src/preview`.

## Demandes de contrat
Aucune.
