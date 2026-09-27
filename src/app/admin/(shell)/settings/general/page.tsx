import type { Metadata } from 'next'

import { requireSession } from '@/admin/core/auth/session'
import { can } from '@/admin/core/contracts'
import { GeneralForm } from '@/admin/features/general/GeneralForm'
import { loadGeneralSettings } from '@/admin/features/general/load'
import { GeneralLoadError } from '@/admin/features/general/GeneralLoadError'

export const metadata: Metadata = { title: 'General' }

/** B2 · Site Settings › General (/admin/settings/general). Kuartz, client admin et editor. */
export default async function GeneralSettingsPage() {
  const session = await requireSession()
  let view
  try {
    view = await loadGeneralSettings()
  } catch (err) {
    console.error('[admin/general] loading siteSettings failed:', err instanceof Error ? err.message : err)
    return <GeneralLoadError />
  }
  return <GeneralForm view={view} canEdit={can(session.role, 'content.write')} />
}
