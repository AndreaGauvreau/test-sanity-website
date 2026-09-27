'use client'

import { useMemo, useState, type ReactNode } from 'react'

import { autosave } from '@/admin/core/autosave'
import type { SeoTemplateVariable } from '@/admin/core/contracts'
import { validateFieldValue } from '@/admin/core/sanity/validate'
import { Button, SearchPreview, Select, SettingRow, SocialPreview, VariableChip, VariableInput } from '@/admin/ui'
import type { ArticleTemplate, SiteSettings } from '@/lib/seo'

import { imageAssetId } from '../lib/form'
import { ARTICLE_SEO_FIELDS, SEO_LIMITS, unknownVariables } from '../lib/manifest'
import { articlePath, articleSeoPreview, displayUrl, estimatedLength } from '../lib/seo-preview'
import { saveArticleSeoAction } from '../server/actions'
import type { SaveResult } from '../server/save'
import type { ArticleOption } from '../server/data'
import { postImage } from './FormContext'
import { OgImageRow } from './OgImageRow'
import { Counter, imageUrl } from './SeoView'
import { useFieldSave } from './useFieldSave'
import styles from './SeoView.module.css'

type Key = 'metaTitle' | 'metaDescription' | 'ogImageField' | 'ogImage' | 'allowIndexing'

export type ArticleSeoViewProps = {
  pageId: string
  domain: string
  siteName: string
  /** « /blog/:slug » */
  pathPattern: string
  /** « Blog » (« Allow indexing of all 12 Blog posts. ») */
  collectionLabel: string
  /** Nom d'un élément au pluriel, en minuscules (« posts »). */
  itemsLabel: string
  variables: readonly SeoTemplateVariable[]
  initial: ArticleTemplate
  settings: SiteSettings
  articles: ArticleOption[]
  total: number
  readOnly: boolean
  jsonLd: ReactNode
  save?: (key: Key, value: unknown) => Promise<SaveResult>
  upload?: (file: File) => Promise<{ ok: true; assetId: string; url: string } | { ok: false; error: string }>
}

/**
 * Onglet SEO de la page article d'une collection (C6) : un modèle pour toutes les pages article, avec les champs de
 * l'article en variables {{…}} (VariableInput), image OG « From field » (cover) ou fixe, indexation de toutes les
 * pages article, aperçus avec un article réel choisi dans « Preview with ».
 */
export function ArticleSeoView(props: ArticleSeoViewProps) {
  const { pageId, domain, siteName, pathPattern, collectionLabel, itemsLabel, variables, initial, settings, articles, total, readOnly, jsonLd } = props
  const write = props.save ?? ((key: Key, value: unknown) => saveArticleSeoAction({ pageId, key, value }))
  const send = props.upload ?? ((file: File) => postImage(pageId, { target: 'article', file }))

  const [metaTitle, setMetaTitle] = useState(initial.metaTitle ?? '')
  const [metaDescription, setMetaDescription] = useState(initial.metaDescription ?? '')
  const [ogImageField, setOgImageField] = useState<string | null>(initial.ogImageField ?? null)
  const [ogImage, setOgImage] = useState(initial.ogImage ?? null)
  const [allowIndexing, setAllowIndexing] = useState(initial.allowIndexing !== false)
  const [previewId, setPreviewId] = useState(articles[0]?.id ?? null)
  const [titleError, setTitleError] = useState<string | null>(null)
  const [descriptionError, setDescriptionError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)

  const titleSaver = useFieldSave((v: string | null) => write('metaTitle', v), initial.metaTitle || null)
  const descriptionSaver = useFieldSave((v: string | null) => write('metaDescription', v), initial.metaDescription || null)
  const fieldSaver = useFieldSave((v: string | null) => write('ogImageField', v), initial.ogImageField ?? null, 0)
  const imageSaver = useFieldSave((v: string | null) => write('ogImage', v), imageAssetId(initial.ogImage), 0)
  const indexSaver = useFieldSave((v: boolean) => write('allowIndexing', v), initial.allowIndexing !== false, 0)

  const article = articles.find((a) => a.id === previewId) ?? null
  const values = useMemo(() => article?.values ?? {}, [article])
  const chipVariables = useMemo(() => variables.map((v) => ({ name: v.token, label: v.label })), [variables])

  const preview = useMemo(
    () =>
      articleSeoPreview({
        settings,
        template: {
          metaTitle: metaTitle || null,
          metaDescription: metaDescription || null,
          ogImageField,
          ogImage,
          allowIndexing,
        } as ArticleTemplate,
        values,
        cover: { url: article?.coverUrl ?? null, alt: article?.coverAlt },
      }),
    [settings, metaTitle, metaDescription, ogImageField, ogImage, allowIndexing, values, article],
  )

  const onText = (key: 'metaTitle' | 'metaDescription', value: string) => {
    const setValue = key === 'metaTitle' ? setMetaTitle : setMetaDescription
    const setError = key === 'metaTitle' ? setTitleError : setDescriptionError
    const saver = key === 'metaTitle' ? titleSaver : descriptionSaver
    setValue(value)
    const unknown = unknownVariables(value, variables)
    const message = unknown.length
      ? `Unknown field {{${unknown[0]}}}. Insert a field from the list.`
      : validateFieldValue(ARTICLE_SEO_FIELDS[key], value || null)
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
    if (!result.ok) {
      setImageError(result.error)
      autosave.failed(result.error)
      return
    }
    setOgImage({ asset: { _ref: result.assetId } } as ArticleTemplate['ogImage'])
    imageSaver.markSaved(result.assetId)
    autosave.saved()
    // Une image fixe envoyée remplace « From field ».
    setOgImageField(null)
    fieldSaver.schedule(null)
  }

  const fixedImage = imageUrl(ogImage as Parameters<typeof imageUrl>[0])
  const fromField = ogImageField === 'cover'
  const withTitle = article ? ` with “${article.title}”` : ''

  return (
    <div className={styles.body}>
      <div className={styles.fields}>
        <VariableInput
          label="Meta title"
          value={metaTitle}
          variables={chipVariables}
          disabled={readOnly}
          error={titleError ?? titleSaver.error ?? undefined}
          helper={
            <Counter length={estimatedLength(metaTitle, values)} limit={SEO_LIMITS.metaTitle} prefix="≈ " suffix={withTitle} />
          }
          onValueChange={(v) => onText('metaTitle', v)}
        />
        <VariableInput
          label="Meta description"
          value={metaDescription}
          variables={chipVariables}
          disabled={readOnly}
          error={descriptionError ?? descriptionSaver.error ?? undefined}
          helper={
            <Counter
              length={estimatedLength(metaDescription, values)}
              limit={SEO_LIMITS.metaDescription}
              prefix="≈ "
              suffix={article ? ' with this post' : ''}
            />
          }
          onValueChange={(v) => onText('metaDescription', v)}
        />
        <OgImageRow
          src={fromField ? (article?.coverUrl ?? null) : (fixedImage ?? preview.ogImage)}
          removable={fromField || Boolean(fixedImage)}
          uploading={uploading}
          disabled={readOnly}
          error={imageError ?? fieldSaver.error ?? imageSaver.error}
          extra={
            fromField ? (
              <span className={styles.ogFrom}>
                From field <VariableChip name="cover" />
              </span>
            ) : (
              <span className={styles.ogFrom}>
                <Button
                  variant="ghost"
                  size="small"
                  disabled={readOnly}
                  onClick={() => {
                    setOgImageField('cover')
                    fieldSaver.schedule('cover')
                  }}
                >
                  Use the cover
                </Button>
              </span>
            )
          }
          note={!fromField && !fixedImage ? (preview.ogImage ? 'Using the site image (General).' : 'No image: set one here or in General.') : null}
          onFile={(file) => void onFile(file)}
          onRemove={() => {
            if (fromField) {
              setOgImageField(null)
              fieldSaver.schedule(null)
            } else {
              setOgImage(null)
              imageSaver.schedule(null)
            }
          }}
        />
        {jsonLd}
        <SettingRow
          title="Search engines"
          description={`Allow indexing of all ${total} ${collectionLabel} ${itemsLabel}.`}
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
        <Select
          label="Preview with"
          options={articles.map((a) => ({ value: a.id, label: a.title }))}
          value={previewId}
          placeholder={articles.length ? 'Select…' : `No ${itemsLabel} yet`}
          disabled={articles.length === 0}
          onValueChange={setPreviewId}
        />
        {article ? (
          <>
            <SearchPreview
              siteName={siteName}
              url={displayUrl(domain, articlePath(pathPattern, article.slug))}
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
          </>
        ) : (
          <p className={styles.muted}>{`Previews appear once a ${itemsLabel.replace(/s$/, '')} is published.`}</p>
        )}
      </div>
    </div>
  )
}
