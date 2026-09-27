import { ShellSkeleton } from '@/admin/shell/states/ShellSkeleton'

// Chargement d'un écran de la coque : la sidebar et la top bar restent, la zone de contenu montre un squelette.
export default function ShellLoading() {
  return <ShellSkeleton />
}
