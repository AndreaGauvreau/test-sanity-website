'use client'

import { viewportOf, type Viewport } from '@/admin/core/contracts/engine'
import { SegmentedControl } from '@/admin/ui'
import type { EditorMode } from '../state/store'
import { VIEWPORTS } from './scale'
import styles from './EditorToolbar.module.css'

const MODES = [
  { value: 'view', label: 'View', icon: 'eye' },
  { value: 'select', label: 'Select', icon: 'select' },
] as const

export type EditorToolbarProps = {
  mode: EditorMode
  viewport: Viewport
  /** Claude travaille : View / Select grisés ; Desktop / Tablet / Mobile restent actifs (G2). */
  locked: boolean
  onModeChange: (mode: EditorMode) => void
  onViewportChange: (viewport: Viewport) => void
}

/**
 * Barre d'outils flottante de l'aperçu (Figma « Editor toolbar » 340:1486) : View (œil) · Select (curseur) |
 * Desktop · Tablet · Mobile, en icônes avec infobulle. `locked` : seul le groupe des formats reste actif.
 * Une largeur d'une version précédente (768, l'ancien Tablet) s'affiche sur son format actuel (`viewportOf`).
 */
export function EditorToolbar({ mode, viewport, locked, onModeChange, onViewportChange }: EditorToolbarProps) {
  return (
    <div role="group" aria-label="Preview tools" className={styles.toolbar} data-locked={locked || undefined}>
      <SegmentedControl<EditorMode>
        aria-label="Mode"
        items={MODES}
        value={mode}
        disabled={locked}
        onValueChange={onModeChange}
      />
      <span className={styles.divider} aria-hidden="true" />
      <SegmentedControl<string>
        aria-label="Screen size"
        items={VIEWPORTS.map((v) => ({ value: String(v.value), label: v.label, icon: v.icon }))}
        value={String(viewportOf(viewport))}
        onValueChange={(value) => onViewportChange(viewportOf(Number(value)))}
      />
    </div>
  )
}
