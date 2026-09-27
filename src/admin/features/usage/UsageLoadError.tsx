import { ContentArea, EmptyState, PageHeader } from '@/admin/ui'

/** B5 : journal illisible (Sanity injoignable, jeton de lecture absent) — message dans l'écran. Composant pur. */
export function UsageLoadError() {
  return (
    <ContentArea gap={24}>
      <PageHeader title="Usage" meta="AI consumption on the site's own Claude account: model, input and output tokens, cost." />
      <EmptyState icon="warning" title="Couldn't load AI usage" description="Sanity isn't responding. Reload the page in a moment." role="alert" />
    </ContentArea>
  )
}
