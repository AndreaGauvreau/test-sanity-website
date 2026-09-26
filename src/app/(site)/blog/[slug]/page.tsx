import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { PortableTextBody } from '@/components/PortableTextBody'
import { RenderStamp } from '@/components/RenderStamp'
import { SanityImage } from '@/components/SanityImage'
import { formatDate, formatReadingTime } from '@/lib/format'
import { openGraphDefaults } from '@/lib/site'
import { urlFor } from '@/sanity/lib/image'
import { sanityFetch } from '@/sanity/lib/live'
import { POST_QUERY, POST_SLUGS_QUERY } from '@/sanity/lib/queries'

import styles from './article.module.css'

// Articles pré-générés au build ; un article publié ensuite est généré à la première visite.
export async function generateStaticParams() {
  const { data } = await sanityFetch({ query: POST_SLUGS_QUERY, perspective: 'published', stega: false })
  return data.filter((post): post is { slug: string } => Boolean(post.slug))
}

export async function generateMetadata({ params }: PageProps<'/blog/[slug]'>): Promise<Metadata> {
  const { slug } = await params
  const { data: post } = await sanityFetch({ query: POST_QUERY, params: { slug }, stega: false })
  // Article introuvable : titre distinct pour repérer ces 404 dans GA4 (page_title).
  if (!post) return { title: 'Article not found' }

  return {
    title: post.title,
    description: post.excerpt,
    openGraph: {
      ...openGraphDefaults,
      type: 'article',
      title: post.title,
      description: post.excerpt,
      publishedTime: post.publishedAt,
      images: [
        {
          url: urlFor({
            asset: post.image.asset,
            crop: post.image.crop ?? undefined,
            hotspot: post.image.hotspot ?? undefined,
          })
            .width(1200)
            .height(630)
            .url(),
          width: 1200,
          height: 630,
          alt: post.image.alt ?? '',
        },
      ],
    },
  }
}

// Article, pas encore dessiné : mise en forme provisoire avec les styles de texte du Figma.
export default async function PostPage({ params }: PageProps<'/blog/[slug]'>) {
  const { slug } = await params
  const { data: post } = await sanityFetch({ query: POST_QUERY, params: { slug } })

  if (!post) notFound()

  return (
    <article className={styles.article}>
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
    </article>
  )
}
