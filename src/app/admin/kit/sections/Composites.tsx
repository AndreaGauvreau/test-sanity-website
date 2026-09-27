'use client'

import { CompositesDataDisplay } from './CompositesDataDisplay'
import { CompositesNavigation } from './CompositesNavigation'
import { CompositesAIEditor, CompositesOverlays } from './CompositesOverlays'

/** Section de ui-composites : Data display (composites), Navigation, Overlays, AI editor (Model usage). */
export function Composites() {
  return (
    <>
      <CompositesDataDisplay />
      <CompositesNavigation />
      <CompositesOverlays />
      <CompositesAIEditor />
    </>
  )
}
