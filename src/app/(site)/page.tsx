import type { Metadata } from 'next'

import { SiteScripts } from '@/components/site-scripts/SiteScripts'
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
import { pageMetadata } from '@/lib/seo'
import { sanityFetch } from '@/sanity/lib/live'
import { FAQS_QUERY, LATEST_POSTS_QUERY, PAGE_QUERY, SITE_SETTINGS_QUERY } from '@/sanity/lib/queries'

// Page « Dock Scheduling » du Figma (id 'home' dans src/admin.config.ts). Tous les textes viennent du
// document unique « dockSchedulingPage » ; une section vide n'est pas affichée. Questions, témoignage
// et articles viennent de leurs collections.
export async function generateMetadata(): Promise<Metadata> {
  const [{ data: page }, { data: settings }] = await Promise.all([
    sanityFetch({ query: PAGE_QUERY, stega: false }),
    sanityFetch({ query: SITE_SETTINGS_QUERY, stega: false }),
  ])
  // Le modèle de titre du layout ne s'applique qu'aux segments enfants : suffixe ajouté ici.
  return pageMetadata({ settings, seo: page?.seo, segmentRoot: true })
}

export default async function HomePage() {
  const [{ data: page }, { data: faqs }, { data: posts }, { data: settings }] = await Promise.all([
    sanityFetch({ query: PAGE_QUERY }),
    sanityFetch({ query: FAQS_QUERY }),
    sanityFetch({ query: LATEST_POSTS_QUERY }),
    sanityFetch({ query: SITE_SETTINGS_QUERY, stega: false }),
  ])
  if (!page) return null

  return (
    <>
      <SiteScripts scripts={settings?.scripts} page="home" placements={['headEnd', 'bodyStart']} />
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
      <SiteScripts scripts={settings?.scripts} page="home" placements={['bodyEnd']} />
    </>
  )
}
