# 02 · Installer et configurer Claude pour l’éditeur

> État au 2026-09-25, 21:05. POC : `payload-ai-editor-test`, branche `batterie-tests`, tête `888d165`.
> Les chemins `cms/…` sont relatifs à `/Users/andreagauvreau/Tools/payloadjs-test/payload-ai-editor-test`.
> Pastilles : ✅ validé en passage réel · 🟡 approuvé, pas encore repassé · 🔧 en cours · 📋 prévu · 📚 documentation Sanity ou Anthropic (ou registre npm), non testée dans le POC · 💡 proposition du dossier, sans équivalent dans le POC.
> **Aucune valeur de secret ne figure dans ce fichier.** Seuls les noms de variables y apparaissent.

## 1. Où tourne Claude

L’agent ne s’appelle pas par l’API Messages « à la main ». Le runner lance **Claude Code** comme sous-processus, par l’**Claude Agent SDK** (`query()`), dans le dossier du brouillon (`cwd = site-draft`). Claude y lit et modifie le code du site avec des outils filtrés. ✅ (`cms/src/editor/agent.ts:262-335`)

Conséquences :

- **Côté serveur uniquement.** L’appel part d’une route Next (runtime Node) ou d’un service Node. Jamais depuis Sanity Studio ni depuis un composant client : la clé serait exposée et le binaire ne tournerait pas.
- **Processus persistant** avec un disque : le SDK démarre un binaire natif Claude Code, le runner garde un dépôt git (`site/` + worktree `site-draft/`) et pilote Chrome. Ni fonction serverless, ni Sanity Function (limite de 900 s 📚).
- **Une seule instance** du runner : la file et les réponses attendues sont en mémoire (`cms/src/editor/store.ts`). ✅

## 2. Paquets et versions exactes

### 2.1 Versions installées dans le POC ✅

Relevées dans `cms/package.json` et `cms/node_modules/*/package.json`.

| Paquet | Version installée | Rôle | Placement |
|---|---|---|---|
| `@anthropic-ai/claude-agent-sdk` | **0.3.281** (embarque Claude Code **2.1.281**) | Lancer Claude Code, outils MCP en mémoire, hooks | `dependencies` |
| `@anthropic-ai/sdk` | 0.128.0 | Dépendance paire du SDK (≥ 0.93.0) | `dependencies` |
| `@modelcontextprotocol/sdk` | 1.30.1 | Dépendance paire du SDK (^1.29.0) | `dependencies` |
| `zod` | 4.6.5 | Schémas des outils MCP (^4.0.0 exigé par le SDK) | `dependencies` |
| `playwright-core` | 1.63.0 | Captures, `measure`, contrôles visuels | `dependencies` |
| `pixelmatch` / `pngjs` | ^7.2.0 / ^7.0.0 | Comparaison au pixel (isolation) | `dependencies` |
| `postcss` | 8.5.23 | Lint CSS sur le fichier entier (🟡) | `dependencies` (importé à l’exécution) |
| `typescript` | 5.7.3 | Lint TSX (🟡) et `tsc --noEmit` du brouillon | `dependencies` (importé à l’exécution) |
| `next` | 16.3.3 | Routes du runner | `dependencies` |
| `react` / `react-dom` | 19.2.6 | — | `dependencies` |
| `tsx` | 4.22.4 | Tests : `node --import tsx --test "src/editor/**/*.test.ts"` | `devDependencies` |

Node testé : **v22.14.0** (`cms/package.json` : engines `^18.20.2 || >=20.9.0`). 📚 Sanity 6 et `@sanity/client` 8 exigent Node ≥ 22.12 : prenez Node 22.12 ou plus pour tout le projet.

Commande d’installation côté runner, alignée sur le POC :

```bash
npm install --save-exact @anthropic-ai/claude-agent-sdk@0.3.281 @anthropic-ai/sdk@0.128.0 \
  @modelcontextprotocol/sdk@1.30.1 zod@4.6.5 playwright-core@1.63.0 postcss@8.5.23 typescript@5.7.3
npm install pixelmatch@^7.2.0 pngjs@^7.0.0
npm install -D tsx@4.22.4 @types/pngjs@^6.0.5
```

📚 Le registre npm affiche `@anthropic-ai/claude-agent-sdk` **0.3.282** le 2026-09-25. Le POC n’a été validé qu’avec **0.3.281** : gardez 0.3.281 tant que le banc n’a pas tourné sur une autre version.

### 2.2 Binaire natif propre à la plateforme ✅ / 📚

Le SDK déclare en `optionalDependencies` un binaire par plateforme (`@anthropic-ai/claude-agent-sdk-darwin-arm64`, `-linux-x64`, `-linux-x64-musl`, `-win32-x64`…). Dans le POC, seul `darwin-arm64` est installé (`cms/node_modules/@anthropic-ai/`).

- Lancez **`npm install` sur la machine cible** (VM Linux, image Docker). Ne copiez jamais un `node_modules` de macOS vers Linux.
- Sous Alpine (musl), vérifiez que le paquet `-linux-x64-musl` est bien installé.

### 2.3 Next.js : garder le SDK hors du bundle ✅

Extrait réel de `cms/next.config.ts:11-13` :

```ts
// L'Agent SDK lance son propre exécutable Claude Code et Playwright pilote Chrome :
// ces paquets doivent rester des modules Node natifs, pas être bundlés.
serverExternalPackages: ['@anthropic-ai/claude-agent-sdk', 'playwright-core', 'pngjs', 'pixelmatch'],
```

Le POC ajoute aussi `withPayload(nextConfig, { devBundleServerPackages: false })` (`cms/next.config.ts:30`), propre à Payload : **à ne pas reprendre** dans un projet sans Payload. Gardez seulement `serverExternalPackages`, et déclarez `export const runtime = 'nodejs'` dans les routes du runner.

## 3. Modèle et réglages

### 3.1 Valeurs par défaut ✅

Lues par `readEditorConfig(env, root = process.cwd())`. Une valeur numérique non finie ou ≤ 0 reprend le défaut (`cms/src/editor/config.ts:4-35`).

| Réglage | Variable | Défaut | Effet |
|---|---|---|---|
| Modèle | `EDITOR_MODEL` | `claude-opus-5-5` | Passé à `query({ model })`. Le plan interdit d’en changer sans preuve du banc (`docs/superpowers/plans/2026-09-25-corrections-batterie.md:23`). |
| Effort | `EDITOR_EFFORT` | `medium` | `query({ effort })`. 📚 Sur Opus 5.5, la réflexion ne se désactive pas : l’effort est le seul réglage. Gardez `medium` explicite. |
| Tours max | `EDITOR_MAX_TURNS` | `24` | `query({ maxTurns })`. Dans le banc : médiane 5, maximum 10. |
| Budget | `EDITOR_MAX_BUDGET_USD` | `1.5` | `query({ maxBudgetUsd })`. Le POC le traite comme un plafond **par appel** de `query()`, donc jusqu’à environ **2 × 1,5 $** par demande avec le 2e essai (portée non vérifiée pour une session reprise : § 7.4). |
| Délai de Claude | `EDITOR_TIMEOUT_MS` | `300000` (5 min) | Un minuteur appelle `abort()`. Le temps d’attente d’une réponse du client **n’est pas décompté** (`pauseClock`) ; après une réponse, Claude garde au moins 60 s (`MIN_RESUME_MS`). |
| Délai de réponse du client | `EDITOR_QUESTION_TIMEOUT_MS` | `900000` (15 min) | Au-delà, la modification est arrêtée (`cancelled`) et le brouillon reste intact. `setup.mjs` ne l’écrit pas. |
| Contrôles visuels | `EDITOR_VISUAL_CHECKS` | activé (tout sauf `off`) | `off` coupe Playwright **et** l’outil `measure` : la sûreté baisse. Admis seulement au jalon 1 (socle en texte seul), puis `on` dès le jalon 2. |
| Navigateur | `EDITOR_BROWSER_CHANNEL` | `chrome` | `chromium.launch({ channel, headless: true })`, avec repli sur le Chromium de Playwright. |
| Largeurs | (en dur) | `[375, 768, 1280]` | Mesures et captures. |
| Dossiers de travail | (dérivés) | `.editor/shots`, `.editor/claude` | Captures ; `CLAUDE_CONFIG_DIR` dédié. Le dossier `.editor` est ignoré par git (`cms/.gitignore`). |

Modèles reconnus pour l’affichage : `claude-opus-5-5`, `claude-opus-5`, `claude-sonnet-5`, `claude-fable-5-1` (`cms/src/editor/job.ts:73-79`). ✅

### 3.2 Options passées à `query()` ✅

Extrait réel de `cms/src/editor/agent.ts:301-334` :

```ts
const options: Options = {
  cwd,
  model: settings.model,
  effort: settings.effort,
  maxTurns: settings.maxTurns,
  maxBudgetUsd: settings.maxBudgetUsd,
  tools: TOOLS, // ['Read', 'Edit', 'Glob', 'Grep']
  allowedTools: [
    ...TOOLS,
    ...(textTool ? [TEXT_TOOL] : []),
    ...(measureTool ? [MEASURE_TOOL] : []),
    ...(askTool ? [ASK_TOOL] : []),
  ],
  permissionMode: 'dontAsk',
  // Isolation : ni CLAUDE.md, ni réglages, plugins ou serveurs MCP de la machine ; seuls nos outils.
  settingSources: [],
  strictMcpConfig: true,
  mcpServers: server ? { lyondrive: server } : {},
  systemPrompt: { type: 'preset', preset: 'claude_code', append: systemAppend },
  hooks: { PreToolUse: [{ hooks: [guard] }] },
  abortController,
  resume,
  // Environnement minimal : un seul identifiant transmis, jamais ceux de la session Claude de la machine.
  env: {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    ...(access.kind === 'api-key'
      ? { ANTHROPIC_API_KEY: access.secret }
      : { CLAUDE_CODE_OAUTH_TOKEN: access.secret }),
    CLAUDE_CONFIG_DIR: settings.configDir,
    CLAUDE_AGENT_SDK_CLIENT_APP: 'lyondrive-visual-editor/0.1',
    // Une question au client peut attendre plusieurs minutes.
    MCP_TOOL_TIMEOUT: String(settings.toolTimeoutMs), // questionTimeoutMs + 60 000 (service.ts:47)
  },
}
```

Points à garder à l’identique :

- **`env` remplace `process.env`** (doc du SDK, `sdk.d.ts:1578-1600` 📚). Sans `PATH` ni `HOME`, le sous-processus ne démarre pas correctement. Avec `...process.env`, tous les secrets du serveur (jeton d’écriture Sanity compris) arriveraient chez Claude. **Ne jamais étaler `process.env`.**
- Les noms complets des outils vus par le hook sont `mcp__<serveur>__<outil>`. Si vous renommez le serveur `lyondrive`, changez aussi `TEXT_TOOL`, `MEASURE_TOOL` et `ASK_TOOL` (`cms/src/editor/guards.ts:18-22`).
- `CLAUDE_AGENT_SDK_CLIENT_APP` peut prendre le nom de votre projet.

### 3.3 Schémas des outils MCP ✅ / 🟡

Extrait réel de `cms/src/editor/agent.ts:171-195` (schéma d’`ask_client`) :

```ts
const QUESTIONS_SCHEMA = {
  questions: z
    .array(
      z.object({
        topic: z.string().max(30).optional().describe('Sujet court : « Couleur », « Taille »…'),
        question: z.string().min(1).max(300),
        options: z
          .array(
            z.object({
              label: z.string().min(1).max(80),
              description: z.string().max(300).optional(),
              tone: z.enum(['recommended', 'neutral', 'discouraged']),
              hardcoded: z
                .object({ property: z.string().min(1).max(60), value: z.string().min(1).max(120) })
                .optional()
                .describe('Option discouraged uniquement : la propriété CSS et la valeur exacte écrite en dur.'),
            }),
          )
          .min(2)
          .max(4),
      }),
    )
    .min(1)
    .max(3),
}
```

`set_text` (aujourd’hui) : `{ field: z.enum(paths), value: z.string() }`, avec une description qui liste les champs et leurs limites (`agent.ts:202-222`). `measure` : `{}` (`agent.ts:224-234`). Le serveur est créé par `createSdkMcpServer({ name: 'lyondrive', version: '1.0.0', tools })`.

**📋 Recommandation pour le projet Sanity : écrire directement la version de la tâche 23.** Aujourd’hui, la définition de `set_text` change d’une zone à l’autre et les outils ne sont déclarés que si la demande les permet. Le préfixe du prompt (outils → système → messages) change donc, et le **cache se casse**. Le plan (`docs/superpowers/plans/2026-09-25-corrections-batterie.md`, section « ### Tâche 23 : Outils à définition fixe pour garder le cache entre demandes rapprochées » ; numéros de ligne stables seulement dans `git show 888d165:docs/superpowers/plans/2026-09-25-corrections-batterie.md`, car la copie de travail du plan bouge) prévoit :

- les 3 outils toujours déclarés, avec une définition fixe : `set_text { field: z.string(), value: z.string() }`, une description sans liste de champs, `measure` et `ask_client` en constantes ;
- un outil indisponible répond une erreur claire (« Texte non coché : aucun texte modifiable pour cette demande. », « Mesure indisponible : les contrôles visuels sont coupés. », « Questions indisponibles. ») ;
- `allowedTools` fixe. Le filtrage réel reste fait par le hook `PreToolUse` et par `validateText` ;
- la liste des champs et de leurs limites passe dans le **message** (section TEXTE de `buildPrompt`, qui la donne déjà).

Cible mesurée prévue en phase 6 : moins de 6 000 jetons écrits en cache par demande.

**Réserve : la tâche 23 ne suffit peut-être pas à garder le cache.** Le texte d’ajout (`systemAppend`) est fixe, mais le preset `claude_code` ajoute au prompt système l’environnement du `cwd`, dont l’état git de `site-draft` (branche, commits récents). Cet état change à chaque commit sur `draft`. Le plan du POC le note : « l’état git entre dans le prompt système » (`docs/superpowers/plans/2026-09-24-batterie-tests-editeur-ia.md:66`). Le préfixe système n’est donc pas garanti stable d’une demande à l’autre. À mesurer par `cacheCreationInputTokens` sur deux demandes successives, avant et après un commit sur `draft`.

### 3.4 Erreurs d’API ✅

Lues sur les messages `system/api_retry` et `assistant.error` (`cms/src/editor/agent.ts:103-139, 356-418`).

- **Fatales** (arrêt immédiat, sans attendre le délai) : `authentication_failed`, `billing_error`, `model_not_found` (message « Essayez claude-sonnet-5 »), `account_on_hold`, `oauth_org_not_allowed`, `verification_required`, `invalid_request`, `cloud_credential_error`, et `rate_limit` **seulement en abonnement** (plafond d’utilisation atteint).
- **Réessayées par le SDK** (journal « nouvel essai n/max ») : `overloaded`, `server_error`, et `rate_limit` avec une clé API.
- Après l’arrêt, le bloc `finally` appelle `abortController.abort()` pour ne pas laisser tourner le processus Claude Code.

## 4. Variables d’environnement (noms seulement)

### 4.1 Accès à Claude ✅

Règle de `resolveClaudeAccess` (`cms/src/editor/config.ts:37-72`), dans l’ordre :

1. Un `ANTHROPIC_API_KEY` qui commence par `sk-ant-oat` est **refusé** : c’est un jeton d’abonnement, qui va dans `CLAUDE_CODE_OAUTH_TOKEN`.
2. `ANTHROPIC_API_KEY` présente → accès `api-key`, **prioritaire**.
3. `CLAUDE_CODE_OAUTH_TOKEN` seul → accès `subscription`, **seulement si `NODE_ENV === 'development'`** (donc sous `next dev`). Sinon : erreur « réservé aux tests locaux sous `npm run dev` ».
4. Aucun des deux → erreur qui explique les deux options. La demande échoue (`failed`) avant tout appel à Claude.

| Variable | Usage | Où |
|---|---|---|
| `CLAUDE_CODE_OAUTH_TOKEN` | **Test local** sur votre abonnement Pro/Max, jeton produit par `claude setup-token`. Consomme le quota de l’abonnement ; le coût affiché n’est qu’une estimation non facturée. Refusé hors `next dev`. | `.env.local` du runner |
| `ANTHROPIC_API_KEY` | **Production** et tout usage par des clients : clé créée dans platform.claude.com > API keys. Prioritaire si les deux sont renseignés. Anthropic n’autorise pas un produit utilisé par des tiers à reposer sur un abonnement claude.ai (`docs/superpowers/specs/2026-09-24-ai-live-editor-design.md` §5). | Secrets du serveur de production |

### 4.2 Réglages de l’éditeur ✅

`EDITOR_MODEL`, `EDITOR_EFFORT`, `EDITOR_MAX_TURNS`, `EDITOR_MAX_BUDGET_USD`, `EDITOR_TIMEOUT_MS`, `EDITOR_QUESTION_TIMEOUT_MS`, `EDITOR_VISUAL_CHECKS`, `EDITOR_BROWSER_CHANNEL`. Défauts : tableau du § 3.1.

### 4.3 Chemins et preview ✅

| Variable | Défaut dans le POC | Rôle |
|---|---|---|
| `SITE_LIVE_DIR` | `../site` | Dépôt du site, branche `main` (publiée). |
| `SITE_DRAFT_DIR` | `../site-draft` | Worktree sur la branche `draft` : `cwd` de Claude. |
| `SITE_DRAFT_URL` | `http://127.0.0.1:4012` | Preview du brouillon ouverte par Playwright. |
| `PREVIEW_SECRET` | vide | Envoyé par Playwright dans l’en-tête `x-preview-secret`. Partagé avec la preview du brouillon. |

> ⚠️ **Ne jamais laisser `SITE_LIVE_DIR`, `SITE_DRAFT_DIR` ou `SITE_DRAFT_URL` vides.** `readEditorConfig` lit ces variables avec `??` (`cms/src/editor/config.ts:15-17`) : une chaîne vide ne reprend **pas** la valeur par défaut, et `path.resolve(root, '')` renvoie le dossier courant du runner. Si le runner tourne dans le projet Sanity, `draftDir` et `liveDir` pointent alors sur votre dépôt de travail. Dès la première demande, `discardWorkingChanges` y lance `git reset --hard HEAD` puis `git clean -fd` (`cms/src/editor/job.ts:378-381`, rollback `job.ts:339-346`, `cms/src/editor/git.ts:62-65`), et `recoverInterrupted` peut faire de même : **tout travail non commité et tout fichier non suivi du projet est détruit.**
>
> Deux protections à écrire dans le portage 💡 :
> 1. porter `config.ts` avec `||` au lieu de `??` pour ces trois variables (une valeur vide reprend alors le défaut) ;
> 2. **au démarrage, le runner refuse de tourner** si `draftDir` ou `liveDir` est vide, égal au dépôt du runner ou au dépôt de travail du développeur, si `draftDir` n’est pas sur la branche `draft`, ou si `liveDir` n’est pas sur `main` (`git rev-parse --abbrev-ref HEAD`). Un test dédié couvre chacun de ces cas.
>
> `site/` et `site-draft/` doivent être un **clone dédié** du dépôt du front, distinct de la copie de travail où vous développez l’intégration (voir `06-adaptation-sanity.md` § 6).

**Côté site et brouillon** (variables lues par l’interface et le pont portés, et par le tableau de bord ; source des noms : `scripts/setup.mjs:64-119`, `cms/src/components/Dashboard.tsx:10`) :

| Variable | Où dans le POC | Rôle | Pour Sanity |
|---|---|---|---|
| `SITE_MODE` | `site/.env.local` (`live`), `site-draft/.env.local` (`draft`) | Mode du serveur Next : site en ligne ou preview du brouillon. | À garder : `draft` sur la preview du worktree. |
| `CMS_URL` | site et brouillon | URL du CMS (relais `/editor-api/*`, lecture des textes). | À remplacer par l’URL du runner ; la lecture des textes passe par `next-sanity`. |
| `DRAFT_URL` | site | URL de la preview, seule origine acceptée par l’éditeur pour le pont. | À garder (URL de `site-draft`). |
| `ADMIN_URL` | site | Lien vers l’admin Payload (« Publier depuis l’admin »). | URL du Studio, ou retiré si l’éditeur vit dans le Studio. |
| `LIVE_ORIGINS` | brouillon | Parents autorisés pour le pont (`postMessage`). | **Y ajouter l’origine du Studio** si l’éditeur est un outil du Studio. |
| `PREVIEW_SECRET` | CMS et brouillon (même valeur) | Accès de Playwright à la preview. | À garder, côté runner et preview seulement. |
| `SITE_LIVE_URL` | CMS (`Dashboard.tsx:10`) | Lien vers le site en ligne dans le tableau de bord. | Onglet Publication de l’outil du Studio. |
| `EDITOR_DEV_AUTOLOGIN` | site et brouillon (commenté) | Autologin local. | Propre à Payload : voir ci-dessous. |

Variables propres à Payload, **à ne pas reprendre** : `DATABASE_URL`, `PAYLOAD_SECRET`, `SERVER_URL`, `EDITOR_AUTOLOGIN` (et `EDITOR_DEV_AUTOLOGIN` côté site). Source des noms : `scripts/setup.mjs:64-119`.

### 4.4 Variables Sanity à prévoir 📚 (proposition, non testée)

| Variable | Côté | Rôle |
|---|---|---|
| `NEXT_PUBLIC_SANITY_PROJECT_ID`, `NEXT_PUBLIC_SANITY_DATASET` | site + runner | Projet et dataset. |
| `SANITY_API_READ_TOKEN` | preview du brouillon (serveur) | Lecture en perspective `drafts` (droits Viewer). |
| `SANITY_API_WRITE_TOKEN` | **runner uniquement** | Écriture des brouillons par `set_text`, publication (droits Editor). Jamais transmis à Claude ni au navigateur. |

Si le projet Sanity existant utilise déjà d’autres noms pour ces jetons, gardez les siens.

### 4.5 Modèle de `.env.local` pour le runner (valeurs vides)

```dotenv
# Accès à Claude : l'un des deux. Valeurs recopiées À LA MAIN (voir § 5), jamais collées dans un chat.
# Test local sous `next dev` uniquement :
CLAUDE_CODE_OAUTH_TOKEN=
# Production / clients (prioritaire si renseignée) :
ANTHROPIC_API_KEY=

EDITOR_MODEL=claude-opus-5-5
EDITOR_EFFORT=medium
EDITOR_MAX_TURNS=24
EDITOR_MAX_BUDGET_USD=1.5
EDITOR_TIMEOUT_MS=300000
EDITOR_QUESTION_TIMEOUT_MS=900000
# off au jalon 1 (socle en texte seul), on à partir du jalon 2 (preview et contrôles visuels)
EDITOR_VISUAL_CHECKS=off
EDITOR_BROWSER_CHANNEL=chrome

# JAMAIS VIDES : une valeur vide vaut le dossier du runner (`??` dans config.ts), et le runner
# y ferait `git reset --hard` + `git clean -fd`. Chemins ABSOLUS vers un clone dédié du front.
# Clone dédié du dépôt du front, sur main :
SITE_LIVE_DIR=/chemin/absolu/vers/site
# Worktree de ce clone, sur la branche draft :
SITE_DRAFT_DIR=/chemin/absolu/vers/site-draft
SITE_DRAFT_URL=http://127.0.0.1:<port de la preview>
PREVIEW_SECRET=
```

Les trois lignes `SITE_*` sont des **gabarits** : remplacez-les avant de lancer le runner. Le runner doit refuser de démarrer si l’une vaut encore un gabarit, est vide ou désigne le dépôt du runner (§ 4.3).

Vérifiez que `.env.local` (et `.env*`) figurent dans le `.gitignore` du projet Sanity **avant** d’y écrire une valeur.

## 5. Recopier le jeton déjà configuré (à faire par vous, pas par Claude)

Le jeton d’abonnement fonctionne déjà dans le POC. Il est rangé sur la ligne `CLAUDE_CODE_OAUTH_TOKEN=` du fichier :

```
/Users/andreagauvreau/Tools/payloadjs-test/payload-ai-editor-test/cms/.env
```

**Règles :**

- C’est **vous** qui faites la copie. Ne demandez jamais à une conversation Claude de lire ce fichier, d’afficher la valeur ou de la recopier. Ne collez jamais la valeur dans un chat, un ticket, un commit ou un README.
- Ne lancez pas `cat`, `echo $CLAUDE_CODE_OAUTH_TOKEN` ni `grep` sans redirection : la valeur s’afficherait dans le terminal (et dans l’historique de défilement).
- **Faites ces manipulations dans un terminal extérieur à Claude Code** (Terminal.app, iTerm), jamais dans le panneau Terminal de l’application de bureau Claude Code : Claude peut lire ce panneau. Une commande mal tapée ou un jeton affiché y entrerait dans une conversation. **Effacez ensuite le défilement** (Cmd+K).

**Option A — dans votre éditeur de code (la plus simple).**
1. Ouvrez `cms/.env` du POC dans votre éditeur.
2. Copiez la **ligne entière** `CLAUDE_CODE_OAUTH_TOKEN=…`.
3. Collez-la dans le `.env.local` du runner du projet Sanity, à la place de la ligne vide.
4. Fermez les deux fichiers.

**Option B — dans votre propre terminal, sans afficher la valeur.** Depuis le dossier du runner Sanity (après avoir **retiré** la ligne vide `CLAUDE_CODE_OAUTH_TOKEN=` du modèle, pour ne pas la doubler) :

```bash
# Garantit un saut de ligne final, sinon la ligne se collerait au bout de la précédente :
printf '\n' >> .env.local
grep '^CLAUDE_CODE_OAUTH_TOKEN=' /Users/andreagauvreau/Tools/payloadjs-test/payload-ai-editor-test/cms/.env >> .env.local
# Contrôle sans rien afficher d'autre qu'un nombre (1 attendu) :
grep -c '^CLAUDE_CODE_OAUTH_TOKEN=..' .env.local
```

**Option C — générer un jeton neuf.** Lancez `claude setup-token` dans un terminal extérieur à Claude Code (voir les règles ci-dessus). Le jeton s’affiche une fois : copiez-le, collez-le dans `.env.local` sur la ligne `CLAUDE_CODE_OAUTH_TOKEN=`, puis effacez l’écran et le défilement (Cmd+K). Cela évite de dépendre du fichier du POC.

**Ensuite :**
- Lancez le runner avec `next dev` (`NODE_ENV=development`), sinon le jeton est refusé.
- Le journal de la modification doit afficher « Claude Opus 5.5 via votre abonnement Pro/Max (test local). » (`cms/src/editor/job.ts:359-365`). Avec une clé API : « … via la clé API Anthropic. »
- Ne mettez **jamais** le jeton d’abonnement dans `ANTHROPIC_API_KEY` : il est refusé exprès.
- Pour `next start` en local, ou pour tout environnement accessible à des clients : `ANTHROPIC_API_KEY` obligatoire.

## 6. Chrome et Playwright pour la mesure

✅ `cms/src/editor/visual.ts:172-186, 619-733` :

- `chromium.launch({ channel: EDITOR_BROWSER_CHANNEL, headless: true })`, avec repli automatique sur le Chromium de Playwright si Chrome n’est pas installé.
- Chaque contexte : viewport `largeur × 900`, `deviceScaleFactor: 1`, en-tête `x-preview-secret: PREVIEW_SECRET`, `waitUntil: 'networkidle'`, puis `document.fonts.ready`.
- Si la capture « avant » échoue (preview muette ou Chrome absent), la demande échoue **avant** l’appel à Claude (« preview … ou Chrome indisponible »).

À prévoir :

- **En local (macOS)** : Chrome installé suffit (`channel: 'chrome'`).
- **Sur un serveur Linux** 📚 : installez Google Chrome, ou le Chromium de Playwright avec ses dépendances système (`npx playwright-core install --with-deps chromium`, commande à vérifier pour la version 1.63). `playwright-core` n’embarque aucun navigateur.
- **Preview du brouillon** : elle doit répondre à `SITE_DRAFT_URL` et afficher les **brouillons** Sanity quand elle reçoit le secret. Dans le POC, `canViewDraft()` accepte l’en-tête `x-preview-secret` (`site main:src/editor/session.ts:43-48`). Dans Sanity, il faudra l’équivalent avec le Draft Mode de Next (proposition, 📚 à tester) : la route d’activation accepte ce secret serveur, et Playwright l’ouvre d’abord pour recevoir le cookie.
- **Stega** 📚 : si la preview active l’encodage stega de Visual Editing, les textes contiennent des caractères invisibles qui peuvent fausser `measure` (lignes, longueurs). Désactivez stega pour le rendu mesuré par le runner, ou vérifiez les mesures.
- Dans le code évalué par `page.evaluate`, n’écrivez aucune fonction nommée ni `const f = () =>` : tsx/esbuild injecte `__name`, absent du navigateur (`.superpowers/sdd/corr-12-report.md`). 🟡

## 7. Coût et cache

### 7.1 Chiffres mesurés ✅

Passage de référence `scripts/bench/runs/1-reference` (2026-09-25, 50 cas, accès `subscription` pour les 50, donc **coûts estimés** par le SDK) :

| Mesure | Valeur |
|---|---|
| Total | **3,83 $** pour 50 demandes |
| Médiane par demande | **0,070 $** (cible ≤ 0,08 $) |
| Minimum / maximum | 0,030 $ / **0,152 $** (T09) |
| Durée médiane | 24 s (maximum 50,6 s) |
| Tours | médiane 5, maximum 10 |
| Jetons écrits en cache (médiane) | 4 737 |
| Jetons lus en cache (médiane) | 32 412 |
| 2e essai | aucun dans ce passage |

Parcours réels du 2026-09-24 : entre 0,03 $ (annulation) et 0,18 $ par demande (`docs/superpowers/specs/2026-09-24-ai-live-editor-design.md:201-236`).

### 7.2 Tarifs 📚

Skill `claude-api` (table au 2026-06-24) et plan des corrections, tâche 24 :

| Modèle | Entrée | Sortie | Lecture cache | Écriture cache (5 min) |
|---|---|---|---|---|
| `claude-opus-5-5` | 4 $ / M | 20 $ / M | 0,20 $ / M | 5 $ / M |
| `claude-sonnet-5` | 2 $ / M | 10 $ / M | 0,20 $ / M | 2,5 $ / M |

Ordre de grandeur pour une demande médiane sur Opus 5.5 : écriture de cache ≈ 4 737 × 5 $/M ≈ 0,024 $, lecture ≈ 32 412 × 0,20 $/M ≈ 0,006 $. Le reste vient surtout de la sortie (réflexion comprise). Le plan estime que 30 à 70 % du prix d’une demande part dans l’écriture du cache (`docs/superpowers/plans/2026-09-24-batterie-tests-editeur-ia.md`).

### 7.3 Lecture du coût dans le runner ✅

- Le message `result` fournit `total_cost_usd` (→ `costUsd`) et `modelUsage` (somme de `inputTokens`, `outputTokens`, `cacheReadInputTokens`, `cacheCreationInputTokens`, tous modèles), plus `num_turns` (`cms/src/editor/agent.ts:337-403`).
- `runEdit` cumule les essais : une session reprise rapporte déjà le cumul (`total_cost_usd` continue), donc elle n’est pas rangée deux fois (`cms/src/editor/job.ts:309-336, 505-512`). Le résultat est enregistré dans l’Edit : `costUsd` (4 décimales), `tokens`, `durationMs`, `access`.
- La vue du client affiche le coût réel avec une clé API, et « ≈ … (abonnement, non facturé) » en abonnement.

### 7.4 Pièges et recommandations

- **Portée de `maxBudgetUsd` : non vérifiée.** 📚 Le SDK dit seulement « Maximum budget in USD for the query » (`sdk.d.ts:1870-1874`). Le POC le traite comme un plafond par appel de `query()` (plan `docs/superpowers/plans/2026-09-24-batterie-tests-editeur-ia.md`, « Point de départ » : « 1,5 par passage (jusqu’à ~3 $ avec le 2e essai) »), mais ce n’est pas vérifié pour une session reprise, dont `total_cost_usd` est cumulé depuis son début. À mesurer, ou, plus sûr, ajouter côté runner un plafond du cumul par demande, contrôlé avant de lancer le 2e essai. Le plafond par demande n’est pas fait dans le POC (📋 « en réserve »).
- **Coût du 1er essai perdu si le 2e échoue** (délai, erreur fatale, arrêt) : `failed()` renvoie `costUsd: 0` avec le même `sessionId`, ce qui écrase le cumul. 📋 Tâche 24 : `apiTurns`, `costKind: 'session' | 'call'`, `meterUsage` dédoublonné par `message.message.id` et `estimateCost(model, tokens)` avec la table de prix du § 7.2. À écrire dès le départ dans le portage.
- **Cache cassé d’une zone à l’autre** tant que les définitions d’outils varient : voir § 3.3 (tâche 23). Environ 0,39 $ perdus sur le passage de référence.
- **Préfixe système pas forcément stable, même avec la tâche 23.** Le preset `claude_code` ajoute l’état git du `cwd` (`site-draft`), qui change à chaque commit sur `draft` (plan `2026-09-24-batterie-tests-editeur-ia.md:66`). À mesurer par `cacheCreationInputTokens` avant de promettre un gain de cache.
- `total_cost_usd` est une **estimation** du SDK, pas une facture. La facture fait foi sur la console Anthropic.
- Ne changez de modèle (`claude-sonnet-5` pour réduire le coût, par exemple) qu’après un passage du banc.

## 8. Vérification rapide après installation

1. `npm ls @anthropic-ai/claude-agent-sdk` affiche 0.3.281, et le paquet natif de la plateforme est présent dans `node_modules/@anthropic-ai/`.
2. `next.config.ts` contient `serverExternalPackages` (§ 2.3).
3. `.env.local` est ignoré par git, et la ligne du jeton est remplie (contrôle par `grep -c`, jamais par affichage).
4. Le runner tourne sous `next dev` (jeton d’abonnement) ou avec `ANTHROPIC_API_KEY`.
5. Chrome se lance en headless et la preview du brouillon répond avec le secret.
6. Portez les tests `config.test.ts` et `job.test.ts` (faux Claude `fakeClaude`, faux CMS `fakeContent`) et lancez-les avant le premier appel réel : `node --import tsx --test "src/editor/**/*.test.ts"`.
7. Première demande réelle : une modification de **texte CMS** (jalon 1, `EDITOR_VISUAL_CHECKS=off`), avec votre accord explicite ; le style viendra au jalon 3. Contrôlez dans le journal la ligne d’accès, puis le coût (de l’ordre de 0,03 à 0,15 $).
8. Avant cette première demande : `SITE_LIVE_DIR` et `SITE_DRAFT_DIR` pointent sur le clone dédié (jamais vides, jamais le dépôt où vous développez), et le runner refuse bien de démarrer sinon (§ 4.3).
