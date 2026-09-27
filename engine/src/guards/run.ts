import type { Scope } from '../../../src/admin/core/contracts/engine'
import { contrastCheck, coverWarning, frameCheck, linesCheck, reachCheck, unverifiableCheck, type CoverWarning, type RawCheck } from './checks'
import type { DesignSystem } from './design-system'
import { lintChanges, lintContextFor, outOfScope } from './guards'
import { scopeFlags, type ChangedFile, type Hardcoded, type ScopeFlags, type ToolAccess, type Violation } from './types'
import type { VisualSession, VisualVerdict } from './visual'

/**
 * Les deux temps des contrôles après un essai de Claude, repris de `job.ts > runChecks` du POC (batterie-tests@59348e7),
 * dans le même ordre et avec les mêmes textes (traduits en anglais) :
 * 1. runStaticChecks : périmètre (scope), design system et structure (tokens : CSS et TSX entiers), compilation (types,
 *    seulement si un .ts/.tsx a changé), trace des textes (texts) ;
 * 2. runRenderChecks, SEULEMENT si tous les contrôles statiques passent : rendu, débordement, isolation, placement
 *    (informatif), cadre, avertissement du texte recouvert, lignes, contraste, effet des règles, portée des règles.
 * Un contrôle en échec renvoie son `problem` à Claude (2e essai) ; au 2e échec, retour arrière complet (engine-core).
 * Rien ici ne vient de Claude : zones, périmètre et valeurs accordées viennent de la demande et des réponses du client.
 */

export type StaticCheckInput = {
  ds: DesignSystem
  /** Périmètre choisi par le client (contrat : `['style', 'text']`), ou déjà en booléens. */
  scope: readonly Scope[] | ScopeFlags
  /** Zones visées par la demande (ElementTarget.zone, 1 à 8), dans l'ordre de la demande. */
  zones: readonly string[]
  /** Ce que le hook a permis : les fichiers modifiables (chemins relatifs au dépôt). */
  access: ToolAccess
  /**
   * Fichiers modifiés dans le clone de travail (git status), ENTIERS : contenu au dernier commit (`before`, null pour un
   * fichier nouveau) et dans la copie de travail (`after`, null pour un fichier supprimé).
   */
  changes: readonly ChangedFile[]
  /** Valeurs en dur accordées par le client (options 🔴 choisies). */
  hardcoded: readonly Hardcoded[]
  /** Nombre de textes Sanity écrits par set_text pendant l'essai (trace pour l'admin). */
  texts: number
  /** `tsc --noEmit` dans le clone : la sortie en cas d'erreur, null si tout compile. Appelé si un .ts/.tsx a changé. */
  typecheck: () => Promise<string | null>
}

export type StaticCheckResult = {
  /** Contrôles, dans l'ordre du POC (textes internes en anglais, techniques : voir report.ts pour le client). */
  checks: RawCheck[]
  /** Tous les contrôles passent : on peut lancer runRenderChecks. */
  ok: boolean
  /** Refus du contrôle CSS/TSX, pour le journal du moteur. */
  violations: Violation[]
  /** Valeurs en dur accordées qui ont réellement servi : signalées à Kuartz (EditJob.hardcoded). */
  granted: Hardcoded[]
}

const isScopeList = (scope: StaticCheckInput['scope']): scope is readonly Scope[] => Array.isArray(scope)

/** Contrôles statiques d'un essai de Claude (couche 3 du POC). Pur, sauf l'appel de `typecheck`. */
export async function runStaticChecks(input: StaticCheckInput): Promise<StaticCheckResult> {
  const scope = isScopeList(input.scope) ? scopeFlags(input.scope) : input.scope
  const files = input.changes.map((change) => change.file)
  const checks: RawCheck[] = []
  let violations: Violation[] = []
  let granted: Hardcoded[] = []

  if (files.length) {
    const outside = outOfScope(files, input.access.files)
    checks.push({
      id: 'scope',
      label: 'Only the allowed files changed',
      ok: outside.length === 0,
      detail: outside.join(', ') || undefined,
      problem: `Files changed outside the allowed scope: ${outside.join(', ')}. Put them back in their original state.`,
    })

    // Fichiers entiers : dernier commit contre copie de travail, CSS et composants, pour les zones de la demande (jamais
    // une donnée venue de Claude). Seules les valeurs en dur choisies par le client (option déconseillée) échappent au
    // contrôle, pour leur propriété et leur valeur exactes.
    // Même contexte que le hook (ToolAccess.lint) : lintContextFor ; ici une copie figée des valeurs accordées.
    const lint = lintChanges([...input.changes], lintContextFor({ ds: input.ds, scope, zones: input.zones, hardcoded: [...input.hardcoded] }))
    violations = lint.violations
    granted = lint.granted
    checks.push({
      id: 'tokens',
      label: scope.style ? 'Design system and scope respected' : 'Only the text changed in the code',
      ok: violations.length === 0,
      detail: violations.map((v) => v.message).slice(0, 3).join(' ') || undefined,
      problem: violations.map((v) => `${v.file}: ${v.message}${v.line ? ` Excerpt: \`${v.line}\`` : ''}`).join(' | '),
    })

    if (files.some((file) => /\.tsx?$/.test(file))) {
      const error = await input.typecheck()
      checks.push({
        id: 'types',
        label: 'The code compiles',
        ok: !error,
        detail: error?.split('\n')[0],
        problem: `TypeScript error: ${error}`,
      })
    }
  }

  if (input.texts > 0) {
    // Longueur et format sont déjà vérifiés à chaque appel de set_text ; on le trace pour l'admin.
    checks.push({ id: 'texts', label: 'Texts compliant (length, plain text)', ok: true, problem: '' })
  }
  return { checks, ok: checks.every((check) => check.ok), violations, granted }
}

export type RenderCheckInput = {
  /** Session ouverte AVANT l'essai de Claude (Preview.open), sur la zone de la demande. */
  session: Pick<VisualSession, 'before' | 'occurrences' | 'painted' | 'verify'>
  /** Zone de la session : un logotype est exempté du seuil de contraste (plancher 1,5:1). */
  logotype: boolean
  /** Le client a choisi une option `longer-text` : la ligne gagnée à 375 px est acceptée. */
  acceptsLongerText: boolean
  /**
   * Autres zones visées par la même demande (Maj + clic) : leur changement ne compte pas contre l'isolation de celle-ci.
   * Les contrôles du cadre, des lignes et du contraste ne portent que sur la zone de la session.
   */
  alsoChanged?: readonly string[]
}

export type RenderCheckResult = {
  checks: RawCheck[]
  ok: boolean
  /** Texte recouvert : avertissement non bloquant (décision 17). `step` pour le journal, `client` ajouté au message. */
  warning: CoverWarning | null
  verdict: VisualVerdict
}

/** Zones changées « id (375, 768 px) » d'un détail d'isolation, sans celles de `ignored`. */
function isolationWithout(isolation: VisualVerdict['isolation'], ignored: readonly string[]): VisualVerdict['isolation'] {
  if (!ignored.length) return isolation
  const zones = isolation.zones.filter((id) => !ignored.includes(id))
  const parts = [...(isolation.detail ?? '').matchAll(/([\w.-]+) \(([^)]*)\)/g)]
    .filter((match) => zones.includes(match[1]))
    .map((match) => match[0])
  return { ...isolation, ok: zones.length === 0, zones, detail: parts.join(', ') || undefined }
}

/**
 * Contrôles du rendu (couche 4 du POC) : recapture le brouillon (`session.verify()`), puis juge. À appeler seulement
 * quand runStaticChecks passe, une fois l'aperçu à jour (fichier CSS pris par le HMR, brouillon Sanity visible : voir
 * `settle` des réglages de l'aperçu).
 */
export async function runRenderChecks(input: RenderCheckInput): Promise<RenderCheckResult> {
  const { session } = input
  const verdict = await session.verify()
  const isolation = isolationWithout(verdict.isolation, input.alsoChanged ?? [])
  const checks: RawCheck[] = [
    {
      id: 'render',
      label: 'The page renders without error',
      ok: verdict.render.ok,
      detail: verdict.render.detail,
      problem: `The page no longer renders correctly: ${verdict.render.detail}.`,
    },
    {
      id: 'responsive',
      label: 'No overflow at 375, 768 and 1280 px',
      ok: verdict.responsive.ok,
      detail: verdict.responsive.detail,
      problem: `${verdict.responsive.detail}. The site must stay responsive: shorten the text or avoid fixed widths.`,
    },
    {
      id: 'isolation',
      label: 'The other elements of the page are intact',
      ok: isolation.ok,
      detail: isolation.detail,
      problem:
        `These other elements changed appearance: ${isolation.detail}. Stick to the selected element; ` +
        'a zone that contains others can only apply placement to them (margin, text-align, order, align-self, ' +
        'justify-self).',
    },
  ]
  // Placement des zones intérieures : permis, mais montré au client et à l'admin.
  if (verdict.isolation.placement) {
    checks.push({
      id: 'placement',
      label: 'Inner zones: placement only',
      ok: true,
      detail: verdict.isolation.placement,
      problem: '',
    })
  }
  // Chaque occurrence relevée de la zone (décision 18) : le cadre est bloquant, le texte recouvert est un avertissement.
  checks.push(frameCheck(session.occurrences, verdict.occurrences))
  const warning = coverWarning(session.occurrences, verdict.occurrences)
  // Lignes gagnées à 375 px par un texte réécrit : refusées sans l'accord du client.
  const lines = linesCheck(session.before, verdict.after, input.acceptsLongerText)
  if (lines) checks.push(lines)
  // Contraste WCAG sur le fond réel, au repos et dans chaque état forcé ; règles de couleur jugées sur leur effet
  // (décision 19) ; le logotype est exempté du seuil, pas du plancher de 1,5:1. Aucun accord du client ne les lève.
  const contrast = contrastCheck(session.painted, verdict.painted, input.logotype)
  if (contrast) checks.push(contrast)
  const unverifiable = unverifiableCheck(verdict.unmeasured, input.logotype)
  if (unverifiable) checks.push(unverifiable)
  // Chaque règle de couleur jugée aussi sur les textes qu'une règle plus précise lui reprend, et à 4,5 si elle est large.
  const reach = reachCheck(verdict.unreadable, input.logotype)
  if (reach) checks.push(reach)
  return { checks, ok: checks.every((check) => check.ok), warning, verdict }
}
