import type { Metadata } from 'next'
import { draftMode } from 'next/headers'
import { VisualEditing } from 'next-sanity/visual-editing'

import { EditorBridge } from '@/admin/editor-bridge'
import { LiveEditButton } from '@/admin/live-edit'
import { Analytics } from '@/components/Analytics'
import { DraftModeBanner } from '@/components/DraftModeBanner'
import { SiteFooter } from '@/components/layout/SiteFooter'
import { SiteHeader } from '@/components/layout/SiteHeader'
import { onLiveError, onLiveGoAway, onLiveReconnect, onLiveWelcome } from '@/components/LiveStatus'
import { SiteScripts } from '@/components/site-scripts/SiteScripts'
import { isEditorPreview } from '@/lib/editor/preview'
import { layoutMetadata } from '@/lib/seo'
import { SanityLive, sanityFetch } from '@/sanity/lib/live'
import { onContentChange } from '@/sanity/lib/live-action'
import { SITE_SETTINGS_QUERY } from '@/sanity/lib/queries'

import '@/styles/tokens.css'
import '@/styles/base.css'

// Réglages du site (B2) : modèle de titre, description et image de partage par défaut, favicons,
// indexation. Sans document siteSettings, les valeurs d'avant l'admin (« Conduit »).
export async function generateMetadata(): Promise<Metadata> {
  const { data: settings } = await sanityFetch({ query: SITE_SETTINGS_QUERY, stega: false })
  return layoutMetadata(settings)
}

export default async function SiteLayout({ children }: LayoutProps<'/'>) {
  // Aperçu de l'éditeur IA (KZ_EDITOR_PREVIEW=1) : brouillons sans stega, ni overlays de Sanity, ni
  // mesure, ni scripts du site ; le pont de l'éditeur à la place (src/lib/editor/preview.ts).
  const editorPreview = isEditorPreview()
  const { isEnabled: isDraftMode } = await draftMode()
  const { data: settings } = await sanityFetch({ query: SITE_SETTINGS_QUERY, stega: false })
  const scripts = settings?.scripts

  return (
    <>
      {/* Scripts de siteSettings pour toutes les pages (B3) : jamais en Draft Mode ni en aperçu. */}
      <SiteScripts scripts={scripts} page="all" placements={['headEnd', 'bodyStart']} />
      {/* GTM (+ GA4) : ici plutôt que dans le layout racine, pour ne pas mesurer l'admin. */}
      {!editorPreview && <Analytics />}
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main">{children}</main>
      <SiteFooter />

      {/* Écoute le Live Content API : une publication met à jour la page ouverte.
          SANITY_LIVE_MODE=swr → action par défaut de next-sanity 13, pour comparer.
          Pas dans l'aperçu de l'éditeur : il lit les brouillons sans cache, le pont demande un refresh. */}
      {!editorPreview && (
        <SanityLive
          action={process.env.SANITY_LIVE_MODE === 'swr' ? undefined : onContentChange}
          onWelcome={onLiveWelcome}
          onError={onLiveError}
          onReconnect={onLiveReconnect}
          onGoAway={onLiveGoAway}
        />
      )}

      {isDraftMode && !editorPreview && (
        <>
          <DraftModeBanner />
          {/* Survol → clic → ouvre le bon champ dans le Studio. */}
          <VisualEditing />
        </>
      )}

      <SiteScripts scripts={scripts} page="all" placements={['bodyEnd']} />

      {/* « Edit with AI » (question 9, src/admin/live-edit) : rien dans le HTML ; affiché côté client seulement si la
          personne connectée à l'admin peut modifier cette page. Jamais en aperçu de l'éditeur ni en Draft Mode. */}
      {!editorPreview && !isDraftMode && <LiveEditButton />}

      {/* Pont de l'éditeur IA (propriété d'editor-canvas) : aperçu 4042 seulement. */}
      {editorPreview && <EditorBridge />}
    </>
  )
}
