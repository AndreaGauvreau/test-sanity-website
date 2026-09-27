import type { CSSProperties, HTMLAttributes, ReactNode, Ref } from 'react'
import { RemoveBadge } from '../RemoveBadge'
import { cx } from '../utils/cx'
import styles from './ImagePreview.module.css'

export type ImagePreviewProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  /** Image (URL) ; absente = état empty (« Drop image »). */
  src?: string | null
  /** Texte alternatif de l'image (vide si décorative). */
  alt?: string
  /** Rapport largeur / hauteur : 1200 / 630 (1,905) par défaut, format des images sociales. */
  ratio?: number
  /** Largeur (375 par défaut ; « 100% » pour s'étirer). */
  width?: number | string
  /** Bouton de suppression (Remove badge) sur le coin haut droit. */
  onRemove?: () => void
  removeLabel?: string
  /** Texte de l'état vide. */
  emptyLabel?: ReactNode
  ref?: Ref<HTMLDivElement>
}

/**
 * Image au ratio 1200 × 630 (Figma « Image preview » 410:1609) : cadre radius/lg, bg/input, liseré border/edge
 * 0,91 px intérieur ; filled = image + Remove badge ; empty = « Drop image » (text/tertiary).
 */
export function ImagePreview({
  src,
  alt = '',
  ratio = 1200 / 630,
  width = 375,
  onRemove,
  removeLabel = 'Remove image',
  emptyLabel = 'Drop image',
  className,
  style,
  ref,
  ...rest
}: ImagePreviewProps) {
  return (
    <div
      ref={ref}
      data-state={src ? 'filled' : 'empty'}
      className={cx(styles.preview, className)}
      style={{ ...style, width, aspectRatio: String(ratio) } as CSSProperties}
      {...rest}
    >
      <div className={styles.frame}>
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- composant pur du kit, sans next/image
          <img className={styles.image} src={src} alt={alt} />
        ) : (
          <span className={styles.empty}>{emptyLabel}</span>
        )}
        <span className={styles.edge} aria-hidden="true" />
      </div>
      {src && onRemove ? <RemoveBadge corner label={removeLabel} onClick={onRemove} /> : null}
    </div>
  )
}
