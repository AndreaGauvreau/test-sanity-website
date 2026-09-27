import { ItemDrawerState } from '@/admin/features/cms/components/ItemDrawerState'

// Élément supprimé, id inconnu ou d'une autre collection.
export default function ItemNotFound() {
  return <ItemDrawerState kind="not-found" />
}
