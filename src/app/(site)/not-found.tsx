import Link from 'next/link'

export default function NotFound() {
  return (
    <section className="hero">
      <h1>Page introuvable</h1>
      <p>Cet article n’existe pas, ou il n’est pas encore publié.</p>
      <Link href="/blog" className="button">
        Retour au blog
      </Link>
    </section>
  )
}
