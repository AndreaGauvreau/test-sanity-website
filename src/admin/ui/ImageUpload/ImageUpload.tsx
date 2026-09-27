'use client'

import { useId, useRef, useState, type DragEvent, type ReactNode, type Ref } from 'react'
import { Button } from '../Button'
import { Icon } from '../icons'
import { IconButton } from '../IconButton'
import { ProgressBar } from '../ProgressBar'
import { cx } from '../utils/cx'
import { formatBytes } from './format'
import styles from './ImageUpload.module.css'

export type ImageUploadValue = {
  /** Aperçu (URL) ; sans URL, l'icône image et le nom sont affichés comme dans le Figma. */
  src?: string | null
  name: string
  /** Taille en octets (« 184 KB »). */
  size?: number
  alt?: string
}

export type ImageUploadRejection = { reason: 'type' | 'size'; file: File; message: string }

export type ImageUploadProps = {
  label?: ReactNode
  hideLabel?: boolean
  /** Dimensions conseillées, à droite du libellé (« 1200 × 630 px »). */
  hint?: ReactNode
  /** Image en place (état filled). */
  value?: ImageUploadValue | null
  /** Envoi en cours (état uploading) : nom et avancement 0-100 (absent = indéterminé). */
  uploading?: { name: string; progress?: number } | null
  /** Fichier valide choisi ou déposé. L'envoi réel est fait par la feature. */
  onFile: (file: File) => void
  /** Fichier refusé (type ou taille) ; un message est aussi affiché sous la zone. */
  onReject?: (rejection: ImageUploadRejection) => void
  /** Suppression (bouton corbeille de l'état filled). */
  onRemove?: () => void
  /**
   * Actions de la feature (FOLLOWUPS #38), ex. `<Button variant="ghost" size="small">Choose from Media</Button>`.
   * Rempli : dans la ligne fichier, avant Replace. Vide / envoi : ligne d'actions sous la zone.
   * La feature gère leur état (désactivées pendant l'envoi si besoin).
   */
  actions?: ReactNode
  /** Types acceptés (défaut PNG, JPG, WebP). */
  accept?: string
  /** Taille max en octets (défaut 5 Mo). */
  maxSize?: number
  /** Ligne des formats (Caption, text/muted). */
  formats?: ReactNode
  /** Erreur fournie par la feature (échec d'envoi). */
  error?: ReactNode
  disabled?: boolean
  /** Hauteur de la zone (190 par défaut). */
  height?: number
  className?: string
  ref?: Ref<HTMLDivElement>
}

function matchesAccept(file: File, accept: string): boolean {
  const rules = accept.split(',').map((r) => r.trim().toLowerCase()).filter(Boolean)
  if (rules.length === 0) return true
  const type = file.type.toLowerCase()
  const name = file.name.toLowerCase()
  return rules.some((rule) =>
    rule.startsWith('.') ? name.endsWith(rule) : rule.endsWith('/*') ? type.startsWith(rule.slice(0, -1)) : type === rule,
  )
}

/**
 * Envoi d'image (Figma « Image upload » 330:408) : empty (pointillés border/strong), dragover (bg/tint/info,
 * pointillés border/focus, « Drop to upload »), uploading (Progress bar + message), filled (aperçu + ligne
 * fichier : Replace, corbeille). Glisser-déposer ou clic (Entrée / Espace) pour parcourir.
 * `actions` : emplacement pour les actions de la feature (« Choose from Media »), dans la ligne fichier ou sous la zone.
 */
export function ImageUpload({
  label = 'Image',
  hideLabel,
  hint,
  value,
  uploading,
  onFile,
  onReject,
  onRemove,
  actions,
  accept = 'image/png,image/jpeg,image/webp',
  maxSize = 5 * 1024 * 1024,
  formats = 'PNG, JPG or WebP · 5 MB max',
  error,
  disabled,
  height = 190,
  className,
  ref,
}: ImageUploadProps) {
  const id = useId()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const depth = useRef(0)
  const [dragging, setDragging] = useState(false)
  const [rejection, setRejection] = useState<string | null>(null)
  const state = uploading ? 'uploading' : dragging ? 'dragover' : value ? 'filled' : 'empty'
  const labelId = `${id}-label`
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const message = error ?? rejection

  const accept1 = (file: File | undefined) => {
    if (!file) return
    if (!matchesAccept(file, accept)) {
      const msg = `${file.name} isn't a supported image. Use ${typeof formats === 'string' ? formats.split(' ·')[0] : 'another format'}.`
      setRejection(msg)
      onReject?.({ reason: 'type', file, message: msg })
      return
    }
    if (file.size > maxSize) {
      const msg = `${file.name} is ${formatBytes(file.size)}. The limit is ${formatBytes(maxSize)}.`
      setRejection(msg)
      onReject?.({ reason: 'size', file, message: msg })
      return
    }
    setRejection(null)
    onFile(file)
  }

  const browse = () => {
    if (!disabled && !uploading) inputRef.current?.click()
  }

  const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes('Files')

  const dropHandlers = disabled || uploading
    ? {}
    : {
        onDragEnter: (event: DragEvent<HTMLElement>) => {
          if (!hasFiles(event)) return
          event.preventDefault()
          depth.current += 1
          setDragging(true)
        },
        onDragOver: (event: DragEvent<HTMLElement>) => {
          if (!hasFiles(event)) return
          event.preventDefault()
          event.dataTransfer.dropEffect = 'copy'
        },
        onDragLeave: () => {
          depth.current = Math.max(0, depth.current - 1)
          if (depth.current === 0) setDragging(false)
        },
        onDrop: (event: DragEvent<HTMLElement>) => {
          event.preventDefault()
          depth.current = 0
          setDragging(false)
          accept1(event.dataTransfer.files?.[0])
        },
      }

  const describedBy = [hint != null ? hintId : undefined, message ? errorId : undefined].filter(Boolean).join(' ') || undefined

  let zone: ReactNode
  if (state === 'uploading' && uploading) {
    const pct = uploading.progress
    zone = (
      <div className={cx(styles.zone, styles.uploading)} style={{ height }} aria-labelledby={labelId}>
        <ProgressBar value={pct} label={`Uploading ${uploading.name}`} className={styles.progress} />
        <span className={styles.message} role="status" aria-live="polite">
          Uploading {uploading.name}…{pct != null ? ` ${Math.round(pct)}%` : ''}
        </span>
      </div>
    )
  } else if (state === 'filled' && value) {
    zone = (
      <div className={cx(styles.zone, styles.filled)} style={{ height }} {...dropHandlers}>
        {value.src ? (
          // eslint-disable-next-line @next/next/no-img-element -- composant pur du kit
          <img className={styles.image} src={value.src} alt={value.alt ?? ''} />
        ) : (
          <>
            <Icon name="image" size={18} />
            <span className={styles.fileName}>{value.name}</span>
          </>
        )}
      </div>
    )
  } else {
    zone = (
      <button
        type="button"
        className={cx(styles.zone, styles.drop, dragging && styles.dragover)}
        style={{ height }}
        disabled={disabled}
        aria-labelledby={`${labelId} ${id}-cta`}
        aria-describedby={describedBy}
        onClick={browse}
        {...dropHandlers}
      >
        <svg className={styles.dash} aria-hidden="true" focusable="false">
          <rect className={styles.dashRect} />
        </svg>
        <Icon name="upload" size={18} />
        <span id={`${id}-cta`} className={cx(styles.message, dragging && styles.messageActive)}>
          {dragging ? 'Drop to upload' : 'Drop an image or browse'}
        </span>
        <span className={styles.formats}>{formats}</span>
      </button>
    )
  }

  return (
    <div ref={ref} data-state={state} className={cx(styles.upload, disabled && styles.disabled, className)}>
      <div className={cx(styles.labelRow, hideLabel && 'kz-visually-hidden')}>
        <span id={labelId} className={styles.label}>
          {label}
        </span>
        {hint != null ? (
          <span id={hintId} className={styles.hint}>
            {hint}
          </span>
        ) : null}
      </div>
      {zone}
      {state === 'filled' && value ? (
        <div className={styles.fileRow}>
          <span className={styles.file}>
            {value.name}
            {value.size != null ? ` · ${formatBytes(value.size)}` : ''}
          </span>
          {actions}
          <Button variant="secondary" size="small" onClick={browse} disabled={disabled} aria-describedby={labelId}>
            Replace
          </Button>
          {onRemove ? <IconButton icon="trash" label={`Remove ${value.name}`} onClick={onRemove} disabled={disabled} /> : null}
        </div>
      ) : actions != null && actions !== false ? (
        <div className={styles.actionRow}>{actions}</div>
      ) : null}
      {message ? (
        <p id={errorId} className={styles.error} role="alert">
          {message}
        </p>
      ) : null}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        hidden
        tabIndex={-1}
        onChange={(event) => {
          accept1(event.target.files?.[0])
          event.target.value = ''
        }}
      />
    </div>
  )
}
