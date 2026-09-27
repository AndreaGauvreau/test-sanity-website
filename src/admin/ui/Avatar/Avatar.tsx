'use client'

import { useEffect, useRef, useState, type HTMLAttributes, type Ref } from 'react'
import { cx } from '../utils/cx'
import { initialsOf } from './initials'
import styles from './Avatar.module.css'

export type AvatarSize = 20 | 28 | 40
export type AvatarTone = 'blue' | 'green' | 'neutral'

export type AvatarProps = Omit<HTMLAttributes<HTMLSpanElement>, 'children'> & {
  /** Nom complet : sert au nom accessible et aux initiales si `initials` est absent. */
  name: string
  /** Initiales affichées (1 ou 2 lettres). Défaut : tirées de `name`. */
  initials?: string
  /** Photo : remplit le cercle ; initiales en repli si l'image ne charge pas. */
  src?: string
  size?: AvatarSize
  /** blue = Kuartz, green = client, neutral. */
  tone?: AvatarTone
  /** Décoratif (le nom est déjà écrit à côté) : aria-hidden. */
  decorative?: boolean
  ref?: Ref<HTMLSpanElement>
}

/** Avatar rond (Figma « Avatar » 332:340) : 20 / 28 / 40, initiales Label Small / Label / Label Large. */
export function Avatar({ name, initials, src, size = 20, tone = 'blue', decorative, className, ref, ...rest }: AvatarProps) {
  const [failed, setFailed] = useState(false)
  const imgRef = useRef<HTMLImageElement | null>(null)
  // L'erreur a pu survenir avant l'hydratation (image rendue par le serveur) : on la relit au montage.
  useEffect(() => {
    setFailed(false)
    const img = imgRef.current
    if (img && img.complete && img.naturalWidth === 0) setFailed(true)
  }, [src])
  const showImage = src && !failed
  return (
    <span
      ref={ref}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : name}
      aria-hidden={decorative || undefined}
      data-size={size}
      className={cx(styles.avatar, styles[`size${size}`], styles[tone], className)}
      {...rest}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- composant pur du kit, sans next/image
        <img ref={imgRef} className={styles.image} src={src} alt="" onError={() => setFailed(true)} />
      ) : (
        <span className={styles.initials} aria-hidden="true">
          {initials ?? initialsOf(name)}
        </span>
      )}
    </span>
  )
}
