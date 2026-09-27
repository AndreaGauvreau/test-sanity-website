import type { Metadata } from 'next'

import { requireCapability } from '@/admin/core/auth/session'
import { CodeScreen } from '@/admin/features/code/CodeScreen'
import { loadCodeScreen } from '@/admin/features/code/data'
import { CodeLoadError } from '@/admin/features/code/CodeLoadError'

export const metadata: Metadata = { title: 'Code' }

/**
 * B3 · Site Settings › Code — Kuartz seulement (`settings.code`) : 404 pour les autres rôles, sans révéler l'écran.
 * Les scripts sont du code injecté tel quel sur le site : lecture ET écriture réservées à ce droit.
 */
export default async function CodePage() {
  await requireCapability('settings.code')
  let data: Awaited<ReturnType<typeof loadCodeScreen>>
  try {
    data = await loadCodeScreen()
  } catch (err) {
    console.error('[code] load failed', err)
    return <CodeLoadError />
  }
  return <CodeScreen scripts={data.scripts} pages={data.pages} />
}
