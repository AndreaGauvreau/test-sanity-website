'use client'

import Link from 'next/link'
import { useRef, useState, type CSSProperties } from 'react'

import { Icon, Input, LockBadge, ToolLink, ToolLinks, type IconName } from '@/admin/ui'
import { useFieldSaver } from '@/admin/features/cms/components/useFieldSaver'

import { assetMetaLine, isDeletable, lockReason, type MediaAsset } from '../lib/assets'
import { previewRatio } from '../lib/preview'
import { updateAltTextAction } from '../server/actions'
import { MediaLightbox } from './MediaLightbox'
import { downloadUrl } from './upload'
import styles from './MediaLibrary.module.css'

/**
 * Fiche à droite de la médiathèque (C5) : aperçu dans le ratio du fichier (+ cadenas s'il est utilisé ; clic,
 * Entrée ou Espace : grand aperçu en Modal pour une image ou une vidéo), nom, méta, texte alternatif (sur l'asset :
 * vaut pour toutes les utilisations, enregistré pendant la frappe), « Used in N places » (lignes cliquables vers
 * l'écran concerné), actions en icônes collées (`ToolLinks` du kit) : Replace, Download, Delete (rouge, désactivé si
 * le fichier est utilisé, explication au survol).
 */
export function MediaDetails({
  asset,
  onReplace,
  onDelete,
  onAltSaved,
  replacing,
}: {
  asset: MediaAsset
  onReplace: (file: File) => void
  onDelete: () => void
  onAltSaved: (altText: string) => void
  replacing: boolean
}) {
  const [alt, setAlt] = useState(asset.altText)
  const fileInput = useRef<HTMLInputElement | null>(null)
  const saver = useFieldSaver<string>(async (altText) => {
    const result = await updateAltTextAction({ assetId: asset.id, altText })
    if (result.ok) onAltSaved(result.altText)
    return result.ok ? { ok: true } : { ok: false, error: result.error }
  })
  const used = asset.usages.length
  const deletable = isDeletable(asset)
  const accept = asset.kind === 'image' ? 'image/*' : asset.kind === 'video' ? 'video/mp4,video/webm,video/quicktime' : '.pdf,.txt,.csv,.zip'
  const icon: IconName = asset.kind === 'image' ? 'image' : asset.kind === 'video' ? 'play' : 'file'
  // Grand aperçu : image (aperçu disponible) ou vidéo (fichier lisible) ; PDF et autres fichiers : pas de Modal.
  const canPreview = asset.kind === 'image' ? !!asset.preview : asset.kind === 'video' ? !!asset.url : false
  const [lightbox, setLightbox] = useState(false)
  const previewButton = useRef<HTMLButtonElement | null>(null)
  const ratio = previewRatio(asset)
  const media = asset.preview ? <img src={asset.preview} alt="" className={styles.previewImage} /> : <Icon name={icon} size={18} />

  return (
    <aside className={styles.details} aria-label={`Details of ${asset.name}`}>
      {/* Ratio du fichier (dimensions de l'asset), hauteur plafonnée dans le CSS ; sans dimensions : cadre du Figma. */}
      <div className={styles.preview} style={ratio ? ({ '--preview-ratio': ratio } as CSSProperties) : undefined}>
        {canPreview ? (
          <button
            ref={previewButton}
            type="button"
            className={styles.previewButton}
            aria-label={`Preview ${asset.name}`}
            aria-haspopup="dialog"
            onClick={() => setLightbox(true)}
          >
            {media}
          </button>
        ) : (
          media
        )}
        {used > 0 ? <LockBadge label={lockReason(used)} className={styles.previewLock} /> : null}
      </div>
      {canPreview ? <MediaLightbox asset={asset} open={lightbox} onClose={() => setLightbox(false)} triggerRef={previewButton} /> : null}
      <h2 className={styles.name}>{asset.name}</h2>
      <p className={styles.meta}>{assetMetaLine(asset)}</p>
      {asset.kind === 'image' ? (
        <Input
          label="Alt text"
          value={alt}
          placeholder="Describe the image for screen readers"
          error={saver.error ?? undefined}
          title="Used everywhere this image appears on the site."
          onChange={(event) => {
            setAlt(event.target.value)
            saver.change(event.target.value)
          }}
          onBlur={() => void saver.flush()}
        />
      ) : null}
      <h3 className={styles.usedTitle}>{used > 0 ? `Used in ${used} ${used === 1 ? 'place' : 'places'}` : 'Not used on the site'}</h3>
      {used > 0 ? (
        <ul className={styles.places}>
          {asset.usages.map((place) => (
            <li key={place.id}>
              {place.adminHref ? (
                <Link href={place.adminHref} className={styles.place}>
                  <Icon name="locate" size={12} set={18} />
                  <span>{place.label}</span>
                </Link>
              ) : (
                <span className={styles.place}>
                  <Icon name="locate" size={12} set={18} />
                  <span>{place.label}</span>
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      <ToolLinks aria-label="File actions">
        <ToolLink icon="replace" label={replacing ? 'Replacing…' : 'Replace'} disabled={replacing} onClick={() => fileInput.current?.click()} />
        <ToolLink icon="download" label="Download" href={downloadUrl(asset) || undefined} download rel="noopener" />
        <ToolLink icon="trash" label="Delete" tone="danger" disabled={!deletable} disabledReason={deletable ? undefined : lockReason(used)} onClick={onDelete} />
      </ToolLinks>
      <input
        ref={fileInput}
        type="file"
        accept={accept}
        hidden
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) onReplace(file)
        }}
      />
    </aside>
  )
}
