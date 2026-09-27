import { PublishSkeleton } from '@/admin/features/publish/PublishSkeleton'

/** E1 / E2 pendant la lecture du moteur (jusqu'à 15 s si le moteur est lent). */
export default function PublishLoading() {
  return <PublishSkeleton />
}
