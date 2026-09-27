import type { Metadata } from 'next'

import { ArticleSeoScreen } from '@/admin/features/pages/screens'
import { pageTitle } from '@/admin/features/pages/metadata'

// C6 · Pages › /<page> › slug: (page article d'une page listing) — onglet SEO.
type Props = { params: Promise<{ pageId: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: pageTitle((await params).pageId, 'Article SEO') }
}

export default function ArticleSeoRoute({ params }: Props) {
  return <ArticleSeoScreen params={params} />
}
