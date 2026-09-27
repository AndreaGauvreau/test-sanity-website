# Pilotage de Claude (moteur IA) — LLM context

> Propriétaire : engine-claude · Figma : D1-D3, G2 (questions, journal, coût), G4 (Ask AI via `complete`) · Mis à jour : 2026-09-28 (tarifs dans les contrats, modèle/effort de l'admin)

## Utilité
Tout ce qui parle à Claude dans le moteur (`engine/`, processus Node séparé, jamais importé par Next) :
- lancer Claude Code (Agent SDK) sur UNE demande de l'éditeur IA, enfermé dans le clone de travail du site ;
- ses 3 outils MCP à définition fixe (`set_text`, `measure`, `ask_client`) et le hook PreToolUse ;
- les prompts en anglais (`systemAppend` + `src/editor/RULES.md`, `buildPrompt`, `buildRetryPrompt`) ;
- les questions au client 🟢⚪🔴 (validation, ids, réponses) ; la validation des textes Sanity (`validateText`) ;
- le métrage du coût (session reprise, appel interrompu, tarifs) ; l'accès (clé API / abonnement) ;
- le filtre UNIQUE des adresses web dans tout texte montré au client (`sanitizeClientText`, SEC-08) ;
- une passerelle sans outil pour Ask AI (`complete`) ; un faux Claude scriptable pour les tests des autres modules.

Il ne fait PAS : le cycle d'une demande (2 essais, contrôles, retour arrière, commit, file, statuts : engine-core),
l'écriture Sanity (injectée), les garde-fous CSS/TSX/rendu et la décision du hook (engine-guards), la route Ask AI (ask-ai).
Aucun rôle ni route : c'est une bibliothèque du moteur. Tout ce que lit le client (questions, options, messages, erreurs)
est en anglais ; commentaires et ce fichier en français.

## Fichiers
- `index.ts` — API publique (les autres modules n'importent que d'ici).
- `access.ts` — `resolveClaudeAccess` (variables d'environnement : clé API / jeton d'abonnement, mode local seulement),
  `ClaudeCredential` (dont la connexion Claude Code DE LA MACHINE, sans secret : `{ kind: 'subscription', secret: null,
  machineLogin }`), `credentialEnv` (variables de l'identifiant pour le sous-processus), `readAgentSettings` (EDITOR_*), `accessKind`.
  L'accès réellement utilisé (env + clé enregistrée depuis l'admin + abonnement de la machine) est résolu et RECHARGÉ À
  CHAUD par `engine/src/access` (engine-core, B5), qui s'appuie sur `resolveClaudeAccess` pour l'environnement.
- `agent.ts` — `createAgentRunner` (query() et lecture du flux), `buildAgentOptions`, `agentEnv`, `createKuartzServer`,
  `createAgentClock` (pauseClock), `fatalApiError`, `RESULT_ERRORS`, `describeTool`.
- `tools.ts` — outils MCP `kuartzTools` (définitions, schémas zod, descriptions en anglais, dont `ASK_CLIENT_DESCRIPTION`).
- `hook.ts` — `createGuardHook` (adaptateur SDK du `checkToolUse` d'engine-guards), `toolAccessFor`, `scopeOf`.
- `names.ts` — ré-exporte les noms d'outils d'engine-guards (une seule source) : `mcp__kuartz__*`, `ALLOWED_TOOLS`, `SITE_DIRS`.
- `prompt.ts` — `SYSTEM_SENTENCES`, `systemAppend`, `buildPrompt` (catalogue des tokens), `buildRetryPrompt`, `sharedDisplays`, `DATA`, `MEASURED_TEXTS`.
- `palette.ts` — `cssCustomValues` (custom properties d'une feuille ; `ds.cssValues` d'engine-guards donne la même chose),
  `resolveCssValue` (chaîne var() → valeur, AI-03).
- `sanitize.ts` — `sanitizeClientText`, `containsAddress`, `stripInvisible`, `LINK_REMOVED` (filtre des adresses, SEC-08).
- `questions.ts` — `questionProblems`, `effectProblem`, `prepareQuestions`, `parseAnswers`, `describeAnswers`, `createAskTool`…
- `text.ts` — `resolveTextFields`, `editableFields`, `validateText`, `createTextTool` (écriture injectée), `clientMessage`.
- `quote.ts` — `quoteData` (texte du site/Sanity cité comme donnée, guillemets “ ” « » " → ‹ ›, longueur bornée).
- `cost.ts` — `meterUsage`, `estimateCost`, `addCall` (banked/session), `toUsage`, `usageFromTokens` (format `Usage` du contrat).
- `pricing.ts` — RÉEXPORTE `PRICES_PER_MTOK` (table typée et gelée) et `priceOf` de `src/admin/core/contracts/pricing.ts`
  (source unique, partagée avec l'admin pour la carte AI settings de B5 ; déplacée le 2026-09-28).
- `complete.ts` — `complete` / `createComplete` (Ask AI), `completeOptions`, `transcriptPrompt`, `CompleteError`.
- `fake.ts` — `createFakeAgent`, `fakeScenarios` (faux Claude scriptable, même interface que `RunAgent`), `applyEdit`
  (l'outil Edit réel appliqué à un contenu).
- `fixtures.ts` — zones et tokens de TEST modelés sur Conduit (mêmes 6 groupes que le vrai tokens.json, valeurs en hex),
  `designSystem()` construit par engine-guards.
- `*.test.ts` — tests (voir Tests). `rules.test.ts` et un cas de `prompt.test.ts` lisent le VRAI design system du dépôt
  (`loadDesignSystem(repo)` : src/styles/tokens.json, tokens.css, src/editor/zones.json, src/editor/RULES.md).
- `../../../src/editor/RULES.md` — règles données à Claude, en anglais (propriété d'engine-claude dans un dossier du site).

## Contrats
- Entrées : `core/contracts/engine.ts` (`EditRequest`, `ElementTarget`, `Question`, `QuestionOption`, `Answer`,
  `Usage`, `ClaudeAccess`, `StepKind`), `core/contracts/zones.ts` (`ZoneDef`, `SanityTextBinding`, `ZonesFile`) ;
  engine-guards : `DesignSystem` (`loadDesignSystem`, dont `rules` = RULES.md et `cssValues` = custom properties de
  tokens.css), `checkToolUse`, `repoPath`, `SITE_DIRS`,
  noms d'outils, `css-policy` (`EXTERNAL_RESOURCE`, `NEGATIVE_OR_CALC`, `isExemptable`, `unmeasurableColor`,
  `normalizeValue`, `MAX_VALUE_LENGTH`, `tokenVarName`), `describeMeasures`/`ZoneMeasure`, `contrastRatio`/`colorTone`, `PageText`.
- Sorties (signatures principales) :
  - `resolveClaudeAccess(env: { ANTHROPIC_API_KEY?, CLAUDE_CODE_OAUTH_TOKEN?, ENGINE_MODE? }, { localMode? }) → { ok: true, access: ClaudeCredential, warning? } | { ok: false, error }`
  - `readAgentSettings(env: SettingsEnv, { configDir }) → AgentSettings` (lève si `configDir` n'est pas absolu)
  - `createAgentRunner(settings, { query? }) → RunAgent` ; `RunAgent = (run: AgentRun) => Promise<AgentResult>`
    - `AgentRun = { prompt, cwd (absolu), toolAccess: {files, textTool, lint?}, textTool?, measureTool?, askTool?, systemAppend, access, resume?, signal, onEvent(AgentEvent), allowedDomains? }`
    - `AgentResult = { ok, message, sessionId, costUsd, tokens, turns, apiTurns, costKind: 'session'|'call', error, fatal? }`
    - `AgentEvent = { kind: StepKind, label, detail? }` (engine-core horodate → `Step`)
  - `systemAppend(ds) → string` (lève sans RULES.md) ; `buildPrompt(ds: PromptDesignSystem, request: PromptRequest, texts?: PromptTexts | null, context?: { before?, pages?, pageTexts? }) → string` ; `buildRetryPrompt(problems: string[]) → string`
    - `PromptDesignSystem = Pick<DesignSystem, 'tokens'|'zones'|'breakpoints'|'policy'|'rules'> & Partial<Pick<DesignSystem, 'cssValues'>>`
      (engine-core passe le `ds` de `loadDesignSystem` tel quel : ses `cssValues` résolvent les couleurs)
  - `cssCustomValues(css: string) → Map<'--nom', valeur>` ; `resolveCssValue(value, values?) → string | null`
  - `sanitizeClientText(text: string, allowedDomains: readonly string[]) → string` ; `containsAddress(text, allowedDomains) → boolean` ; `stripInvisible(text)` ; `LINK_REMOVED = '[link removed]'`
  - `toolAccessFor(zones, { scope, targets }, textFieldCount) → ToolAccess`
  - `resolveTextFields(binding, { doc?, key? }, { emphasis? }) → { ok, target: { fields: TextField[], closed: string[] } } | { ok: false, error }` ; `editableFields(target, scope)` ; `createTextTool({ target, fields, scope, before, write, onEvent? }) → { onSet, proposed, written }`
  - `createAskTool({ waitForAnswers(asked) → Promise<ResolvedAnswer[]>, onEvent?, policy?, now?, allowedDomains? }) → AskTool` ; `questionProblems(drafts, policy?, allowedDomains?) → string | null` ; `prepareQuestions(drafts, now?, batchId?, allowedDomains?) → { id, askedAt, questions: Question[] }` ; `parseAnswers(asked, body) → { ok, answers: Answer[], resolved } | { ok: false, error }` ; `describeAnswers(resolved) → string` ; `hardcodedOf`, `acceptsLongerText`
  - `clientMessage(text, allowedDomains = []) → string` ; `describeTool(cwd, name, input, allowedDomains = []) → AgentEvent | null`
  - `addCall(state, call: AgentResult, resumed: string | null) → CostState` ; `toUsage(state, { model, access, durationMs }) → Usage` ; `totalCost(state)`
  - `complete({ model, system, messages, maxTokens, signal? }, { access, configDir, anthropic?, query?, base?, now? }) → Promise<{ text, usage: Usage, stopReason }>` (lève `CompleteError { fatal }`)
  - `createFakeAgent(script: FakeCall[] | (run, i) => FakeCall) → RunAgent & { runs, results, toolErrors }` ; `fakeScenarios.*`
    - étape `{ kind: 'edit', file, find?, replace?, replaceAll?, content? }` ; `applyEdit(current: string | null, oldString,
      newString, replaceAll = false) → { content } | { error }`
- Dépend de : `@anthropic-ai/claude-agent-sdk` 0.3.283, `@anthropic-ai/sdk` 0.128, zod 4, engine-guards, contrats.
- Utilisé par : engine-core (job, serveur), engine-publish (journal `aiUsage` via `Usage`), ask-ai (`complete`, `sanitizeClientText`).

## Comportement
### Options exactes de query() (`buildAgentOptions`, vérifiées dans `sdk.d.ts` 0.3.283, figées par test)
| Option | Valeur | Pourquoi |
|---|---|---|
| `cwd` | clone de travail (branche draft), absolu | Claude ne voit que le site ; chemin vide/relatif refusé (piège 5 du POC) |
| `model` / `effort` | ceux de la DEMANDE : choisis dans l'admin (B5 · AI settings, `engine/src/access/ai-settings.ts`), sinon `EDITOR_MODEL` (claude-opus-5-5) / `EDITOR_EFFORT` (medium) | main.ts construit les réglages de chaque appel avec le modèle et l'effort lus au départ de la demande (`jobs/run.ts`) ; Opus 5.5 : medium est aussi son défaut |
| `maxTurns` / `maxBudgetUsd` | 24 / 1.5 | plafonds PAR APPEL de query() (voir Pièges) |
| `tools` | `['Read','Edit','Glob','Grep']` | ni Bash, ni Write, ni Web |
| `allowedTools` | les 4 + `mcp__kuartz__set_text`, `…__measure`, `…__ask_client`, FIXE et gelé | cache ; le droit se décide à l'appel (hook) |
| `permissionMode` | `'dontAsk'` | tout outil non pré-approuvé est refusé, jamais de question |
| `settingSources` / `strictMcpConfig` | `[]` / `true` | ni CLAUDE.md, ni réglages, plugins ou MCP de la machine |
| `mcpServers` | `{ kuartz: createSdkMcpServer({ name: 'kuartz', tools, alwaysLoad: true, timeout }) }` | `alwaysLoad` : jamais différé derrière ToolSearch (préfixe stable) |
| `systemPrompt` | `{ type: 'preset', preset: 'claude_code', append: systemAppend(ds), excludeDynamicSections: true }` | sort cwd/état git du système (cache entre demandes) |
| `hooks` | `{ PreToolUse: [{ hooks: [guard] }] }` sans matcher | TOUS les outils passent par `checkToolUse` |
| `abortController`, `resume` | Stop/délai ; id de session au 2e essai | une session = une demande |
| `env` | `PATH`, `HOME`, UN identifiant (`credentialEnv`), `CLAUDE_CONFIG_DIR` dédié, `CLAUDE_AGENT_SDK_CLIENT_APP=kuartz-ai-editor/0.1`, `MCP_TOOL_TIMEOUT` (question + 60 s) | jamais `...process.env` |
`disallowedTools`, `canUseTool`, `plugins` : non utilisés (le test vérifie la liste exacte des clés).

### Flux et erreurs
- `system/api_retry` : erreur fatale (`authentication_failed`, `billing_error`, `model_not_found`, `account_on_hold`,
  `oauth_org_not_allowed`, `verification_required`, `invalid_request`, `cloud_credential_error`, `rate_limit` avec
  l'abonnement seulement) → arrêt immédiat, `fatal: true` (engine-core ne tente pas de 2e essai) ; sinon étape `warn`.
- `assistant` : jetons relevés par `message.id` (dédoublonnés, dernier relevé) ; dernier texte = message au client
  (nettoyer avec `clientMessage`) ; les textes précédents → étape `info` FILTRÉE (`sanitizeClientText`, `run.allowedDomains`) ;
  chaque `tool_use` → étape (`describeTool`, anglais, arguments filtrés ; un id de champ `<doc>:<chemin>` sans espace
  reste tel quel). measure/ask sont journalisés par engine-core.
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
- dans AUCUN texte lu par le client (question, sujet, libellé, description) : une ressource externe ou une adresse web
  hors de `allowedDomains` — URL, `//`, `www.`, domaine NU (`conduit-billing.help/login`), e-mail, IPv4, IDN et punycode
  compris (`containsAddress`, SEC-08) ; mineur #21 du POC corrigé : la question et son sujet sont contrôlés aussi ;
  « the image(s) » n'est pas une ressource. `prepareQuestions` repasse en plus chaque texte par `sanitizeClientText`.

### Adresses dans les textes montrés au client (`sanitize.ts`, SEC-08)
Un seul filtre, `sanitizeClientText(text, allowedDomains)`, pour les questions et options (refus + nettoyage), le message
final (`clientMessage`), le journal (`info`, `describeTool`) et Ask AI (ask-ai l'importe). Chaque adresse devient
`[link removed]` ; la ponctuation finale reste au texte. Retirés : URL à schéma quelconque (`https`, `hxxps`…), `//…` et
`//` seul, `javascript:`/`data:`/`vbscript:`/`file:`/`blob:` (toujours), e-mails (`mailto:` compris), IPv4, domaines nus
(labels Unicode, TLD de 2 lettres ou plus en tout alphabet ou `xn--`, séparateurs `。．｡`, `[.]`, `(.)`, `{.}`), après
retrait des caractères de format invisibles (le ZWJ d'un emoji composé reste). Gardés : les hôtes de la liste blanche et
leurs sous-domaines, comparés en punycode (`domainToASCII`) ; les « domaines » dont le TLD est une extension de fichier
technique (`Next.js`, `Hero.module.css`) ; les nombres (`4.79:1`, `1.5rem`), abréviations d'une lettre (`e.g.`, `U.S.`).
Liste vide (défaut partout) = aucune adresse gardée.

### Textes Sanity (`text.ts`)
Champs = chemins de `zones.json` (`$key` remplacé par la `_key` de data-edit-doc/data-edit-key, id publié du document
sur data-edit-doc), id donné à Claude `<document>:<chemin>`. `validateText` : champ connu, pas un champ `closed`, non vide,
pas de `<`/`>` ni de caractère invisible, longueur VISIBLE ≤ max, lignes ≤ `lines` (retours gardés seulement là),
astérisques refusés sauf champ à mise en avant (option `emphasis`, DÉSACTIVÉE par défaut : Conduit met en avant par un
champ séparé, ex. `getStarted.titleMuted`). `createTextTool` écrit AUSSITÔT par la fonction injectée (engine-core), sans
réécrire une valeur identique ; une exception d'écriture devient une erreur renvoyée à Claude.

### Connexion de la machine (« Use my Claude subscription », B5, moteur local seulement)
Vérifié dans le binaire Claude Code 2.1.283 de l'Agent SDK 0.3.283 : les identifiants de `/login` sont dans le trousseau
macOS (service « Claude Code-credentials », compte `$USER`, lus par `security find-generic-password -w`) ou dans
`~/.claude/.credentials.json` (Linux). Dès que CLAUDE_CONFIG_DIR est posé, le service prend un suffixe
`-<sha256(dossier)[0..8]>` : notre CLAUDE_CONFIG_DIR dédié ferait donc chercher un AUTRE élément. La variable
CLAUDE_SECURESTORAGE_CONFIG_DIR (même vide) décide seule de ce suffixe et du dossier du fichier : `credentialEnv` d'une
connexion de machine donne `{ USER, CLAUDE_SECURESTORAGE_CONFIG_DIR: '' }` (emplacement par défaut, celui de `claude`
dans un terminal) et AUCUN secret ; CLAUDE_CONFIG_DIR reste dédié (réglages, sessions, CLAUDE.md, MCP : jamais ceux de
~/.claude). Isolation inchangée : `settingSources: []`, `strictMcpConfig`, outils filtrés, hook, env minimal. Claude Code
peut rafraîchir le jeton et le réécrire dans le trousseau (comme tout `claude` de la machine). Présence de la connexion :
`claude auth status --json` du même binaire avec le même env (`engine/src/access/machine.ts`), jamais le secret.

### Accès (`resolveClaudeAccess`)
`ANTHROPIC_API_KEY` d'abord (seule voie pour des clients). `CLAUDE_CODE_OAUTH_TOKEN` (abonnement) SEULEMENT si
`{ localMode: true }` (engine-core : `config.mode === 'local' && config.explicitLocal`, c.-à-d. ENGINE_MODE=local écrit)
ET `env.ENGINE_MODE` absent ou « local » : un ENGINE_MODE=hosted l'emporte même sur un drapeau posé par erreur.
NODE_ENV n'est JAMAIS lu (AI-02 : hérité du shell ou d'`engine/.env.local`, il acceptait l'abonnement en hébergé). Un `sk-ant-oat…`
dans `ANTHROPIC_API_KEY` est refusé. Les blancs d'un jeton sont retirés (copie sur 2 lignes) ; un jeton court
(< 100 caractères) donne un `warning`. Aucun message ne contient le secret.

### Coût
`Usage.inputTokens` = non cachés + lus + écrits en cache. `costKind: 'estimated'` dès qu'un appel est interrompu. Avec
l'abonnement, le coût est calculé (SDK) mais non facturé : `access: 'subscription'`. Tarifs (skill `claude-api`, 2026-09-27) :
Opus 5.5 4/20 $, Fable 5.1 10/50 $, Sonnet 5 2/10 $, Haiku 4.5 1/5 $ par million (revérifiés le 2026-09-28) ; cache : lecture 0,1 ×, écriture 5 min 1,25 ×.

### Catalogue des tokens du prompt (`buildPrompt`) et RULES.md
Le catalogue suit l'ordre de tokens.json : couleurs (rôles), styles de texte avec leur tracking (paire `font` +
`letter-spacing`), espacement (`var(--space-8)` … `var(--space-64)`), mise en page (verrouillé : seuls ses tokens utiles au
CSS, avec leur usage) ; polices et points de rupture (verrouillés) n'y figurent pas (les points de rupture sont dans la
section STYLE). Couleurs : sur Conduit ce sont des rôles en var() de palette (`var(--color-neutral-900)`) ; avec
`ds.cssValues`, `resolveCssValue` suit la chaîne jusqu'à la valeur, et le catalogue donne « label, #hex, light|dark,
N:1 on Surface » (le fond : « page background »). `ds.cssValues` est rempli par `loadDesignSystem` d'engine-guards
(FOLLOWUPS #37) : le `ds` passé tel quel par engine-core suffit. Sans `cssValues` ou vide (design system construit à la
main, pas de tokens.css), variable inconnue, boucle > 8 niveaux : le libellé seul, jamais le nom de palette (RULES.md
l'interdit). `src/editor/RULES.md` décrit le VRAI design system : couleurs de
rôle, 3 polices, échelle d'espacement 8-64 px (padding, margin, gap, outline-offset), tokens de mise en page (padding et
margin ; `--page-max` pour max-width), pas de token d'arrondi, d'ombre ni de graisse, points de rupture 50.625 / 64 / 80 /
90 rem (groupe `breakpoint`, écrits en valeur car une media query ne lit pas var()), aucun soulèvement au survol.

### Ask AI (`complete`)
Clé API → API Messages, système marqué `cache_control` éphémère, coût calculé aux tarifs. Avec le système actuel
d'Ask AI (≈ 800 jetons) et Haiku 4.5 (minimum de cache 4 096 jetons), la marque est SANS EFFET : rien n'est écrit ni lu
en cache (aucun surcoût non plus). Elle ne servirait qu'avec un système plus long ou un autre modèle. Abonnement → query() sans aucun
outil (`tools: []`, `allowedTools: []`, hook qui refuse tout, `mcpServers: {}`, `settingSources: []`, `maxTurns: 1`,
`persistSession: false`, prompt personnalisé, `CLAUDE_CODE_MAX_OUTPUT_TOKENS`), historique en transcription.

## Forces
- Options, env et outils figés par des tests option par option ; aucun appel réel (query et client injectables).
- Une seule source pour les noms d'outils, le hook et la politique CSS (engine-guards) : pas de divergence possible.
- RULES.md testé contre le prompt système ET contre la politique CSS réelle, sur les fixtures ET sur le VRAI design system
  du dépôt (AI-01) : valeurs promises acceptées, rôles non vides cités, rôles vides exactement ceux que RULES.md dit
  absents, points de rupture identiques au groupe `breakpoint`, chaque réglage de zones.json permis par la ligne de
  RULES.md de sa propriété. Un token ajouté à Conduit (arrondi, ombre…) fait échouer le test tant que RULES.md ne suit pas.
- Un seul filtre d'adresses pour tout texte montré au client (SEC-08), linéaire (testé sur entrées hostiles de 40 k).
- Coût : la reprise de session n'est jamais comptée deux fois (test avec le faux Claude qui cumule comme le SDK).
- Faux Claude fidèle à l'outil Edit (entrée du hook, remplacement, erreurs) : la pré-validation d'engine-guards s'applique
  en test et avec `ENGINE_FAKE_CLAUDE` (testé sur un dépôt git jetable avec le vrai Hero.module.css et `lintContextFor`).

## Faiblesses et limites connues
- Le 2e essai (session reprise) et le gain de cache (`excludeDynamicSections`, outils fixes) n'ont JAMAIS tourné avec le
  vrai Claude (ni au POC, ni ici) : seuls les tests avec un faux Claude les couvrent. À mesurer au premier passage réel
  (`cacheWriteTokens` de deux demandes séparées par un commit).
- `maxTurns` borne le nombre d'allers-retours, pas la longueur d'une réponse.
- La description d'`ask_client` doit rester ≤ 2 048 caractères (plafond Claude Code), testé.
- Couleurs du catalogue : ton et ratio seulement si `ds.cssValues` résout la chaîne var() (tokens.css présent et lisible) ;
  sinon le libellé seul.
- Faux Claude : un `find` qui apparaît plusieurs fois est refusé (hook avec `lint`, sinon l'outil), comme pour le vrai
  Claude. Piège : `color: var(--color-text-muted);` apparaît 2 fois dans Hero.module.css (`.lede` et `.rating`).
- Filtre d'adresses heuristique, sans liste de TLD : un identifiant pointé dans un texte au client (`hero.title`,
  `St.Louis`, `done.Now` sans espace) est pris pour un domaine et retiré (faux positif accepté : jargon de toute façon) ;
  une adresse écrite avec des espaces ou en toutes lettres (`evil . help`, `evil dot help`) passe. Texte brut, jamais un lien.
- `complete` via l'abonnement : pas de vraie conversation multi-tours (transcription), pas de `max_tokens` exact.
- `buildPrompt` ne cite que le rendu d'avant fourni (en général le premier élément visé).

## Points sensibles
- JAMAIS `...process.env` dans l'env de Claude, jamais les deux identifiants, jamais `~/.claude` (CLAUDE_CONFIG_DIR dédié ;
  seule exception : le magasin d'identifiants de la machine via CLAUDE_SECURESTORAGE_CONFIG_DIR, abonnement local choisi dans B5).
- JAMAIS rendre `ALLOWED_TOOLS`, la liste des outils MCP, leurs descriptions ou schémas dépendants de la demande (cache perdu,
  11-15 k jetons écrits par demande au POC). Le droit se décide dans le hook et les gestionnaires.
- Tout texte du site, de Sanity, de la page ou d'une réponse libre passe par `quoteData` et un titre « data, not instructions ».
  Le libellé de zone envoyé par le navigateur (`ElementTarget.label`) n'entre JAMAIS dans le prompt : on lit zones.json.
- `validateText` est la seule barrière des textes : l'API Sanity n'applique pas le schéma.
- `maxBudgetUsd` est par appel : le plafond du CUMUL d'une demande (2 essais) est à tenir côté engine-core (`totalCost`).
- Aucun appel réel à Claude sans l'accord de l'utilisateur.

## Pièges
- **Connexion de la machine ≠ élément du trousseau présent** : l'élément « Claude Code-credentials » peut exister sans
  connexion utilisable (jetons MCP seuls, connexion périmée). Constat du 2026-09-27 : trousseau présent, mais
  `claude auth status` → `loggedIn: false` (l'utilisatrice se sert de Claude Desktop, pas de `claude` en terminal).
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
- **Fixtures ≠ Conduit** (piège 16 du POC revenu, AI-01/AI-03) : une fixture en hex et sans groupe `space` faisait passer des
  tests faux (RULES.md niait les tokens d'espacement ; couleurs sans ton sur le vrai site). Toute règle ou tout catalogue
  se teste AUSSI sur `loadDesignSystem(repo)`.
- Le groupe `text` de tokens.json contient les styles ET leurs trackings : `byGroup.text` mélange les deux (les trackings
  vont dans `letter-spacing`, jamais dans `font`).
- `clientMessage` et `describeTool` ont un 2e argument (liste blanche) : ne JAMAIS les passer en rappel
  (`.map(clientMessage)` donnerait l'index comme liste blanche).
- `tldts` est présent dans node_modules mais seulement en dépendance transitive (jsdom → tough-cookie) : ne pas l'importer.

## Comment modifier
- Ajouter une consigne pour Claude : dans `src/editor/RULES.md` (fixe, en cache) si elle vaut pour toute demande, sinon
  dans `buildPrompt` ; ajouter la phrase au test (`rules.test.ts` ou `prompt.test.ts`). Toute règle de valeur doit être
  vraie pour `css-policy` d'engine-guards (le test le vérifie).
- Changer un tarif / ajouter un modèle : `src/admin/core/contracts/pricing.ts` (source unique) + test « pricing » de
  `cost.test.ts` (skill `claude-api` comme source) ; modèle proposé dans B5 : aussi `AI_MODELS` (contrat) et `modelLabel`.
- Changer une option de query() : `buildAgentOptions` + test « passe exactement les options attendues » ; vérifier dans
  `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`.
- Nouveau refus de question : `questionProblems` + phrase dans `ASK_CLIENT_DESCRIPTION` (≤ 2 048) + RULES.md.
- Le design system de Conduit change (tokens.json, zones.json) : relancer `rules.test.ts` ; il dit quelle phrase de
  RULES.md ne correspond plus (rôle absent, rôle vide annoncé, réglage non permis, point de rupture).
- Élargir ou resserrer le filtre d'adresses : `sanitize.ts` seulement (un seul filtre pour tous les textes) + cas dans
  `sanitize.test.ts` (dont le test de linéarité). Les domaines permis viennent des appelants (`allowedDomains`).
- Nouveau scénario de faux Claude : `fakeScenarios` dans `fake.ts` + un test.

### Faux Claude et outil Edit (FOLLOWUPS #37)
Chaque étape `edit` passe au hook l'entrée de l'outil Edit réel : `{ file_path, old_string: find, new_string: replace,
replace_all? }` ; avec `content`, `old_string` = contenu actuel du fichier ('' s'il est absent ou vide) et `new_string` =
`content`. Avec `toolAccess.lint` (engine-core, SEC-07), engine-guards juge donc le fichier FUTUR avant l'écriture, en
test comme avec `ENGINE_FAKE_CLAUDE`. Puis `applyEdit` fait ce que fait l'outil : remplacement LITTÉRAL de l'occurrence
unique (toutes avec `replaceAll`), suppression qui emporte le saut de ligne suivant, old_string vide = création d'un
fichier absent ou vide ; erreurs de l'outil (« String to replace not found in file. », « Found N matches … replace_all is
false … », « File does not exist. », « Cannot create new file - file already exists. », « No changes to make … ») :
rien n'est écrit, rien au journal (le vrai runner ne journalise pas les résultats d'outil), l'erreur va dans
`agent.toolErrors` (« Edit (<fichier>): <raison> »). new_string est écrit tel quel (engine-guards juge aussi la variante
sans blancs de fin).

## Tests
`npx vitest run engine/src/claude` (13 fichiers, 184 tests, ≈ 2 s, aucun réseau). Couvert : options exactes, env, hook
(avec le vrai `checkToolUse`), lecture du flux (succès, erreurs de résultat, fatales, interruption, Stop, délai),
pauseClock, outils MCP fixes, questions (refus, ids, réponses, longer-text, #21), textes (chemins `$key`, lignes,
fermés, mise en avant optionnelle), coût et tarifs, prompts (sections, ordre, neutralisation, multi-éléments, catalogue
des couleurs résolu sur le vrai design system passé tel quel, `ds.cssValues` compris), RULES.md (phrases des 14 règles + ajouts de la tâche 12, valeurs
promises acceptées par la politique réelle, fidélité au vrai design system), accès (abonnement refusé hors mode local,
quel que soit NODE_ENV), filtre d'adresses (domaines nus, IDN, punycode, liste blanche, linéarité) dans questions, message
final et journal, `complete` (faux client Messages et faux query), faux Claude (dont `applyEdit` et l'Edit jugé par le
hook avec `lint` : valeur en dur refusée avant l'écriture, token permis écrit, old_string ambigu, `replaceAll`, `content`). Non couvert : un vrai appel à Claude (interdit pendant la construction).
Typage : `npx tsc --noEmit -p .` depuis la racine (zéro erreur dans ce dossier au 2026-09-27).

## Décisions et « À trancher »
- Abonnement accepté SEULEMENT en mode local explicite (`localMode` ET ENGINE_MODE absent ou « local ») ; NODE_ENV
  ignoré (AI-02, 2026-09-27). Vaut aussi pour la connexion de la machine (`engine/src/access`).
- Messages d'accès refusé : ils ne renvoient plus à `engine/.env.local` pour une clé API (elle peut venir de B5) :
  « check the API key (Settings › Usage › Claude connection) » ; connexion de la machine : « run claude in a terminal, then /login ».
- Mise en avant par astérisques désactivée par défaut, activable par champ (`emphasis`) : Conduit n'en a pas.
- Noms d'outils, hook et politique CSS importés d'engine-guards plutôt que copiés (une seule source).
- `complete` marque le système `cache_control` éphémère : sans effet aujourd'hui (système d'Ask ≈ 800 jetons, sous le
  minimum de 4 096 de Haiku 4.5), gardé pour un système plus long.
- Adresses : remplacées par `[link removed]` (plutôt que supprimées sans trace) ; questions contenant une adresse
  REFUSÉES et renvoyées à Claude (le client ne voit rien) ; liste blanche vide par défaut ; pas de dépendance à une liste
  de TLD (heuristique + extensions de fichiers exclues).
- `buildPrompt` accepte 1 à 8 éléments (contrat) : une section STYLE/TEXT commune, règles et portée par zone.

## Demandes de contrat
- ~~**engine-guards** (AI-03) : `DesignSystem.cssValues`~~ — **fait** (FOLLOWUPS #37) : rempli par `loadDesignSystem`,
  lu tel quel par `buildPrompt` (test sur le vrai design system sans rien ajouter).
- ~~engine-core / engine-publish (FOLLOWUPS #37, conséquence)~~ — **fait** (vérifié le 2026-09-27) : leurs scripts de faux Claude éditent
  `color: var(--color-text-muted);`, présent 2 fois dans Hero.module.css : avec `toolAccess.lint` le hook refuse l'Edit
  (« old_string appears 2 times »), comme il le ferait au vrai Claude. `find` unique partout (`LEDE_MUTED` / `ledeColor`
  de `jobs/testing.ts`) : jobs/, main.test.ts, server/http.test.ts, publish/module.test.ts, publish/service.test.ts.
- ~~engine-core (SEC-08) : domaines du site en liste blanche~~ — **fait** (vérifié le 2026-09-27) : `jobs/run.ts` passe
  `allowedDomains` (domaines du site, `deps.siteDomains`) à `createAskTool`, `clientMessage` et `AgentRun.allowedDomains` ;
  testé par `jobs/wiring.test.ts`. (AI-02) Le commentaire d'`engine/src/config.ts` est à jour : l'abonnement n'est
  accepté qu'en mode local explicite, NODE_ENV n'y joue aucun rôle.
- ~~ask-ai (SEC-08)~~ — **fait** : `cleanAnswer` (`engine/src/ask/answer.ts`) importe `sanitizeClientText` depuis `../claude`.
