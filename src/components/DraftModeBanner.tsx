'use client'

import { useIsPresentationTool } from 'next-sanity/hooks'

import styles from './DraftModeBanner.module.css'

// Visible seulement quand le Draft Mode est actif hors de l'admin
// (dans l'onglet « Aperçu live », l'admin a déjà sa propre barre).
export function DraftModeBanner() {
  const isPresentationTool = useIsPresentationTool()
  if (isPresentationTool !== false) return null

  return (
    <div className={styles.banner}>
      Brouillons visibles (Draft Mode) · <a href="/api/draft-mode/disable">Revenir au contenu publié</a>
    </div>
  )
}
