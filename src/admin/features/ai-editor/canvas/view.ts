import type { BridgeView } from '@/admin/editor-bridge/protocol'
import { toTargetRef } from '@/admin/editor-bridge/zones'
import { isLocked, type EditorState } from '../state/store'

/**
 * État d'affichage du pont, dérivé du magasin de l'éditeur. Pur.
 * - pendant une demande (locked) : reflet sur les éléments visés par la demande, pas de sélection ni de survol ;
 * - modification à valider (hors travail) : cadre « … — modified by Claude » sur ses éléments ;
 * - sinon : la sélection courante.
 */
export function bridgeViewFrom(state: EditorState, scale: number): BridgeView {
  const locked = isLocked(state)
  const working = locked && state.job ? state.job.request.targets.map(toTargetRef) : []
  const review = !locked && state.pending?.status === 'to-validate' ? state.pending.targets.map(toTargetRef) : []
  return {
    mode: state.mode,
    locked,
    scale: scale > 0 && scale <= 1 ? scale : 1,
    selection: state.selection.map(toTargetRef),
    working: working.slice(0, 8),
    review: review.slice(0, 8),
  }
}
