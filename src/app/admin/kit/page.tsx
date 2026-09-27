import { notFound } from 'next/navigation'
import { Tag } from '@/admin/ui'
import { KitGallery } from './KitGallery'

// Galerie du kit : développement seulement (introuvable en production).
// Le Tag est rendu ici, côté serveur, pour vérifier que le barrel @/admin/ui s'importe depuis un Server Component.
export default function KitPage() {
  if (process.env.NODE_ENV === 'production') notFound()
  return <KitGallery badge={<Tag tone="info">DEV ONLY</Tag>} />
}
