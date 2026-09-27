import type { Metadata } from 'next'

import { ShellNotFound } from '@/admin/shell/states/ShellNotFound'

export const metadata: Metadata = { title: 'Page not found' }

// notFound() hors de la coque (galerie du kit en production, éditeur plein écran…) : plein écran, thème de l'admin.
export default function AdminNotFound() {
  return <ShellNotFound standalone />
}
