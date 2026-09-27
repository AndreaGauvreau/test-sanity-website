/**
 * Garde-fous déterministes du moteur IA — API publique (engine-guards). Portés du POC `batterie-tests@59348e7`
 * (cms/src/editor) avec leurs tests, adaptés à Sanity et au site Conduit. Voir CLAUDE.md du dossier.
 *
 * Ordre d'emploi dans le cycle d'une demande (câblé par engine-core, voir CLAUDE.md « Cycle d'une demande ») :
 *   1. loadDesignSystem(repoDir)                          → DesignSystem (tokens, contrôles, zones, points de rupture, policy, cssValues)
 *   2. checkToolUse(root, access, tool, input)            → hook PreToolUse de Claude ; access.lint = lintContextFor(…)
 *                                                            (chaque Edit jugé sur le fichier futur AVANT l'écriture)
 *   3. preview.open(page, zone, index)                    → VisualSession AVANT l'essai (état d'avant ; outil measure)
 *   4. runStaticChecks({ ds, scope, zones, access, changes, hardcoded, texts, typecheck })
 *   5. si ok : runRenderChecks({ session, logotype, acceptsLongerText, alsoChanged })
 *   6. publicChecks(checks, warning) → CheckResult[] du contrat ; retryProblems(checks) → consignes du 2e essai
 *   7. session.saveShots(dir) si tout passe ; session.close() TOUJOURS (finally)
 */

// ─── Types partagés ──────────────────────────────────────────────────────────
export {
  scopeFlags,
  type ChangedFile,
  type ControlDef,
  type Hardcoded,
  type ScopeFlags,
  type TokenGroup,
  type TokensFile,
  type ToolAccess,
  type Violation,
  type ZoneDef,
  type ZonesFile,
} from './types'

// ─── Design system : chargement et validation ───────────────────────────────
export {
  buildDesignSystem,
  customPropertyValues,
  declaredProperties,
  DesignSystemError,
  loadDesignSystem,
  mediaBreakpoints,
  validateDesignSystem,
  RULES_FILE,
  TOKENS_CSS_FILE,
  TOKENS_FILE,
  ZONES_FILE,
  type DesignSystem,
  type DesignSystemOptions,
} from './design-system'

// ─── Politique CSS (liste blanche par propriété) ─────────────────────────────
export {
  ALLOWED_PROPERTIES,
  checkValue,
  EXTERNAL_RESOURCE,
  isExemptable,
  isGrantableValue,
  MAX_VALUE_LENGTH,
  NEGATIVE_OR_CALC,
  normalizeValue,
  PLACEMENT_PROPERTIES,
  STATE_PROPERTIES,
  tokenSets,
  tokenVarName,
  unmeasurableColor,
  type TokenNaming,
  type TokenRole,
  type TokenSets,
  type ValueProblem,
} from './css-policy'
import { EXTERNAL_RESOURCE, isExemptable, MAX_VALUE_LENGTH, NEGATIVE_OR_CALC, normalizeValue, unmeasurableColor } from './css-policy'

/**
 * Règles dont dépend le refus d'une option 🔴 (valeur en dur) dans les questions de Claude : l'objet attendu par
 * `questionProblems(drafts, policy)` d'engine-claude (type HardcodedPolicy), tiré de la politique qui jugera le CSS.
 */
export const HARDCODED_POLICY = Object.freeze({
  MAX_VALUE_LENGTH,
  EXTERNAL_RESOURCE,
  NEGATIVE_OR_CALC,
  isExemptable,
  unmeasurableColor,
  normalizeValue,
})

// ─── Hook PreToolUse et contrôle des fichiers modifiés ──────────────────────
export {
  ALLOWED_TOOLS,
  ASK_TOOL,
  BUILTIN_TOOLS,
  checkToolUse,
  DISK_IO,
  editedContents,
  isReadable,
  lintChanges,
  lintContextFor,
  MCP_SERVER,
  MCP_TOOLS,
  MEASURE_TOOL,
  outOfScope,
  READABLE_ROOT_FILES,
  repoPath,
  SITE_DIRS,
  TEXT_TOOL,
  type GuardIO,
  type LintContext,
  type Verdict,
} from './guards'
export { checkCssFiles, lintCssFiles, type CssCheck, type CssLintContext } from './css-lint'
export { EDIT_ATTRS, lintTsxFiles, tsxZone, type TsxZone } from './tsx-lint'

// ─── Les deux temps des contrôles (job.ts > runChecks du POC) ────────────────
export {
  runRenderChecks,
  runStaticChecks,
  type RenderCheckInput,
  type RenderCheckResult,
  type StaticCheckInput,
  type StaticCheckResult,
} from './run'
export { CHECK_LABELS, contractCheckId, publicChecks, retryProblems } from './report'

// ─── Contrôles du rendu, un par un (utilisés par runRenderChecks) ────────────
export {
  contrastCheck,
  coverWarning,
  frameCheck,
  linesCheck,
  LOGOTYPE_FLOOR,
  reachCheck,
  unverifiableCheck,
  type CoverWarning,
  type RawCheck,
} from './checks'
export { contrastRatio, formatRatio, requiredContrast } from './contrast'

// ─── Aperçu (Chrome via playwright-core) et relevés ──────────────────────────
export { chromePreview, PREVIEW_VIEWPORTS, type Preview, type PreviewSettings } from './preview'
export {
  compareZones,
  MODULE_HASH,
  previewUrl,
  startVisualSession,
  withoutHash,
  type Capture,
  type PageText,
  type VisualSession,
  type VisualSettings,
  type VisualVerdict,
  type ZoneChange,
} from './visual'
export {
  describeMeasures,
  excerpt,
  lineSummary,
  MAX_OCCURRENCES,
  MAX_PAINTED_OCCURRENCES,
  MAX_PAINTS,
  MAX_RULES,
  MAX_TEXTS,
  type ZoneMeasure,
} from './measure'
