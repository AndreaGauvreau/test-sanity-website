import { notFound, redirect } from 'next/navigation'

import { requireSession } from '@/admin/core/auth/session'
import { articleSeoHref, findPage } from '@/admin/features/pages/lib/manifest'

// /admin/pages/<page>/slug : la page article n'a qu'un onglet propre (SEO, C6) → redirection.
type Props = { params: Promise<{ pageId: string }> }

export default async function ArticlePageRoute({ params }: Props) {
  await requireSession('page')
  const page = findPage((await params).pageId)
  if (!page?.article) notFound()
  redirect(articleSeoHref(page.id))
}
