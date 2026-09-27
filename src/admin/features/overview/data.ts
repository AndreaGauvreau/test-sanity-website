import 'server-only'

import { headers } from 'next/headers'

import adminConfig from '@/admin.config'
import { requestOrigin } from '@/admin/core/auth/request'
import { can, type PublishStatus, type Session } from '@/admin/core/contracts'
import { engineFetch } from '@/admin/core/engine/server'
import { getUsageSummary } from '@/admin/core/usage'

import { loadTeamSummary } from '../team/data'
import type { TeamSummary } from '../team/members'
import type { UsageTotals } from './format'
import { canFrame } from './frame'

/**
 * Données de B1 (Overview), toutes lues côté serveur à l'ouverture de l'écran. Chaque source échoue seule : une carte
 * indisponible n'empêche pas les autres de s'afficher.
 * - Production et Content : état partagé de publication du moteur (`GET publish/status`, moteur simulé en local) ;
 * - AI usage this month : `getUsageSummary('month')` (core/usage, même source que B5) ;
 * - Team : membres du projet Sanity (jeton de l'utilisateur) ;
 * - Aperçu : le site public peut-il s'afficher dans un cadre (en-têtes X-Frame-Options / CSP) ?
 */

export async function loadPublishStatus(session: Session): Promise<PublishStatus | null> {
  try {
    return await engineFetch<PublishStatus>(session, 'GET', 'publish/status')
  } catch (err) {
    // Moteur arrêté, non configuré ou simulé sans cette route (501) : la carte dit « Unavailable ».
    const code = (err as { code?: unknown })?.code
    if (code !== 'unavailable' && code !== 'not_implemented') {
      console.error('[admin/overview] publish status failed:', err instanceof Error ? err.message : err)
    }
    return null
  }
}

export async function loadMonthUsage(): Promise<UsageTotals | 'unavailable'> {
  try {
    const summary = await getUsageSummary('month')
    return summary.totals
  } catch (err) {
    console.error('[admin/overview] usage failed:', err instanceof Error ? err.message : err)
    return 'unavailable'
  }
}

export type TeamCardData = { summary: TeamSummary | null; noToken: boolean; clickable: boolean }

export async function loadTeamCard(session: Session): Promise<TeamCardData> {
  const summary = await loadTeamSummary(session)
  return {
    summary: summary === 'no-token' ? null : summary,
    noToken: summary === 'no-token',
    // Figma B1 : « pour Kuartz, la carte n'est pas cliquable » (Team est au client admin).
    clickable: can(session.role, 'settings.team'),
  }
}

/** Le site public accepte-t-il d'être affiché dans l'admin ? `null` = inconnu (site injoignable) : on essaie quand même. */
export async function loadFrameability(): Promise<boolean | null> {
  const h = await headers()
  const adminOrigin = requestOrigin(h)
  try {
    const request = (method: 'HEAD' | 'GET') =>
      fetch(adminConfig.site.url, {
        method,
        redirect: 'follow',
        cache: 'no-store',
        signal: AbortSignal.timeout(4_000),
        headers: { Accept: 'text/html' },
      })
    // HEAD d'abord (seuls les en-têtes comptent) ; GET si le serveur refuse HEAD, corps jamais lu.
    let res = await request('HEAD')
    if (res.status === 405 || res.status === 501) res = await request('GET')
    void res.body?.cancel().catch(() => {})
    return canFrame(res.headers, adminOrigin, new URL(res.url || adminConfig.site.url).origin)
  } catch {
    return null
  }
}
