# Versions (`engine/src/versions`) — LLM context

> Propriétaire : engine-publish · Figma : E2 (docs/admin/figma/screens/E2.md) · Mis à jour : 2026-09-27 (corrections vague 3)

## Utilité
Historique des publications (E2 « Versions ») pour tous les rôles qui ont `publish.run`, et retour arrière réservé à
Kuartz (`versions.rollback`, décision 5). Ne publie rien (voir `../publish`).

## Fichiers
- `versions.ts` — `createVersionsService({ repo, publications, mode })` : `list()`, `rollback(user, number)` ; `rollbackReason`, `LOCAL_ROLLBACK_REASON`, `HOSTED_ROLLBACK_REASON`.
- `index.ts` — `versionsModule` (routes).
- `versions.test.ts`.

## Contrats
- `GET /versions` → `{ publications: Publication[]; rollback: { available: boolean; reason?: string } }` (publish.run).
- `POST /versions/:number/rollback` (`^\d{1,6}$`) → `Publication` (versions.rollback, Kuartz ; revérifié dans le service).
- Entrées : `publications.json` (écrit par `../publish`), tags `publication-N` du clone (`listPublicationTags`).

## Comportement
Liste = publications du magasin + tags `publication-N` absents du magasin (statut `previous`, note « Found in git
only… », date et auteur du tag/commit), la plus récente en haut ; le tag et le commit complètent une publication du
magasin qui ne les porte pas. `live` = celle que le magasin a posée (la dernière réussie) ; sans magasin du tout, le tag
le plus récent. `failed` = étape en échec (l'ancienne version est restée en ligne).
Retour arrière : 403 sans le droit, 404 numéro inconnu, 409 version `failed`, puis **501 `not_implemented`** : en mode
local « Roll back isn't available in local mode… Kuartz can restore a version by hand from its git tag » ; en mode
hébergé « Roll back through Vercel Instant Rollback isn't connected yet ». `rollback.available` est toujours `false`
avec la même raison.

## Forces
Lecture seule, testée sur un vrai dépôt (tags légers ; un tag annoté est lu par `for-each-ref` via `*objectname`, non testé).

## Faiblesses et limites connues
- Pas d'URL de déploiement Vercel (`deployUrl`) : le hook ne la renvoie pas ; E2 « View ↗ » n'a rien à ouvrir en local.
- Retour arrière non implémenté (prévu : Vercel Instant Rollback pour le code ; les textes passent par l'historique
  Sanity, séparément).
- Une publication de contenu seul n'a pas de tag : seul le magasin la connaît.

## Points sensibles
Ne jamais implémenter un retour arrière qui réécrit `main` ou force un push : en mode local, c'est une opération
humaine (Kuartz). Le numéro vient de l'URL : toujours validé (`^\d{1,6}$` + entier ≥ 1).

## Pièges
- Les tags `publication-N` sont écrits par `../publish` (`tagPublication`, `--force`) dans le CLONE du moteur, pas dans
  le dépôt source (sauf push, `ENGINE_GIT_PUSH=1`) : `git tag` dans le dépôt du développeur ne les montre pas.
- Une publication de contenu seul n'a PAS de tag : une version absente des tags n'est pas une erreur.
- `listPublicationTags` lit `%(*objectname)` (commit pointé d'un tag annoté) puis `%(objectname)` (tag léger) : ne pas
  prendre `objectname` seul, ce serait l'objet tag, pas le commit.
- Le numéro vient de l'URL (`^\d{1,6}$`) ; le routeur renvoie 404 pour tout autre format AVANT le service.
- Mode local : `rollback.available` est toujours `false` avec la raison « local mode » (vérifié sur 4043 : GET /versions
  répond ainsi) ; POST rollback répond 501 `not_implemented` après les contrôles 403 / 404 / 409 — l'ordre compte pour
  les tests.

## Comment modifier
Brancher Vercel Instant Rollback (mode hosted) : `rollback()` → API Vercel (jeton dans la config, jamais journalisé),
publication cible `live`, les autres `previous`/`rolled-back` ; `rollback.available: true` en mode hosted.

## Tests
`npx vitest run engine/src/versions` (~1 s) ; routes et droits : `engine/src/publish/module.test.ts`.

## Décisions et « À trancher »
Question 5 (le client peut-il revenir en arrière ?) : non, Kuartz seulement, comme le contrat.

## Demandes de contrat
Aucune.
