'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'

import { Icon, Input, LockBadge, Tooltip, cx, type IconName } from '@/admin/ui'
import { useFieldSaver } from '@/admin/features/cms/components/useFieldSaver'

import { assetMetaLine, isDeletable, lockReason, type MediaAsset } from '../lib/assets'
import { updateAltTextAction } from '../server/actions'
import { downloadUrl } from './upload'
import styles from './MediaLibrary.module.css'

/**
 * Fiche à droite de la médiathèque (C5) : aperçu (+ cadenas si le fichier est utilisé), nom, méta, texte
 * alternatif (sur l'asset : vaut pour toutes les utilisations, enregistré pendant la frappe), « Used in N places »
 * (lignes cliquables vers l'écran concerné), actions en icônes collées : Replace, Download, Delete (rouge,
 * désactivé si le fichier est utilisé, explication au survol).
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

  return (
    <aside className={styles.details} aria-label={`Details of ${asset.name}`}>
      <div className={styles.preview}>
        {asset.preview ? <img src={asset.preview} alt={asset.altText} className={styles.previewImage} /> : <Icon name={icon} size={18} />}
        {used > 0 ? <LockBadge label={lockReason(used)} className={styles.previewLock} /> : null}
      </div>
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
      <div className={styles.tools} role="group" aria-label="File actions">
        <ToolLink icon="replace" label={replacing ? 'Replacing…' : 'Replace'} disabled={replacing} onClick={() => fileInput.current?.click()} />
        <span className={styles.toolDivider} aria-hidden="true" />
        <ToolLink icon="download" label="Download" href={downloadUrl(asset) || undefined} />
        <span className={styles.toolDivider} aria-hidden="true" />
        <ToolLink icon="trash" label="Delete" danger disabled={!deletable} disabledReason={deletable ? undefined : lockReason(used)} onClick={onDelete} />
      </div>
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

/**
 * « Tool link » du Figma (C5, actions icônes collées 36 × 36) : absent du kit, composé ici (voir CLAUDE.md).
 * Bouton ou lien de téléchargement ; désactivé = aria-disabled (reste focalisable pour lire la raison).
 */
function ToolLink({
  icon,
  label,
  onClick,
  href,
  danger,
  disabled,
  disabledReason,
}: {
  icon: IconName
  label: string
  onClick?: () => void
  href?: string
  danger?: boolean
  disabled?: boolean
  disabledReason?: string
}) {
  const className = cx(styles.tool, danger && styles.toolDanger)
  const content = <Icon name={icon} size={16} set={18} />
  const node = href ? (
    <a href={href} className={className} aria-label={label} download rel="noopener">
      {content}
    </a>
  ) : (
    <button
      type="button"
      className={className}
      aria-label={label}
      aria-disabled={disabled || undefined}
      onClick={() => {
        if (!disabled) onClick?.()
      }}
    >
      {content}
    </button>
  )
  return <Tooltip label={disabled && disabledReason ? disabledReason : label}>{node}</Tooltip>
}
