'use client'

import { useId, useRef, type HTMLAttributes, type ReactNode, type Ref } from 'react'
import { Button } from '../Button'
import { RemoveBadge } from '../RemoveBadge'
import { cx } from '../utils/cx'
import styles from './FaviconPreview.module.css'

export type FaviconPreviewProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  /** Thème du navigateur simulé. */
  theme?: 'light' | 'dark'
  /** Favicon (URL), affiché 16 × 16 dans l'onglet actif. */
  src?: string | null
  /** Libellé sous l'aperçu (défaut « Light » / « Dark »). */
  label?: ReactNode
  /** Fichier choisi par le bouton Upload (l'envoi réel est fait par la feature). */
  onFile?: (file: File) => void
  accept?: string
  /** Pastille de suppression (Figma : Show remove). */
  onRemove?: () => void
  uploadLabel?: string
  disabled?: boolean
  ref?: Ref<HTMLDivElement>
}

/**
 * Favicon dans un onglet de navigateur (Figma « Favicon preview » 410:1592), 180 px : cadre 180×110 radius/lg,
 * liseré border/edge, Remove badge en haut à droite ; pied : libellé Body Small + Button subtle small « Upload ».
 * Le navigateur est redessiné en CSS (le Figma utilise une capture) ; les onglets voisins sont neutres.
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
  const text = label ?? (theme === 'light' ? 'Light' : 'Dark')
  return (
    <div ref={ref} data-theme-preview={theme} className={cx(styles.favicon, className)} {...rest}>
      <div className={styles.preview}>
        <div className={cx(styles.frame, theme === 'dark' ? styles.dark : styles.light)} aria-hidden="true">
          <div className={styles.chrome}>
            <span className={cx(styles.tab, styles.side)}>
              <span className={styles.ghostIcon} />
            </span>
            <span className={cx(styles.tab, styles.active)}>
              {src ? (
                // eslint-disable-next-line @next/next/no-img-element -- composant pur du kit
                <img className={styles.icon} src={src} alt="" width={16} height={16} />
              ) : (
                <span className={styles.placeholder} />
              )}
            </span>
            <span className={cx(styles.tab, styles.side)}>
              <span className={styles.ghostIcon} />
            </span>
          </div>
          <div className={styles.page} />
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
