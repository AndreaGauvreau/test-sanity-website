# Garde-fous du moteur IA (`engine/src/guards`) — LLM context

> Propriétaire : engine-guards · Figma : aucun écran (moteur) ; les contrôles s'affichent en D2/D3/G2 (« Checks: contrast ✓ ») · Mis à jour : 2026-09-27

## Utilité

Les garde-fous **déterministes** de l'éditeur IA : ce que Claude a le droit de lire et de modifier (hook), le jugement de
ce qu'il a modifié (CSS et TSX entiers, en liste blanche), et les contrôles du rendu dans un vrai Chrome (cadre, lignes,
contraste au repos et dans les états forcés, effet des règles, isolation). Portés **avec leurs tests** du POC
(`payload-ai-editor-test`, branche `batterie-tests@59348e7`, `cms/src/editor/`), fruit de 26 corrections relues de manière
adverse, puis adaptés à Sanity et au site Conduit sans affaiblir une règle.

Ne fait pas : piloter Claude (engine-claude), le cycle d'une demande, git, l'aperçu 4042, Sanity (engine-core), les
questions au client (engine-claude, qui reçoit `HARDCODED_POLICY` d'ici). Aucune I/O sauf `loadDesignSystem` (lecture du
clone), l'aperçu (Chrome) et, dans le hook, trois lectures injectables (`GuardIO`) : le fichier visé par un Edit, sa
version du dernier commit (`git cat-file`), la liste d'un dossier fouillé par Grep.

## Fichiers

- `index.ts` — API publique (tout ce qu'importent engine-core et engine-claude), `HARDCODED_POLICY`.
- `types.ts` — types communs (re-export de `core/contracts/zones.ts`), `ScopeFlags`/`scopeFlags`, `Hardcoded`, `ChangedFile`, `Violation`, `ToolAccess`, `frozenSet`.
- `design-system.ts` — chargement (`loadDesignSystem`) et validation (`validateDesignSystem`, `buildDesignSystem`) de tokens.json + zones.json (+ tokens.css, RULES.md) ; points de rupture ; construit la politique (`ds.policy`) ; valeurs des custom properties de tokens.css (`customPropertyValues` → `ds.cssValues`).
- `css-policy.ts` — valeurs CSS permises propriété par propriété (`checkValue`, `RULES`), rôles de tokens (`tokenSets`), valeurs en dur accordables (`isExemptable`, `isGrantableValue`, `NOT_EXEMPTABLE`).
- `css-lint.ts` — CSS entier avant/après par postcss : @-règles, sélecteurs, appartenance à la zone, états, masquage, paire font/letter-spacing.
- `tsx-lint.ts` — arbre TypeScript entier avant/après : risques, squelette figé, className figée, zones marquées
  (`data-edit="…"` ou `editAttrs('…')`) intactes, texte seulement dans la zone.
- `guards.ts` — `checkToolUse` (hook PreToolUse : lecture, recherche, Edit jugé sur le fichier FUTUR), `isReadable`,
  `GuardIO`/`DISK_IO`, `editedContents` (fichier après un Edit, comme l'outil de Claude Code), noms des outils
  `mcp__kuartz__*`, `lintChanges` (CSS + TSX + type de fichier), `lintContextFor` (contexte commun hook / après l'essai),
  `outOfScope`.
- `run.ts` — `runStaticChecks` et `runRenderChecks` : les deux temps de `job.ts > runChecks` du POC, même ordre, mêmes textes
  (traduits en anglais).
- `report.ts` — contrôles montrés au client (contrat `CheckResult`, libellés anglais) : `publicChecks`, `retryProblems`, `CHECK_LABELS`.
- `preview.ts` — interface injectable `Preview`, `chromePreview(settings)`, `PREVIEW_VIEWPORTS` (375, 768, 1280).
- `visual.ts` — captures Playwright, `READ_ZONE` (relevé dans la page), états forcés (CDP `CSS.forcePseudoState`), valeurs témoins, `compareZones`, `startVisualSession`, `previewUrl`, `MODULE_HASH`.
- `measure.ts` — relevé brut → mesures (`toZoneMeasure`), plafonds (`MAX_*`), `describeMeasures` (sortie de l'outil measure, en anglais), `lineSummary` (journal, en anglais).
- `checks.ts` — `frameCheck`, `coverWarning`, `linesCheck`, `contrastCheck`, `unverifiableCheck`, `reachCheck` (type `RawCheck`).
- `contrast.ts` — couleurs, luminance, ratio WCAG, seuil (4,5 / 3 grand texte), fond réel avec dégradés ; `formatRatio`
  (point décimal : « 3.07 », pour les textes anglais) ; `colorTone` (« clair » / « sombre », API interne traduite par
  le prompt d'engine-claude).
- `measure-fixtures.ts` — fabriques de relevés pour les tests (pas un test).
- Tests : `css-policy`, `css-lint`, `tsx-lint`, `guards`, `contrast`, `measure`, `checks`, `visual`, `visual-page` (portés), `conduit`, `run`, `index`, `edit-guard` (nouveaux).
- `fixtures/lyondrive/` — le site du POC (CSS, composants en `.tsx.txt`, zones.json converti au contrat, tokens.json, RULES.md) ; `fixtures/lyondrive-options.ts` (points de rupture 48/64rem, nommage `group-key`) ; `fixtures/reference-1.json` (31 fichiers du passage de référence).
- `fixtures/conduit/` — copie ANCIENNE de Conduit (tokens.json sans `space` ni `breakpoint`, zones.json de test, trois
  CSS Modules) : ne sert plus qu'au banc d'engine-core (`engine/src/jobs/testing.ts`). Les tests d'ici (`conduit`, `run`,
  `edit-guard`) lisent le VRAI site à la racine du dépôt (AI-09). Ne pas s'y fier pour la politique de Conduit.

## Contrats

- Entrées : `ZoneDef`, `ZonesFile`, `TokensFile`, `ControlDef` (`src/admin/core/contracts/zones.ts`) ; `Scope`, `CheckId`,
  `CheckResult` (`contracts/engine.ts`). `ToolAccess` (types.ts, interne au moteur) porte le contexte du lint (`lint`). Fichiers du site lus dans le clone : `src/styles/tokens.json`,
  `src/editor/zones.json`, `src/styles/tokens.css` (facultatif), `src/editor/RULES.md` (facultatif), CSS de
  `src/components` et `src/app/(site)` (points de rupture en repli).
- Dépend de : `../claude/quote` (`quoteData`, une seule neutralisation des textes cités pour tout le moteur). Les tests
  lisent aussi `../claude/names`, `../claude/questions`, `../claude/palette` et `../claude/hook` (cohérence des noms d’outils, de `HARDCODED_POLICY`, de `cssValues` et de la chaîne du hook).
- Utilisé par : engine-core (cycle d'une demande), engine-claude (hook PreToolUse = `checkToolUse` d'ici, via
  `createGuardHook` ; faux Claude idem ; `questionProblems` juge les options 🔴 avec les fonctions de `css-policy.ts`,
  les mêmes que `HARDCODED_POLICY` ; `colorTone`, `contrastRatio` pour le prompt ; `ds.cssValues` lu tel quel par
  `buildPrompt` pour résoudre les couleurs du catalogue, AI-03).

### API (signatures)

```ts
loadDesignSystem(siteDir: string, options?: DesignSystemOptions): Promise<DesignSystem>   // lève DesignSystemError
buildDesignSystem(input: { tokens; zones; rules?; declared?; cssValues?; cssBreakpoints? }, options?): DesignSystem   // pur
customPropertyValues(css: string): Map<string, string>   // '--x' → valeur brute (trim, sans !important), dernière déclaration
declaredProperties(css: string): Set<string>             // = clés de customPropertyValues
validateDesignSystem(tokens: unknown, zones: unknown, policy?): { problems: string[]; warnings: string[] }
type DesignSystemOptions = { breakpoints?: readonly string[]; naming?: 'key' | 'group-key'; roles?; lift? }
type DesignSystem = { tokens; controls; zones; breakpoints: string[]; breakpointSource: 'option'|'tokens'|'css'|'none';
                      policy: TokenSets; rules: string | null; warnings: string[];
                      cssValues: ReadonlyMap<string, string> }   // tokens.css, var() non résolus ; vide sans la feuille

checkToolUse(root: string, access: ToolAccess, tool: string, input: Record<string, unknown>, io?: GuardIO): Verdict
type ToolAccess = { files: string[]; textTool: boolean; lint?: LintContext }   // Verdict = { allow: true } | { allow: false; reason }
type LintContext = { scope: ScopeFlags; policy: TokenSets; hardcoded: Hardcoded[]; zone: string | readonly string[]; zones }
lintContextFor({ ds, scope: Scope[] | ScopeFlags, zones: string[], hardcoded: Hardcoded[] }): LintContext   // hardcoded gardé par référence
lintChanges(changes: ChangedFile[], ctx: LintContext): { violations: Violation[]; granted: Hardcoded[] }
editedContents(current: string | null, oldString, newString, replaceAll): { contents: string[] } | { error: string }
type GuardIO = { read(root, rel): string | null; head(root, rel): string | null; list(root, rel): string[] | null }   // DISK_IO par défaut

runStaticChecks({ ds, scope: Scope[] | ScopeFlags, zones: string[], access, changes: ChangedFile[],
                  hardcoded, texts: number, typecheck: () => Promise<string | null> }): Promise<{ checks: RawCheck[]; ok; violations; granted }>
runRenderChecks({ session, logotype: boolean, acceptsLongerText: boolean, alsoChanged?: string[] })
  : Promise<{ checks: RawCheck[]; ok; warning: CoverWarning | null; verdict: VisualVerdict }>
publicChecks(raw: RawCheck[], warning?: CoverWarning | null): CheckResult[]    // libellés anglais fixes, jamais problem ni detail
retryProblems(raw: RawCheck[]): string[]                                       // consignes du 2e essai

chromePreview(settings: { baseUrl; cookies?: {name; value}[]; channel?: string; viewports?; settle?(page) }): Preview
type Preview = { open(page: string, zone: string, index: number): Promise<VisualSession> }
type VisualSession = { before; pageTexts; occurrences; painted; measure(): Promise<ZoneMeasure[]>;
                       verify(): Promise<VisualVerdict>; saveShots(dir): Promise<string[]>; close(): Promise<void> }
describeMeasures(m: ZoneMeasure[]): string   // outil measure (anglais) ; lineSummary(m) : étape du journal
HARDCODED_POLICY   // = HardcodedPolicy d'engine-claude (questionProblems)
```

## Comportement — les 6 couches (POC § 3) et ce qui est ici

| Couche | Ici | Bloquant | Averti seulement |
|---|---|---|---|
| 0 · Accès et isolation du processus Claude | non (engine-claude : `settingSources: []`, env minimal, outils réduits) | — | — |
| 1 · Entrée de la demande | `validateDesignSystem` (zones.json fautif = DesignSystemError) ; la demande elle-même est validée par engine-core | zone ouvrant un fichier hors du site, sélecteur non-classe, contrôle/zone intérieure/groupe inconnus, chemin Sanity à index numérique ou `drafts.` | réglage dont la politique refuserait une valeur, token absent de tokens.css |
| 2 · Pendant l'exécution | `checkToolUse` (hook) ; `HARDCODED_POLICY` pour les options 🔴 | Read hors `src/components`, `src/styles`, `src/app/(site)`, `src/lib`, `package.json`, `tsconfig.json`, `next.config.ts`, ou d'un Markdown (`CLAUDE.md`, `*.md`) ou d'un chemin caché ; Glob/Grep hors de ces dossiers (jamais `src` entier) ; Grep non restreint au code (`glob: "*.{tsx,css}"`, `type`) dans un dossier qui contient un fichier illisible ; Edit hors `access.files` ou hors site ; **Edit dont le fichier futur viole le lint** (avec `access.lint`) ; Edit de composant sans `access.lint` ; `set_text` sans T ; tout outil inconnu | — |
| 3 · Statique après chaque essai | `runStaticChecks` → `scope`, `tokens` (CSS + TSX entiers), `types`, `texts` | tout refus du lint (liste ci-dessous), fichier hors périmètre, erreur tsc | — |
| 4 · Rendu (seulement si 3 passe) | `runRenderChecks` → `render`, `responsive`, `isolation`, `frame`, `lines`, `contrast`, `contrast-unverifiable`, `contrast-reach` | tous ceux-là ; relevé partiel (plafonds `MAX_*`) = refus | `placement` (zone intérieure replacée), `cover` (texte recouvert, décision 17) |
| 5 · Sortie | `publicChecks`, `retryProblems` ; le reste (2 essais, retour arrière, validation humaine) est à engine-core | — | — |

**Lint CSS** (fichier entier, HEAD contre copie de travail) : mode Texte = aucun octet CSS ; CSS illisible ; `;` libre
entre deux règles ; imbrication ; @-règle ajoutée autre qu'une `@media (min-width: X)` des points de rupture du design
system (jamais `@container`, `@import`, `@font-face`, `@keyframes`) ; `!important` ; sélecteur mal formé (ASCII seul,
ni `+ ~ * #id [attr]`, ni pseudo-élément, pseudo-classes en liste blanche) ; sélecteur hors de la zone ; zone intérieure :
placement seulement ; valeur hors liste blanche (tokens du bon rôle, `var()` connu sans repli, 200 caractères, aucune
ressource externe, mots-clés en minuscules) ; états (`:hover`, `:focus(-visible)`, `:active`) = peinture seulement, ni
transparent ni inherit ; `min-width` ≠ auto seulement sur la racine ; `display: none` seulement sur la racine d'une zone
`hideable`, rétabli à un point de rupture ; **paire font** : `font: var(--text-X)` exige `letter-spacing:
var(--text-X-tracking)` dans la même règle (Conduit) ; règle d'une autre zone retirée ou déplacée. Une valeur en dur 🔴
accordée n'exempte que du refus de **valeur**, pour la propriété et la valeur exactes, jamais `NOT_EXEMPTABLE`
(`font-family`, `font`, `opacity`, `display`, `position`, `transform`, `background-image`, `outline*`, `box-shadow`,
décalages).

**Lint TSX** : composant créé/supprimé ; ne s'analyse plus ; risques ajoutés (`<script>`, `<iframe>`…,
`dangerouslySetInnerHTML`, `on*`, `style={{}}`, `process.env`, import, `javascript:`) ; zones intactes (`data-edit="…"`,
`{...editAttrs('…')}` et `edit={editAttrs('…')}` comptés pareil ; `editAttrs(null, …)` ne marque rien) ; aucune
className ne change ; squelette identique ; en 🖌 seul aucun texte ; en T un texte change seulement dans les `text.files`
d'une zone visée, dans le sous-arbre de son `data-edit` (ou un attribut de texte).

**Adaptations Conduit / Sanity** (tout le reste est le code du POC) :
- Politique paramétrée par le design system chargé : rôles `color`, `space`, `spaceWide` (padding/margin : `--page-inset`,
  `--section-space*`, `--gutter`), `font`, `fontSize`, `weight`, `textStyle` (raccourci `font`), `tracking`, `radius`,
  `shadow`, `measure` (`--page-max`). Groupes reconnus par leur nom (`color`, `text`, `layout`…) ; un contrôle ne donne un
  rôle qu'à un groupe au nom inconnu, jamais n'élargit un groupe reconnu. Conduit (vrai design system, testé dans
  `conduit.test.ts`) : `space` = `--space-8` à `--space-64` (groupe `space`) ; rôles vides : rayon, ombre, graisse,
  taille seule. Rôle vide = seulement les mots-clés sûrs (`0`, `auto`, `inherit`…) ; le message dit à Claude de demander
  au client (ask_client, option 🔴). Soulèvement au survol : aucun sans `--space-1/2` (Conduit : aucun).
- Noms des tokens : contrat = clé de tokens.json = nom de la custom property sans `--` (`naming: 'key'`, défaut) ; avec
  tokens.css, le nom déclaré l'emporte. LyonDrive : `naming: 'group-key'`.
- Points de rupture : option du moteur, sinon groupe `breakpoint(s)` de tokens.json, sinon `@media (min-width: …)` en
  service dans le CSS du site (`@container` et `max-width` ignorés). Conduit : groupe `breakpoint` verrouillé de
  tokens.json (`breakpointSource: 'tokens'`) : 50.625rem, 64rem, 80rem, 90rem.
- `max-inline-size` et `inline-size` : mêmes valeurs que `max-width` et `width` (Conduit écrit en propriétés logiques).
- Demandes à plusieurs éléments (contrat : 1 à 8 cibles) : `lintChanges` et `runStaticChecks` jugent l'union des zones
  visées (une règle, un texte passent s'ils appartiennent à l'une d'elles ; racine de chacune pour `min-width` et le
  masquage). Une seule zone : comportement du POC à l'identique.
- Mineurs du POC corrigés : #74 (`Object.hasOwn` partout sur les zones), #83 (listes exportées gelées : `Object.freeze`,
  `frozenSet` qui lève sur `add/delete/clear`).
- Aperçu : cookie du secret sur l'origine de l'aperçu (plus d'en-tête `x-preview-secret`, qui partait vers toutes les
  origines) ; `previewUrl` refuse toute page hors de l'origine ; `settle(page)` injectable avant chaque relevé.
- CSS Modules Next 16.3.6 (Turbopack) vérifiés sur 127.0.0.1:4040 : `Hero-module__Vtspxq__title`, hachage de 6
  caractères `[\w-]` (`d2c-Xa`) : `MODULE_HASH = /-module__[\w-]{6}__/g`, inchangé, testé.
- Textes : **tout est en anglais** (2026-09-27, demande d'engine-claude) — raisons de refus de `checkToolUse` (lues par
  Claude et montrées au client dans le journal, étape `warn`), refus du lint CSS/TSX, `problem`, `label` et `detail` des
  contrôles, problèmes de `validateDesignSystem` / `DesignSystemError`, erreurs de `previewUrl` et du rendu, libellés
  `publicChecks`, avertissement du texte recouvert, sortie de `measure` et `lineSummary`. Traduction fidèle des textes du
  POC, sans changer ni la logique ni les seuils ; citations entre “ ” (quoteData), ratios au point décimal (`3.07`),
  milliers à la virgule (`20,000`), côtés `left`/`right`/`top`/`bottom` (`ZoneMeasure.frame`). Commentaires du code en
  français. Reste interne en français : `colorTone` (« clair » / « sombre », traduit par engine-claude) et les marqueurs
  du squelette TSX (`#texte`), jamais montrés.

## Cycle d'une demande (pour engine-core, repris de `job.ts > runEdit/runChecks`)

1. `ds = await loadDesignSystem(repoDir)` à chaque demande (dans le clone, branche draft). `DesignSystemError` → échec
   « internal » sans lancer Claude. Zones inconnues de la demande : refus 400 (`Object.hasOwn(ds.zones, id)`).
2. `access` : `toolAccessFor` d'engine-claude (🖌 = CSS des zones, T + texte dans le code = ses fichiers), PLUS
   `lint: lintContextFor({ ds, scope: request.scope, zones: targets.map(t => t.zone), hardcoded })` où `hardcoded` est le
   tableau vivant de la demande (les réponses du client s'y ajoutent). Hook : `checkToolUse(repoDir, access, tool, input)` :
   chaque Edit est jugé sur le fichier futur contre HEAD AVANT l'écriture (SEC-07). Câblé dans `jobs/run.ts` (demande de
   contrat 5, faite) ; sans `lint`, aucun composant ne s'écrirait et un CSS ne serait jugé qu'à l'étape 4.
3. `session = await preview.open(page, targets[0].zone, targets[0].index)` AVANT Claude (état d'avant ; échec = « preview
   ou Chrome indisponible », rien n'a changé). `session.before` et `session.pageTexts` alimentent le prompt ; l'outil
   measure = `describeMeasures(await session.measure())` (+ `lineSummary` pour l'étape du journal), après avoir laissé
   l'aperçu prendre les fichiers.
4. Après chaque essai : `changes` = fichiers de `git status` (HEAD / copie de travail, entiers) ;
   `st = await runStaticChecks({ ds, scope, zones: targets.map(t => t.zone), access, changes, hardcoded, texts, typecheck })`.
5. Si `st.ok` : attendre que l'aperçu soit à jour (CSS pris, brouillon Sanity visible), puis
   `rd = await runRenderChecks({ session, logotype: !!ds.zones[zone]?.logotype, acceptsLongerText, alsoChanged: autres zones })`.
6. `checks = [...st.checks, ...(rd?.checks ?? [])]`. Tout ok → `EditJob.checks = publicChecks(checks, rd?.warning)`,
   `EditJob.hardcoded = st.granted`, `rd.warning?.client` ajouté au message, `rd.warning?.step` au journal,
   `session.saveShots(dir)`, commit. Sinon 2e essai avec `retryProblems(checks)` ; 2e échec → retour arrière complet.
7. `finally { await session.close() }`.

Plusieurs cibles : la session du rendu porte sur la première ; pour contrôler cadre, lignes et contraste de chacune,
ouvrir une session par cible (coûteux : 3 largeurs × capture) avec `alsoChanged` = les autres.

## Forces

- 26 corrections du POC relues de manière adverse, portées sans changer leur logique ; 330 tests unitaires et 68 tests
  dans Chrome (`visual-page.test.ts`) verts. Le hook juge le fichier futur de chaque Edit avec le même lint que l'étape
  statique : rien d'interdit n'atteint le disque, donc ni l'aperçu `next dev` ni la mesure (SEC-07). Liste blanche sur le fichier entier (CSS par postcss, TSX par l'AST) : un
  diff maquillé (deux lignes, commentaire, `:global(body)`, échappement Unicode) ne passe pas.
- Politique entièrement dérivée du design system chargé : aucun nom de token ni point de rupture en dur ; un design system
  pauvre rend la politique plus stricte, jamais plus large.
- Tout est pur sauf le chargement et l'aperçu : testable sans Claude, sans serveur (faux `Preview`/session).

## Faiblesses et limites connues

- Limites du POC encore vraies : un conteneur peut réordonner ses zones intérieures (`order`, `column-reverse`, #30/#33) ;
  l'accord `longer-text` vaut pour toute la demande (#53) ; au-delà de 12 occurrences le cadre n'est plus contrôlé pour
  les suivantes (#47 ; le relevé partiel est dit) ; une autre zone qui a bougé n'est pas comparée au pixel, et le texte
  des autres zones n'est pas comparé (seuls le lint TSX et set_text le protègent) ; contraste du contenu libre (corps
  d'article) : une imbrication absente de la page peut passer ; le texte recouvert n'est qu'un avertissement et un
  soulèvement au survol n'est pas relevé ; `set_css` n'existe pas (le style passe par Edit, jugé avant l'écriture avec
  `access.lint`, après l'essai sinon).
- SEC-07 : engine-core passe `access.lint` (`jobs/run.ts`, testé par `jobs/wiring.test.ts`) ; tout Edit, CSS compris,
  est jugé avant l'écriture. Reste hors d'ici : `next dev` de l'aperçu tourne avec les droits de l'utilisateur (HOME, disque,
  réseau) : l'isoler (utilisateur ou conteneur dédié, lecture limitée au clone, sortie réseau limitée à Sanity) reste
  une défense en profondeur à engine-core.
- Reconstruction d'un Edit : correspondance EXACTE de old_string seulement. L'outil de Claude Code sait retrouver un
  texte aux guillemets typographiques différents : le hook refuse ces Edit (Claude doit recopier le texte exact).
- Zone `integrations.logos` (T, texte dans le code) : ses textes alternatifs sont des littéraux d'un objet (`alt: 'Uber'`),
  pas des textes JSX ni des attributs de texte : les changer est un changement de structure, refusé. À revoir avec
  site-adapter si ces textes doivent être modifiables.
- Rendu : une session = une zone. Plusieurs cibles → voir Cycle, étape 7.
- Points de rupture en repli relus dans le CSS, pour un site dont tokens.json n'en déclare pas (pas Conduit) : un point
  de rupture retiré du site disparaît de la politique ; un nouveau n'y entre qu'une fois écrit dans un CSS Module.
- Classement des tokens par nom de groupe et de token (`section|gutter|inset` → espacement large, `container|measure|max`
  → largeur, `-tracking`) : un tokens.json aux noms inattendus donne des rôles vides (plus strict), à régler par
  `DesignSystemOptions.roles`.
- `visual.ts` fait 2 100 lignes (READ_ZONE, états forcés, valeurs témoins) : relu et testé, mais difficile à modifier.

## Points sensibles

- Ne JAMAIS élargir `SITE_DIRS`, `READABLE_ROOT_FILES` ni retirer un segment bloqué (`node_modules`, `engine`, tout
  segment caché `.git`/`.next`/`.env*`/`.claude`, tout Markdown `*.md`/`*.mdx`/`*.markdown`, `src/admin`,
  `src/app/admin`, `src/app/studio`, `src/sanity/lib/token.ts`) : Claude lirait l'admin, le jeton Sanity, les secrets ou
  les notes des développeurs. Comparaison en minuscules (disque du Mac insensible à la casse).
- Ne JAMAIS laisser passer un Edit de composant sans juger son fichier futur (`access.lint` absent = refus) : `next dev`
  exécute le composant dès qu'il est écrit, avant l'étape statique. Ne jamais retirer une variante d'`editedContents`
  (blancs de fin de new_string, saut de ligne emporté par une suppression) : l'outil Edit les produit.
- Grep affiche le contenu des fichiers : ne jamais l'autoriser non restreint dans un dossier qui contient un fichier
  illisible (`codeOnlySearch` : `type` ts/js/css, ou `glob` fait seulement d'extensions de code).
- Ne jamais permettre `url(`, `image(`, `//`, `\`, `@import`, `expression(` dans une valeur, même accordée (`EXTERNAL_RESOURCE`).
- Ne jamais passer un secret par un en-tête Playwright ; ne jamais journaliser `cookies`.
- Ne jamais exempter `case`, `state`, `min-width`, `display-none`, `font-pair`, `selector` par un accord 🔴.
- Les zones, le périmètre et les valeurs accordées viennent de la demande et des réponses du client, jamais de Claude.

## Pièges

- **Piège 13 du POC** : dans un callback `page.evaluate` (READ_ZONE et co.), aucune fonction nommée ni `const f = () =>`
  — tsx/esbuild injecte `__name`, absent du navigateur. Callbacks anonymes et boucles `for` seulement ; calculs côté Node.
- Les composants de `fixtures/lyondrive` sont en `.tsx.txt` : sinon `tsc -p .` (qui inclut `**/*.tsx`) et Next les
  compileraient. Les tests ajoutent `.txt` à la lecture.
- Un littéral `{ '__proto__': x }` fixe le prototype, pas une clé : pour tester une zone `__proto__`, `JSON.parse`.
- `extraHTTPHeaders` d'un contexte Playwright part vers TOUTES les origines (CDN Sanity, polices) : cookie seulement.
- Tests Chrome : ~6 min (`visual-page.test.ts`, serveur HTTP jetable sur un port libre, Chrome installé, repli sur le
  Chromium de Playwright, sautés si aucun navigateur ne se lance).
- Les tests portés utilisent `node:assert/strict` avec Vitest (`beforeAll as before`) : garder ce style en les modifiant.
- Le HMR de `next dev` voit le CSS, pas un brouillon Sanity : attendre un signal (`settle`) plutôt qu'un délai fixe.
- Avec `access.lint`, CHAQUE Edit doit laisser le fichier conforme à lui seul : `font` et son `letter-spacing`, un
  `display: none` et son rétablissement au point de rupture, s'écrivent dans le même Edit (la raison le dit à Claude).
- Le faux Claude (`engine/src/claude/fake.ts`) doit passer `old_string`/`new_string` au hook comme le vrai : avec
  `access.lint`, un Edit sans eux est refusé.
- `DISK_IO.list` : un chemin absent rend `[]` (rien à lire), un dossier illisible ou de plus de 5 000 entrées rend null
  (recherche alors restreinte au code). `head` lit `git cat-file blob HEAD:<chemin>` dans `root` (la racine du clone) :
  hors dépôt git, le fichier est jugé comme nouveau, donc refusé.

## Comment modifier

- **Ajouter une propriété CSS permise, en toute sûreté** :
  1. `css-policy.ts > RULES` : une règle **par valeurs entières** (`oneOf`, `one(role(...))`, `words`), jamais une regex
     ouverte ; si la propriété déplace ou masque (décalage, taille, `display`…), l'ajouter à `NOT_EXEMPTABLE`.
  2. Si elle change la mise en page, ne PAS l'ajouter à `STATE_PROPERTIES` (les états ne sont jamais mesurés au repos).
  3. Si c'est une variante d'une propriété à règle spéciale dans `css-lint.ts` (`min-width`, `display`, `font`/`letter-spacing`),
     étendre la règle spéciale (sinon, contournement : `min-inline-size` n'est volontairement PAS permise).
  4. Si elle peint un texte (couleur, taille), vérifier que `PAINT_GROUPS` (`visual.ts`) la relève, sinon la règle ne sera
     pas jugée sur son effet (décision 19).
  5. Tests dans `css-policy.test.ts` (acceptées ET refusées, casse, valeur démesurée) et `conduit.test.ts`.
  Exemple fait : `inline-size` / `max-inline-size` = mêmes valeurs que `width` / `max-width`.
- **Nouveau groupe de tokens** : nom reconnu dans `GROUP_ROLES` ou rôle via `DesignSystemOptions.roles` ; test de rôle.
- **Nouveau point de rupture** : groupe `breakpoint` de tokens.json (ou option `breakpoints`) ; jamais en dur.
- **Nouveau contrôle** : `run.ts` (ordre), id du contrat dans `report.ts > CONTRACT_IDS` et `CHECK_LABELS` (anglais).
- **Nouvelle écriture d'un marquage de zone** (autre fonction que `editAttrs`) : `tsx-lint.ts > editAttrsZone` et
  `dataEditOf` (compte ET zones englobantes des textes) ; test dans `edit-guard.test.ts` (FOLLOWUPS #2).
- **Nouvel outil qui écrit** (MultiEdit, Write…) : ne l'ajouter à `BUILTIN_TOOLS` qu'avec sa reconstruction du fichier
  futur dans `checkToolUse`, comme `editedContents` pour Edit, et ses tests d'attaque (import, process.env, fetch…).

## Tests

- `npx vitest run engine/src/guards` (tout, ~6 min avec Chrome) ; sans Chrome :
  `npx vitest run engine/src/guards --exclude '**/visual-page.test.ts'` (~2 s).
- Couvert : politique (sondes de la critique, passage de référence), lint CSS/TSX (non-régression sur 31 fichiers de
  référence), hook, mesures, contrôles, contraste, états forcés et valeurs témoins dans Chrome, design system Conduit RÉEL
  (`conduit.test.ts`, `run.test.ts` : tokens.json, zones.json et CSS du dépôt), multi-zones, `previewUrl`, `MODULE_HASH`,
  API publique, cohérence avec engine-claude (noms d'outils, `HARDCODED_POLICY`).
- `ds.cssValues` (FOLLOWUPS #37, `conduit.test.ts`) : vrai tokens.css (palette en hex, rôles en `var()` bruts), mêmes
  clés que `declaredProperties` et mêmes valeurs que `cssCustomValues` d'engine-claude, toutes les couleurs de
  tokens.json résolues par `resolveCssValue` ; dernière déclaration gagnante, `!important` retiré, feuille illisible ou
  absente = vide ; copie de la Map passée à `buildDesignSystem`.
- `edit-guard.test.ts` (dépôt git jetable avec les vrais Integrations.tsx et Hero.module.css) : Edit refusé AVANT
  l'écriture pour import `node:fs`, `process.env`, `fetch`, `dangerouslySetInnerHTML`, expression ajoutée, `require`,
  `replace_all`, `@import`, `url()`, valeur en dur, règle d'un autre élément ; vrai changement de texte ou de token
  permis ; valeur accordée comptée aussitôt ; `editedContents` ; CLAUDE.md et `*.md` ni lus ni fouillés ; zones
  `editAttrs`. Chaîne réelle : `toolAccessFor` d'engine-claude + `lint: lintContextFor(…)` (forme de la demande 5) →
  `createGuardHook` : Edit dangereux (`process.env`, import `node:fs`) = `deny` + étape `warn` avant l'écriture, vrai
  texte de zone permis ; sans `lint`, le même texte de composant est refusé.
- Textes anglais : messages vérifiés mot à mot dans les tests portés (traduits le 2026-09-27) ; raisons du hook
  (`guards.test.ts`), consignes du 2e essai sans français (`run.test.ts`), ratios au point (`contrast.test.ts`,
  `measure.test.ts`). Changer un message = changer son test ; un texte du site cité reste dans sa langue (données).
- Non couvert : l'aperçu 4042 réel (engine-core), Claude réel (interdit pendant la construction).

## Décisions et « À trancher »

- Politique paramétrée plutôt que tokens en dur ; rôle vide = mots-clés sûrs + question au client (engine-guards).
- `quoteData` d'engine-claude utilisé ici (une seule neutralisation) ; copie locale du POC supprimée.
- Refus, consignes et contrôles traduits en anglais (2026-09-27) : Claude travaille en anglais, le client lit le journal ;
  tests portés mis à jour (même sens, nouveaux textes) et tests ajoutés (raisons du hook, `retryProblems` sans français,
  `formatRatio` et `describeMeasures` au point décimal).
- SEC-07 (2026-09-27) : le hook juge le fichier futur de chaque Edit (`lintChanges` complet, contre HEAD) plutôt que de
  compter sur l'étape statique : `next dev` exécute un composant écrit avant elle. Toutes les variantes de l'outil Edit
  sont jugées ; old_string introuvable ou ambigu = refus (rien n'est deviné). Sans `access.lint` : composant refusé
  (sûr), CSS jugé après l'essai (le CSS n'exécute rien) ; engine-core passe désormais `access.lint` (`jobs/run.ts`).
- AI-08 (2026-09-27) : Markdown et chemins cachés jamais lus ; Grep restreint au code dans un dossier qui en contient
  (Glob, qui ne rend que des noms, reste libre).
- AI-09 (2026-09-27) : les tests de Conduit lisent le vrai site ; `fixtures/conduit` gardé pour le banc d'engine-core.

## Demandes de contrat

1. ~~engine-claude : hook limité aux dossiers du site~~ — **fait** (vérifié le 2026-09-27) : `hook.ts > createGuardHook`
   appelle `checkToolUse` d'ici (lecture limitée à `SITE_DIRS` + 3 fichiers de config, Glob/Grep jamais sur `src`
   entier), branché sur tous les outils dans `agent.ts` ; le faux Claude (`fake.ts`) passe par le même `checkToolUse`.
2. ~~engine-claude : politique des questions~~ — **fait** : `questionProblems(drafts, policy = CSS_POLICY)` où
   `CSS_POLICY` est le module `css-policy.ts` lui-même (mêmes `MAX_VALUE_LENGTH`, `EXTERNAL_RESOURCE`, `NEGATIVE_OR_CALC`,
   `isExemptable`, `unmeasurableColor`, `normalizeValue` que `HARDCODED_POLICY`) ; plus de `test-policy.ts`. Les tests
   d'engine-claude (`rules.test.ts`) vérifient RULES.md contre la politique réelle.
3. ~~site-adapter : groupe `breakpoint` dans tokens.json~~ — **fait** : groupe `breakpoint` verrouillé (50.625rem, 64rem,
   80rem, 90rem), clés = noms des custom properties, pas de palette brute (vérifié par `conduit.test.ts` sur le vrai site).
4. **Contrat `engine.ts`** : `CheckId` n'a pas `placement` (zone intérieure replacée, informatif) : il reste interne ;
   l'ajouter si l'admin doit l'afficher.
5. ~~engine-core (`engine/src/jobs/run.ts`) — SEC-07~~ — **fait** (vérifié le 2026-09-27) : `const toolAccess = { ...toolAccessFor(…), lint:
   lintContextFor({ ds, scope: request.scope, zones: request.targets.map((t) => t.zone), hardcoded }) }` (le MÊME tableau
   `hardcoded` que l'outil ask_client remplit) : `run.ts` construit `toolAccess` avec `lint` (FOLLOWUPS #36) ;
   `jobs/wiring.test.ts` vérifie le contexte passé et le refus par le vrai hook avant l'écriture. Reste ouvert (défense
   en profondeur, engine-core) : isoler `next dev` de l'aperçu (utilisateur ou conteneur dédié, sans HOME, sortie réseau
   limitée à Sanity).
6. ~~engine-claude (`fake.ts`) : passer au hook `old_string`/`new_string` comme l'outil Edit réel~~ — **fait** (vérifié
   le 2026-09-27) : `find`/`replace`/`replaceAll` → `old_string`/`new_string`/`replace_all`, `content` → `old_string` =
   contenu actuel ; remplacement appliqué comme l'outil (`applyEdit`).
7. ~~engine-claude (AI-03) : `DesignSystem.cssValues`~~ — **fait** (FOLLOWUPS #37, 2026-09-27) : rempli par
   `loadDesignSystem` depuis la même lecture de tokens.css que `declared`.
