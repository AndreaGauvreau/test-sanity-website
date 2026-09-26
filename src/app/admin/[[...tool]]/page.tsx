import type { Metadata } from 'next'
import { NextStudio, metadata as studioMetadata } from 'next-sanity/studio'

import config from '../../../../sanity.config'

// L'admin est une application 100 % navigateur : la page est générée une fois, en statique.
export const dynamic = 'force-static'

export const metadata: Metadata = { ...studioMetadata, title: 'Admin — Conduit' }
export { viewport } from 'next-sanity/studio'

export default function AdminPage() {
  return <NextStudio config={config} />
}
