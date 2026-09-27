'use client'

import { useEffect, useState } from 'react'

import { ButtonContent, Icon, buttonClassName, cx } from '@/admin/ui'

import styles from './overview.module.css'

export type SitePreviewProps = {
  /** URL publique du site (production). */
  url: string
  /** Domaine affiché dans la barre d'adresse (« conduit.com »). */
  domain: string
  /** Résultat du contrôle serveur des en-têtes : false = le site refuse l'iframe ; null = inconnu ; undefined = en cours. */
  frameable?: boolean | null
}

/** Délai au-delà duquel un cadre muet est déclaré indisponible. */
export const PREVIEW_TIMEOUT_MS = 15_000

/**
 * Aperçu du site publié (Figma B1 « site-preview ») : barre de navigateur (● ● ●, cadenas + domaine, « Published
 * site ») puis le site en lecture seule dans une iframe. États : chargement (icône + « Live preview of … »),
 * chargé (fondu), indisponible (« Preview unavailable » + lien vers le site).
 */
export function SitePreview({ url, domain, frameable }: SitePreviewProps) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable'>(frameable === false ? 'unavailable' : 'loading')

  useEffect(() => {
    if (frameable === false) {
      setStatus('unavailable')
      return
    }
    if (frameable === undefined) return
    const timer = window.setTimeout(() => setStatus((s) => (s === 'loading' ? 'unavailable' : s)), PREVIEW_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [frameable])

  const showFrame = frameable !== false && frameable !== undefined && status !== 'unavailable'

  return (
    <section className={styles.preview} aria-label="Published site">
      <div className={styles.browserBar}>
        <span className={styles.dots} aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <span className={styles.url}>
          <Icon name="lock" size={12} set={18} />
          <span>{domain}</span>
        </span>
        <span className={styles.spacer} />
        <span className={styles.barLabel}>Published site</span>
      </div>
      <div className={styles.viewport}>
        {showFrame ? (
          <iframe
            className={cx(styles.frame, status === 'ready' && styles.frameReady)}
            src={url}
            title={`Live preview of ${domain}`}
            // Pas de `sandbox` : le site est de la même origine que l'admin (conduit.com/admin) et a besoin de ses
            // scripts ; « allow-scripts allow-same-origin » ne protégerait rien (le cadre pourrait retirer l'attribut).
            referrerPolicy="no-referrer"
            loading="lazy"
            tabIndex={status === 'ready' ? 0 : -1}
            onLoad={() => setStatus('ready')}
          />
        ) : null}
        {status !== 'ready' ? (
          <div className={styles.placeholder} role={status === 'unavailable' ? 'status' : undefined}>
            <Icon name="image" size={18} />
            {status === 'unavailable' ? (
              <>
                <span className={styles.placeholderTitle}>Preview unavailable</span>
                <span>The site can&rsquo;t be shown inside the admin.</span>
                <a href={url} target="_blank" rel="noopener noreferrer" className={buttonClassName({ variant: 'secondary', size: 'small' })}>
                  <ButtonContent size="small" iconRight="external">
                    Open {domain}
                  </ButtonContent>
                  <span className="kz-visually-hidden"> (opens in a new tab)</span>
                </a>
              </>
            ) : (
              <span>Live preview of {domain}</span>
            )}
          </div>
        ) : null}
      </div>
    </section>
  )
}
