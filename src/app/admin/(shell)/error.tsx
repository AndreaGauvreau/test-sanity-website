'use client'

import { ShellError } from '@/admin/shell/states/ShellError'

// Erreur d'un écran de la coque (Next 16 : `retry` refait la requête et le rendu). La sidebar reste utilisable.
export default function ShellErrorBoundary({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ShellError error={error} retry={retry} />
}
