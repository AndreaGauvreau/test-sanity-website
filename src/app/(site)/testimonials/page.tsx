import type { Metadata } from 'next'
import Link from 'next/link'
import { stegaClean } from 'next-sanity'

import { RenderStamp } from '@/components/RenderStamp'
import { SiteScripts } from '@/components/site-scripts/SiteScripts'
import { PageHeading } from '@/components/ui/PageHeading/PageHeading'
import { editAttrs } from '@/lib/editor/preview'
import { TESTIMONIALS_PAGE_DEFAULTS as DEFAULTS } from '@/lib/page-defaults'
import { pageMetadata } from '@/lib/seo'
import { sanityFetch } from '@/sanity/lib/live'
import { SITE_SETTINGS_QUERY, TESTIMONIALS_PAGE_QUERY, TESTIMONIALS_QUERY } from '@/sanity/lib/queries'

import styles from './testimonials.module.css'

// SEO de /testimonials (C2) : document unique testimonialsPage, repli sur son titre puis sur les réglages du site.
export async function generateMetadata(): Promise<Metadata> {
  const [{ data: page }, { data: settings }] = await Promise.all([
    sanityFetch({ query: TESTIMONIALS_PAGE_QUERY, stega: false }),
    sanityFetch({ query: SITE_SETTINGS_QUERY, stega: false }),
  ])
  return pageMetadata({ settings, seo: page?.seo, defaultTitle: page?.content?.title || DEFAULTS.title })
}

// Liste des témoignages (id 'testimonials' dans src/admin.config.ts), dans l'ordre manuel de la collection.
// Pas de maquette : en-tête des sections (PageHeading) et cartes de citation sur fond clair, dont la
// typographie reprend celle de la section Témoignage de l'accueil (guillemets ajoutés par le site).
export default async function TestimonialsPage() {
  const [{ data: testimonials }, { data: page }, { data: settings }] = await Promise.all([
    sanityFetch({ query: TESTIMONIALS_QUERY }),
    sanityFetch({ query: TESTIMONIALS_PAGE_QUERY }),
    sanityFetch({ query: SITE_SETTINGS_QUERY, stega: false }),
  ])
  const content = page?.content

  return (
    <section className={styles.page} aria-labelledby="testimonials-title" {...editAttrs(null, { doc: 'testimonialsPage' })}>
      <SiteScripts scripts={settings?.scripts} page="testimonials" placements={['headEnd', 'bodyStart']} />
      <PageHeading
        id="testimonials-title"
        className={styles.heading}
        eyebrow={content?.eyebrow || DEFAULTS.eyebrow}
        title={content?.title || DEFAULTS.title}
        lede={content?.lede || DEFAULTS.lede}
      />
      {testimonials.length === 0 ? (
        <p>{content?.emptyText || DEFAULTS.emptyText}</p>
      ) : (
        // role="list" : Safari retire la sémantique de liste quand list-style vaut none.
        <ul className={styles.grid} role="list">
          {testimonials.map((testimonial) => {
            const slug = stegaClean(testimonial.slug)
            return (
              <li key={testimonial._id} {...editAttrs(null, { doc: testimonial._id })}>
                <figure className={styles.card}>
                  <blockquote className={styles.quote}>
                    <p>“{testimonial.quote}”</p>
                  </blockquote>
                  <figcaption className={styles.author}>
                    {/* Le nom mène à la page du témoignage ; son lien couvre toute la carte. */}
                    {slug ? (
                      <Link href={`/testimonials/${slug}`} className={styles.link}>
                        {testimonial.name}
                      </Link>
                    ) : (
                      <span className={styles.name}>{testimonial.name}</span>
                    )}
                    <span className={styles.role}>
                      {testimonial.role && <>{testimonial.role}, </>}
                      {testimonial.company}
                    </span>
                  </figcaption>
                </figure>
              </li>
            )
          })}
        </ul>
      )}
      <RenderStamp />
      <SiteScripts scripts={settings?.scripts} page="testimonials" placements={['bodyEnd']} />
    </section>
  )
}
