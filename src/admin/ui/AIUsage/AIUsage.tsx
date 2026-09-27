'use client'

import type { HTMLAttributes, ReactNode, Ref } from 'react'
import { formatCost, formatTokens } from '@/admin/core/contracts/format'
import { Icon } from '../icons'
import { ModelUsage, type ModelUsageValue } from '../ModelUsage'
import { Select } from '../Select'
import { cx } from '../utils/cx'
import { useControllableState } from '../utils/useControllableState'
import styles from './AIUsage.module.css'

export type AIUsagePeriod = 'month' | '3-months' | 'all-time'

export const AI_USAGE_PERIODS: ReadonlyArray<{ value: AIUsagePeriod; label: string }> = [
  { value: 'month', label: 'This month' },
  { value: '3-months', label: 'Last 3 months' },
  { value: 'all-time', label: 'Since launch' },
]

export type AIUsageFeature = {
  id?: string
  /** « AI editor », « Ask AI ». */
  label: ReactNode
  usage: ModelUsageValue
}

export type AIUsageProps = Omit<HTMLAttributes<HTMLElement>, 'children' | 'title'> & {
  title?: ReactNode
  period?: AIUsagePeriod
  defaultPeriod?: AIUsagePeriod
  onPeriodChange?: (period: AIUsagePeriod) => void
  /** Totaux de la période (null pendant le chargement). */
  totals: { inputTokens: number; outputTokens: number; costUsd: number } | null
  /** Détail par fonctionnalité avec le modèle (Model usage). */
  features?: readonly AIUsageFeature[]
  /** Note de bas de carte (Caption, text/muted). `null` pour la masquer. */
  note?: ReactNode
  loading?: boolean
  ref?: Ref<HTMLElement>
}

/**
 * Consommation IA du compte Claude du site (Figma « AI usage » 352:1557) : 384 px dans Figma, fluide ici ;
 * en-tête (icône ai, titre Label, période en Select 150 px), totaux Heading 2 (input, output, coût),
 * détail par fonctionnalité (Model usage) et note. Chiffres formatés par le contrat (formatTokens, formatCost).
 */
export function AIUsage({
  title = 'AI usage',
  period: periodProp,
  defaultPeriod = 'month',
  onPeriodChange,
  totals,
  features = [],
  note = "Billed on the site's own Claude API account. Kuartz doesn't resell AI.",
  loading,
  className,
  ref,
  ...rest
}: AIUsageProps) {
  const [period, setPeriod] = useControllableState<AIUsagePeriod>(periodProp, defaultPeriod, onPeriodChange)
  const busy = loading || totals == null
  const value = (text: string) => (busy ? '—' : text)

  return (
    <section ref={ref} aria-busy={busy || undefined} className={cx(styles.card, className)} {...rest}>
      <div className={styles.header}>
        <Icon name="ai" size={16} set={18} />
        <h3 className={styles.title}>{title}</h3>
        <Select<AIUsagePeriod>
          label="Period"
          hideLabel
          options={AI_USAGE_PERIODS}
          value={period}
          onValueChange={setPeriod}
          placement="bottom-end"
          className={styles.period}
        />
      </div>
      <dl className={styles.totals}>
        <div className={styles.total}>
          <dt className={styles.totalLabel}>Input tokens</dt>
          <dd className={styles.totalValue}>{value(formatTokens(totals?.inputTokens ?? 0))}</dd>
        </div>
        <div className={styles.total}>
          <dt className={styles.totalLabel}>Output tokens</dt>
          <dd className={styles.totalValue}>{value(formatTokens(totals?.outputTokens ?? 0))}</dd>
        </div>
        <div className={styles.total}>
          <dt className={styles.totalLabel}>Cost</dt>
          <dd className={styles.totalValue}>{value(formatCost(totals?.costUsd ?? 0))}</dd>
        </div>
      </dl>
      {!busy ? (
        features.length > 0 ? (
          <ul className={styles.byFeature} aria-label="Usage by feature">
            {features.map((feature, i) => (
              <li key={feature.id ?? i} className={styles.row}>
                <span className={styles.feature}>{feature.label}</span>
                <ModelUsage usage={feature.usage} />
              </li>
            ))}
          </ul>
        ) : (
          <p className={cx(styles.byFeature, styles.empty)}>No AI usage in this period.</p>
        )
      ) : null}
      {note != null ? <p className={styles.note}>{note}</p> : null}
    </section>
  )
}
