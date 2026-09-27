import type { Metadata } from 'next'
import { NextStudio, metadata as studioMetadata } from 'next-sanity/studio'

import config from '../../../../sanity.config'

// Le Studio est une application 100 % navigateur : la page est générée une fois, en statique.
// Réservé à Kuartz (le bouton Publish natif publierait un texte sans le code de l'éditeur IA) :
// le client utilise l'admin, sur /admin.
export const dynamic = 'force-static'

export const metadata: Metadata = { ...studioMetadata, title: 'Studio — Conduit' }
export { viewport } from 'next-sanity/studio'

export default function StudioPage() {
  return <NextStudio config={config} />
}
