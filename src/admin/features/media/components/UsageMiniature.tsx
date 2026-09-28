'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'

import { FaviconPreview, Icon, SocialPreview, Tag, cx, type IconName, type UsagePlace } from '@/admin/ui'

import type { MediaAsset } from '../lib/assets'
import {
  LIVE_PAGE_HEIGHT,
  LIVE_PAGE_WIDTH,
  LIVE_SCALE,
  LIVE_TIMEOUT_MS,
  SOCIAL_STAGE,
  assetHash,
  containBox,
  fallbackArea,
  faviconLayout,
  miniatureModes,
  socialLayout,
  type Box,
  type MiniatureMode,
} from '../lib/usage-preview'
import { inspectLivePage, loadPageSnapshot, measureLivePage } from './live-page'
import styles from './UsageMiniature.module.css'

/**
 * Miniatures de l'Usage tooltip (C5) : « tu recrées au format tout petit la UI avec l'image entourée en rouge ».
 *
 * - Page vivante : la vraie page publique, lue par un fetch de MÊME ORIGINE puis NETTOYÉE (`cleanPageHtml` : ni script,
 *   ni `<noscript>`, ni iframe, ni préchargement de JS ; styles et images gardés, `<base href>` posée), rendue dans une
 *   iframe `srcdoc` de 1280 px réduite à 278 px (fenêtre visible : 124 px). `sandbox="allow-same-origin"` SANS
 *   `allow-scripts` en plus : rien ne s'exécute ; le parent, de même origine, lit le DOM de la copie, y trouve
 *   l'élément qui affiche l'asset (hash de l'URL CDN), fait défiler pour le centrer et pose le cadre rouge.
 *   Ne JAMAIS ajouter `allow-scripts` : avec `allow-same-origin`, le document pourrait retirer son propre bac à sable.
 * - Favicon et image de partage (réglages, SEO) : composants du kit (FaviconPreview, SocialPreview) en petit.
 * - Repli (image absente de la page publiée, page en échec, emplacement sans page, au-delà de 3 pages vivantes) :
 *   l'image seule, en `contain`, entourée.
 * Monté seulement quand l'info-bulle est ouverte (le Popover du kit ne rend son contenu qu'ouvert).
 */

/** Mentions du repli d'une page vivante. */
export const MINIATURE_NOTES = {
  /** Page absente (404) ou lue sans l'image : utilisée dans un brouillon seulement, ou page publiée sans elle. */
  missing: 'Not on the live site yet',
  /** Page en erreur, illisible (redirection vers une autre origine, réponse non HTML) ou muette (délai dépassé). */
  unavailable: 'Live page unavailable',
} as const

/**
 * Emplacements de l'Usage tooltip avec leur miniature. Au plus MAX_LIVE_MINIATURES (3) pages vivantes par
 * info-bulle : chacune charge une page entière ; les emplacements suivants sont montrés en repli (`miniatureModes`).
 */
export function usagePlacesFor(asset: MediaAsset): UsagePlace[] {
  const modes = miniatureModes(asset.usages, asset.kind)
  return asset.usages.map((usage, i) => ({
    id: usage.id,
    label: usage.label,
    href: usage.siteHref,
    preview: <UsageMiniature asset={asset} mode={modes[i]} />,
  }))
}

export function UsageMiniature({ asset, mode }: { asset: MediaAsset; mode: MiniatureMode }) {
  switch (mode.kind) {
    case 'live':
      return <LiveMiniature asset={asset} path={mode.path} occurrence={mode.occurrence} />
    case 'favicon':
      return <FaviconMiniature src={asset.preview} theme={mode.theme} />
    case 'social':
      return <SocialMiniature image={asset.preview} domain={mode.domain} title={mode.title} description={mode.description} />
    default:
      return <FallbackMiniature asset={asset} />
  }
}

function boxStyle(box: Box): CSSProperties {
  return { left: box.x, top: box.y, width: box.width, height: box.height }
}

type LiveState = { status: 'loading' } | { status: 'ready'; frame: Box } | { status: 'missing' } | { status: 'unavailable' }

function LiveMiniature({ asset, path, occurrence }: { asset: MediaAsset; path: string; occurrence: number }) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const [html, setHtml] = useState<string | null>(null)
  const [state, setState] = useState<LiveState>({ status: 'loading' })
  const hash = assetHash(asset.id)
  // Mesure en cours (asynchrone) : seule la dernière compte, jamais après le démontage.
  const measure = useRef(0)
  useEffect(() => () => void (measure.current += 1), [])

  // Copie nettoyée de la page (lue une fois par chemin tant que la page de l'admin est ouverte).
  useEffect(() => {
    let cancelled = false
    void loadPageSnapshot(path).then((snapshot) => {
      if (cancelled) return
      if (snapshot.status === 'ok') setHtml(snapshot.html)
      else setState({ status: snapshot.status })
    })
    return () => {
      cancelled = true
    }
  }, [path])

  // Garde : au-delà du délai, la copie déjà rendue est lue une dernière fois, sinon repli.
  useEffect(() => {
    if (state.status !== 'loading') return
    const timer = window.setTimeout(() => {
      measure.current += 1
      const result = inspectLivePage(iframeRef.current, hash, occurrence)
      setState(result?.status === 'ready' ? { status: 'ready', frame: result.frame } : { status: 'unavailable' })
    }, LIVE_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [state.status, hash, occurrence])

  if (state.status === 'missing' || state.status === 'unavailable') {
    return <FallbackMiniature asset={asset} note={MINIATURE_NOTES[state.status]} />
  }
  const ready = state.status === 'ready'
  return (
    <span className={styles.root} data-state={state.status}>
      {ready ? null : <MiniatureSkeleton />}
      {html !== null ? (
        <iframe
          ref={iframeRef}
          srcDoc={html}
          title="Page preview"
          sandbox="allow-same-origin"
          tabIndex={-1}
          aria-hidden="true"
          inert
          loading="lazy"
          className={cx(styles.page, ready && styles.pageReady)}
          style={{ width: LIVE_PAGE_WIDTH, height: LIVE_PAGE_HEIGHT, transform: `scale(${LIVE_SCALE})` }}
          onLoad={() => {
            const id = (measure.current += 1)
            void measureLivePage(iframeRef.current, hash, occurrence).then((result) => {
              if (id !== measure.current || !result) return
              setState(result.status === 'ready' ? { status: 'ready', frame: result.frame } : result)
            })
          }}
        />
      ) : null}
      {ready ? <span className={cx(styles.frame, styles.reveal)} style={boxStyle(state.frame)} aria-hidden="true" /> : null}
    </span>
  )
}

/** Squelette d'une page (en-tête, titre, média) pendant le chargement ; en local, next dev compile la page d'abord. */
function MiniatureSkeleton() {
  return (
    <span className={styles.skeleton} aria-hidden="true" data-skeleton="">
      <span className={cx(styles.bone, styles.logo)} />
      <span className={cx(styles.bone, styles.links)} />
      <span className={cx(styles.bone, styles.cta)} />
      <span className={cx(styles.bone, styles.title)} />
      <span className={cx(styles.bone, styles.line)} />
      <span className={cx(styles.bone, styles.line, styles.lineShort)} />
      <span className={cx(styles.bone, styles.media)} />
    </span>
  )
}

/** Favicon des réglages : l'aperçu d'onglet du kit (fond Figma), cadre rouge autour du favicon. */
function FaviconMiniature({ src, theme }: { src: string | null; theme: 'light' | 'dark' }) {
  const { stage, frame } = faviconLayout()
  return (
    <span className={styles.root} aria-hidden="true" data-mode="favicon">
      <span className={styles.stage} style={boxStyle(stage)}>
        <FaviconPreview theme={theme} src={src} />
      </span>
      <span className={styles.frame} style={boxStyle(frame)} />
    </span>
  )
}

/** Image de partage : la carte réseaux sociaux du kit réduite, cadre rouge autour de l'image. */
function SocialMiniature({ image, domain, title, description }: { image: string | null; domain: string; title: string; description?: string }) {
  const { scale, stage, frame } = socialLayout()
  return (
    <span className={styles.root} aria-hidden="true" data-mode="social">
      <span
        className={cx(styles.stage, styles.scaled)}
        style={{ left: stage.x, top: stage.y, width: SOCIAL_STAGE.width, height: SOCIAL_STAGE.height, transform: `scale(${scale})` }}
      >
        <SocialPreview domain={domain} title={title} description={description} image={image ?? undefined} />
      </span>
      <span className={styles.frame} style={boxStyle(frame)} />
    </span>
  )
}

const KIND_ICON: Record<MediaAsset['kind'], IconName> = { image: 'image', video: 'play', file: 'file' }

/** Repli : l'image elle-même (contain), entourée ; mention éventuelle (« Not on the live site yet »). */
function FallbackMiniature({ asset, note }: { asset: MediaAsset; note?: string }) {
  const natural = asset.width && asset.height ? { width: asset.width, height: asset.height } : null
  const box = containBox(natural, fallbackArea(!!note))
  return (
    <span className={styles.root} data-mode="fallback">
      {asset.kind === 'image' && asset.preview ? (
        <img src={asset.preview} alt="" className={styles.fallbackImage} style={boxStyle(box)} />
      ) : (
        <span className={styles.fallbackIcon} style={boxStyle(box)} aria-hidden="true">
          <Icon name={KIND_ICON[asset.kind]} size={18} />
        </span>
      )}
      <span className={styles.frame} style={boxStyle(box)} aria-hidden="true" />
      {note ? (
        <Tag tone="neutral" className={styles.note}>
          {note}
        </Tag>
      ) : null}
    </span>
  )
}
