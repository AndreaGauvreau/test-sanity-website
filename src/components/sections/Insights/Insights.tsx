import type { StegaBranded } from 'next-sanity'

import { Eyebrow } from '@/components/ui/Eyebrow/Eyebrow'
import { PostCard } from '@/components/ui/PostCard/PostCard'
import type { InsightsSection, LATEST_POSTS_QUERY_RESULT } from '@/sanity/types'

import styles from './Insights.module.css'

type Props = {
  data: StegaBranded<InsightsSection>
  posts: StegaBranded<LATEST_POSTS_QUERY_RESULT>
}

// Articles « Learn and grow » (Figma 269:511) : sur-titre et titre (Sanity, onglet
// Articles), puis les derniers articles du Blog en une rangée de cartes qui défile à
// l'horizontale, sans faire déborder la page. Sans article publié, la section n'est pas
// affichée.
export function Insights({ data, posts }: Props) {
  if (posts.length === 0) return null

  const { eyebrow, title } = data

  return (
    <section className={styles.insights} aria-labelledby="insights-title">
      <hgroup className={styles.heading}>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 id="insights-title" className={styles.title}>
          {title}
        </h2>
      </hgroup>
      {/* Zone qui défile : focalisable pour défiler au clavier (flèches), nommée par le titre
          de la section (éditable). « group » et non « region » : la <section> est déjà le
          repère « Learn and grow », un second repère du même nom ferait doublon. */}
      <div className={styles.scroller} role="group" aria-labelledby="insights-title" tabIndex={0}>
        <ul className={styles.cards}>
          {posts.map((post) => (
            <li key={post._id} className={styles.card}>
              <PostCard post={post} heading="h3" sizes="(min-width: 30rem) 380px, calc(100vw - 4.5rem)" />
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
