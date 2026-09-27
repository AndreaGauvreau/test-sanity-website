import { adminConfig } from '@/admin.config'
import { decideEditorAccess, NO_EDITOR_ACCESS, type EditorAccess } from '@/admin/core/auth/editor-access'
import { getSession } from '@/admin/core/auth/session'

/**
 * GET /admin/api/auth/editor-access?path=<chemin public> — bouton « Edit with AI » du site en ligne
 * (src/admin/live-edit). Chemin PUBLIC de l'admin (le proxy le laisse passer sans cookie) : c'est ici que se fait la
 * vraie vérification, sans jamais rediriger. Le cookie `kz_admin` (path=/admin) est envoyé par le navigateur parce que
 * la requête vise /admin ; la session de dev (ADMIN_DEV_AUTOLOGIN) s'applique aussi.
 *
 * Toujours 200 : `{ canEdit: false }` (pas de session, rôle sans `ai.editor`, page inconnue ou sans `aiEditor`,
 * erreur de lecture de la session) ou `{ canEdit: true, href }`. Rien de sensible, `no-store`.
 */
export async function GET(request: Request) {
  const path = new URL(request.url).searchParams.get('path')
  let access: EditorAccess = NO_EDITOR_ACCESS
  try {
    const session = await getSession()
    access = decideEditorAccess({ role: session?.role, path, pages: adminConfig.pages })
  } catch {
    // Secret de session absent ou invalide : le site public ne doit jamais casser pour ça.
    access = NO_EDITOR_ACCESS
  }
  return Response.json(access, {
    headers: { 'cache-control': 'private, no-store', vary: 'Cookie' },
  })
}
