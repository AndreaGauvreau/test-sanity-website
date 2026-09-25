import Link from 'next/link'

import { RenderStamp } from '@/components/RenderStamp'
import { sanityFetch } from '@/sanity/lib/live'
import { HOME_QUERY } from '@/sanity/lib/queries'

export default async function HomePage() {
  const { data: home } = await sanityFetch({ query: HOME_QUERY })

  if (!home) {
    return (
      <section className="hero">
        <h1>Pas encore de contenu</h1>
        <p>
          Lance <code>npm run seed</code> pour importer le contenu de démo, ou remplis la page
          d’accueil dans <a href="/admin">l’admin</a>.
        </p>
      </section>
    )
  }

  return (
    <section className="hero">
      <h1>{home.title}</h1>
      <p>{home.subtitle}</p>
      <Link href="/blog" className="button">
        {home.buttonLabel}
      </Link>
      <RenderStamp />
    </section>
  )
}
