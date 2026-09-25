import { SanityLive } from '@/sanity/lib/live'
import { onPublishFromAdmin } from '@/sanity/lib/live-action'

// L'admin écoute aussi les publications (contenu publié uniquement) pour vider le
// cache du site, même quand aucun onglet du site n'est ouvert.
export default function AdminLayout({ children }: LayoutProps<'/admin'>) {
  return (
    <>
      {children}
      <SanityLive includeDrafts={false} action={onPublishFromAdmin} onWelcome={false} />
    </>
  )
}
