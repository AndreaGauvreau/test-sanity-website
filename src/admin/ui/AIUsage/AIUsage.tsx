'use client'

import type { HTMLAttributes, ReactNode, Ref } from 'react'
import { formatCost, formatIncluded, formatTokens } from '@/admin/core/contracts/format'
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

/**
 * Totaux d'une période. `costUsd` = coût FACTURÉ seulement (compte API du site) ; `includedUsd` = demandes passées par
 * l'abonnement Claude (moteur local), au prix de l'API, non facturées — montrées à part, jamais additionnées.
 */
export type AIUsageTotals = { inputTokens: number; outputTokens: number; costUsd: number; includedUsd?: number }

/** Note de bas de carte selon ce qui a été consommé : facturé, abonnement seulement, ou les deux. */
export const AI_USAGE_NOTES = {
  billed: "Billed on the site's own Claude API account. Kuartz doesn't resell AI.",
  included: "Used through your Claude subscription on the local engine: not billed. Kuartz doesn't resell AI.",
  mixed: "Cost is billed on the site's own Claude API account; use through your Claude subscription isn't. Kuartz doesn't resell AI.",
} as const

/** Note par défaut de la carte (facturé tant que rien n'est passé par l'abonnement, chargement compris). */
export function aiUsageNote(totals: Pick<AIUsageTotals, 'costUsd' | 'includedUsd'> | null): string {
  if (!totals || !((totals.includedUsd ?? 0) > 0)) return AI_USAGE_NOTES.billed
  return totals.costUsd > 0 ? AI_USAGE_NOTES.mixed : AI_USAGE_NOTES.included
}

export type AIUsageProps = Omit<HTMLAttributes<HTMLElement>, 'children' | 'title'> & {
  title?: ReactNode
  period?: AIUsagePeriod
  defaultPeriod?: AIUsagePeriod
  onPeriodChange?: (period: AIUsagePeriod) => void
  /** Totaux de la période (null pendant le chargement). */
  totals: AIUsageTotals | null
  /** Détail par fonctionnalité avec le modèle (Model usage). */
  features?: readonly AIUsageFeature[]
  /** Note de bas de carte (Caption, text/muted). Défaut : `aiUsageNote(totals)`. `null` pour la masquer. */
  note?: ReactNode
  loading?: boolean
  ref?: Ref<HTMLElement>
}

/**
 * Consommation IA du compte Claude du site (Figma « AI usage » 352:1557) : 384 px dans Figma, fluide ici ;
 * en-tête (icône ai, titre Label, période en Select 150 px), totaux Heading 2 (input, output, coût FACTURÉ), part
 * incluse dans l'abonnement Claude sur sa propre ligne (« ≈ $0.30 at API prices — included in your Claude
 * subscription »), détail par fonctionnalité (Model usage) et note. Chiffres formatés par le contrat.
 */
export function AIUsage({
  title = 'AI usage',
  period: periodProp,
  defaultPeriod = 'month',
  onPeriodChange,
  totals,
  features = [],
  note,
  loading,
  className,
  ref,
  ...rest
}: AIUsageProps) {
  const [period, setPeriod] = useControllableState<AIUsagePeriod>(periodProp, defaultPeriod, onPeriodChange)
  const busy = loading || totals == null
  const value = (text: string) => (busy ? '—' : text)
  const included = !busy ? (totals?.includedUsd ?? 0) : 0
  const shownNote = note === undefined ? aiUsageNote(busy ? null : totals) : note

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
      <div className={styles.summary}>
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
        {included > 0 ? <p className={styles.included}>{formatIncluded(included)}</p> : null}
      </div>
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
      {shownNote != null ? <p className={styles.note}>{shownNote}</p> : null}
    </section>
  )
}
