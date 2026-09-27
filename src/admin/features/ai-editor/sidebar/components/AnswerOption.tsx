import type { QuestionTone } from '@/admin/core/contracts'
import styles from './AnswerOption.module.css'

export type AnswerOptionKind = QuestionTone | 'other'

/** Ton dit au lecteur d'écran quand le libellé ne le dit pas déjà (la couleur seule ne suffit pas). */
function spokenTone(kind: AnswerOptionKind, label: string): string | null {
  if (kind === 'recommended' && !/\brecommended\b/i.test(label)) return 'recommended'
  if (kind === 'discouraged' && !/not recommended/i.test(label)) return 'not recommended'
  return null
}

/**
 * Option de réponse (Figma « Answer option ») : le ton est porté par la couleur du point (vert / gris / rouge),
 * jamais par un émoji ; l'option 🔴 montre sa valeur en dur « prop: value ». « Other answer… » n'a pas de point.
 * Bouton `aria-pressed` (choix courant quand plusieurs questions attendent toutes leur réponse). Pur.
 */
export function AnswerOption({
  kind,
  label,
  description,
  hardcoded,
  selected,
  disabled,
  onSelect,
}: {
  kind: AnswerOptionKind
  label: string
  description?: string
  /** « font-size: 60px » (🔴 seulement). */
  hardcoded?: string | null
  selected?: boolean
  disabled?: boolean
  onSelect: () => void
}) {
  const tone = spokenTone(kind, label)
  return (
    <button
      type="button"
      className={styles.option}
      data-kind={kind}
      aria-pressed={selected ?? false}
      disabled={disabled}
      onClick={onSelect}
    >
      {kind !== 'other' ? <span className={styles.dot} aria-hidden="true" /> : null}
      <span className={styles.body}>
        <span className={styles.label}>
          {label}
          {tone ? <span className="kz-visually-hidden"> ({tone})</span> : null}
        </span>
        {description ? <span className={styles.description}>{description}</span> : null}
        {hardcoded ? <code className={styles.code}>{hardcoded}</code> : null}
      </span>
    </button>
  )
}
