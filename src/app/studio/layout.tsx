import { SanityLive } from '@/sanity/lib/live'
import { onPublishFromAdmin } from '@/sanity/lib/live-action'

// Studio Sanity embarqué (/studio), outil de Kuartz : le client passe par l'admin (/admin).
// Le Studio écoute aussi les publications (contenu publié uniquement) pour vider le cache du
// site, même quand aucun onglet du site n'est ouvert. Rien du site (CSS, analytics) n'est chargé ici.
export default function StudioLayout({ children }: LayoutProps<'/studio'>) {
  return (
    <>
      {children}
      <SanityLive includeDrafts={false} action={onPublishFromAdmin} onWelcome={false} />
    </>
  )
}
