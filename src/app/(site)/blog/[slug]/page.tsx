import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { stegaClean, type StegaBranded } from 'next-sanity'

import { PortableTextBody } from '@/components/PortableTextBody'
import { RenderStamp } from '@/components/RenderStamp'
import { SanityImage } from '@/components/SanityImage'
import { SiteScripts } from '@/components/site-scripts/SiteScripts'
import { editAttrs } from '@/lib/editor/preview'
import { formatDate, formatReadingTime } from '@/lib/format'
import { articleMetadata } from '@/lib/seo'
import type { TemplateValues } from '@/lib/template-variables'
import { urlFor } from '@/sanity/lib/image'
import { sanityFetch } from '@/sanity/lib/live'
import { ARTICLE_SEO_QUERY, POST_QUERY, POST_SLUGS_QUERY, SITE_SETTINGS_QUERY } from '@/sanity/lib/queries'
import type { POST_QUERY_RESULT } from '@/sanity/types'

import styles from './article.module.css'

/** Modèle SEO des articles du blog (C6) : id fixe, sans point (un id avec un point serait privé). */
const ARTICLE_SEO_ID = 'articleSeo-post'

type Post = NonNullable<POST_QUERY_RESULT>

/** URL 1200 × 630 de l'image de l'article (image OG, variable {{cover}}). */
function coverUrl(post: Pick<Post, 'image'>): string {
  return urlFor({ asset: post.image.asset, crop: post.image.crop ?? undefined, hotspot: post.image.hotspot ?? undefined })
    .width(1200)
    .height(630)
    .url()
}

/** Valeurs des {{variables}} de la page article (C6, G6), nettoyées du stega. {{date}} : AAAA-MM-JJ. */
function templateValues(post: Post | StegaBranded<Post>): TemplateValues {
  const clean = stegaClean(post) as Post
  return {
    title: clean.title,
    slug: clean.slug,
    date: clean.publishedAt ? clean.publishedAt.slice(0, 10) : null,
    excerpt: clean.excerpt,
    cover: coverUrl(clean),
    author: clean.author,
    category: clean.category,
  }
}

// Articles pré-générés au build ; un article publié ensuite est généré à la première visite.
export async function generateStaticParams() {
  const { data } = await sanityFetch({ query: POST_SLUGS_QUERY, perspective: 'published', stega: false })
  return data.filter((post): post is { slug: string } => Boolean(post.slug))
}

export async function generateMetadata({ params }: PageProps<'/blog/[slug]'>): Promise<Metadata> {
  const { slug } = await params
  const [{ data: post }, { data: settings }, { data: template }] = await Promise.all([
    sanityFetch({ query: POST_QUERY, params: { slug }, stega: false }),
    sanityFetch({ query: SITE_SETTINGS_QUERY, stega: false }),
    sanityFetch({ query: ARTICLE_SEO_QUERY, params: { id: ARTICLE_SEO_ID }, stega: false }),
  ])
  // Article introuvable : titre distinct pour repérer ces 404 dans GA4 (page_title).
  if (!post) return { title: 'Article not found' }

  return articleMetadata({
    settings,
    template,
    values: templateValues(post),
    cover: { url: coverUrl(post), alt: post.image.alt },
    publishedTime: post.publishedAt,
  })
}

// Article, pas encore dessiné : mise en forme provisoire avec les styles de texte du Figma.
export default async function PostPage({ params }: PageProps<'/blog/[slug]'>) {
  const { slug } = await params
  const [{ data: post }, { data: settings }] = await Promise.all([
    sanityFetch({ query: POST_QUERY, params: { slug } }),
    sanityFetch({ query: SITE_SETTINGS_QUERY, stega: false }),
  ])

  if (!post) notFound()
  const values = templateValues(post)

  return (
    <article className={styles.article} {...editAttrs(null, { doc: post._id })}>
      <SiteScripts scripts={settings?.scripts} page="blog/slug" placements={['headEnd', 'bodyStart']} values={values} />
      <header className={styles.header}>
        <p className={styles.category}>{post.category}</p>
        <h1 className={styles.title}>{post.title}</h1>
        <p className={styles.excerpt}>{post.excerpt}</p>
        <p className={styles.meta}>
          <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time> ·{' '}
          {formatReadingTime(post.readingTime)}
        </p>
      </header>
      <SanityImage image={post.image} width={1200} height={630} sizes="(min-width: 48rem) 720px, 100vw" preload />
      <div className={styles.content}>
        <PortableTextBody value={post.content} />
      </div>
      <RenderStamp />
      <SiteScripts scripts={settings?.scripts} page="blog/slug" placements={['bodyEnd']} values={values} />
    </article>
  )
}
