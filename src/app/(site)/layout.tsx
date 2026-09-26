import type { Metadata } from 'next'
import { draftMode } from 'next/headers'
import { VisualEditing } from 'next-sanity/visual-editing'

import { Analytics } from '@/components/Analytics'
import { DraftModeBanner } from '@/components/DraftModeBanner'
import { SiteFooter } from '@/components/layout/SiteFooter'
import { SiteHeader } from '@/components/layout/SiteHeader'
import { onLiveError, onLiveGoAway, onLiveReconnect, onLiveWelcome } from '@/components/LiveStatus'
import { openGraphDefaults, siteName } from '@/lib/site'
import { SanityLive } from '@/sanity/lib/live'
import { onContentChange } from '@/sanity/lib/live-action'

import '@/styles/tokens.css'
import '@/styles/base.css'

export const metadata: Metadata = {
  title: { template: `%s — ${siteName}`, default: siteName },
  openGraph: openGraphDefaults,
  twitter: { card: 'summary_large_image' },
}

export default async function SiteLayout({ children }: LayoutProps<'/'>) {
  const { isEnabled: isDraftMode } = await draftMode()

  return (
    <>
      {/* GTM (+ GA4) : ici plutôt que dans le layout racine, pour ne pas mesurer l'admin. */}
      <Analytics />
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main">{children}</main>
      <SiteFooter />

      {/* Écoute le Live Content API : une publication dans l'admin met à jour la page ouverte.
          SANITY_LIVE_MODE=swr → action par défaut de next-sanity 13, pour comparer. */}
      <SanityLive
        action={process.env.SANITY_LIVE_MODE === 'swr' ? undefined : onContentChange}
        onWelcome={onLiveWelcome}
        onError={onLiveError}
        onReconnect={onLiveReconnect}
        onGoAway={onLiveGoAway}
      />

      {isDraftMode && (
        <>
          <DraftModeBanner />
          {/* Survol → clic → ouvre le bon champ dans l'admin. */}
          <VisualEditing />
        </>
      )}
    </>
  )
}
