import type { Metadata } from 'next'

import { PageContentScreen } from '@/admin/features/pages/screens'
import { pageTitle } from '@/admin/features/pages/metadata'

// C1 · Pages › <page> — onglet Content. Route mince : garde, données et rendu dans features/pages.
// Props typées à la main : les types de routes générés peuvent être en retard sur le dev.
type Props = { params: Promise<{ pageId: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: pageTitle((await params).pageId, 'Content') }
}

export default function PageContentRoute({ params }: Props) {
  return <PageContentScreen params={params} />
}
