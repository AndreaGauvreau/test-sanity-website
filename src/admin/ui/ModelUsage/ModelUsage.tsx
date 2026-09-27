import type { HTMLAttributes, Ref } from 'react'
import type { Usage } from '@/admin/core/contracts/engine'
import { formatCost, formatTokens, formatUsageLine, modelLabel } from '@/admin/core/contracts/format'
import { Icon } from '../icons'
import { cx } from '../utils/cx'
import styles from './ModelUsage.module.css'

export type ModelUsageSize = 'default' | 'small'

/** Consommation affichée : le strict nécessaire d'un `Usage` du contrat. */
export type ModelUsageValue = Pick<Usage, 'inputTokens' | 'outputTokens' | 'costUsd'> & {
  /** Id du modèle (« claude-sonnet-5 ») ou libellé déjà lisible. */
  model?: string
  /** estimated : coût calculé d'après les jetons vus (préfixé « ~ »). */
  costKind?: Usage['costKind']
}

export type ModelUsageProps = Omit<HTMLAttributes<HTMLSpanElement>, 'children'> & {
  /** Consommation (tokens input / output, coût). Absente : seul le modèle s'affiche. */
  usage?: ModelUsageValue | null
  /** Modèle affiché (id ou libellé) ; défaut : `usage.model`. */
  model?: string
  /** default = Body Small (Usage, AI usage) ; small = Caption (en-têtes, lignes). */
  size?: ModelUsageSize
  /** Figma « Show model ». */
  showModel?: boolean
  /** Figma « Show usage ». */
  showUsage?: boolean
  ref?: Ref<HTMLSpanElement>
}

/**
 * Modèle + consommation (Figma « Model usage » 427:1565) : logo Claude (brand/claude) + nom du modèle
 * (modelLabel), puis « 18.2k input · 1.1k output · $0.07 » (formatTokens / formatCost du contrat).
 * Composant pur (utilisable côté serveur).
 */
export function ModelUsage({
  usage,
  model: modelProp,
  size = 'default',
  showModel = true,
  showUsage = true,
  className,
  ref,
  ...rest
}: ModelUsageProps) {
  const model = modelProp ?? usage?.model
  const label = model ? modelLabel(model) : null
  const estimated = usage?.costKind === 'estimated'
  const line = usage ? `${formatUsageLine(usage)}${estimated ? ' (estimated)' : ''}` : undefined
  return (
    <span ref={ref} data-size={size} className={cx(styles.root, styles[size], className)} {...rest}>
      {showModel && label ? (
        <span className={styles.model}>
          <Icon name="claude" size={12} className={styles.mark} />
          <span className={styles.name}>{label}</span>
        </span>
      ) : null}
      {showUsage && usage ? (
        // Le texte visible est découpé pour la couleur ; le nom accessible reprend la ligne du contrat.
        <span className={styles.usage} title={line}>
          <span className="kz-visually-hidden">{line}</span>
          <span aria-hidden="true" className={styles.parts}>
            <span className={styles.tokens}>{formatTokens(usage.inputTokens)} input</span>
            <span className={styles.sep}>·</span>
            <span className={styles.tokens}>{formatTokens(usage.outputTokens)} output</span>
            <span className={styles.sep}>·</span>
            <span className={styles.cost}>
              {estimated ? '~' : ''}
              {formatCost(usage.costUsd)}
            </span>
          </span>
        </span>
      ) : null}
    </span>
  )
}
