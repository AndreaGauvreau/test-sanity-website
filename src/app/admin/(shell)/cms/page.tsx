import { redirect } from 'next/navigation'

import { requireCapability } from '@/admin/core/auth/session'
import adminConfig from '@/admin.config'

/** /admin/cms : pas d'écran propre, on ouvre la première collection du manifeste. */
export default async function CmsIndexPage() {
  await requireCapability('content.write')
  const first = adminConfig.collections[0]
  redirect(first ? `/admin/cms/${first.id}` : '/admin')
}
