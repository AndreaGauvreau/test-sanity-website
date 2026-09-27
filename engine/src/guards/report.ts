import type { CheckId, CheckResult } from '../../../src/admin/core/contracts/engine'
import type { CoverWarning, RawCheck } from './checks'

/**
 * Contrôles tels que les voit l'admin (contrat `CheckResult`, en anglais) à partir des contrôles internes (`RawCheck`).
 *
 * Les contrôles internes portent les textes du POC traduits en anglais : `label` et `detail` (relevé technique, pour
 * Kuartz et le journal du moteur), `problem` = consigne renvoyée à Claude au 2e essai. Rien de cela ne part tel quel au
 * client : ici, un libellé anglais fixe par contrôle, jamais `problem`, jamais le détail technique. Seul l'avertissement
 * du texte recouvert porte un détail pour le client (phrase de coverWarning).
 */

/** Libellés affichés au client (« Checks: contrast ✓ · mobile ✓ »), un par contrôle du contrat. Gelé. */
export const CHECK_LABELS: Readonly<Record<CheckId, string>> = Object.freeze({
  scope: 'Only the allowed files changed',
  tokens: 'Design system respected',
  types: 'Code compiles',
  render: 'Page renders',
  responsive: 'No overflow on mobile, tablet or desktop',
  isolation: 'Rest of the page unchanged',
  frame: 'Element stays in its frame',
  lines: 'No extra line on mobile',
  contrast: 'Contrast',
  unverifiable: 'Every style change is visible',
  reach: 'Contrast everywhere the style applies',
  cover: 'Covered text',
})

/**
 * Id interne (RawCheck.id, repris du POC) → id du contrat. `texts` (trace des textes déjà validés par set_text) et
 * `placement` (zones intérieures seulement replacées, informatif) n'ont pas d'id dans le contrat : ils restent internes.
 */
const CONTRACT_IDS: Readonly<Record<string, CheckId>> = Object.freeze({
  scope: 'scope',
  tokens: 'tokens',
  types: 'types',
  render: 'render',
  responsive: 'responsive',
  isolation: 'isolation',
  frame: 'frame',
  lines: 'lines',
  contrast: 'contrast',
  'contrast-unverifiable': 'unverifiable',
  'contrast-reach': 'reach',
})

/** Id du contrat d'un contrôle interne, ou null s'il reste interne. */
export function contractCheckId(id: string): CheckId | null {
  return Object.hasOwn(CONTRACT_IDS, id) ? CONTRACT_IDS[id] : null
}

/**
 * Contrôles montrés au client : ids du contrat, libellés anglais, ni consigne à Claude ni détail technique. L'ordre des
 * contrôles internes est gardé ; l'avertissement du texte recouvert (décision 17 : non bloquant) vient en dernier.
 */
export function publicChecks(raw: readonly RawCheck[], warning: CoverWarning | null = null): CheckResult[] {
  const results: CheckResult[] = []
  for (const check of raw) {
    const id = contractCheckId(check.id)
    if (id) results.push({ id, label: CHECK_LABELS[id], ok: check.ok })
  }
  if (warning?.client) {
    results.push({ id: 'cover', label: CHECK_LABELS.cover, ok: true, warning: true, detail: warning.client })
  }
  return results
}

/**
 * Consignes renvoyées à Claude pour son 2e essai : le `problem` de chaque contrôle en échec, dans l'ordre (texte du POC
 * traduit en anglais ; les textes cités y sont neutralisés par quoteData et cités entre “ ”). À placer dans le message de reprise d'engine-claude.
 */
export function retryProblems(raw: readonly RawCheck[]): string[] {
  return raw.filter((check) => !check.ok && check.problem).map((check) => check.problem)
}
