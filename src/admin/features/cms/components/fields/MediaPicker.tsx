'use client'

import { useEffect, useState } from 'react'

import { EmptyState, Icon, Modal, ProgressBar, SearchField, cx } from '@/admin/ui'
import { listImagesAction } from '@/admin/features/media/server/actions'
import type { PickerImage } from '@/admin/features/media/server/actions-core'

import styles from './fields.module.css'

/**
 * Choix d'une image de la médiathèque pour un champ image (C4 « Replace (médiathèque ou fichier) »).
 * Fenêtre modale : grille d'images (boutons bascule, flèches entre les vignettes), recherche, « Use image ».
 */
export function MediaPicker({
  open,
  onClose,
  onPick,
  current,
}: {
  open: boolean
  onClose: () => void
  onPick: (image: PickerImage) => void
  current?: string | null
}) {
  const [images, setImages] = useState<PickerImage[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setSelected(null)
    setError(null)
    listImagesAction()
      .then((result) => {
        if (cancelled) return
        if (result.ok) setImages(result.images)
        else setError(result.error)
      })
      .catch(() => !cancelled && setError("Couldn't load the media library."))
    return () => {
      cancelled = true
    }
  }, [open])

  const terms = search.trim().toLowerCase()
  const visible = (images ?? []).filter((i) => !terms || `${i.name} ${i.altText}`.toLowerCase().includes(terms))
  const picked = visible.find((i) => i.id === selected) ?? null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Choose from Media"
      description="The alt text stays on the image, in Media."
      width={640}
      confirmLabel="Use image"
      confirmDisabled={!picked}
      onConfirm={() => {
        if (picked) onPick(picked)
      }}
    >
      <div className={styles.picker}>
        <SearchField value={search} onValueChange={setSearch} shortcut={false} label="Search images" />
        {error ? (
          <p className={styles.pickerError} role="alert">
            {error}
          </p>
        ) : images === null ? (
          <div className={styles.pickerLoading} role="status">
            <ProgressBar label="Loading images" />
            <span>Loading images…</span>
          </div>
        ) : visible.length === 0 ? (
          <EmptyState icon="image" title={images.length ? 'No results' : 'No images yet'} description={images.length ? 'Try another search.' : 'Upload images in Media.'} headingLevel={3} />
        ) : (
          <div className={styles.pickerGrid} role="group" aria-label="Images">
            {visible.map((image) => (
              <button
                key={image.id}
                type="button"
                className={cx(styles.pickerItem, selected === image.id && styles.pickerItemSelected)}
                aria-pressed={selected === image.id}
                onClick={() => setSelected(image.id)}
                onDoubleClick={() => onPick(image)}
              >
                <span className={styles.pickerThumb}>
                  {image.thumb ? <img src={image.thumb} alt="" loading="lazy" /> : <Icon name="image" size={18} />}
                  {current === image.id ? <span className={styles.pickerCurrent}>Current</span> : null}
                </span>
                <span className={styles.pickerName}>{image.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
