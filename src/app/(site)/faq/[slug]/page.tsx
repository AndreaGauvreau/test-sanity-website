import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { stegaClean } from 'next-sanity'

import { PortableTextBody } from '@/components/PortableTextBody'
import { RenderStamp } from '@/components/RenderStamp'
import { SiteScripts } from '@/components/site-scripts/SiteScripts'
import { Button } from '@/components/ui/Button/Button'
import { PageHeading } from '@/components/ui/PageHeading/PageHeading'
import { faqTemplateValues } from '@/lib/article-values'
import { editAttrs } from '@/lib/editor/preview'
import { FAQ_PAGE_DEFAULTS } from '@/lib/page-defaults'
import { articleMetadata, DEFAULT_FAQ_TEMPLATE } from '@/lib/seo'
import { sanityFetch } from '@/sanity/lib/live'
import { ARTICLE_SEO_QUERY, FAQ_PAGE_QUERY, FAQ_QUERY, FAQ_SLUGS_QUERY, SITE_SETTINGS_QUERY } from '@/sanity/lib/queries'

import styles from './question.module.css'

/** Modèle SEO des pages question (C6) : id fixe, sans point (un id avec un point serait privé). */
const ARTICLE_SEO_ID = 'articleSeo-faq'

// Questions pré-générées au build ; une question publiée ensuite est générée à la première visite.
export async function generateStaticParams() {
  const { data } = await sanityFetch({ query: FAQ_SLUGS_QUERY, perspective: 'published', stega: false })
  return data.filter((faq): faq is { slug: string } => Boolean(faq.slug))
}

export async function generateMetadata({ params }: PageProps<'/faq/[slug]'>): Promise<Metadata> {
  const { slug } = await params
  const [{ data: faq }, { data: settings }, { data: template }] = await Promise.all([
    sanityFetch({ query: FAQ_QUERY, params: { slug }, stega: false }),
    sanityFetch({ query: SITE_SETTINGS_QUERY, stega: false }),
    sanityFetch({ query: ARTICLE_SEO_QUERY, params: { id: ARTICLE_SEO_ID }, stega: false }),
  ])
  // Introuvable : titre distinct pour repérer ces 404 dans GA4 (page_title), comme le blog.
  if (!faq) return { title: 'Question not found' }

  return articleMetadata({
    settings,
    template: template ?? DEFAULT_FAQ_TEMPLATE,
    values: faqTemplateValues(faq),
    // Pas d'image dans une question : image fixe du modèle, sinon image de partage du site.
    cover: { url: null },
  })
}

// Page d'une question, hors maquette : colonne de lecture des articles du blog, sur-titre de /faq, la
// question en h1, la réponse (texte riche, styles de la section FAQ), puis le retour à la liste.
export default async function FaqQuestionPage({ params }: PageProps<'/faq/[slug]'>) {
  const { slug } = await params
  const [{ data: faq }, { data: page }, { data: settings }] = await Promise.all([
    sanityFetch({ query: FAQ_QUERY, params: { slug } }),
    sanityFetch({ query: FAQ_PAGE_QUERY }),
    sanityFetch({ query: SITE_SETTINGS_QUERY, stega: false }),
  ])

  if (!faq) notFound()
  const values = faqTemplateValues(stegaClean(faq))

  return (
    <article className={styles.article} aria-labelledby="faq-question-title" {...editAttrs(null, { doc: faq._id })}>
      <SiteScripts scripts={settings?.scripts} page="faq/slug" placements={['headEnd', 'bodyStart']} values={values} />
      <PageHeading
        id="faq-question-title"
        eyebrow={page?.content?.eyebrow || FAQ_PAGE_DEFAULTS.eyebrow}
        title={faq.question}
      />
      <div className={styles.answer}>
        <PortableTextBody value={faq.answer} />
      </div>
      <Button href="/faq" variant="secondary" className={styles.back}>
        All questions
      </Button>
      <RenderStamp />
      <SiteScripts scripts={settings?.scripts} page="faq/slug" placements={['bodyEnd']} values={values} />
    </article>
  )
}
