import type { Metadata } from 'next'

import adminConfig from '@/admin.config'
import { requireCapability } from '@/admin/core/auth/session'
import { readSanityEnv } from '@/admin/core/sanity/env'
import { sanityManageMembersUrl } from '@/admin/features/team/access-api'
import { loadTeam } from '@/admin/features/team/data'
import { TeamScreen } from '@/admin/features/team/TeamScreen'

export const metadata: Metadata = { title: 'Team' }

/** B4 · Site Settings › Team (/admin/settings/team). Client admin seulement (`settings.team`), sinon 404. */
export default async function TeamSettingsPage() {
  const session = await requireCapability('settings.team')
  const state = await loadTeam(session)
  return <TeamScreen state={state} siteName={adminConfig.site.name} manageUrl={sanityManageMembersUrl(readSanityEnv().projectId)} />
}
