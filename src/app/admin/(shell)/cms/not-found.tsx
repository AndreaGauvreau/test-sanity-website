import Link from 'next/link'

import { ContentArea, EmptyState, buttonClassName, ButtonContent } from '@/admin/ui'

/** Collection inconnue (id absent du manifeste). */
export default function CollectionNotFound() {
  return (
    <ContentArea gap={24}>
      <EmptyState
        icon="database"
        title="This collection doesn't exist"
        description="Collections are defined in code by Kuartz. Pick one in the sidebar."
        action={
          <Link href="/admin" className={buttonClassName({ variant: 'secondary', size: 'small' })}>
            <ButtonContent size="small">Back to Overview</ButtonContent>
          </Link>
        }
      />
    </ContentArea>
  )
}
