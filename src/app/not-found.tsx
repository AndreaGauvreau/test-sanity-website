import type { Metadata } from 'next'
import Link from 'next/link'

import { Analytics } from '@/components/Analytics'

// Titre distinct : c'est ce qui permet de retrouver les 404 dans GA4 (page_title).
export const metadata: Metadata = { title: 'Page not found — Conduit' }

// 404 des URL qui ne correspondent à aucune route (un article introuvable passe par
// (site)/not-found.tsx, avec l'en-tête du site). Styles en ligne : ce fichier est
// rattaché au layout racine, partagé avec l'admin, qui ne doit pas recevoir le CSS du site.
// Les valeurs sont celles de src/styles/tokens.css ; les polices viennent du layout racine.
// GTM est chargé ici aussi : les 404 dans GA4 aident à repérer les liens cassés.
export default function NotFound() {
  return (
    <>
      <Analytics />
      <main
        style={{
          minHeight: '100vh',
          padding: '120px 24px',
          background: '#ffffff',
          color: '#232325',
          fontFamily: 'var(--font-geist), system-ui, sans-serif',
          WebkitFontSmoothing: 'antialiased',
        }}
      >
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <h1 style={{ fontSize: 40, fontWeight: 400, lineHeight: 1, letterSpacing: '-0.04em', margin: 0 }}>
            Page not found
          </h1>
          <p style={{ fontSize: 14, lineHeight: 1.3, color: '#717278', margin: '28px 0 40px' }}>
            This address doesn’t match any page on the site.
          </p>
          <Link
            href="/"
            style={{
              display: 'inline-block',
              padding: '8px 16px',
              background: '#f9f9f9',
              color: '#000000',
              fontFamily: 'var(--font-geist-mono), monospace',
              fontSize: 12,
              fontWeight: 500,
              lineHeight: 1.4,
              letterSpacing: '-0.011em',
              textTransform: 'uppercase',
              textDecoration: 'none',
            }}
          >
            Back to home
          </Link>
        </div>
      </main>
    </>
  )
}
