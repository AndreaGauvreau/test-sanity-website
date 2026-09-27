import { ShellNotFound } from '@/admin/shell/states/ShellNotFound'

// notFound() d'un écran de la coque, et droit refusé en page (requireCapability → 404) : dans la coque.
export default function ShellNotFoundPage() {
  return <ShellNotFound />
}
