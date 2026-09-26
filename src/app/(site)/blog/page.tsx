import type { Metadata } from 'next'

import { RenderStamp } from '@/components/RenderStamp'
import { PostCard } from '@/components/ui/PostCard/PostCard'
import { sanityFetch } from '@/sanity/lib/live'
import { POSTS_QUERY } from '@/sanity/lib/queries'

import styles from './blog.module.css'

export const metadata: Metadata = { title: 'Blog' }

// Liste du blog. Pas encore dessinée : les cartes sont celles de la section
// « Learn and grow » du Figma (PostCard, partagée avec la page d'accueil).
export default async function BlogPage() {
  const { data: posts } = await sanityFetch({ query: POSTS_QUERY })

  return (
    <section className={styles.blog} aria-labelledby="blog-title">
      <h1 id="blog-title" className={styles.title}>
        Blog
      </h1>
      {posts.length === 0 ? (
        <p>No articles published yet.</p>
      ) : (
        <ul className={styles.grid}>
          {posts.map((post, index) => (
            <li key={post._id}>
              <PostCard
                post={post}
                heading="h2"
                sizes="(min-width: 75rem) 380px, (min-width: 40rem) 50vw, 100vw"
                loading={index < 3 ? 'eager' : 'lazy'}
              />
            </li>
          ))}
        </ul>
      )}
      <RenderStamp />
    </section>
  )
}
