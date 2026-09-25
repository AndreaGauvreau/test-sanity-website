import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { PortableTextBody } from '@/components/PortableTextBody'
import { RenderStamp } from '@/components/RenderStamp'
import { SanityImage } from '@/components/SanityImage'
import { formatDate } from '@/lib/format'
import { sanityFetch } from '@/sanity/lib/live'
import { POST_QUERY, POST_SLUGS_QUERY } from '@/sanity/lib/queries'

// Articles pré-générés au build ; un article publié ensuite est généré à la première visite.
export async function generateStaticParams() {
  const { data } = await sanityFetch({ query: POST_SLUGS_QUERY, perspective: 'published', stega: false })
  return data.filter((post): post is { slug: string } => Boolean(post.slug))
}

export async function generateMetadata({ params }: PageProps<'/blog/[slug]'>): Promise<Metadata> {
  const { slug } = await params
  const { data: post } = await sanityFetch({ query: POST_QUERY, params: { slug }, stega: false })
  // Article introuvable : titre distinct pour repérer ces 404 dans GA4 (page_title).
  return post
    ? { title: `${post.title} — LyonDrive`, description: post.subtitle }
    : { title: 'Article introuvable — LyonDrive' }
}

export default async function PostPage({ params }: PageProps<'/blog/[slug]'>) {
  const { slug } = await params
  const { data: post } = await sanityFetch({ query: POST_QUERY, params: { slug } })

  if (!post) notFound()

  return (
    <article className="post">
      <h1>{post.title}</h1>
      <p className="subtitle">{post.subtitle}</p>
      <div className="meta">
        {post.publishedAt && <span>Publié le {formatDate(post.publishedAt)}</span>}
        <span>Mis à jour le {formatDate(post._updatedAt)}</span>
      </div>
      {post.image && (
        <SanityImage image={post.image} width={1200} height={630} sizes="(max-width: 800px) 100vw, 760px" preload />
      )}
      {post.content && (
        <div className="content">
          <PortableTextBody value={post.content} />
        </div>
      )}
      <RenderStamp />
    </article>
  )
}
