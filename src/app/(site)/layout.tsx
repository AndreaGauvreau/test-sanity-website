import type { Metadata } from 'next'
import { draftMode } from 'next/headers'
import Link from 'next/link'
import { VisualEditing } from 'next-sanity/visual-editing'

import { Analytics } from '@/components/Analytics'
import { DraftModeBanner } from '@/components/DraftModeBanner'
import {
  LiveStatus,
  onLiveError,
  onLiveGoAway,
  onLiveReconnect,
  onLiveWelcome,
} from '@/components/LiveStatus'
import { SanityLive } from '@/sanity/lib/live'
import { onContentChange } from '@/sanity/lib/live-action'

import './globals.css'

export const metadata: Metadata = {
  title: 'LyonDrive — Location de voiture à Lyon',
}

export default async function SiteLayout({ children }: LayoutProps<'/'>) {
  const { isEnabled: isDraftMode } = await draftMode()

  return (
    <>
      {/* GTM (+ GA4) : ici plutôt que dans le layout racine, pour ne pas mesurer l'admin. */}
      <Analytics />
      <header>
        <Link href="/" className="logo">
          LyonDrive
        </Link>
        <nav>
          <Link href="/">Accueil</Link>
          <Link href="/blog">Blog</Link>
          <Link href="/bench">Bench</Link>
          {/* Lien classique : l'admin est une autre application, chargement complet. */}
          <a href="/admin">Admin</a>
          <LiveStatus />
        </nav>
      </header>
      <main>{children}</main>

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
