import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { stegaClean } from 'next-sanity'
import type { ComponentProps } from 'react'

import { RenderStamp } from '@/components/RenderStamp'
import { Testimonial } from '@/components/sections/Testimonial/Testimonial'
import { SiteScripts } from '@/components/site-scripts/SiteScripts'
import { Button } from '@/components/ui/Button/Button'
import { PageHeading } from '@/components/ui/PageHeading/PageHeading'
import { testimonialTemplateValues } from '@/lib/article-values'
import { editAttrs } from '@/lib/editor/preview'
import { TESTIMONIALS_PAGE_DEFAULTS } from '@/lib/page-defaults'
import { articleMetadata, DEFAULT_TESTIMONIAL_TEMPLATE } from '@/lib/seo'
import { sanityFetch } from '@/sanity/lib/live'
import {
  ARTICLE_SEO_QUERY,
  SITE_SETTINGS_QUERY,
  TESTIMONIAL_QUERY,
  TESTIMONIAL_SLUGS_QUERY,
  TESTIMONIALS_PAGE_QUERY,
} from '@/sanity/lib/queries'

import styles from './testimonial.module.css'

/** Modèle SEO des pages témoignage (C6) : id fixe, sans point (un id avec un point serait privé). */
const ARTICLE_SEO_ID = 'articleSeo-testimonial'

/** Données de la section Témoignage (textes marqués stega comme ceux lus dans Sanity). */
type SectionData = ComponentProps<typeof Testimonial>['data']
type SectionText = SectionData['title']

/** Libellé du bouton vers l'étude de cas : celui de la section Témoignage de l'accueil (seed du Figma). */
const CASE_STUDY_LABEL = 'Read the case study'

// Témoignages pré-générés au build ; un témoignage publié ensuite est généré à la première visite.
export async function generateStaticParams() {
  const { data } = await sanityFetch({ query: TESTIMONIAL_SLUGS_QUERY, perspective: 'published', stega: false })
  return data.filter((testimonial): testimonial is { slug: string } => Boolean(testimonial.slug))
}

export async function generateMetadata({ params }: PageProps<'/testimonials/[slug]'>): Promise<Metadata> {
  const { slug } = await params
  const [{ data: testimonial }, { data: settings }, { data: template }] = await Promise.all([
    sanityFetch({ query: TESTIMONIAL_QUERY, params: { slug }, stega: false }),
    sanityFetch({ query: SITE_SETTINGS_QUERY, stega: false }),
    sanityFetch({ query: ARTICLE_SEO_QUERY, params: { id: ARTICLE_SEO_ID }, stega: false }),
  ])
  // Introuvable : titre distinct pour repérer ces 404 dans GA4 (page_title), comme le blog.
  if (!testimonial) return { title: 'Testimonial not found' }

  return articleMetadata({
    settings,
    template: template ?? DEFAULT_TESTIMONIAL_TEMPLATE,
    values: testimonialTemplateValues(testimonial),
    // Pas d'image dans un témoignage : image fixe du modèle, sinon image de partage du site.
    cover: { url: null },
  })
}

// Page d'un témoignage, hors maquette : en-tête (sur-titre de /testimonials, entreprise en h1), puis la
// section Témoignage de l'accueil telle quelle (photo, citation, auteur, bouton vers l'étude de cas s'il y
// a un lien), puis le retour à la liste.
export default async function TestimonialPage({ params }: PageProps<'/testimonials/[slug]'>) {
  const { slug } = await params
  const [{ data: testimonial }, { data: page }, { data: settings }] = await Promise.all([
    sanityFetch({ query: TESTIMONIAL_QUERY, params: { slug } }),
    sanityFetch({ query: TESTIMONIALS_PAGE_QUERY }),
    sanityFetch({ query: SITE_SETTINGS_QUERY, stega: false }),
  ])

  if (!testimonial) notFound()
  const values = testimonialTemplateValues(stegaClean(testimonial))
  // La section Témoignage de l'accueil, remplie avec ce témoignage. Sans lien vers une étude de cas : pas de
  // bouton (pas de lien vide « # » sur cette page). Titre invisible de la section : sous le h1 de la page.
  const section: SectionData = {
    _type: 'testimonialSection',
    item: testimonial,
    ...(testimonial.caseStudyUrl
      ? { cta: { _type: 'cta', label: CASE_STUDY_LABEL as SectionText, href: testimonial.caseStudyUrl } }
      : {}),
    title: `What ${testimonial.name} says` as SectionText,
  }

  return (
    <article className={styles.article} aria-labelledby="testimonial-page-title" {...editAttrs(null, { doc: testimonial._id })}>
      <SiteScripts scripts={settings?.scripts} page="testimonials/slug" placements={['headEnd', 'bodyStart']} values={values} />
      <PageHeading
        id="testimonial-page-title"
        className={styles.heading}
        eyebrow={page?.content?.eyebrow || TESTIMONIALS_PAGE_DEFAULTS.eyebrow}
        title={testimonial.company}
      />
      <Testimonial pageDoc={null} data={section} />
      <div className={styles.back}>
        <Button href="/testimonials" variant="secondary">
          All testimonials
        </Button>
        <RenderStamp />
      </div>
      <SiteScripts scripts={settings?.scripts} page="testimonials/slug" placements={['bodyEnd']} values={values} />
    </article>
  )
}
