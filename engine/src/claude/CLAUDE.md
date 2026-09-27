# Pilotage de Claude (moteur IA) — LLM context

> Propriétaire : engine-claude · Figma : D1-D3, G2 (questions, journal, coût), G4 (Ask AI via `complete`) · Mis à jour : 2026-09-27

## Utilité
Tout ce qui parle à Claude dans le moteur (`engine/`, processus Node séparé, jamais importé par Next) :
- lancer Claude Code (Agent SDK) sur UNE demande de l'éditeur IA, enfermé dans le clone de travail du site ;
- ses 3 outils MCP à définition fixe (`set_text`, `measure`, `ask_client`) et le hook PreToolUse ;
- les prompts en anglais (`systemAppend` + `src/editor/RULES.md`, `buildPrompt`, `buildRetryPrompt`) ;
- les questions au client 🟢⚪🔴 (validation, ids, réponses) ; la validation des textes Sanity (`validateText`) ;
- le métrage du coût (session reprise, appel interrompu, tarifs) ; l'accès (clé API / abonnement) ;
- une passerelle sans outil pour Ask AI (`complete`) ; un faux Claude scriptable pour les tests des autres modules.

Il ne fait PAS : le cycle d'une demande (2 essais, contrôles, retour arrière, commit, file, statuts : engine-core),
l'écriture Sanity (injectée), les garde-fous CSS/TSX/rendu et la décision du hook (engine-guards), la route Ask AI (ask-ai).
Aucun rôle ni route : c'est une bibliothèque du moteur. Tout ce que lit le client (questions, options, messages, erreurs)
est en anglais ; commentaires et ce fichier en français.

## Fichiers
- `index.ts` — API publique (les autres modules n'importent que d'ici).
- `access.ts` — `resolveClaudeAccess` (clé API / abonnement), `readAgentSettings` (EDITOR_*), `accessKind`.
- `agent.ts` — `createAgentRunner` (query() et lecture du flux), `buildAgentOptions`, `agentEnv`, `createKuartzServer`,
  `createAgentClock` (pauseClock), `fatalApiError`, `RESULT_ERRORS`, `describeTool`.
- `tools.ts` — outils MCP `kuartzTools` (définitions, schémas zod, descriptions en anglais, dont `ASK_CLIENT_DESCRIPTION`).
- `hook.ts` — `createGuardHook` (adaptateur SDK du `checkToolUse` d'engine-guards), `toolAccessFor`, `scopeOf`.
- `names.ts` — ré-exporte les noms d'outils d'engine-guards (une seule source) : `mcp__kuartz__*`, `ALLOWED_TOOLS`, `SITE_DIRS`.
- `prompt.ts` — `SYSTEM_SENTENCES`, `systemAppend`, `buildPrompt`, `buildRetryPrompt`, `sharedDisplays`, `DATA`, `MEASURED_TEXTS`.
- `questions.ts` — `questionProblems`, `effectProblem`, `prepareQuestions`, `parseAnswers`, `describeAnswers`, `createAskTool`…
- `text.ts` — `resolveTextFields`, `editableFields`, `validateText`, `createTextTool` (écriture injectée), `clientMessage`.
- `quote.ts` — `quoteData` (texte du site/Sanity cité comme donnée, guillemets “ ” « » " → ‹ ›, longueur bornée).
- `cost.ts` — `meterUsage`, `estimateCost`, `addCall` (banked/session), `toUsage`, `usageFromTokens` (format `Usage` du contrat).
- `pricing.ts` — `PRICES_PER_MTOK` (table typée et gelée), `priceOf`.
- `complete.ts` — `complete` / `createComplete` (Ask AI), `completeOptions`, `transcriptPrompt`, `CompleteError`.
- `fake.ts` — `createFakeAgent`, `fakeScenarios` (faux Claude scriptable, même interface que `RunAgent`).
- `fixtures.ts` — zones et tokens de TEST modelés sur Conduit, `designSystem()` construit par engine-guards.
- `*.test.ts` — tests (voir Tests). `rules.test.ts` lit le vrai `src/editor/RULES.md`.
- `../../../src/editor/RULES.md` — règles données à Claude, en anglais (propriété d'engine-claude dans un dossier du site).

## Contrats
- Entrées : `core/contracts/engine.ts` (`EditRequest`, `ElementTarget`, `Question`, `QuestionOption`, `Answer`,
  `Usage`, `ClaudeAccess`, `StepKind`), `core/contracts/zones.ts` (`ZoneDef`, `SanityTextBinding`, `ZonesFile`) ;
  engine-guards : `DesignSystem` (`loadDesignSystem`, dont `rules` = RULES.md), `checkToolUse`, `repoPath`, `SITE_DIRS`,
  noms d'outils, `css-policy` (`EXTERNAL_RESOURCE`, `NEGATIVE_OR_CALC`, `isExemptable`, `unmeasurableColor`,
  `normalizeValue`, `MAX_VALUE_LENGTH`, `tokenVarName`), `describeMeasures`/`ZoneMeasure`, `contrastRatio`/`colorTone`, `PageText`.
- Sorties (signatures principales) :
  - `resolveClaudeAccess(env: { ANTHROPIC_API_KEY?, CLAUDE_CODE_OAUTH_TOKEN?, NODE_ENV? }, { localMode? }) → { ok: true, access: ClaudeCredential, warning? } | { ok: false, error }`
  - `readAgentSettings(env: SettingsEnv, { configDir }) → AgentSettings` (lève si `configDir` n'est pas absolu)
  - `createAgentRunner(settings, { query? }) → RunAgent` ; `RunAgent = (run: AgentRun) => Promise<AgentResult>`
    - `AgentRun = { prompt, cwd (absolu), toolAccess: {files, textTool}, textTool?, measureTool?, askTool?, systemAppend, access, resume?, signal, onEvent(AgentEvent) }`
    - `AgentResult = { ok, message, sessionId, costUsd, tokens, turns, apiTurns, costKind: 'session'|'call', error, fatal? }`
    - `AgentEvent = { kind: StepKind, label, detail? }` (engine-core horodate → `Step`)
  - `systemAppend(ds) → string` (lève sans RULES.md) ; `buildPrompt(ds, request: PromptRequest, texts?: PromptTexts | null, context?: { before?, pages?, pageTexts? }) → string` ; `buildRetryPrompt(problems: string[]) → string`
  - `toolAccessFor(zones, { scope, targets }, textFieldCount) → ToolAccess`
  - `resolveTextFields(binding, { doc?, key? }, { emphasis? }) → { ok, target: { fields: TextField[], closed: string[] } } | { ok: false, error }` ; `editableFields(target, scope)` ; `createTextTool({ target, fields, scope, before, write, onEvent? }) → { onSet, proposed, written }`
  - `createAskTool({ waitForAnswers(asked) → Promise<ResolvedAnswer[]>, onEvent?, policy?, now? }) → AskTool` ; `prepareQuestions(drafts, now?, batchId?) → { id, askedAt, questions: Question[] }` ; `parseAnswers(asked, body) → { ok, answers: Answer[], resolved } | { ok: false, error }` ; `describeAnswers(resolved) → string` ; `hardcodedOf`, `acceptsLongerText`
  - `addCall(state, call: AgentResult, resumed: string | null) → CostState` ; `toUsage(state, { model, access, durationMs }) → Usage` ; `totalCost(state)`
  - `complete({ model, system, messages, maxTokens, signal? }, { access, configDir, anthropic?, query?, base?, now? }) → Promise<{ text, usage: Usage, stopReason }>` (lève `CompleteError { fatal }`)
  - `createFakeAgent(script: FakeCall[] | (run, i) => FakeCall) → RunAgent & { runs, results }` ; `fakeScenarios.*`
- Dépend de : `@anthropic-ai/claude-agent-sdk` 0.3.283, `@anthropic-ai/sdk` 0.128, zod 4, engine-guards, contrats.
- Utilisé par : engine-core (job, serveur), engine-publish (journal `aiUsage` via `Usage`), ask-ai (`complete`).

## Comportement
### Options exactes de query() (`buildAgentOptions`, vérifiées dans `sdk.d.ts` 0.3.283, figées par test)
| Option | Valeur | Pourquoi |
|---|---|---|
| `cwd` | clone de travail (branche draft), absolu | Claude ne voit que le site ; chemin vide/relatif refusé (piège 5 du POC) |
| `model` / `effort` | `EDITOR_MODEL` (claude-opus-5-5) / `EDITOR_EFFORT` (medium) | réglages validés au POC ; Opus 5.5 : medium est aussi son défaut |
| `maxTurns` / `maxBudgetUsd` | 24 / 1.5 | plafonds PAR APPEL de query() (voir Pièges) |
| `tools` | `['Read','Edit','Glob','Grep']` | ni Bash, ni Write, ni Web |
| `allowedTools` | les 4 + `mcp__kuartz__set_text`, `…__measure`, `…__ask_client`, FIXE et gelé | cache ; le droit se décide à l'appel (hook) |
| `permissionMode` | `'dontAsk'` | tout outil non pré-approuvé est refusé, jamais de question |
| `settingSources` / `strictMcpConfig` | `[]` / `true` | ni CLAUDE.md, ni réglages, plugins ou MCP de la machine |
| `mcpServers` | `{ kuartz: createSdkMcpServer({ name: 'kuartz', tools, alwaysLoad: true, timeout }) }` | `alwaysLoad` : jamais différé derrière ToolSearch (préfixe stable) |
| `systemPrompt` | `{ type: 'preset', preset: 'claude_code', append: systemAppend(ds), excludeDynamicSections: true }` | sort cwd/état git du système (cache entre demandes) |
| `hooks` | `{ PreToolUse: [{ hooks: [guard] }] }` sans matcher | TOUS les outils passent par `checkToolUse` |
| `abortController`, `resume` | Stop/délai ; id de session au 2e essai | une session = une demande |
| `env` | `PATH`, `HOME`, UN identifiant, `CLAUDE_CONFIG_DIR` dédié, `CLAUDE_AGENT_SDK_CLIENT_APP=kuartz-ai-editor/0.1`, `MCP_TOOL_TIMEOUT` (question + 60 s) | jamais `...process.env` |
`disallowedTools`, `canUseTool`, `plugins` : non utilisés (le test vérifie la liste exacte des clés).

### Flux et erreurs
- `system/api_retry` : erreur fatale (`authentication_failed`, `billing_error`, `model_not_found`, `account_on_hold`,
  `oauth_org_not_allowed`, `verification_required`, `invalid_request`, `cloud_credential_error`, `rate_limit` avec
  l'abonnement seulement) → arrêt immédiat, `fatal: true` (engine-core ne tente pas de 2e essai) ; sinon étape `warn`.
- `assistant` : jetons relevés par `message.id` (dédoublonnés, dernier relevé) ; dernier texte = message au client
  (nettoyer avec `clientMessage`) ; chaque `tool_use` → étape (`describeTool`, anglais). measure/ask sont journalisés par engine-core.
- `result` : `total_cost_usd` (cumul de session), somme de `modelUsage`, `num_turns` ; erreurs `RESULT_ERRORS` en anglais.
- Interruption sans `result` : coût ESTIMÉ d'après les jetons vus (`costKind: 'call'`). `finally` coupe toujours le processus.
- `createAgentClock` : délai `timeoutMs` (300 s) par appel ; `pauseClock` le suspend pendant `ask_client`, puis au moins 60 s.

### Les 4 cas d'`ask_client` (description de l'outil, étape 2 du prompt, RULES.md)
1. écart au design system (couleur, transparence, taille, arrondi, espacement…) ; 2. information que seul le client
connaît (prix, horaires, numéro, adresse) — aucune option ne propose de valeur, le client répond librement ;
3. texte qui contredit l'élément (lien qui mène ailleurs, offre absente) — avant tout `set_text` ; 4. texte réécrit qui
gagnerait une ligne à 375 px — option `effect: 'longer-text'` (jamais la neutre, jamais toutes, et elle dit le nombre de
lignes). Une question refusée est RENVOYÉE À CLAUDE (isError) sans rien montrer au client. Ids du contrat : `<lot>-q1`,
`<lot>-q1o2` (une réponse à un ancien lot ne vaut jamais). Réponse : une option, ou un texte libre ≤ 300 caractères.

### Ce que les questions ne peuvent pas contenir (`questionProblems`, politique réelle d'engine-guards)
- une valeur en dur hors de l'option 🔴 ; une police (`font-family`, ni le raccourci `font`) même en 🔴 ;
- une valeur en dur sur une propriété non exemptable (`opacity`, `display`, `position`, `transform`, `background-image`,
  `outline`, `outline-offset`, `box-shadow`, décalages) ou inconnue ; une valeur > 200 caractères ;
- `url()`, `image(`, `@import`, `//`, `javascript:`, `\` ; un négatif, `calc()`, `min()`, `max()`, `clamp()` ;
  une couleur non mesurable (relative, `none`, var() dans la couleur, alpha hexadécimal) ;
- dans AUCUN texte lu par le client (question, sujet, libellé, description) : une adresse web ou une ressource externe
  (mineur #21 du POC corrigé : la question et son sujet sont contrôlés aussi ; « the image(s) » n'est pas une ressource).

### Textes Sanity (`text.ts`)
Champs = chemins de `zones.json` (`$key` remplacé par la `_key` de data-edit-doc/data-edit-key, id publié du document
sur data-edit-doc), id donné à Claude `<document>:<chemin>`. `validateText` : champ connu, pas un champ `closed`, non vide,
pas de `<`/`>` ni de caractère invisible, longueur VISIBLE ≤ max, lignes ≤ `lines` (retours gardés seulement là),
astérisques refusés sauf champ à mise en avant (option `emphasis`, DÉSACTIVÉE par défaut : Conduit met en avant par un
champ séparé, ex. `getStarted.titleMuted`). `createTextTool` écrit AUSSITÔT par la fonction injectée (engine-core), sans
réécrire une valeur identique ; une exception d'écriture devient une erreur renvoyée à Claude.

### Accès (`resolveClaudeAccess`)
`ANTHROPIC_API_KEY` d'abord (seule voie pour des clients). `CLAUDE_CODE_OAUTH_TOKEN` (abonnement) seulement si
`NODE_ENV === 'development'` OU `{ localMode: true }` passé par engine-core (choix : `npm run engine` lance tsx sans
NODE_ENV ; le drapeau n'est posé que sur configuration explicite du mode local, jamais en mode `hosted`). Un `sk-ant-oat…`
dans `ANTHROPIC_API_KEY` est refusé. Les blancs d'un jeton sont retirés (copie sur 2 lignes) ; un jeton court
(< 100 caractères) donne un `warning`. Aucun message ne contient le secret.

### Coût
`Usage.inputTokens` = non cachés + lus + écrits en cache. `costKind: 'estimated'` dès qu'un appel est interrompu. Avec
l'abonnement, le coût est calculé (SDK) mais non facturé : `access: 'subscription'`. Tarifs (skill `claude-api`, 2026-09-27) :
Opus 5.5 4/20 $, Sonnet 5 2/10 $, Haiku 4.5 1/5 $ par million ; cache : lecture 0,1 ×, écriture 5 min 1,25 ×.

### Ask AI (`complete`)
Clé API → API Messages, système en `cache_control` éphémère, coût calculé aux tarifs. Abonnement → query() sans aucun
outil (`tools: []`, `allowedTools: []`, hook qui refuse tout, `mcpServers: {}`, `settingSources: []`, `maxTurns: 1`,
`persistSession: false`, prompt personnalisé, `CLAUDE_CODE_MAX_OUTPUT_TOKENS`), historique en transcription.

## Forces
- Options, env et outils figés par des tests option par option ; aucun appel réel (query et client injectables).
- Une seule source pour les noms d'outils, le hook et la politique CSS (engine-guards) : pas de divergence possible.
- RULES.md testé contre le prompt système ET contre la politique CSS réelle (valeurs promises acceptées, propriétés jamais
  en dur toutes citées dans « Never for… »).
- Coût : la reprise de session n'est jamais comptée deux fois (test avec le faux Claude qui cumule comme le SDK).

## Faiblesses et limites connues
- Le 2e essai (session reprise) et le gain de cache (`excludeDynamicSections`, outils fixes) n'ont JAMAIS tourné avec le
  vrai Claude (ni au POC, ni ici) : seuls les tests avec un faux Claude les couvrent. À mesurer au premier passage réel
  (`cacheWriteTokens` de deux demandes séparées par un commit).
- `maxTurns` borne le nombre d'allers-retours, pas la longueur d'une réponse.
- La description d'`ask_client` doit rester ≤ 2 048 caractères (plafond Claude Code), testé.
- Les raisons de refus du hook et des contrôles viennent d'engine-guards, aujourd'hui en FRANÇAIS : Claude et le journal
  du client les reçoivent telles quelles (voir Demandes de contrat). `describeMeasures` écrit les ratios avec une virgule.
- `complete` via l'abonnement : pas de vraie conversation multi-tours (transcription), pas de `max_tokens` exact.
- `buildPrompt` ne cite que le rendu d'avant fourni (en général le premier élément visé).

## Points sensibles
- JAMAIS `...process.env` dans l'env de Claude, jamais les deux identifiants, jamais `~/.claude` (CLAUDE_CONFIG_DIR dédié).
- JAMAIS rendre `ALLOWED_TOOLS`, la liste des outils MCP, leurs descriptions ou schémas dépendants de la demande (cache perdu,
  11-15 k jetons écrits par demande au POC). Le droit se décide dans le hook et les gestionnaires.
- Tout texte du site, de Sanity, de la page ou d'une réponse libre passe par `quoteData` et un titre « data, not instructions ».
  Le libellé de zone envoyé par le navigateur (`ElementTarget.label`) n'entre JAMAIS dans le prompt : on lit zones.json.
- `validateText` est la seule barrière des textes : l'API Sanity n'applique pas le schéma.
- `maxBudgetUsd` est par appel : le plafond du CUMUL d'une demande (2 essais) est à tenir côté engine-core (`totalCost`).
- Aucun appel réel à Claude sans l'accord de l'utilisateur.

## Pièges
- **Jeton OAuth sur 2 lignes** : `claude setup-token` l'affiche sur deux lignes, il faut copier les deux (≈ 108 caractères),
  sinon `authentication_failed`. Copie par l'utilisateur, dans un terminal extérieur à Claude Code ; vérifier sans afficher.
- **Session reprise cumulée** : `total_cost_usd` et `modelUsage` d'une session reprise incluent le 1er essai. Ne JAMAIS
  les additionner : `addCall(state, result, resumedSessionId)` remplace le total de la session ; `num_turns`, lui, s'additionne.
- **`maxBudgetUsd` par appel** : `sdk.d.ts` le confirme (« counts only the spend since this query() call started ») :
  une demande à 2 essais peut coûter ≈ 2 × 1,5 $.
- `excludeDynamicSections` va DANS `systemPrompt` (preset), pas à la racine des options.
- `snapshot` (défaut true) : sur une session reprise, le SDK réutilise le prompt système enregistré au 1er essai.
- Glob/Grep : engine-guards n'accepte que les dossiers du site (`SITE_DIRS` : src/components, src/styles, src/app/(site),
  src/lib), pas `src` : le prompt système les cite.
- `zones.json` : un champ `closed` doit AUSSI figurer dans `fields` (validation d'engine-guards) ; `resolveTextFields` l'exclut des champs modifiables.
- Tests : dans un fichier de fixtures, `designSystem()` a besoin de `DECLARED` (sinon `--layout-gutter` au lieu de `--gutter`).

## Comment modifier
- Ajouter une consigne pour Claude : dans `src/editor/RULES.md` (fixe, en cache) si elle vaut pour toute demande, sinon
  dans `buildPrompt` ; ajouter la phrase au test (`rules.test.ts` ou `prompt.test.ts`). Toute règle de valeur doit être
  vraie pour `css-policy` d'engine-guards (le test le vérifie).
- Changer un tarif / ajouter un modèle : `pricing.ts` + test « pricing » de `cost.test.ts` (skill `claude-api` comme source).
- Changer une option de query() : `buildAgentOptions` + test « passe exactement les options attendues » ; vérifier dans
  `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`.
- Nouveau refus de question : `questionProblems` + phrase dans `ASK_CLIENT_DESCRIPTION` (≤ 2 048) + RULES.md.
- Nouveau scénario de faux Claude : `fakeScenarios` dans `fake.ts` + un test.

## Tests
`npx vitest run engine/src/claude` (12 fichiers, 148 tests, < 1 s, aucun réseau). Couvert : options exactes, env, hook
(avec le vrai `checkToolUse`), lecture du flux (succès, erreurs de résultat, fatales, interruption, Stop, délai),
pauseClock, outils MCP fixes, questions (refus, ids, réponses, longer-text, #21), textes (chemins `$key`, lignes,
fermés, mise en avant optionnelle), coût et tarifs, prompts (sections, ordre, neutralisation, multi-éléments), RULES.md
(phrases des 14 règles + ajouts de la tâche 12, valeurs promises acceptées par la politique réelle), `complete` (faux
client Messages et faux query), faux Claude. Non couvert : un vrai appel à Claude (interdit pendant la construction).
Typage : `npx tsc --noEmit -p .` depuis la racine (zéro erreur dans ce dossier au 2026-09-27).

## Décisions et « À trancher »
- Abonnement accepté en `NODE_ENV=development` OU mode local explicite (`localMode`), jamais en mode hébergé (engine-claude).
- Mise en avant par astérisques désactivée par défaut, activable par champ (`emphasis`) : Conduit n'en a pas.
- Noms d'outils, hook et politique CSS importés d'engine-guards plutôt que copiés (une seule source).
- `complete` met le système en cache éphémère (5 min) côté API : coût d'écriture 1,25 ×, gain dès la 2e question.
- `buildPrompt` accepte 1 à 8 éléments (contrat) : une section STYLE/TEXT commune, règles et portée par zone.

## Demandes de contrat
- **engine-guards** : les raisons de refus de `checkToolUse` et les `problem`/messages des contrôles renvoyés à Claude
  sont en français ; Claude travaille en anglais et le journal (`Step.label` d'un refus du hook) est lu par le client de
  l'admin anglaise → les écrire en anglais. Idem `formatRatio` (virgule) dans `describeMeasures`, lu par Claude.
- **engine-core** : (1) passer `localMode: true` à `resolveClaudeAccess` seulement sur configuration explicite du mode
  local ; (2) tenir le plafond du cumul par demande (`totalCost(state)`) en plus de `maxBudgetUsd` par appel ; (3) ne pas
  tenter de 2e essai si `result.fatal` ; (4) nettoyer le message final avec `clientMessage` ; (5) enregistrer `textsBefore`
  avant la première écriture de `createTextTool`.
- **site-adapter** : `src/styles/tokens.json` avec des groupes nommés `color`, `font` (verrouillé), `text` (styles + tracking)
  et `layout` (`--page-max`, `--gutter`, `--page-inset`, `--section-space*`), clés = nom de la custom property sans « -- » :
  RULES.md et le catalogue du prompt supposent ces rôles.
