'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import type { UsagePeriod, UsageSummary } from '@/admin/core/usage/aggregate'
import { AIUsage } from '@/admin/ui'

export type UsagePeriodCardProps = {
  period: UsagePeriod
  summary: Pick<UsageSummary, 'totals' | 'byFeature'>
  className?: string
}

/**
 * Carte « AI usage » de B5 (AIUsage du kit) : le choix de période change l'URL (`?period=`), le Server Component
 * relit le journal ; pendant la transition, la carte affiche son état de chargement.
 */
export function UsagePeriodCard({ period, summary, className }: UsagePeriodCardProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [pending, startTransition] = useTransition()
  const [selected, setSelected] = useState<UsagePeriod>(period)

  // La période affichée suit l'URL quand la navigation est terminée (retour arrière du navigateur compris).
  const [lastPeriod, setLastPeriod] = useState(period)
  if (lastPeriod !== period) {
    setLastPeriod(period)
    setSelected(period)
  }

  return (
    <AIUsage
      className={className}
      period={selected}
      onPeriodChange={(next) => {
        setSelected(next)
        startTransition(() => {
          router.replace(next === 'month' ? pathname : `${pathname}?period=${next}`, { scroll: false })
        })
      }}
      loading={pending}
      totals={summary.totals}
      features={summary.byFeature.map((f) => ({ id: f.feature, label: f.label, usage: f.usage }))}
    />
  )
}
