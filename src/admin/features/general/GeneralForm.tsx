'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'

import { autosave } from '@/admin/core/autosave'
import { siteLogo } from '@/admin/core/site-logo'
import { pickSiteFavicon } from '@/admin/core/site-logo-src'
import { validateFieldValue, visibleLength } from '@/admin/core/sanity/validate'
import {
  AnimatePresence,
  Button,
  Callout,
  FaviconPreview,
  ImagePreview,
  Input,
  PageHeader,
  ProgressBar,
  SearchPreview,
  SectionHeader,
  SettingRow,
  SocialPreview,
  Textarea,
  motion,
  slideDown,
  fade,
  useMotionVariants,
} from '@/admin/ui'

import { removeGeneralImageAction, saveGeneralValueAction } from './actions'
import { createDebouncer } from './debounce'
import { GENERAL_TEXT_FIELDS, UPLOAD_MAX_BYTES, UPLOAD_TOO_LARGE, acceptFor, formatsLabel, type GeneralImageSlot, type GeneralTextField } from './fields'
import { ratioWarning, type GeneralImage } from './images'
import { uploadGeneralImageRequest } from './upload-client'
import { truncateWords, type GeneralView } from './view'
import styles from './general.module.css'

type ActionResult = { ok: true } | { ok: false; error: string }

export type GeneralFormProps = {
  view: GeneralView
  /** Droit `content.write` : sans lui, l'écran est en lecture seule. */
  canEdit: boolean
  /** Injection pour les tests (par défaut : les server actions ; l'envoi d'image passe par la route, upload-client.ts). */
  actions?: {
    save: (input: unknown) => Promise<ActionResult>
    upload: (form: FormData) => Promise<({ ok: true; image: GeneralImage }) | { ok: false; error: string }>
    remove: (input: unknown) => Promise<ActionResult>
  }
}

const DEFAULT_ACTIONS = { save: saveGeneralValueAction, upload: (form: FormData) => uploadGeneralImageRequest(form), remove: removeGeneralImageAction }

type Images = Record<GeneralImageSlot, GeneralImage | null>
type SlotState = { uploading?: string; error?: string }

/** Enveloppe une écriture dans l'état « Draft saved automatically » de la Top bar. */
async function tracked<T extends { ok: boolean }>(work: () => Promise<T>): Promise<T> {
  autosave.saving()
  try {
    const result = await work()
    if (result.ok) autosave.saved()
    else autosave.failed((result as unknown as { error: string }).error)
    return result
  } catch {
    const message = "Couldn't reach the server. Check your connection and try again."
    autosave.failed(message)
    return { ok: false, error: message } as unknown as T
  }
}

/** Compteur « 25 / 60 » ; au-delà de la limite, le chiffre passe en couleur d'avertissement sans bloquer la saisie. */
function counter(value: string, max: number): ReactNode {
  const n = visibleLength(value)
  if (n <= max) return `${n} / ${max}`
  return (
    <>
      <span className={styles.over}>{n}</span> / {max} · Too long: not saved until it fits.
    </>
  )
}

/**
 * B2 · Site Settings › General (Figma 359:717). Formulaire de `siteSettings` : identité (titre, description),
 * favicons clair / sombre, image sociale, indexation ; aperçus Google et réseaux sociaux mis à jour pendant la frappe.
 * Chaque modification part en brouillon (600 ms après la dernière frappe, tout de suite pour un interrupteur ou une image).
 */
export function GeneralForm({ view, canEdit, actions = DEFAULT_ACTIONS }: GeneralFormProps) {
  const [text, setText] = useState<Record<GeneralTextField, string>>({ title: view.values.title, description: view.values.description })
  const [textErrors, setTextErrors] = useState<Partial<Record<GeneralTextField, string>>>({})
  const [allowIndexing, setAllowIndexing] = useState(view.values.allowIndexing)
  const [indexingError, setIndexingError] = useState<string | null>(null)
  const [images, setImages] = useState<Images>({
    faviconLight: view.values.faviconLight,
    faviconDark: view.values.faviconDark,
    socialImage: view.values.socialImage,
  })
  const [slots, setSlots] = useState<Partial<Record<GeneralImageSlot, SlotState>>>({})
  const socialInput = useRef<HTMLInputElement | null>(null)
  const [dropping, setDropping] = useState(false)
  const actionsRef = useRef(actions)
  actionsRef.current = actions
  const noticeVariants = useMotionVariants(slideDown)
  const fadeVariants = useMotionVariants(fade)

  // ─── Textes : validation immédiate, envoi différé ───
  const debouncer = useMemo(
    () =>
      createDebouncer<GeneralTextField, string>((field, value) => {
        void tracked(() => actionsRef.current.save({ field, value })).then((result) => {
          setTextErrors((prev) => ({ ...prev, [field]: result.ok ? undefined : result.error }))
        })
      }),
    [],
  )

  // Logo de la sidebar = favicon du site (dark d'abord, l'admin est sombre) : mis à jour dès qu'un envoi ou un retrait
  // réussit (ou est annulé), sans recharger la coque (core/site-logo.ts). Pas au montage : le serveur l'a déjà.
  const logoFavicon = pickSiteFavicon({ dark: images.faviconDark?.url, light: images.faviconLight?.url })
  const logoMounted = useRef(false)
  useEffect(() => {
    if (!logoMounted.current) {
      logoMounted.current = true
      return
    }
    siteLogo.set(logoFavicon)
  }, [logoFavicon])

  useEffect(() => {
    // Départ de la page ou de l'écran : ce qui attend part tout de suite.
    const flush = () => debouncer.flush()
    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      debouncer.flush()
    }
  }, [debouncer])

  const onText = (field: GeneralTextField, value: string) => {
    setText((prev) => ({ ...prev, [field]: value }))
    const def = GENERAL_TEXT_FIELDS[field]
    const candidate = field === 'title' ? value.replace(/\r?\n/g, ' ') : value
    const message = validateFieldValue(def, candidate === '' ? null : candidate)
    if (message) {
      // Valeur refusée par le schéma (trop longue, titre vide) : rien ne part tant qu'elle ne l'est pas.
      debouncer.cancel(field)
      setTextErrors((prev) => ({ ...prev, [field]: message }))
      return
    }
    setTextErrors((prev) => ({ ...prev, [field]: undefined }))
    debouncer.schedule(field, value)
  }

  // ─── Indexation : envoi immédiat, retour arrière si refus ───
  const onIndexing = async (checked: boolean) => {
    setAllowIndexing(checked)
    setIndexingError(null)
    const result = await tracked(() => actionsRef.current.save({ field: 'allowIndexing', value: checked }))
    if (!result.ok) {
      setAllowIndexing(!checked)
      setIndexingError(result.error)
    }
  }

  // ─── Images ───
  const setSlot = (slot: GeneralImageSlot, next: SlotState) => setSlots((prev) => ({ ...prev, [slot]: next }))

  const upload = useCallback(async (slot: GeneralImageSlot, file: File) => {
    if (file.size > UPLOAD_MAX_BYTES) {
      setSlot(slot, { error: UPLOAD_TOO_LARGE })
      return
    }
    setSlot(slot, { uploading: file.name })
    const form = new FormData()
    form.set('slot', slot)
    form.set('file', file)
    const result = await tracked(() => actionsRef.current.upload(form))
    if (result.ok) {
      setImages((prev) => ({ ...prev, [slot]: result.image }))
      setSlot(slot, {})
    } else {
      setSlot(slot, { error: result.error })
    }
  }, [])

  const remove = async (slot: GeneralImageSlot) => {
    const previous = images[slot]
    setImages((prev) => ({ ...prev, [slot]: null }))
    setSlot(slot, {})
    const result = await tracked(() => actionsRef.current.remove({ slot }))
    if (!result.ok) {
      setImages((prev) => ({ ...prev, [slot]: previous }))
      setSlot(slot, { error: result.error })
    }
  }

  const disabled = !canEdit
  const title = text.title.trim() || view.site.name
  const description = text.description.trim()
  const lightUrl = images.faviconLight?.url
  const darkUrl = images.faviconDark?.url
  const faviconNotice =
    slots.faviconLight?.error ??
    slots.faviconDark?.error ??
    ratioWarning('faviconLight', images.faviconLight) ??
    ratioWarning('faviconDark', images.faviconDark) ??
    (lightUrl && !darkUrl ? 'No dark favicon: the light one is used everywhere.' : null)
  const faviconNoticeIsError = !!(slots.faviconLight?.error ?? slots.faviconDark?.error)
  const socialNotice = slots.socialImage?.error ?? ratioWarning('socialImage', images.socialImage)
  const uploadingFavicon = slots.faviconLight?.uploading ?? slots.faviconDark?.uploading

  const socialDrop = disabled || slots.socialImage?.uploading
    ? {}
    : {
        onDragOver: (event: DragEvent<HTMLDivElement>) => {
          if (!Array.from(event.dataTransfer.types).includes('Files')) return
          event.preventDefault()
          event.dataTransfer.dropEffect = 'copy'
          setDropping(true)
        },
        onDragLeave: () => setDropping(false),
        onDrop: (event: DragEvent<HTMLDivElement>) => {
          event.preventDefault()
          setDropping(false)
          const file = event.dataTransfer.files?.[0]
          if (file) void upload('socialImage', file)
        },
      }

  return (
    <div className={styles.layout}>
      <div className={styles.form}>
        <PageHeader title="General" meta="Site settings" />

        {!canEdit ? <Callout tone="info">You can view these settings but not change them.</Callout> : null}
        {view.missing ? (
          <Callout tone="warning">These settings don&rsquo;t exist in Sanity yet. Ask Kuartz to set up the site settings.</Callout>
        ) : null}

        <SectionHeader title="Site identity" description="Used by browsers and search engines when a page has no title of its own." />

        <Input
          label="Title"
          name="title"
          value={text.title}
          disabled={disabled}
          autoComplete="off"
          onChange={(event) => onText('title', event.target.value)}
          onBlur={() => debouncer.flush('title')}
          helper={textErrors.title && visibleLength(text.title) <= GENERAL_TEXT_FIELDS.title.maxLength ? undefined : counter(text.title, GENERAL_TEXT_FIELDS.title.maxLength)}
          error={textErrors.title && visibleLength(text.title) <= GENERAL_TEXT_FIELDS.title.maxLength ? textErrors.title : undefined}
          aria-invalid={textErrors.title ? true : undefined}
        />

        <Textarea
          label="Description"
          name="description"
          value={text.description}
          disabled={disabled}
          placeholder="Describe this page in one or two sentences…"
          onChange={(event) => onText('description', event.target.value)}
          onBlur={() => debouncer.flush('description')}
          helper={
            textErrors.description && visibleLength(text.description) <= GENERAL_TEXT_FIELDS.description.maxLength
              ? undefined
              : counter(text.description, GENERAL_TEXT_FIELDS.description.maxLength)
          }
          error={
            textErrors.description && visibleLength(text.description) <= GENERAL_TEXT_FIELDS.description.maxLength
              ? textErrors.description
              : undefined
          }
          aria-invalid={textErrors.description ? true : undefined}
        />

        <SectionHeader title="Site Images" />

        <div className={styles.siteImages}>
          <section className={styles.imageRow} aria-labelledby="general-favicon-label">
            <div className={styles.meta}>
              <div className={styles.labels}>
                <h3 id="general-favicon-label" className={styles.imageLabel}>
                  Favicon
                </h3>
                <p className={styles.dimensions}>64 × 64 pixels</p>
                <p className={styles.formats}>{formatsLabel('faviconLight')}</p>
              </div>
            </div>
            <div className={styles.faviconColumn}>
              <div className={styles.favicons}>
                <FaviconPreview
                  theme="light"
                  src={lightUrl}
                  accept={acceptFor('faviconLight')}
                  disabled={disabled || !!slots.faviconLight?.uploading}
                  onFile={disabled ? undefined : (file) => void upload('faviconLight', file)}
                  onRemove={disabled || !lightUrl ? undefined : () => void remove('faviconLight')}
                  aria-busy={!!slots.faviconLight?.uploading || undefined}
                />
                <FaviconPreview
                  theme="dark"
                  // Favicon sombre absent : le clair sert partout (Figma B2), montré comme tel.
                  src={darkUrl ?? lightUrl}
                  accept={acceptFor('faviconDark')}
                  disabled={disabled || !!slots.faviconDark?.uploading}
                  onFile={disabled ? undefined : (file) => void upload('faviconDark', file)}
                  onRemove={disabled || !darkUrl ? undefined : () => void remove('faviconDark')}
                  aria-busy={!!slots.faviconDark?.uploading || undefined}
                />
              </div>
              <p className="kz-visually-hidden" role="status" aria-live="polite">
                {uploadingFavicon ? `Uploading ${uploadingFavicon}…` : ''}
              </p>
              <AnimatePresence initial={false}>
                {uploadingFavicon ? (
                  <motion.div key="uploading" className={styles.uploading} variants={noticeVariants} initial="initial" animate="animate" exit="exit">
                    <ProgressBar label={`Uploading ${uploadingFavicon}`} className={styles.progress} />
                    <span aria-hidden="true">Uploading {uploadingFavicon}…</span>
                  </motion.div>
                ) : faviconNotice ? (
                  <motion.p
                    key={faviconNotice}
                    role={faviconNoticeIsError ? 'alert' : undefined}
                    className={faviconNoticeIsError ? styles.error : styles.notice}
                    variants={noticeVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                  >
                    {faviconNotice}
                  </motion.p>
                ) : null}
              </AnimatePresence>
            </div>
          </section>

          <div className={styles.divider} role="presentation" />

          <section className={styles.imageRow} aria-labelledby="general-social-label">
            <div className={styles.meta}>
              <div className={styles.labels}>
                <h3 id="general-social-label" className={styles.imageLabel}>
                  Social Preview
                </h3>
                <p id="general-social-dimensions" className={styles.dimensions}>
                  1200 × 630 pixels
                </p>
                <p className={styles.formats}>{formatsLabel('socialImage')}</p>
              </div>
              {canEdit ? (
                <div>
                  <Button
                    variant="subtle"
                    size="small"
                    loading={!!slots.socialImage?.uploading}
                    aria-describedby="general-social-label general-social-dimensions"
                    onClick={() => socialInput.current?.click()}
                  >
                    Upload
                  </Button>
                  <input
                    ref={socialInput}
                    type="file"
                    accept={acceptFor('socialImage')}
                    hidden
                    tabIndex={-1}
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      if (file) void upload('socialImage', file)
                      event.target.value = ''
                    }}
                  />
                </div>
              ) : null}
            </div>
            <div className={styles.socialColumn}>
              <div className={styles.socialFrame} data-dropping={dropping || undefined} {...socialDrop}>
                <AnimatePresence initial={false} mode="popLayout">
                  <motion.div key={images.socialImage?.url ?? 'empty'} variants={fadeVariants} initial="initial" animate="animate" exit="exit">
                    <ImagePreview
                      src={images.socialImage?.url}
                      alt="Social preview image"
                      width={375}
                      emptyLabel={dropping ? 'Drop to upload' : canEdit ? 'Drop image' : 'No image'}
                      onRemove={disabled ? undefined : () => void remove('socialImage')}
                      removeLabel="Remove social preview image"
                    />
                  </motion.div>
                </AnimatePresence>
                {slots.socialImage?.uploading ? (
                  <div className={styles.socialUploading} role="status" aria-live="polite">
                    <ProgressBar label={`Uploading ${slots.socialImage.uploading}`} className={styles.progress} />
                    <span>Uploading {slots.socialImage.uploading}…</span>
                  </div>
                ) : null}
              </div>
              <AnimatePresence initial={false}>
                {socialNotice ? (
                  <motion.p
                    key={socialNotice}
                    role={slots.socialImage?.error ? 'alert' : undefined}
                    className={slots.socialImage?.error ? styles.error : styles.notice}
                    variants={noticeVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                  >
                    {socialNotice}
                  </motion.p>
                ) : null}
              </AnimatePresence>
            </div>
          </section>
        </div>
      </div>

      <aside className={styles.previews} aria-labelledby="general-preview-title">
        <h2 id="general-preview-title" className={styles.previewTitle}>
          Preview
        </h2>
        <SearchPreview
          className={styles.searchPreview}
          siteName={view.site.name}
          url={view.site.url}
          title={title}
          description={description || undefined}
          favicon={lightUrl ?? darkUrl}
          aria-label="Google search result preview"
        />
        <SocialPreview
          className={styles.socialPreview}
          domain={view.site.domain}
          title={title}
          description={description ? truncateWords(description, 45) : undefined}
          image={images.socialImage?.url}
          aria-label="Social card preview"
        />
        <SettingRow
          title="Search engines"
          description="Allow search engines to index the site."
          checked={allowIndexing}
          disabled={disabled}
          onCheckedChange={(checked) => void onIndexing(checked)}
        />
        {indexingError ? (
          <p role="alert" className={styles.error}>
            {indexingError}
          </p>
        ) : !allowIndexing ? (
          <p className={styles.notice}>Search engines won&rsquo;t index any page, whatever each page&rsquo;s own setting.</p>
        ) : null}
      </aside>
    </div>
  )
}
