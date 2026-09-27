import type { Metadata } from 'next'

import { PageSeoScreen } from '@/admin/features/pages/screens'
import { pageTitle } from '@/admin/features/pages/metadata'

// C2 · Pages › <page> — onglet SEO.
type Props = { params: Promise<{ pageId: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: pageTitle((await params).pageId, 'SEO') }
}

export default function PageSeoRoute({ params }: Props) {
  return <PageSeoScreen params={params} />
}
