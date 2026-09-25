import type { Metadata } from 'next'
import Link from 'next/link'
import { stegaClean } from 'next-sanity'

import { RenderStamp } from '@/components/RenderStamp'
import { SanityImage } from '@/components/SanityImage'
import { formatDate } from '@/lib/format'
import { sanityFetch } from '@/sanity/lib/live'
import { POSTS_QUERY } from '@/sanity/lib/queries'

export const metadata: Metadata = { title: 'Blog — LyonDrive' }

export default async function BlogPage() {
  const { data: posts } = await sanityFetch({ query: POSTS_QUERY })

  return (
    <section className="blog">
      <h1>Blog</h1>
      {posts.length === 0 ? (
        <p className="subtitle">Aucun article publié pour l’instant.</p>
      ) : (
        <div className="grid">
          {posts.map((post, index) => (
            <Link key={post._id} href={`/blog/${stegaClean(post.slug)}`} className="card">
              {post.image && (
                <SanityImage
                  image={post.image}
                  width={1200}
                  height={630}
                  sizes="(max-width: 720px) 100vw, (max-width: 1160px) 50vw, 530px"
                  loading={index < 2 ? 'eager' : 'lazy'}
                />
              )}
              <h2>{post.title}</h2>
              <p>{post.subtitle}</p>
              {post.publishedAt && <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>}
            </Link>
          ))}
        </div>
      )}
      <RenderStamp />
    </section>
  )
}
