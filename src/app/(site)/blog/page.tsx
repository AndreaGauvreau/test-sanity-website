import type { Metadata } from 'next'

import { RenderStamp } from '@/components/RenderStamp'
import { SiteScripts } from '@/components/site-scripts/SiteScripts'
import { PostCard } from '@/components/ui/PostCard/PostCard'
import { editAttrs } from '@/lib/editor/preview'
import { pageMetadata } from '@/lib/seo'
import { sanityFetch } from '@/sanity/lib/live'
import { BLOG_PAGE_QUERY, POSTS_QUERY, SITE_SETTINGS_QUERY } from '@/sanity/lib/queries'

import styles from './blog.module.css'

// Textes par défaut, tant que le document blogPage ne les porte pas (ce sont ceux d'avant l'admin).
const DEFAULT_TITLE = 'Blog'
const DEFAULT_EMPTY_TEXT = 'No articles published yet.'

// SEO de /blog (C2) : document unique blogPage, repli sur son titre puis sur les réglages du site.
export async function generateMetadata(): Promise<Metadata> {
  const [{ data: blog }, { data: settings }] = await Promise.all([
    sanityFetch({ query: BLOG_PAGE_QUERY, stega: false }),
    sanityFetch({ query: SITE_SETTINGS_QUERY, stega: false }),
  ])
  return pageMetadata({ settings, seo: blog?.seo, defaultTitle: blog?.content?.title || DEFAULT_TITLE })
}

// Liste du blog (id 'blog' dans src/admin.config.ts). Pas encore dessinée : les cartes sont celles
// de la section « Learn and grow » du Figma (PostCard, partagée avec la page d'accueil).
export default async function BlogPage() {
  const [{ data: posts }, { data: blog }, { data: settings }] = await Promise.all([
    sanityFetch({ query: POSTS_QUERY }),
    sanityFetch({ query: BLOG_PAGE_QUERY }),
    sanityFetch({ query: SITE_SETTINGS_QUERY, stega: false }),
  ])

  return (
    <section className={styles.blog} aria-labelledby="blog-title" {...editAttrs(null, { doc: 'blogPage' })}>
      <SiteScripts scripts={settings?.scripts} page="blog" placements={['headEnd', 'bodyStart']} />
      <h1 id="blog-title" className={styles.title}>
        {blog?.content?.title || DEFAULT_TITLE}
      </h1>
      {posts.length === 0 ? (
        <p>{blog?.content?.emptyText || DEFAULT_EMPTY_TEXT}</p>
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
      <SiteScripts scripts={settings?.scripts} page="blog" placements={['bodyEnd']} />
    </section>
  )
}
