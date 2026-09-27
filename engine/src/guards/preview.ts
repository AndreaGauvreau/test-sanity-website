import { startVisualSession, type VisualSession, type VisualSettings } from './visual'

/**
 * Aperçu du brouillon vu par les contrôles du rendu, derrière une interface injectable : engine-core passe la vraie
 * (chromePreview : Chrome via playwright-core, channel « chrome ») en production, une fausse dans ses tests. Une session
 * = une page, une zone, une occurrence : elle capture l'état d'avant à l'ouverture, puis `measure()` (outil measure de
 * Claude) et `verify()` (après l'essai de Claude) relisent le brouillon ; `close()` ferme le navigateur, TOUJOURS
 * (finally), même après une erreur.
 */

/** Largeurs relevées : mobile, tablette, ordinateur (celles de la barre d'outils de l'éditeur). Gelée. */
export const PREVIEW_VIEWPORTS: readonly number[] = Object.freeze([375, 768, 1280])

/** Réglages de l'aperçu (voir VisualSettings) ; `viewports` vaut PREVIEW_VIEWPORTS par défaut. */
export type PreviewSettings = Omit<VisualSettings, 'viewports'> & { viewports?: readonly number[] }

export type Preview = {
  /**
   * Ouvre une session sur `page` (chemin absolu de l'aperçu, `/`) pour la zone `zone` (data-edit), occurrence `index`
   * (0 pour une zone unique). Lève une erreur si l'aperçu ou le navigateur ne répondent pas, ou si le chemin sort de
   * l'origine de l'aperçu.
   */
  open: (page: string, zone: string, index: number) => Promise<VisualSession>
}

/** L'aperçu réel : Chrome installé (repli : le Chromium de Playwright), cookie du secret d'aperçu sur son origine. */
export function chromePreview(settings: PreviewSettings): Preview {
  const full: VisualSettings = { ...settings, viewports: [...(settings.viewports ?? PREVIEW_VIEWPORTS)] }
  return { open: (page, zone, index) => startVisualSession(full, page, zone, index) }
}
