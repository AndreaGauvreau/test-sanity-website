'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react'

import { Modal, cx } from '@/admin/ui'

import type { MediaAsset } from '../lib/assets'
import { lightboxBounds, lightboxCaption, lightboxImageSize, lightboxModalWidth, lightboxVideoWidth, originFrom } from '../lib/preview'
import type { Size } from '../lib/usage-preview'
import styles from './MediaLightbox.module.css'

/**
 * Grand aperçu d'un média (fiche à droite, C5), comme un aperçu du Finder : Modal du kit (voile, Échap, clic à
 * l'extérieur, ✕, focus piégé puis rendu au déclencheur, défilement de la page verrouillé). Titre : nom du fichier ;
 * l'image dans son ratio (au plus ~90vw × 85vh, lib/preview.ts), alt = texte alternatif ; légende « 2400 × 1600 · JPG
 * · 1.2 MB ». Vidéo : lecteur (controls), focalisé à l'ouverture (Espace lance la lecture).
 *
 * Mouvement : celui de la Modal (échelle 0.96 → 1 + fondu, 200 ms ease-out ; sortie 160 ms ; rien en mouvement
 * réduit), dont l'origine est posée au centre de la miniature cliquée : la fenêtre semble en sortir. L'image en
 * pleine définition arrive par un fondu sur l'aperçu déjà chargé (coupé en mouvement réduit).
 */

const subscribe = (onChange: () => void) => {
  window.addEventListener('resize', onChange)
  return () => window.removeEventListener('resize', onChange)
}
const viewportKey = () => `${window.innerWidth}x${window.innerHeight}`
const serverViewportKey = () => ''

/** Taille de la fenêtre du navigateur, suivie au redimensionnement ; null au rendu serveur. */
function useViewport(): Size | null {
  const key = useSyncExternalStore(subscribe, viewportKey, serverViewportKey)
  if (!key) return null
  const [width, height] = key.split('x').map(Number)
  return { width, height }
}

export type MediaLightboxProps = {
  asset: MediaAsset
  open: boolean
  onClose: () => void
  /** Miniature qui ouvre l'aperçu : origine de l'animation (le focus y revient à la fermeture). */
  triggerRef: RefObject<HTMLElement | null>
}

export function MediaLightbox({ asset, open, onClose, triggerRef }: MediaLightboxProps) {
  const viewport = useViewport() ?? { width: 1440, height: 900 }
  const isImage = asset.kind === 'image'
  const natural = asset.width && asset.height ? { width: asset.width, height: asset.height } : null
  const imageSize = lightboxImageSize(natural, viewport)
  const contentWidth = isImage ? imageSize.width : lightboxVideoWidth(viewport)

  // Origine de l'échelle d'entrée : centre de la miniature, dans le repère de la fenêtre (position de mise en page,
  // `offsetLeft` / `offsetTop` : hors transformation), mesurée une fois quand la fenêtre apparaît.
  const measured = useRef<HTMLDivElement | null>(null)
  const setOrigin = useCallback(
    (node: HTMLDivElement | null) => {
      const trigger = triggerRef.current
      if (!node || !trigger || measured.current === node) return
      measured.current = node
      const r = trigger.getBoundingClientRect()
      node.style.transformOrigin = originFrom({ x: r.left, y: r.top, width: r.width, height: r.height }, { x: node.offsetLeft, y: node.offsetTop })
    },
    [triggerRef],
  )

  return (
    <Modal open={open} onClose={() => onClose()} title={asset.name} width={lightboxModalWidth(contentWidth)} ref={setOrigin}>
      <figure className={styles.figure}>
        {isImage ? (
          <LightboxImage asset={asset} size={imageSize} />
        ) : (
          <video
            className={styles.video}
            src={asset.url}
            controls
            preload="metadata"
            playsInline
            // Dans le piège du focus du kit (sélecteur [tabindex]) et focalisé à l'ouverture.
            tabIndex={0}
            data-autofocus=""
            style={{ width: contentWidth, maxHeight: lightboxBounds(viewport).height }}
          />
        )}
        <figcaption className={styles.caption}>{lightboxCaption(asset)}</figcaption>
      </figure>
    </Modal>
  )
}

/** Image en pleine définition, posée sur l'aperçu de la fiche (déjà chargé) jusqu'à son arrivée. */
function LightboxImage({ asset, size }: { asset: MediaAsset; size: Size }) {
  const src = asset.full ?? asset.preview ?? ''
  const [status, setStatus] = useState<'loading' | 'loaded' | 'failed'>('loading')
  const imgRef = useRef<HTMLImageElement | null>(null)
  // Déjà en cache : `load` a pu passer avant l'abonnement.
  useEffect(() => {
    const img = imgRef.current
    if (img?.complete && img.naturalWidth > 0) setStatus('loaded')
  }, [])
  const placeholder = asset.preview && asset.preview !== src && status !== 'loaded' ? asset.preview : null
  return (
    <span className={styles.media} style={{ width: size.width, height: size.height }}>
      {placeholder ? <img src={placeholder} alt="" aria-hidden="true" className={styles.placeholder} /> : null}
      <img
        ref={imgRef}
        src={src}
        alt={asset.altText}
        width={asset.width}
        height={asset.height}
        className={cx(styles.image, status === 'loaded' && styles.imageLoaded)}
        onLoad={() => setStatus('loaded')}
        onError={() => setStatus('failed')}
      />
    </span>
  )
}
