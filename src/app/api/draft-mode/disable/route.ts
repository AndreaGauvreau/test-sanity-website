import { draftMode } from 'next/headers'

// Lien « Revenir au contenu publié » du bandeau brouillon. Redirection relative :
// on reste sur l'hôte utilisé (localhost ou 127.0.0.1).
export async function GET() {
  ;(await draftMode()).disable()
  return new Response(null, { status: 307, headers: { Location: '/' } })
}
