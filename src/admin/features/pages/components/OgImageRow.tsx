'use client'

import { useId, useRef, useState, type DragEvent, type ReactNode } from 'react'

import { Button, ImagePreview } from '@/admin/ui'

import styles from './SeoView.module.css'

/**
 * Ligne « OG image » de C2 / C6 : libellé + « 1200 × 630 pixels » + Upload (subtle), aperçu au ratio 1200 × 630
 * avec la pastille × pour retirer. Glisser-déposer accepté sur l'aperçu. L'envoi réel est fait par l'appelant.
 */
export function OgImageRow({
  src,
  removable,
  onFile,
  onRemove,
  uploading,
  disabled,
  error,
  extra,
  note,
}: {
  /** Image affichée (la valeur effective : celle du champ, sinon celle qui s'applique à sa place). */
  src: string | null
  /** La pastille × n'apparaît que pour une image propre au champ. */
  removable: boolean
  onFile: (file: File) => void
  onRemove: () => void
  uploading: boolean
  disabled: boolean
  error?: string | null
  /** Ligne sous les dimensions (C6 : « From field [cover] »). */
  extra?: ReactNode
  /** Précision sous le bouton (« Using the site image »). */
  note?: ReactNode
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const labelId = useId()
  const errorId = useId()

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragOver(false)
    if (disabled) return
    const file = event.dataTransfer.files?.[0]
    if (file) onFile(file)
  }

  return (
    <div className={styles.ogRow} role="group" aria-labelledby={labelId} aria-describedby={error ? errorId : undefined}>
      <div className={styles.ogMeta}>
        <div className={styles.ogLabels}>
          <span id={labelId} className={styles.ogLabel}>
            OG image
          </span>
          <span className={styles.ogDimensions}>1200 × 630 pixels</span>
        </div>
        {extra}
        <div>
          <Button variant="subtle" size="small" loading={uploading} disabled={disabled} onClick={() => inputRef.current?.click()}>
            Upload
          </Button>
        </div>
        {note ? <p className={styles.ogNote}>{note}</p> : null}
        {error ? (
          <p id={errorId} className={styles.ogError} role="alert">
            {error}
          </p>
        ) : null}
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="kz-visually-hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) onFile(file)
          }}
        />
      </div>
      <div
        className={styles.ogPreview}
        data-dragover={dragOver || undefined}
        onDragOver={(event) => {
          if (disabled) return
          event.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <ImagePreview
          src={src}
          alt=""
          width={375}
          emptyLabel="Drop image"
          removeLabel="Remove OG image"
          onRemove={removable && !disabled ? onRemove : undefined}
        />
      </div>
    </div>
  )
}
