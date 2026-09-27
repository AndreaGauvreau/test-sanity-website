import { handleImageUpload } from '@/admin/features/pages/server/upload'

// POST multipart { target: 'seo' | 'article' | 'field', path?, file } : envoi d'une image depuis C1, C2 ou C6.
// Garde (content.write), CSRF, validation et écriture : features/pages/server/upload.ts.
export async function POST(request: Request, context: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await context.params
  return handleImageUpload(request, pageId)
}
