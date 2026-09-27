'use client'

import { useEffect } from 'react'

import type { ZoneLabels } from '@/admin/editor-bridge/zones'
import { EditorCanvas } from '../canvas'
import { EditorSidebar } from '../sidebar'
import { EditorStoreProvider, useEditorStore } from '../state/context'
import styles from './EditorScreen.module.css'

export type EditorScreenProps = {
  pageId: string
  /** Chemin public de la page (« / »). */
  path: string
  pageLabel: string
  labels: ZoneLabels
  /** Écran d'origine pour « ‹ Admin » (chemin /admin… déjà nettoyé), ou null. */
  backHref?: string | null
  previewOverride?: string | null
}

/**
 * Écran plein écran de l'éditeur IA (D1-D3), hors de la coque de l'admin : sidebar Claude (editor-sidebar) à gauche,
 * aperçu du brouillon (editor-canvas) sur le reste. Un magasin par écran (EditorStoreProvider).
 */
export function EditorScreen({ pageId, path, pageLabel, labels, backHref, previewOverride }: EditorScreenProps) {
  return (
    <EditorStoreProvider pageId={pageId} path={path} backHref={backHref}>
      <EscapeDeselects />
      <div className={styles.screen}>
        <EditorSidebar />
        <EditorCanvas pageLabel={pageLabel} labels={labels} previewOverride={previewOverride} />
      </div>
    </EditorStoreProvider>
  )
}

/**
 * Échap = tout désélectionner (G2). Ignoré si une couche l'a déjà traité (menu, infobulle, fenêtre : ils appellent
 * preventDefault) ou si une fenêtre modale est ouverte. Dans l'aperçu, c'est le pont qui relaie Échap.
 */
function EscapeDeselects() {
  const store = useEditorStore()
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      if (document.querySelector('[aria-modal="true"]')) return
      store.clearSelection()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [store])
  return null
}
