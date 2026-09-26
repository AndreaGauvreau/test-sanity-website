import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { stegaBrand } from 'next-sanity'

import { Insights } from '@/components/sections/Insights/Insights'
import { sanityFetch } from '@/sanity/lib/live'
import { LATEST_POSTS_QUERY } from '@/sanity/lib/queries'
import { insights } from '@/sanity/seed/sections/insights'

// Aperçu de développement : la section seule, avec les textes du Figma et les vrais
// articles du Blog. Absent du build de production.
export const metadata: Metadata = { title: 'Aperçu — Insights', robots: { index: false } }

export default async function InsightsPreview() {
  if (process.env.NODE_ENV === 'production') notFound()
  const { data: posts } = await sanityFetch({ query: LATEST_POSTS_QUERY })
  return <Insights data={stegaBrand(insights)} posts={posts} />
}
