'use client'

import { useMemo, useState, type ReactNode } from 'react'

import { autosave } from '@/admin/core/autosave'
import { validateFieldValue, visibleLength } from '@/admin/core/sanity/validate'
import { Input, SearchPreview, SettingRow, SocialPreview, Textarea } from '@/admin/ui'
import type { SiteSettings } from '@/lib/seo'
import { urlFor } from '@/sanity/lib/image'

import { imageAssetId } from '../lib/form'
import { SEO_FIELDS, SEO_LIMITS } from '../lib/manifest'
import { displayUrl, pageSeoPreview } from '../lib/seo-preview'
import { savePageSeoAction } from '../server/actions'
import type { SaveResult } from '../server/save'
import { postImage } from './FormContext'
import { OgImageRow } from './OgImageRow'
import { useFieldSave } from './useFieldSave'
import styles from './SeoView.module.css'

type ImageValue = { asset?: { _ref: string } | null; crop?: unknown; hotspot?: unknown } | null

export type SeoInitial = {
  metaTitle: string
  metaDescription: string
  ogImage: ImageValue
  allowIndexing: boolean
}

export type SeoViewProps = {
  pageId: string
  path: string
  domain: string
  siteName: string
  defaultTitle?: string | null
  initial: SeoInitial
  settings: SiteSettings
  readOnly: boolean
  /** JSON-LD (lecture seule), rendu côté serveur après lecture du HTML de la page. */
  jsonLd: ReactNode
  /** Arbre des titres, idem. */
  headings: ReactNode
  /** Injection pour les tests. */
  save?: (key: 'metaTitle' | 'metaDescription' | 'ogImage' | 'allowIndexing', value: unknown) => Promise<SaveResult>
  upload?: (file: File) => Promise<{ ok: true; assetId: string; url: string } | { ok: false; error: string }>
}

export function imageUrl(image: ImageValue | undefined, width = 1200, height = 630): string | null {
  if (!image?.asset?._ref) return null
  try {
    return urlFor(image as Parameters<typeof urlFor>[0])
      .width(width)
      .height(height)
      .url()
  } catch {
    return null
  }
}

/** Compteur indicatif « 34 / 60 » : au-delà, chiffre en orange, sans blocage (C2). */
export function Counter({ length, limit, prefix = '', suffix = '' }: { length: number; limit: number; prefix?: string; suffix?: string }) {
  const over = length > limit
  return (
    <span className={over ? styles.over : undefined}>
      {`${prefix}${length} / ${limit}${suffix}`}
      {over ? <span className="kz-visually-hidden"> (longer than recommended)</span> : null}
    </span>
  )
}

/**
 * Onglet SEO d'une page (C2) : meta title et description (compteurs indicatifs), image OG, JSON-LD en lecture
 * seule, indexation ; aperçus Google et réseaux sociaux mis à jour pendant la frappe (valeur effective, comme le
 * site : champ vide → valeur du site, B2) ; arbre des titres de la page.
 */
export function SeoView({ pageId, path, domain, siteName, defaultTitle, initial, settings, readOnly, jsonLd, headings, save, upload }: SeoViewProps) {
  const write = save ?? ((key, value) => savePageSeoAction({ pageId, key, value }))
  const send = upload ?? ((file: File) => postImage(pageId, { target: 'seo', file }))

  const [metaTitle, setMetaTitle] = useState(initial.metaTitle)
  const [metaDescription, setMetaDescription] = useState(initial.metaDescription)
  const [ogImage, setOgImage] = useState<ImageValue>(initial.ogImage)
  const [allowIndexing, setAllowIndexing] = useState(initial.allowIndexing)
  const [titleError, setTitleError] = useState<string | null>(null)
  const [descriptionError, setDescriptionError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)

  const titleSaver = useFieldSave((v: string | null) => write('metaTitle', v), initial.metaTitle || null)
  const descriptionSaver = useFieldSave((v: string | null) => write('metaDescription', v), initial.metaDescription || null)
  const imageSaver = useFieldSave((v: string | null) => write('ogImage', v), imageAssetId(initial.ogImage), 0)
  const indexSaver = useFieldSave((v: boolean) => write('allowIndexing', v), initial.allowIndexing, 0)

  const preview = useMemo(
    () =>
      pageSeoPreview({
        settings,
        seo: { metaTitle: metaTitle || null, metaDescription: metaDescription || null, ogImage, allowIndexing },
        path,
        defaultTitle,
      }),
    [settings, metaTitle, metaDescription, ogImage, allowIndexing, path, defaultTitle],
  )
  const fallback = useMemo(() => pageSeoPreview({ settings, seo: {}, path, defaultTitle }), [settings, path, defaultTitle])

  const onText = (key: 'metaTitle' | 'metaDescription', raw: string) => {
    // Une meta description tient sur une ligne : un retour à la ligne devient une espace.
    const value = key === 'metaDescription' ? raw.replace(/\r?\n/g, ' ') : raw
    const setValue = key === 'metaTitle' ? setMetaTitle : setMetaDescription
    const setError = key === 'metaTitle' ? setTitleError : setDescriptionError
    const saver = key === 'metaTitle' ? titleSaver : descriptionSaver
    setValue(value)
    const message = validateFieldValue(SEO_FIELDS[key], value || null)
    setError(message)
    if (message) saver.cancel()
    else saver.schedule(value || null)
  }

  const onFile = async (file: File) => {
    setUploading(true)
    setImageError(null)
    autosave.saving()
    const result = await send(file)
    setUploading(false)
    if (result.ok) {
      setOgImage({ asset: { _ref: result.assetId } })
      imageSaver.markSaved(result.assetId)
      autosave.saved()
    } else {
      setImageError(result.error)
      autosave.failed(result.error)
    }
  }

  const ownImage = imageUrl(ogImage)
  const siteIndexingOff = settings?.allowIndexing === false

  return (
    <div className={styles.body}>
      <div className={styles.fields}>
        <Input
          label="Meta title"
          value={metaTitle}
          placeholder={fallback.ogTitle}
          disabled={readOnly}
          error={titleError ?? titleSaver.error ?? undefined}
          helper={<Counter length={visibleLength(metaTitle)} limit={SEO_LIMITS.metaTitle} />}
          onChange={(e) => onText('metaTitle', e.target.value)}
          onBlur={() => void titleSaver.flush()}
        />
        <Textarea
          label="Meta description"
          value={metaDescription}
          placeholder="Describe this page in one or two sentences…"
          disabled={readOnly}
          error={descriptionError ?? descriptionSaver.error ?? undefined}
          helper={<Counter length={visibleLength(metaDescription)} limit={SEO_LIMITS.metaDescription} />}
          onChange={(e) => onText('metaDescription', e.target.value)}
          onBlur={() => void descriptionSaver.flush()}
        />
        <OgImageRow
          src={ownImage ?? preview.ogImage}
          removable={Boolean(ownImage)}
          uploading={uploading}
          disabled={readOnly}
          error={imageError ?? imageSaver.error}
          note={!ownImage ? (preview.ogImage ? 'Using the site image (General).' : 'No image: set one here or in General.') : null}
          onFile={(file) => void onFile(file)}
          onRemove={() => {
            setOgImage(null)
            imageSaver.schedule(null)
          }}
        />
        {jsonLd}
        <SettingRow
          title="Search engines"
          description={
            siteIndexingOff ? 'Allow indexing of this page. Indexing is turned off for the whole site in General.' : 'Allow indexing of this page.'
          }
          checked={allowIndexing}
          disabled={readOnly}
          onCheckedChange={(next) => {
            setAllowIndexing(next)
            indexSaver.schedule(next)
          }}
        />
        {indexSaver.error ? (
          <p className={styles.ogError} role="alert">
            {indexSaver.error}
          </p>
        ) : null}
      </div>
      <div className={styles.previews}>
        <SearchPreview
          siteName={siteName}
          url={displayUrl(domain, path)}
          title={preview.title}
          description={preview.description || undefined}
          favicon={settings?.faviconLight ?? undefined}
          aria-label="Google search preview"
        />
        <SocialPreview
          className={styles.social}
          domain={domain}
          title={preview.ogTitle}
          description={preview.ogDescription || undefined}
          image={preview.ogImage ?? undefined}
          aria-label="Social media preview"
        />
        {headings}
      </div>
    </div>
  )
}
