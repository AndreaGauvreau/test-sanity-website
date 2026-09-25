import type { Metadata } from 'next'
import Link from 'next/link'

import { Analytics } from '@/components/Analytics'

// Titre distinct : c'est ce qui permet de retrouver les 404 dans GA4 (page_title).
export const metadata: Metadata = { title: 'Page introuvable — LyonDrive' }

// 404 des URL qui ne correspondent à aucune route (un article introuvable passe par
// (site)/not-found.tsx, avec l'en-tête du site). Styles en ligne : ce fichier est
// rattaché au layout racine, partagé avec l'admin, qui ne doit pas recevoir le CSS du site.
// GTM est chargé ici aussi : les 404 dans GA4 aident à repérer les liens cassés.
export default function NotFound() {
  return (
    <>
      <Analytics />
      <main
        style={{
          minHeight: '100vh',
          padding: '120px 24px',
          background: '#0f172a',
          color: '#f8fafc',
          fontFamily: 'Georgia, serif',
        }}
      >
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <h1 style={{ fontSize: 56, lineHeight: 1.05, margin: 0 }}>Page introuvable</h1>
          <p style={{ fontSize: 22, color: '#94a3b8', margin: '32px 0 48px', fontFamily: 'system-ui' }}>
            Cette adresse ne correspond à aucune page du site.
          </p>
          <Link
            href="/"
            style={{
              display: 'inline-block',
              background: '#e11d48',
              color: '#fff',
              padding: '18px 36px',
              fontFamily: 'system-ui',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Retour à l’accueil
          </Link>
        </div>
      </main>
    </>
  )
}
