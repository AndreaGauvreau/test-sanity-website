import { createHash, timingSafeEqual } from 'node:crypto'

import { revalidatePath, revalidateTag } from 'next/cache'
import { z } from 'zod'

/**
 * POST /api/revalidate — vide le cache du site après une publication (moteur de l'admin, étape 4 de
 * Publish ; ou webhook Sanity). Voir src/app/(site)/CLAUDE.md.
 *
 * - En-tête `x-kz-revalidate: <REVALIDATE_SECRET>`, comparé à temps constant ; secret absent côté
 *   serveur ou en-tête faux : 401 (échec fermé).
 * - Corps JSON `{ tags?: string[], paths?: string[] }` (zod) :
 *   - tags  → revalidateTag(tag, { expire: 0 }) : la requête suivante attend les données fraîches
 *             (updateTag n'existe que dans les server actions, pas dans un route handler) ;
 *   - paths → revalidatePath(path) ; un motif (« /blog/[slug] ») vaut pour toutes ses pages ;
 *   - ni l'un ni l'autre → tout le site (revalidatePath('/', 'layout')).
 * - 200 `{ revalidated: true, tags, paths, now }` ; 400 corps invalide.
 */

const HEADER = 'x-kz-revalidate'

const tag = z.string().min(1).max(256)
// Chemin du site : commence par « / », sans « .. », 1024 caractères au plus (limite de revalidatePath).
const path = z
  .string()
  .min(1)
  .max(1024)
  .regex(/^\/[^\s?#]*$/, 'A site path starting with /')
  .refine((value) => !value.split('/').includes('..'), 'No ".." segment')

const bodySchema = z
  .object({
    tags: z.array(tag).max(100).optional(),
    paths: z.array(path).max(100).optional(),
  })
  .strict()

/** Comparaison à temps constant (empreintes de même longueur, quelle que soit la saisie). */
function sameSecret(given: string | null, expected: string | undefined): boolean {
  if (!given || !expected) return false
  const a = createHash('sha256').update(given).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

export async function POST(request: Request) {
  if (!sameSecret(request.headers.get(HEADER), process.env.REVALIDATE_SECRET)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  let json: unknown = {}
  const text = await request.text()
  if (text.trim()) {
    try {
      json = JSON.parse(text)
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
  }
  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    return Response.json({ error: 'Invalid body', issues: parsed.error.issues.map((issue) => issue.message) }, { status: 400 })
  }

  const tags = [...new Set(parsed.data.tags ?? [])]
  const paths = [...new Set(parsed.data.paths ?? [])]
  for (const value of tags) revalidateTag(value, { expire: 0 })
  for (const value of paths) {
    if (value.includes('[')) revalidatePath(value, 'page')
    else revalidatePath(value)
  }
  if (tags.length === 0 && paths.length === 0) revalidatePath('/', 'layout')

  return Response.json({ revalidated: true, tags, paths, now: Date.now() })
}
