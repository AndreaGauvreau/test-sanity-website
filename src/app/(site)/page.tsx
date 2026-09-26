import type { Metadata } from 'next'

import { ConduitSystem } from '@/components/sections/ConduitSystem/ConduitSystem'
import { CustomerStory } from '@/components/sections/CustomerStory/CustomerStory'
import { Faq } from '@/components/sections/Faq/Faq'
import { Features } from '@/components/sections/Features/Features'
import { GetStarted } from '@/components/sections/GetStarted/GetStarted'
import { Hero } from '@/components/sections/Hero/Hero'
import { Insights } from '@/components/sections/Insights/Insights'
import { Integrations } from '@/components/sections/Integrations/Integrations'
import { Performance } from '@/components/sections/Performance/Performance'
import { Testimonial } from '@/components/sections/Testimonial/Testimonial'
import { Tour } from '@/components/sections/Tour/Tour'
import { openGraphDefaults, siteName } from '@/lib/site'
import { sanityFetch } from '@/sanity/lib/live'
import { FAQS_QUERY, LATEST_POSTS_QUERY, PAGE_QUERY } from '@/sanity/lib/queries'

// Page « Dock Scheduling » du Figma. Tous les textes viennent du document unique
// « Page Dock Scheduling » de l'admin ; une section vide n'est pas affichée. Questions,
// témoignage et articles viennent de leurs collections.
export async function generateMetadata(): Promise<Metadata> {
  const { data: page } = await sanityFetch({ query: PAGE_QUERY, stega: false })
  if (!page) return { title: siteName }

  const { seoTitle: title, seoDescription: description } = page
  return {
    // Le modèle de titre du layout ne s'applique qu'aux pages des segments enfants.
    title: `${title} — ${siteName}`,
    description,
    openGraph: { ...openGraphDefaults, title, description },
  }
}

export default async function HomePage() {
  const [{ data: page }, { data: faqs }, { data: posts }] = await Promise.all([
    sanityFetch({ query: PAGE_QUERY }),
    sanityFetch({ query: FAQS_QUERY }),
    sanityFetch({ query: LATEST_POSTS_QUERY }),
  ])
  if (!page) return null

  return (
    <>
      {page.hero && <Hero data={page.hero} />}
      {page.features && <Features data={page.features} />}
      {page.system && <ConduitSystem data={page.system} />}
      {page.performance && <Performance data={page.performance} />}
      {page.customerStory && <CustomerStory data={page.customerStory} />}
      {page.testimonial && <Testimonial data={page.testimonial} />}
      {page.integrations && <Integrations data={page.integrations} />}
      {page.tour && <Tour data={page.tour} />}
      {page.faq && <Faq data={page.faq} items={faqs} />}
      {page.insights && <Insights data={page.insights} posts={posts} />}
      {page.getStarted && <GetStarted data={page.getStarted} />}
    </>
  )
}
