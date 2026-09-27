import type { Metadata } from 'next'

import { AuthCallback } from './AuthCallback'

/**
 * /admin/auth/callback — retour du fournisseur Sanity (`#sid=…`). Page publique (le proxy la laisse passer) :
 * elle ne lit aucune donnée, le composant client envoie le sid à POST /admin/api/auth/session.
 * Propriétaire : auth-core. La page de connexion A1 (/admin/login) appartient à l'agent shell.
 */
export const metadata: Metadata = { title: 'Signing in…', robots: { index: false, follow: false } }

export default function AuthCallbackPage() {
  return <AuthCallback />
}
