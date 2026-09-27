# Moteur IA (`engine/`) — LLM context

> Propriétaire de ce fichier, de `src/main.ts`, `src/config.ts` et des dossiers `server/ store/ jobs/ git/ workspace/
> preview/ content/` : engine-core · Figma : D1-D3, G1, G2 (éditeur), E1-E2 via engine-publish · Mis à jour : 2026-09-27

## Utilité
Processus Node PERSISTANT, séparé de Next (jamais importé par l'admin), sur `127.0.0.1:ENGINE_PORT` (4043). Seul
détenteur de l'accès à Claude, du jeton d'écriture Sanity « robot » et du dépôt git de travail. L'admin l'appelle côté
serveur par son relais signé (`src/admin/core/engine/`). Il pilote l'aperçu du brouillon (`next dev` du clone, 4042).
Ne fait pas (encore) : publication, versions, journal `aiUsage` (engine-publish), Ask AI (ask-ai) — ils se branchent par
`MODULES` de `main.ts` (voir « Demandes de contrat »).

## Carte des modules
| Dossier | Propriétaire | Rôle |
|---|---|---|
| `src/main.ts` | engine-core | `startEngine(env, overrides?)` : câblage complet ; lancé seul par `npm run engine` |
| `src/config.ts` | engine-core | lecture + validation zod de `engine/.env.local`, chemins sûrs, `ENGINE_VERSION` |
| `src/server/` | engine-core | serveur node:http, routeur extensible, auth Bearer + identité signée, routes de l'éditeur, santé |
| `src/jobs/` | engine-core | file (une demande à la fois), cycle d'une demande, modification en attente, verrou partagé |
| `src/store/` | engine-core | magasin JSON atomique (`<ENGINE_WORKSPACE>/data/`) : demandes, modifications, fils, publications |
| `src/git/` | engine-core | git du clone de travail (status -z, versions, commit au nom du client, squash, retour arrière) |
| `src/workspace/` | engine-core | `npm run engine:setup` (clone, main/draft, .env.local de l'aperçu, npm ci) et `sync` |
| `src/preview/` | engine-core | processus `next dev` de l'aperçu : lancement, sonde, redémarrage, arrêt |
| `src/content/` | engine-core | Sanity : port + client robot, textes de l'éditeur (instantané, écriture, restauration), publication, signal d'aperçu |
| `src/claude/` | engine-claude | Agent SDK, outils MCP fixes, prompts, questions, coût, faux Claude (voir son CLAUDE.md) |
| `src/guards/` | engine-guards | design system, hook, lint CSS/TSX, contrôles du rendu (Chrome) (voir son CLAUDE.md) |
| `src/publish/ versions/ usage/` | engine-publish | à venir |
| `src/ask/` | ask-ai | à venir |

## Démarrage (l'utilisateur lance à la main, jamais dans PM2)
1. `engine/.env.local` (noms : ARCHITECTURE §9, plus `ENGINE_MODE` local|hosted, `ENGINE_SOURCE_BRANCH` facultatif,
   `EDITOR_MAX_REQUEST_USD` facultatif — plafond du cumul d'une demande, défaut = `EDITOR_MAX_BUDGET_USD`).
2. `npm run engine:setup` : clone `ENGINE_SOURCE_REPO` (branche `ENGINE_SOURCE_BRANCH` ou courante ; seuls les COMMITS
   sont clonés, un avertissement liste les changements non commités) dans `<ENGINE_WORKSPACE>/repo`, crée `main` et
   `draft` (draft extraite), écrit `repo/.env.local` de l'aperçu (0600, exclu de git), `npm ci` une fois, crée `data/`,
   `claude/`, `shots/`. Idempotent. `npm run engine:setup -- sync` : avance main/draft sur la source (moteur arrêté, rien
   en attente, avance rapide seulement).
3. `npm run engine` : config validée (refus clair, noms de variables seulement) → espace vérifié (sinon « run npm run
   engine:setup ») → `data/engine.pid` (un seul moteur par espace) → magasin → reprise des demandes interrompues →
   modules → aperçu lancé → écoute. SIGINT/SIGTERM : serveur fermé, demande en cours arrêtée et remise en état (fichiers +
   textes), aperçu arrêté (SIGTERM au groupe, SIGKILL après 5 s), pid retiré ; filet de 45 s.

## Sécurité (résumé ; détails dans chaque CLAUDE.md)
- Écoute sur 127.0.0.1 seulement. Toute requête : `Authorization: Bearer ENGINE_SECRET` puis `X-Kz-User` signé
  (`verifyEngineBearer` / `verifyEngineUser` de `src/admin/core/engine/signature.ts`) → sinon 401 ; droits revérifiés
  avec `can(role, …)` ; corps JSON ≤ 64 Kio ; erreurs `EngineErrorBody`, messages anglais, 500 sans détail.
- Chemins : absolus, non vides, espace de travail hors du dépôt source ; toute écriture git passe par `openWorkRepo`
  qui exige EXACTEMENT `<ENGINE_WORKSPACE>/repo` (piège 5 du POC). Le dépôt source n'est jamais écrit.
- Secrets : jamais affichés ni journalisés ; environnements MINIMAUX pour `next dev`, `npm`, `tsc` et Claude (jamais
  `...process.env` : ni clé Claude ni jeton d'écriture Sanity dans l'aperçu). Secret d'aperçu : cookie `kz_preview`
  pour Chrome et la sonde ; dans l'URL initiale de l'iframe seulement (`EditorState.preview.url`, attendu par auth-core).
- Claude : accès résolu par engine-claude, abonnement accepté seulement si `ENGINE_MODE=local` est ÉCRIT ; jamais en
  hosted. Aucun appel réel pendant la construction (tests : faux Claude).
- Sanity : le robot n'écrit que des BROUILLONS (`drafts.<id>`) ; rien n'est en ligne avant Publish. Avertissement au
  démarrage si le dataset est `production`.

## Forces
- Tout est injectable (Claude, aperçu, Chrome, Sanity, processus) : le moteur entier démarre dans un test
  (`src/main.test.ts`) sans réseau ni Claude. 93 tests propres à engine-core (13 fichiers), sur de vrais dépôts git
  temporaires, dont un test de fumée sur le vrai design system de Conduit (`jobs/conduit.test.ts`).
- Invariants du POC tenus par construction : une demande à la fois (vérification synchrone), textsBefore enregistré avant
  toute écriture, retour arrière fichiers + textes, coût d'une session reprise jamais doublé, plafond du cumul par demande.

## Faiblesses et limites connues
- Voir les CLAUDE.md des dossiers. Principales : aucun passage réel (Claude, next dev, Chrome, Sanity) n'a encore eu lieu ;
  refus du hook et des contrôles en français (engine-guards) visibles dans le journal du client ; une seule session de
  rendu par demande (premier élément) ; magasin JSON réécrit en entier à chaque étape (suffisant en local).

## Pièges
- `tsx --env-file` ne pose pas NODE_ENV : d'où `ENGINE_MODE=local` explicite pour l'abonnement Claude.
- `main.ts` et `workspace/setup.ts` ne s'exécutent que lancés en ligne de commande (test sur `process.argv[1]`) : les
  importer dans un test ne démarre rien.
- Le `.env.local` du clone est ignoré (`.env*` du site + `.git/info/exclude`) : sinon `git status` le verrait et le
  contrôle `scope` refuserait toute demande.

## Tests
`npx vitest run engine --exclude '**/visual-page.test.ts'` (~10 s) ; avec Chrome : `npx vitest run engine` (~6 min).
Typage : `npx tsc --noEmit -p .` (zéro erreur dans `engine/`).

## Demandes de contrat
1. **Orchestrateur (ARCHITECTURE §9)** : ajouter `ENGINE_MODE`, `ENGINE_SOURCE_BRANCH` (facultatif) et
   `EDITOR_MAX_REQUEST_USD` (facultatif) à la liste des variables du moteur.
2. **engine-publish / ask-ai** : pour se brancher, exporter un `EngineModule` (`src/server/modules.ts`) et demander à
   engine-core de l'ajouter à `MODULES` dans `src/main.ts` (une ligne). Contexte reçu : voir `server/CLAUDE.md`.
3. **engine-guards** : traduire en anglais les raisons de refus de `checkToolUse` (elles deviennent des étapes `warn`
   visibles par le client) — même demande qu'engine-claude.
