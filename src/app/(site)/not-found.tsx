import { Button } from '@/components/ui/Button/Button'

import styles from './not-found.module.css'

// Rendu quand une page du site appelle notFound() : aujourd'hui, un article introuvable.
export default function NotFound() {
  return (
    <section className={styles.notFound} aria-labelledby="not-found-title">
      <h1 id="not-found-title" className={styles.title}>
        Page not found
      </h1>
      <p className={styles.text}>This article doesn’t exist, or it isn’t published yet.</p>
      <Button href="/blog" variant="secondary">
        Back to the blog
      </Button>
    </section>
  )
}
