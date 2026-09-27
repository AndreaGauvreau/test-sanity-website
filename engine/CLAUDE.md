# Moteur IA (`engine/`) — LLM context

> Propriétaire de ce fichier, de `src/main.ts`, `src/config.ts` et des dossiers `server/ store/ jobs/ git/ workspace/
> preview/ content/` : engine-core · Figma : D1-D3, G1, G2 (éditeur) ; E1-E2, G3 (engine-publish) ; G4 (ask-ai) ·
> Mis à jour : 2026-09-27

## Utilité
Processus Node PERSISTANT, séparé de Next (jamais importé par l'admin), sur `127.0.0.1:ENGINE_PORT` (4043). Seul
détenteur de l'accès à Claude, du jeton d'écriture Sanity « robot » et du dépôt git de travail. L'admin l'appelle côté
serveur par son relais signé (`src/admin/core/engine/`). Il pilote l'aperçu du brouillon (`next dev` du clone, 4042).
Fait : éditeur IA (`/editor/*`, engine-core), publication et versions (`/publish/*`, `/versions/*`, engine-publish),
journal `aiUsage` (engine-publish), Ask AI (`/ask`, ask-ai). Les trois derniers sont branchés par `MODULES` de `main.ts`.
Ne fait pas : retour arrière Vercel en local (501), mode hébergé (non construit, voir « Points sensibles »).

## Fichiers (racine du moteur)
- `src/main.ts` — `startEngine(env, overrides?)` : câblage complet (dont domaines du site pour l'éditeur, SEC-08), `MODULES`, arrêt ; lancé seul par `npm run engine`.
- `src/config.ts` — `readEngineConfig` : validation zod de `engine/.env.local`, chemins sûrs, clé d'identité, faux Claude, `ENGINE_VERSION`.
- `src/main.test.ts`, `src/config.test.ts` — moteur entier démarré sans réseau ; refus de configuration.

## Carte des modules
| Dossier | Propriétaire | Rôle |
|---|---|---|
| `src/main.ts` | engine-core | câblage, `MODULES = [usageModule, publishModule, versionsModule, askModule()]`, arrêt ordonné |
| `src/config.ts` | engine-core | configuration validée (noms de variables seulement dans les erreurs) |
| `src/server/` | engine-core | serveur node:http, routeur extensible, Bearer + identité Ed25519, routes de l'éditeur, santé |
| `src/jobs/` | engine-core | file (une demande à la fois), cycle d'une demande, modification en attente, verrou partagé, faux Claude du démarrage |
| `src/store/` | engine-core | magasin JSON atomique (`<ENGINE_WORKSPACE>/data/`) : demandes, modifications, fils, publications |
| `src/git/` | engine-core | git du clone de travail (status -z, versions, commit au nom du client, squash, retour arrière) |
| `src/workspace/` | engine-core | `npm run engine:setup` (clone, main/draft, .env.local de l'aperçu, npm ci) et `sync` |
| `src/preview/` | engine-core | processus `next dev` de l'aperçu : lancement, sonde, redémarrage, arrêt, éditeur inerte |
| `src/content/` | engine-core | Sanity : port + client robot, textes de l'éditeur, publication, signal et jeton d'aperçu du moteur |
| `src/claude/` | engine-claude | Agent SDK, outils MCP fixes, prompts, questions, coût, faux Claude scriptable (voir son CLAUDE.md) |
| `src/guards/` | engine-guards | design system, hook, lint CSS/TSX, contrôles du rendu (Chrome) (voir son CLAUDE.md) |
| `src/usage/` | engine-publish | journal `aiUsage` (port `ports.usage`, `getUsageJournal`) |
| `src/publish/` | engine-publish | `/publish/*`, port `pendingTotal`, `publishServiceOf(context)` |
| `src/versions/` | engine-publish | `/versions`, rollback (501 en local) |
| `src/ask/` | ask-ai | `/ask` (Haiku), écrit sa consommation dans le journal commun |

## Contrats
- API HTTP : `src/admin/core/contracts/engine.ts` (routes, `EngineErrorBody`, messages anglais).
- Transport : `Authorization: Bearer ENGINE_SECRET` puis `X-Kz-User` / `X-Kz-User-Sig` signés Ed25519 par l'admin,
  vérifiés avec `ENGINE_IDENTITY_PUBLIC_KEY` (`verifyEngineUser` de `src/admin/core/engine/signature.ts`, SEC-10).
- Aperçu : `EditorState.preview.url` porte un jeton court `signPreviewToken(ENGINE_PREVIEW_SECRET, user.id)`
  (`src/admin/core/engine/preview-token.ts`, 15 min, SEC-09), jamais le secret racine.
- Extension : `EngineModule { name, register(context), stop?(context) }` (`src/server/modules.ts`).

## Comportement (démarrage et arrêt ; l'utilisateur lance à la main, jamais dans PM2)
1. `engine/.env.local` : noms dans ARCHITECTURE §9, dont `ENGINE_MODE` (local|hosted), `ENGINE_SOURCE_BRANCH` et
   `EDITOR_MAX_REQUEST_USD` (facultatifs), `ENGINE_IDENTITY_PUBLIC_KEY` (OBLIGATOIRE : clé publique Ed25519 SPKI base64 ;
   la clé privée va dans `ENGINE_IDENTITY_PRIVATE_KEY` de l'admin), `ENGINE_FAKE_CLAUDE` (facultatif, voir plus bas).
2. `npm run engine:setup` : clone `ENGINE_SOURCE_REPO` (seuls les COMMITS) dans `<ENGINE_WORKSPACE>/repo`, crée `main`
   et `draft`, écrit `repo/.env.local` de l'aperçu (0600, exclu de git), `npm ci` une fois. Idempotent.
   `npm run engine:setup -- sync` : avance main/draft sur la source (moteur arrêté, rien en attente, avance rapide).
3. `npm run engine` : config validée (refus clair) → espace vérifié → `data/engine.pid` → magasin → reprise des demandes
   interrompues → modules → aperçu lancé → écoute.
4. Arrêt (SIGINT/SIGTERM) : serveur fermé → demande en cours arrêtée et remise en état (fichiers + textes) → publication
   en cours ATTENDUE (`publishServiceOf(context).idle()`, 30 s au plus, FOLLOWUPS #14) → `stop()` des modules (ordre
   inverse, 30 s chacun) → aperçu arrêté (SIGTERM au groupe, SIGKILL après 5 s) → magasins écrits → pid retiré.
   Filet : sortie forcée après 45 s, jamais de next dev orphelin.

**Faux Claude (FOLLOWUPS #12)** : `ENGINE_FAKE_CLAUDE=auto|css|text|ask|fail|budget`, accepté SEULEMENT avec
`ENGINE_MODE=local` écrit (sinon refus au démarrage). L'éditeur joue un scénario scripté (`jobs/fake-claude.ts`) sur le
vrai cycle (vrai hook AVEC pré-validation : chaque Edit, `old_string`/`new_string` comme l'outil réel, est jugé sur le
fichier futur par le lint avant l'écriture ; vrai git, vrai brouillon Sanity, vrai aperçu), sans aucun appel à Claude ; marche même
sans clé Claude. Avertissement bruyant : `⚠⚠⚠` au démarrage, `/health` → `fakeClaude` + `warnings` (champs additifs,
`ok` ne dépend plus de la clé), étape `warn` « FAKE Claude (…) » dans chaque demande, libellé du modèle « Fake Claude
(…) — no real call ». Ask AI n'est PAS simulé. Coût simulé : 0,02 $ par appel (budget : 1,52 $), écrit dans `aiUsage`.
Parcours : `css` (couleur du texte de la zone), `text` (premier champ Sanity), `ask` (question puis la réponse du
client est appliquée), `fail`, `budget` ; `auto` = text si « T Text » est coché, sinon css.

## Forces
- Tout est injectable (Claude, aperçu, Chrome, Sanity, processus) : le moteur entier démarre dans un test
  (`src/main.test.ts`) sans réseau ni Claude. 127 tests propres à engine-core (16 fichiers), sur de vrais dépôts git
  temporaires, dont un test de fumée sur le vrai design system de Conduit (`jobs/conduit.test.ts`).
- Invariants du POC tenus par construction : une demande à la fois (vérification synchrone), textsBefore enregistré avant
  toute écriture, retour arrière fichiers + textes, coût d'une session reprise jamais doublé, plafond du cumul par demande.

## Faiblesses et limites connues
- Une seule session de rendu par demande (premier élément) ; magasin JSON réécrit en entier à chaque étape (suffisant en
  local) ; captures jamais purgées.
- Aperçu : next dev tourne avec les droits de l'utilisateur ; le HMR rend un fichier modifié dès son écriture : la
  barrière est la pré-validation du hook (engine-guards), ACTIVE dans le cycle (`toolAccess.lint`, `jobs/run.ts`,
  FOLLOWUPS #36) — rien d'interdit n'est écrit. Isoler next dev reste une défense en profondeur à construire.
- Le mode hébergé n'est pas construit : pas de frontal devant next dev, pas d'isolation système de l'aperçu.

## Points sensibles
- Écoute sur 127.0.0.1 seulement. Bearer (transport) + identité Ed25519 à durée de vie ≤ 120 s ; droits revérifiés
  (`can(role, …)`) ; corps ≤ 64 Kio ; erreurs `EngineErrorBody`, 500 sans détail. 401 réservé à l'authentification.
- Chemins : absolus, non vides, espace de travail hors du dépôt source ; toute écriture git passe par `openWorkRepo`
  (EXACTEMENT `<ENGINE_WORKSPACE>/repo`, piège 5 du POC). Le dépôt source n'est jamais écrit.
- Secrets : jamais affichés ni journalisés ; environnements MINIMAUX pour next dev, npm, tsc et Claude (jamais
  `...process.env`). Secret racine de l'aperçu : ne quitte jamais le moteur ; sonde, signal et Chrome utilisent un jeton
  du moteur dérivé (2 h, renouvelé) ; l'iframe reçoit un jeton de 15 min lié à l'utilisateur.
- Claude : abonnement accepté seulement si `ENGINE_MODE=local` est ÉCRIT (`resolveClaudeAccess`, engine-claude ; plus
  de NODE_ENV, constat AI-02) ; jamais en hosted. `ENGINE_FAKE_CLAUDE` refusé hors local écrit.
- Sanity : le robot n'écrit que des BROUILLONS (`drafts.<id>`) ; avertissement au démarrage si le dataset est `production`.
  Le port expose aussi les actions `unpublish` / `delete` (`SanityAction`), utilisées par la seule publication.
- Adresses dans les textes du client (SEC-08) : liste blanche = domaines du site lus au démarrage dans
  `<ENGINE_SOURCE_REPO>/src/admin.config.ts` (`site.domain` + hôte de `site.url`, adresses locales et IP exclues ;
  `loadSiteDomains`, `jobs/site.ts`) ; manifeste absent : avertissement, toute adresse retirée.
- Mode hébergé : next dev ne doit JAMAIS être exposé tel quel (ses routes `/__nextjs_*`, `/_next/*` passent avant le
  proxy de l'app) : un frontal doit exiger le jeton d'aperçu sur TOUS les chemins (SEC-06).

## Pièges
- `tsx --env-file` ne pose pas NODE_ENV : d'où `ENGINE_MODE=local` explicite.
- `main.ts` et `workspace/setup.ts` ne s'exécutent que lancés en ligne de commande (test sur `process.argv[1]`) : les
  importer dans un test ne démarre rien.
- Le `.env.local` du clone est ignoré (`.env*` du site + `.git/info/exclude`) : sinon `git status` le verrait et le
  contrôle `scope` refuserait toute demande.
- Le proxy de l'aperçu (auth-core) n'accepte plus le secret racine, même en cookie : tout accès du moteur à 4042 passe
  par `createPreviewCredential` (content/visible.ts). Un clone pas encore synchronisé fait tourner l'ANCIEN proxy.
- `npm run engine` ne recharge pas à chaud : un changement de code ou de `.env.local` demande un redémarrage à la main.

## Comment modifier
- Nouvelle variable : `SCHEMA` et `EngineConfig` de `config.ts` (message avec le NOM seulement) + test dans
  `config.test.ts` + ARCHITECTURE §9 (orchestrateur).
- Nouveau module : exporter un `EngineModule` et l'ajouter à `MODULES` (ordre : `usageModule` d'abord) ; travail à
  finir à l'arrêt → `stop(context)`.
- Nouveau scénario de faux Claude : `FAKE_CLAUDE_SCENARIOS` (config.ts) + `callFor` (`jobs/fake-claude.ts`) + test.

## Tests
`npx vitest run engine --exclude '**/visual-page.test.ts'` (~15 s) ; avec Chrome : `npx vitest run engine` (~6 min).
Propres à engine-core : `npx vitest run engine/src/{server,store,jobs,git,workspace,preview,content} engine/src/main.test.ts engine/src/config.test.ts`.
Typage : `npx tsc --noEmit -p .` (zéro erreur dans `engine/`).

## Décisions et « À trancher »
- Stop et réponses aux questions ouverts à toute personne qui a `ai.editor`, pas seulement à l'auteur de la demande :
  ACCEPTÉ (orchestrateur, FOLLOWUPS #17) — un seul admin partagé, une demande à la fois.
- Identité signée asymétrique (Ed25519, iat/exp) plutôt qu'un HMAC du Bearer (SEC-10, orchestrateur + auth-core).
- À trancher (mode hébergé) : frontal de l'aperçu, isolation de next dev (utilisateur système ou conteneur).

## Demandes de contrat
- ~~Orchestrateur (`contracts/engine.ts`) : `warnings?: string[]` dans `EngineHealth`~~ — **fait** (vérifié le
  2026-09-27) : `warnings?` et `fakeClaude?` sont au contrat.
- ~~Orchestrateur (ARCHITECTURE) : variables du moteur~~ — **fait** : `ENGINE_IDENTITY_PUBLIC_KEY` et `ENGINE_FAKE_CLAUDE`
  figurent dans la liste des variables d'ARCHITECTURE.md.
