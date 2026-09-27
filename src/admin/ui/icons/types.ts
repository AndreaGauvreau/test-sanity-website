/** Un tracé d'icône, tel qu'extrait des SVG du Figma (voir generate.mjs). */
export type IconPath = {
  d: string
  /** Remplissage en currentColor. */
  fill?: true
  /** Épaisseur du trait en currentColor (extrémités et jonctions arrondies). */
  stroke?: number
  /** Opacité du calque : 0.3 = ton de fond duotone ; dégradé pour « loader ». */
  opacity?: number
  /** fill-rule / clip-rule evenodd. */
  evenodd?: true
}
