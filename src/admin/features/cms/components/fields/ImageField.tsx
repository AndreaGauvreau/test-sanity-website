'use client'

import { useState } from 'react'

import { Button, ImageUpload } from '@/admin/ui'
import { uploadFile } from '@/admin/features/media/components/upload'

import type { ImageInfo } from '../../server/data'
import { MediaPicker } from './MediaPicker'
import styles from './fields.module.css'

/**
 * Champ image d'une fiche (C4 « Cover image ») : Image upload du kit (aperçu, « cover.jpg · 420 KB », Replace
 * = fichier, corbeille) + « Choose from Media » (médiathèque). L'image envoyée devient un asset de Media ;
 * le champ du brouillon pointe vers lui. « Alt text required » tant que l'asset n'a pas de texte alternatif
 * (il se règle dans Media : une valeur par image, question 13).
 */
export function ImageField({
  id,
  label,
  image,
  error,
  onSave,
}: {
  id: string
  label: string
  image: ImageInfo | null
  error?: string | null
  /** Enregistre l'id d'asset (null = retirer) ; renvoie une erreur éventuelle. */
  onSave: (assetId: string | null) => Promise<string | null>
}) {
  const [current, setCurrent] = useState<ImageInfo | null>(image)
  const [uploading, setUploading] = useState<{ name: string; progress?: number } | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [picker, setPicker] = useState(false)

  const apply = async (next: ImageInfo | null) => {
    const previous = current
    setCurrent(next)
    const failure = await onSave(next ? next.assetId : null)
    if (failure) {
      setCurrent(previous)
      setProblem(failure)
    } else setProblem(null)
  }

  return (
    <div className={styles.imageField} id={id} tabIndex={-1}>
      <ImageUpload
        label={label}
        hint={current && !current.altText ? 'Alt text required' : undefined}
        value={current ? { src: current.src, name: current.name, size: current.size, alt: current.altText } : null}
        uploading={uploading}
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/svg+xml"
        maxSize={20 * 1024 * 1024}
        formats="PNG, JPG, WebP, GIF or SVG · 20 MB max"
        error={problem ?? error ?? undefined}
        onFile={async (file) => {
          setProblem(null)
          setUploading({ name: file.name })
          const result = await uploadFile(file, { onProgress: (progress) => setUploading({ name: file.name, progress }) })
          setUploading(null)
          if (!result.ok) {
            setProblem(result.error)
            return
          }
          await apply({ assetId: result.asset.id, src: result.asset.preview ?? result.asset.thumb, name: result.asset.name, size: result.asset.size, altText: result.asset.altText })
        }}
        onRemove={() => void apply(null)}
      />
      <div className={styles.imageActions}>
        <Button variant="ghost" size="small" iconLeft="image" onClick={() => setPicker(true)} disabled={!!uploading}>
          Choose from Media
        </Button>
      </div>
      <MediaPicker
        open={picker}
        current={current?.assetId}
        onClose={() => setPicker(false)}
        onPick={(picked) => {
          setPicker(false)
          void apply({ assetId: picked.id, src: picked.thumb?.replace(/\?.*$/, '?w=1600&fit=max&auto=format') ?? null, name: picked.name, altText: picked.altText })
        }}
      />
    </div>
  )
}
