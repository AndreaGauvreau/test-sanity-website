import Link from 'next/link'

import { describeCost, formatCost, formatIncluded, formatTokens, INCLUDED_LABEL, isIncluded } from '@/admin/core/contracts/format'
import { USAGE_PERIOD_LABELS, type UsagePeriod, type UsageRow, type UsageSummary } from '@/admin/core/usage/aggregate'
import { Avatar, ContentArea, PageHeader, StatCard, Table, TableCell, TableHeaderCell, TableRow, Tag } from '@/admin/ui'

import { AiSettingsCard } from './AiSettingsCard'
import { ClaudeConnectionCard } from './ClaudeConnectionCard'
import { formatWhen, requestText, sinceLaunchHint, statusNote } from './format'
import { UsagePeriodCard } from './UsagePeriodCard'
import styles from './Usage.module.css'

export type UsageScreenProps = {
  period: UsagePeriod
  summary: UsageSummary
  allTime: UsageSummary
  rows: { items: UsageRow[]; total: number }
  limit: number
  now: Date
  /** Date de mise en ligne du site (`adminConfig.site.launchedAt`, ISO) pour « online since » ; absente → première demande. */
  launchedAt?: string
  /**
   * Carte « Claude connection » (droit ai.access : Kuartz et client) ; absente = pas de carte (editor).
   * `adminLocal` : admin ouvert sur 127.0.0.1 / localhost (seul cas où l'abonnement de la machine est proposé).
   */
  claudeConnection?: { adminLocal: boolean }
  /** Carte « AI settings » (modèle et effort de l'éditeur IA, même droit ai.access) ; false / absente = pas de carte. */
  aiSettings?: boolean
}

const META = "AI consumption on the site's own Claude account: model, input and output tokens, cost."
export const EMPTY_USAGE = 'No AI usage in this period.'

/**
 * Cellule « Cost » d'une demande : son coût facturé (« $0.16 », « ~$0.50 » estimé) ; passée par l'abonnement Claude
 * (moteur local) : « Included » + prix API équivalent en secondaire, jamais présenté comme un coût facturé.
 */
function CostCell({ row }: { row: Pick<UsageRow, 'costUsd' | 'costKind' | 'access'> }) {
  if (isIncluded(row)) {
    return (
      <span className={styles.included} title={formatIncluded(row.costUsd)}>
        <span aria-hidden="true" className={styles.includedLabel}>
          {INCLUDED_LABEL}
        </span>
        <span aria-hidden="true" className={styles.includedPrice}>
          ≈ {formatCost(row.costUsd)}
        </span>
        <span className="kz-visually-hidden">{describeCost(row)}</span>
      </span>
    )
  }
  if (row.costKind === 'estimated') {
    return (
      <span title="Estimated from the tokens seen">
        ~{formatCost(row.costUsd)}
        <span className="kz-visually-hidden"> (estimated)</span>
      </span>
    )
  }
  return <>{formatCost(row.costUsd)}</>
}

/**
 * B5 · Site Settings › Usage (Kuartz et client) : carte AI usage (période, totaux, par fonctionnalité avec le
 * modèle), carte Since launch, tableau Recent requests. Server Component : seules les données agrégées (sans
 * jeton, sans e-mail) partent vers la carte client. Jamais de crédits, de plafond ni d'alerte (Figma B5).
 * Coûts : seul le FACTURÉ (clé API) est additionné ; ce qui est passé par l'abonnement Claude est montré à part.
 */
export function UsageScreen({ period, summary, allTime, rows, limit, now, launchedAt, claudeConnection, aiSettings }: UsageScreenProps) {
  const nextLimit = Math.min(limit + 50, 500)
  const moreHref = `?${new URLSearchParams({ ...(period !== 'month' ? { period } : {}), limit: String(nextLimit) })}`
  const sinceLaunch = sinceLaunchHint(allTime, launchedAt)

  return (
    <ContentArea gap={24}>
      <PageHeader title="Usage" meta={META} />

      <div className={styles.cards}>
        <UsagePeriodCard period={period} summary={summary} className={styles.card} />
        <StatCard
          icon="history"
          label="Since launch"
          value={formatCost(allTime.totals.costUsd)}
          hint={
            allTime.totals.includedUsd > 0 ? (
              <>
                <span className={styles.hintLine}>{sinceLaunch}</span>
                <span className={styles.hintIncluded}>{formatIncluded(allTime.totals.includedUsd)}</span>
              </>
            ) : (
              sinceLaunch
            )
          }
          className={styles.card}
        />
      </div>

      {claudeConnection ? <ClaudeConnectionCard adminLocal={claudeConnection.adminLocal} /> : null}
      {aiSettings ? <AiSettingsCard /> : null}

      <section className={styles.requests} aria-labelledby="usage-requests-title">
        <div className={styles.requestsHeader}>
          <h2 id="usage-requests-title" className={styles.requestsTitle}>
            Recent requests
          </h2>
          <span className={styles.requestsPeriod}>{USAGE_PERIOD_LABELS[period]}</span>
        </div>
        {rows.items.length === 0 ? (
          <p className={styles.empty} role="status">
            {EMPTY_USAGE}
          </p>
        ) : (
          <div className={styles.tableWrap}>
            <Table aria-labelledby="usage-requests-title">
              <thead>
                <tr>
                  <TableHeaderCell width={110}>When</TableHeaderCell>
                  <TableHeaderCell width={130}>Who</TableHeaderCell>
                  <TableHeaderCell width={110}>Feature</TableHeaderCell>
                  <TableHeaderCell>Request</TableHeaderCell>
                  <TableHeaderCell width={130}>Model</TableHeaderCell>
                  <TableHeaderCell width={96}>Input</TableHeaderCell>
                  <TableHeaderCell width={96}>Output</TableHeaderCell>
                  <TableHeaderCell width={90}>Cost</TableHeaderCell>
                </tr>
              </thead>
              <tbody>
                {rows.items.map((row) => {
                  const note = statusNote(row.status)
                  const request = requestText(row)
                  return (
                    <TableRow key={row.id} hover={false}>
                      <TableCell>
                        <time dateTime={row.createdAt}>{formatWhen(row.createdAt, now)}</time>
                      </TableCell>
                      <TableCell type="user" avatar={<Avatar name={row.user.name} size={20} tone={row.user.role === 'kuartz' ? 'blue' : 'green'} decorative />}>
                        {row.user.name}
                      </TableCell>
                      <TableCell type="tag">
                        <Tag tone={row.feature === 'editor' ? 'info' : 'neutral'}>{row.featureLabel}</Tag>
                      </TableCell>
                      <TableCell title={request}>
                        <span className={styles.request}>{request}</span>
                        {note ? <span className={styles.status}> · {note}</span> : null}
                      </TableCell>
                      <TableCell type="model">{row.modelLabel}</TableCell>
                      <TableCell>{formatTokens(row.inputTokens)}</TableCell>
                      <TableCell>{formatTokens(row.outputTokens)}</TableCell>
                      <TableCell>
                        <CostCell row={row} />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </tbody>
            </Table>
          </div>
        )}
        {rows.total > rows.items.length ? (
          <div className={styles.more}>
            <span>
              Showing {rows.items.length} of {rows.total} requests
            </span>
            {rows.items.length < 500 ? (
              <Link href={moreHref} scroll={false} data-kz-link="">
                Show more
              </Link>
            ) : null}
          </div>
        ) : null}
      </section>
    </ContentArea>
  )
}
