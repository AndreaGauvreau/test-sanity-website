import Link from 'next/link'
import { stegaClean, type StegaBranded } from 'next-sanity'

import { SanityImage } from '@/components/SanityImage'
import { formatDate, formatReadingTime } from '@/lib/format'
import type { POSTS_QUERY_RESULT } from '@/sanity/types'

import styles from './PostCard.module.css'

type Props = {
  /** Un article tel que le lisent POSTS_QUERY et LATEST_POSTS_QUERY (même projection). */
  post: StegaBranded<POSTS_QUERY_RESULT[number]>
  /** Niveau du titre de la carte : h2 sur /blog (sous le h1), h3 dans une section de page. */
  heading: 'h2' | 'h3'
  /** Largeur affichée de l'image, pour le choix de la résolution servie par le CDN. */
  sizes: string
  loading?: 'eager' | 'lazy'
}

// Carte d'article du Figma (section « Learn and grow », 269:518) : image, catégorie, titre,
// date et temps de lecture. Toute la carte est cliquable, mais le seul lien est le titre.
export function PostCard({ post, heading: Heading, sizes, loading }: Props) {
  // stegaClean : la date sert d'attribut et de calcul, pas seulement de texte affiché.
  const publishedAt = stegaClean(post.publishedAt)

  return (
    <article className={styles.card}>
      {/* Image recadrée par le CDN au format de la maquette (380 × 358), servie en 2x. */}
      <SanityImage image={post.image} width={760} height={716} sizes={sizes} loading={loading} />
      {/* Obligatoire dans l'admin, mais absente des articles créés avant ce champ. */}
      {post.category && <p className={styles.category}>{post.category}</p>}
      <Heading className={styles.title}>
        <Link href={`/blog/${stegaClean(post.slug)}`} className={styles.link}>
          {post.title}
        </Link>
      </Heading>
      <p className={styles.meta}>
        <time dateTime={publishedAt}>{formatDate(publishedAt)}</time> · {formatReadingTime(post.readingTime)}
      </p>
    </article>
  )
}
