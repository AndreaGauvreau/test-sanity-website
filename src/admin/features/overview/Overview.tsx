import Link from 'next/link'
import { Suspense, type ReactNode } from 'react'

import adminConfig from '@/admin.config'
import type { Session } from '@/admin/core/contracts'
import { ContentArea, PageHeader, StatCard, type IconName } from '@/admin/ui'

import skeleton from '../general/skeleton.module.css'
import { teamCardText } from '../team/members'
import { AutoRefresh } from './AutoRefresh'
import { loadFrameability, loadMonthUsage, loadPublishStatus, loadTeamCard } from './data'
import { contentCard, hintText, productionCard, publishFingerprint, usageCard, type CardModel } from './format'
import { SitePreview } from './SitePreview'
import { TimeText } from './TimeText'
import styles from './overview.module.css'

/**
 * B1 · Overview (Figma 359:696, route /admin) : l'état du site en un coup d'œil. Server Component ; chaque groupe de
 * cartes se charge dans son propre Suspense (une source lente ou en panne ne bloque pas les autres).
 * Clic sur une carte (proposé par le Figma) : Production → E2, Content → E1, AI usage → B5, Team → B4 (client seulement).
 */
export function Overview({ session }: { session: Session }) {
  return (
    <ContentArea gap={24} className={styles.content}>
      <PageHeader title="Overview" meta={adminConfig.site.domain} />
      <div className={styles.stats}>
        <Suspense fallback={<><CardSkeleton /><CardSkeleton /></>}>
          <PublishCards session={session} />
        </Suspense>
        <Suspense fallback={<CardSkeleton />}>
          <UsageCard />
        </Suspense>
        <Suspense fallback={<CardSkeleton />}>
          <TeamCard session={session} />
        </Suspense>
      </div>
      <Suspense fallback={<SitePreview url={adminConfig.site.url} domain={adminConfig.site.domain} />}>
        <Preview />
      </Suspense>
    </ContentArea>
  )
}

function CardSkeleton() {
  return <div className={`${skeleton.block} ${styles.cardSkeleton}`} aria-hidden="true" />
}

function Hint({ card }: { card: CardModel }) {
  if ('text' in card.hint) return <>{card.hint.text}</>
  return (
    <>
      {card.hint.prefix}
      <TimeText iso={card.hint.iso} format={card.hint.format} initial={hintText({ ...card.hint, prefix: '', suffix: '' }, Date.now())} />
      {card.hint.suffix}
    </>
  )
}

function Card({ card, label, icon, href, linkLabel }: { card: CardModel; label: string; icon: IconName; href?: string; linkLabel?: string }) {
  const value: ReactNode =
    card.tone === 'error' ? (
      <span className={styles.valueError}>{card.value}</span>
    ) : card.tone === 'muted' ? (
      <span className={styles.valueMuted}>{card.value}</span>
    ) : (
      card.value
    )
  const stat = (
    <StatCard
      className={styles.card}
      data-tone={card.tone}
      label={label}
      icon={icon}
      value={value}
      hint={<Hint card={card} />}
    />
  )
  if (!href) return <div className={styles.cell}>{stat}</div>
  return (
    <Link href={href} className={styles.cardLink}>
      {stat}
      {linkLabel ? <span className="kz-visually-hidden">{` — ${linkLabel}`}</span> : null}
    </Link>
  )
}

async function PublishCards({ session }: { session: Session }) {
  const status = await loadPublishStatus(session)
  return (
    <>
      <Card card={productionCard(status)} label="Production" icon="globe" href="/admin/publish/versions" linkLabel="open Versions" />
      <Card card={contentCard(status)} label="Content" icon="page" href="/admin/publish" linkLabel="open Publish" />
      <AutoRefresh fingerprint={publishFingerprint(status)} />
    </>
  )
}

async function UsageCard() {
  const totals = await loadMonthUsage()
  return <Card card={usageCard(totals)} label="AI usage this month" icon="ai" href="/admin/settings/usage" linkLabel="open Usage" />
}

async function TeamCard({ session }: { session: Session }) {
  const data = await loadTeamCard(session)
  const card: CardModel = data.summary
    ? { ...teamCardText(data.summary), hint: { text: teamCardText(data.summary).hint }, tone: 'default' }
    : data.noToken
      ? { value: '—', hint: { text: 'Sign in with Sanity to see the team' }, tone: 'muted' }
      : { value: '—', hint: { text: 'Managed in Sanity' }, tone: 'muted' }
  return <Card card={card} label="Team" icon="team" href={data.clickable ? '/admin/settings/team' : undefined} linkLabel="open Team" />
}

async function Preview() {
  const frameable = await loadFrameability()
  return <SitePreview url={adminConfig.site.url} domain={adminConfig.site.domain} frameable={frameable} />
}
