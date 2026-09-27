import { requireCapability } from '@/admin/core/auth/session'

/** C3 sans panneau ouvert : la liste est rendue par le layout de la collection. */
export default async function CollectionPage() {
  await requireCapability('content.write')
  return null
}
