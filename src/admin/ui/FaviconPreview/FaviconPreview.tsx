'use client'

import { useId, useRef, useState, type HTMLAttributes, type ReactNode, type Ref } from 'react'
import { Button } from '../Button'
import { RemoveBadge } from '../RemoveBadge'
import { cx } from '../utils/cx'
import styles from './FaviconPreview.module.css'
// Fonds exportés tels quels du Figma (calque « browser » de chaque variante, @2x = 360 × 220), sans le favicon d'exemple.
import bgDark from './favicon-bg-dark.png'
import bgLight from './favicon-bg-light.png'

/** Next fournit un StaticImageData ; Vite (vitest) une URL en chaîne. */
function assetUrl(asset: typeof bgLight | string): string {
  return typeof asset === 'string' ? asset : asset.src
}

const BACKGROUNDS = { light: assetUrl(bgLight), dark: assetUrl(bgDark) } as const

export type FaviconPreviewProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  /** Thème du navigateur (fond Figma clair ou sombre). */
  theme?: 'light' | 'dark'
  /** Favicon (URL), posé 16 × 16 dans l'onglet actif (x 72, y 35 du Figma). */
  src?: string | null
  /** Libellé sous l'aperçu (défaut « Light » / « Dark »). */
  label?: ReactNode
  /** Fichier choisi par le bouton Upload (l'envoi réel est fait par la feature). */
  onFile?: (file: File) => void
  accept?: string
  /** Pastille de suppression (Figma : Show remove), affichée seulement quand un favicon est présent. */
  onRemove?: () => void
  uploadLabel?: string
  disabled?: boolean
  ref?: Ref<HTMLDivElement>
}

/**
 * Favicon dans un onglet de navigateur (Figma « Favicon preview » 410:1592), 180 px : cadre 180×110 radius/lg
 * dont le fond est l'image du Figma (capture de navigateur clair / sombre), favicon de l'utilisateur superposé
 * à x 72 / y 35 (16 × 16), liseré border/edge, Remove badge en haut à droite ; pied : libellé Body Small +
 * Button subtle small « Upload ». Sans favicon (ou image illisible) : pastille neutre à la même place.
 */
export function FaviconPreview({
  theme = 'light',
  src,
  label,
  onFile,
  accept = 'image/png,image/x-icon,image/vnd.microsoft.icon,image/svg+xml',
  onRemove,
  uploadLabel = 'Upload',
  disabled,
  className,
  ref,
  ...rest
}: FaviconPreviewProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const labelId = useId()
  // URL dont le chargement a échoué : on retombe sur la pastille neutre (réinitialisé dès que src change).
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const showIcon = !!src && src !== failedSrc
  const text = label ?? (theme === 'light' ? 'Light' : 'Dark')
  return (
    <div ref={ref} data-theme-preview={theme} className={cx(styles.favicon, className)} {...rest}>
      <div className={styles.preview}>
        <div className={styles.frame} aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element -- le kit n'importe pas next/image */}
          <img className={styles.browser} src={BACKGROUNDS[theme]} alt="" width={180} height={110} draggable={false} />
          {showIcon ? (
            // eslint-disable-next-line @next/next/no-img-element -- le kit n'importe pas next/image
            <img
              className={styles.icon}
              src={src}
              alt=""
              width={16}
              height={16}
              draggable={false}
              onError={() => setFailedSrc(src)}
            />
          ) : (
            <span className={cx(styles.icon, styles.placeholder)} data-placeholder="" />
          )}
          <span className={styles.edge} />
        </div>
        {onRemove && src ? <RemoveBadge corner label={`Remove ${theme} favicon`} onClick={onRemove} disabled={disabled} /> : null}
      </div>
      <div className={styles.footer}>
        <span id={labelId} className={styles.label}>
          {text}
        </span>
        {onFile ? (
          <>
            <Button
              variant="subtle"
              size="small"
              disabled={disabled}
              aria-describedby={labelId}
              onClick={() => inputRef.current?.click()}
            >
              {uploadLabel}
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept={accept}
              hidden
              tabIndex={-1}
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) onFile(file)
                event.target.value = ''
              }}
            />
          </>
        ) : null}
      </div>
    </div>
  )
}
