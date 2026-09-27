'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'

import type { CollectionDef, FieldDef } from '@/admin/core/contracts/manifest'
import { validateFieldValue } from '@/admin/core/sanity/validate'
import {
  Callout,
  Drawer,
  IconButton,
  Input,
  Menu,
  MenuItem,
  MenuSeparator,
  Modal,
  Select,
  Switch,
  Tag,
  Textarea,
  duration,
  useReducedMotion,
  useToast,
  type TagTone,
} from '@/admin/ui'

import { richTextConfigFor } from '../lib/portable-text'
import { stagedLabel, stagedToast, statusMenu, type StagedAction } from '../lib/staging'
import { articlePathFor, slugify } from '../lib/slug'
import { STATUS_LABELS, type CmsStatus } from '../lib/status'
import type { ItemView } from '../server/data'
import { saveFieldAction, statusAction } from '../server/actions'
import { useCollectionContext } from './CollectionContext'
import { ImageField } from './fields/ImageField'
import { RichTextField } from './RichTextField/RichTextField'
import { createFieldSaver, type FieldSaver } from './useFieldSaver'
import styles from './ItemDrawer.module.css'

/**
 * Fiche d'un élément (C4) : panneau de 810 px par-dessus la liste, URL partageable (/admin/cms/<collection>/<id>).
 * Champs du manifeste l'un sous l'autre (libellé à gauche), sauvegarde automatique dans le brouillon, statut
 * dans l'en-tête, ⋯ (Preview ↗, Discard changes, Delete), pied « Shown on … Need another field? Ask Kuartz ».
 * Pas de publication ici : elle passe par Publish (E1). Échap, ✕ ou clic sur le voile : retour à la liste.
 */

export const STATUS_TONE: Readonly<Record<CmsStatus, TagTone>> = { live: 'info', draft: 'neutral', changed: 'warning' }

type Props = {
  collection: CollectionDef
  item: ItemView
  listHref: string
  siteUrl: string
  siteDomain: string
  /** Champ à focaliser à l'ouverture (clic sur une cellule non modifiable sur place). */
  focusField?: string | null
}

/**
 * `initialFocusRef` du Drawer vers le champ `focusField` de la fiche (null → le kit prend le premier champ).
 * Référence STABLE dont `current` est lu au moment du focus (le champ n'existe qu'une fois le panneau monté) ;
 * contrôle composé (Select, image, texte riche) : son premier élément focalisable.
 */
export function useFieldFocusRef(itemId: string, focusField: string | null | undefined): RefObject<HTMLElement | null> {
  const target = useRef({ itemId, focusField })
  useEffect(() => {
    target.current = { itemId, focusField }
  })
  const [ref] = useState<RefObject<HTMLElement | null>>(() => ({
    get current() {
      const { itemId: id, focusField: field } = target.current
      if (!field) return null
      const el = document.getElementById(fieldId(id, field))
      if (!el) return null
      return el.tabIndex < 0 ? (el.querySelector<HTMLElement>('input, textarea, button, [contenteditable="true"]') ?? el) : el
    },
  }))
  return ref
}

export function formatPlaces(places: readonly string[]): string {
  if (places.length === 0) return ''
  if (places.length === 1) return places[0]
  return `${places.slice(0, -1).join(', ')} and ${places[places.length - 1]}`
}

export function ItemDrawer({ collection, item, listHref, siteUrl, siteDomain, focusField }: Props) {
  const router = useRouter()
  const toast = useToast()
  const list = useCollectionContext()
  const reduced = useReducedMotion()
  const [open, setOpen] = useState(true)
  const [status, setStatus] = useState<CmsStatus>(item.status)
  const [values, setValues] = useState<Record<string, unknown>>(item.values)
  const [errors, setErrors] = useState<Record<string, string | null>>({})
  const [confirm, setConfirm] = useState<'discard' | 'delete' | 'unpublish' | 'delete-live' | null>(null)
  const [busy, setBusy] = useState(false)
  const valuesRef = useRef(values)
  const statusRef = useRef(status)
  useEffect(() => {
    valuesRef.current = values
    statusRef.current = status
  })

  const save = async (field: FieldDef, value: unknown) => {
    const result = await saveFieldAction({ collectionId: collection.id, id: item.id, field: field.name, value })
    if (!result.ok) return { ok: false as const, error: result.error }
    setStatus(result.status)
    if (result.row) list?.updateRow(result.row)
    return { ok: true as const }
  }

  // Un enregistreur par champ, stable pour la vie du panneau.
  const savers = useRef<Record<string, FieldSaver<unknown>>>({})
  const saverFor = (field: FieldDef): FieldSaver<unknown> => {
    savers.current[field.name] ??= createFieldSaver<unknown>((value) => save(field, value), {
      delay: field.kind === 'select' || field.kind === 'boolean' ? 0 : 600,
      onError: (error) => setErrors((prev) => ({ ...prev, [field.name]: error })),
    })
    return savers.current[field.name]
  }
  useEffect(() => {
    const all = savers.current
    return () => Object.values(all).forEach((s) => s.dispose())
  }, [])

  const setField = (field: FieldDef, value: unknown) => {
    const previousTitle = valuesRef.current[collection.titleField]
    setValues((prev) => ({ ...prev, [field.name]: value }))
    // Validation immédiate (mêmes règles que le serveur) : une valeur invalide n'est pas envoyée.
    const local = validateFieldValue(field, value === '' ? null : value)
    setErrors((prev) => ({ ...prev, [field.name]: local }))
    const saver = saverFor(field)
    if (local) {
      saver.cancel()
      return
    }
    saver.change(value)
    // Slug généré depuis le titre tant que l'élément n'a jamais été publié et que le slug suit le titre.
    if (field.name === collection.titleField && collection.slugField && statusRef.current === 'draft') {
      const slugDef = collection.fields.find((f) => f.name === collection.slugField)
      const slug = valuesRef.current[collection.slugField]
      if (slugDef && typeof previousTitle === 'string' && slug === slugify(previousTitle)) {
        const next = slugify(String(value))
        if (next && next !== slug) setField(slugDef, next)
      }
    }
  }

  // Textes riches : leur dernière frappe est remontée avant d'envoyer (l'éditeur regroupe par paquets).
  const richFlushers = useRef<Record<string, () => void>>({})
  const flushAll = () => {
    Object.values(richFlushers.current).forEach((flush) => flush())
    return Promise.all(Object.values(savers.current).map((s) => s.flush()))
  }

  const close = async () => {
    await flushAll()
    setOpen(false)
    setTimeout(() => router.push(listHref, { scroll: false }), reduced ? 0 : duration.overlay * 800)
  }

  const runStatus = async (action: 'discard' | 'delete-draft') => {
    setBusy(true)
    Object.values(savers.current).forEach((s) => s.cancel())
    const result = await statusAction({ collectionId: collection.id, id: item.id, action })
    setBusy(false)
    setConfirm(null)
    if (!result.ok) {
      toast.show({ type: 'error', message: result.error })
      return
    }
    if (result.row) list?.updateRow(result.row)
    else list?.removeRow(item.id)
    toast.show({ type: 'success', message: action === 'discard' ? 'Changes discarded.' : `${collection.singular} deleted.` })
    setOpen(false)
    setTimeout(() => {
      router.push(listHref, { scroll: false })
      router.refresh()
    }, reduced ? 0 : duration.overlay * 800)
  }

  // Dépublier / supprimer un élément en ligne : programmé pour le prochain Publish (état partagé avec la liste).
  const staged = list?.staged[item.id]
  const menu = statusMenu(status, staged)
  const has = (id: string) => menu.some((m) => m.id === id)
  const runStage = async (kind: StagedAction | null) => {
    if (!list) return
    setBusy(true)
    const error = await list.stage(item.id, kind)
    setBusy(false)
    setConfirm(null)
    toast.show(error ? { type: 'error', message: error } : { type: 'success', message: stagedToast(kind, collection.singular) })
  }

  // Focus initial (fait par le Drawer du kit, même ouvert au montage) : le champ demandé (clic sur une cellule
  // image, texte riche, liste…), sinon le premier champ.
  const initialFocusRef = useFieldFocusRef(item.id, focusField)

  const title = (typeof values[collection.titleField] === 'string' && (values[collection.titleField] as string).trim()) || 'Untitled'
  const slug = collection.slugField ? (values[collection.slugField] as string) : ''
  const places = useMemo(() => {
    const article = articlePathFor(collection.articlePath, slug || null)
    return article ? [article, ...item.shownOn] : item.shownOn
  }, [item.shownOn, collection.articlePath, slug])
  const previewHref = item.livePath ? `${siteUrl.replace(/\/$/, '')}${item.livePath}` : null
  const singular = collection.singular.toLowerCase()

  return (
    <>
      <Drawer
        open={open}
        onClose={() => void close()}
        title={title}
        initialFocusRef={initialFocusRef}
        status={
          <Tag tone={STATUS_TONE[status]} dot>
            {staged ? stagedLabel(staged) : STATUS_LABELS[status]}
          </Tag>
        }
        actions={
          <Menu trigger={<IconButton icon="more" label="More actions" />} placement="bottom-end" aria-label={`${collection.singular} actions`}>
            <MenuItem icon="external" href={previewHref ?? undefined} target="_blank" rel="noopener noreferrer" disabled={!previewHref}>
              Preview
            </MenuItem>
            <MenuSeparator />
            <MenuItem icon="history" danger disabled={!has('discard') || busy} onSelect={() => setConfirm('discard')}>
              Discard changes
            </MenuItem>
            {staged ? (
              <MenuItem icon={staged === 'unpublish' ? 'eye' : 'history'} disabled={busy || !list} onSelect={() => void runStage(null)}>
                {staged === 'unpublish' ? 'Keep online' : 'Don’t delete'}
              </MenuItem>
            ) : (
              <MenuItem icon="eye-off" disabled={!has('unpublish') || busy || !list} onSelect={() => setConfirm('unpublish')}>
                Unpublish
              </MenuItem>
            )}
            <MenuItem
              icon="trash"
              danger
              disabled={busy || (status === 'draft' ? false : !has('delete-live') || !list)}
              onSelect={() => setConfirm(status === 'draft' ? 'delete' : 'delete-live')}
            >
              Delete
            </MenuItem>
          </Menu>
        }
        footer={
          <Callout tone="neutral">
            {places.length ? `Shown on ${formatPlaces(places)}. ` : ''}Need another field? Ask Kuartz — fields are defined in code.
          </Callout>
        }
      >
        {collection.fields.map((field) => (
          <FieldControl
            key={field.name}
            itemId={item.id}
            collection={collection}
            field={field}
            value={values[field.name]}
            image={item.images[field.name] ?? null}
            error={errors[field.name] ?? null}
            siteDomain={siteDomain}
            onChange={(value) => setField(field, value)}
            onCommit={() => void saverFor(field).flush()}
            registerFlush={(flush) => {
              if (flush) richFlushers.current[field.name] = flush
              else delete richFlushers.current[field.name]
            }}
            onImage={async (assetId) => {
              setValues((prev) => ({ ...prev, [field.name]: assetId }))
              const result = await save(field, assetId)
              return result.ok ? null : result.error
            }}
          />
        ))}
      </Drawer>
      <Modal
        open={confirm === 'discard'}
        onClose={() => !busy && setConfirm(null)}
        tone="destructive"
        title="Discard changes?"
        description={`The draft is deleted and this ${singular} goes back to its live version.`}
        confirmLabel="Discard changes"
        confirmLoading={busy}
        onConfirm={() => void runStatus('discard')}
      />
      <Modal
        open={confirm === 'delete'}
        onClose={() => !busy && setConfirm(null)}
        tone="destructive"
        title={`Delete this ${singular}?`}
        description={`It has never been published: it will be deleted for good.`}
        confirmLabel="Delete"
        confirmLoading={busy}
        onConfirm={() => void runStatus('delete-draft')}
      />
      <Modal
        open={confirm === 'unpublish'}
        onClose={() => !busy && setConfirm(null)}
        title={`Unpublish this ${singular}?`}
        description="It stays on the site until the next Publish, then it’s taken offline. Its content is kept here as a draft."
        confirmLabel="Unpublish"
        confirmLoading={busy}
        onConfirm={() => void runStage('unpublish')}
      />
      <Modal
        open={confirm === 'delete-live'}
        onClose={() => !busy && setConfirm(null)}
        tone="destructive"
        title={`Delete this ${singular}?`}
        description="It stays on the site until the next Publish, then it’s removed from the site and deleted for good."
        confirmLabel="Delete"
        confirmLoading={busy}
        onConfirm={() => void runStage('delete')}
      />
    </>
  )
}

export function fieldId(itemId: string, field: string): string {
  return `cms-${itemId}-${field}`
}

function FieldControl({
  itemId,
  collection,
  field,
  value,
  image,
  error,
  siteDomain,
  onChange,
  onCommit,
  onImage,
  registerFlush,
}: {
  itemId: string
  collection: CollectionDef
  field: FieldDef
  value: unknown
  image: ItemView['images'][string]
  error: string | null
  siteDomain: string
  onChange: (value: unknown) => void
  onCommit: () => void
  onImage: (assetId: string | null) => Promise<string | null>
  registerFlush: (flush: (() => void) | null) => void
}) {
  const id = fieldId(itemId, field.name)
  const text = typeof value === 'string' ? value : ''
  const common = { id, label: field.label, layout: 'inline' as const, error: error ?? undefined, required: field.required }

  switch (field.kind) {
    case 'string':
    case 'url':
      return (
        <Input
          {...common}
          type={field.kind === 'url' ? 'url' : 'text'}
          value={text}
          placeholder={field.placeholder}
          helper={field.help && field.name !== collection.titleField ? field.help : undefined}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onCommit}
        />
      )
    case 'slug': {
      const path = articlePathFor(collection.articlePath, text || ':slug') ?? `/${text}`
      return (
        <Input
          {...common}
          value={text}
          spellCheck={false}
          autoComplete="off"
          helper={`${siteDomain}${path}`}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onCommit}
        />
      )
    }
    case 'text':
      return (
        <Textarea
          {...common}
          value={text}
          helper={field.help}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onCommit}
        />
      )
    case 'select':
      return (
        <Select
          {...common}
          options={(field.options ?? []).map((o) => ({ value: o.value, label: o.label }))}
          value={text || null}
          placeholder="Select…"
          onValueChange={(next) => onChange(next)}
        />
      )
    case 'date':
      return <Input {...common} type="date" value={text} inputClassName={styles.date} onChange={(event) => onChange(event.target.value)} onBlur={onCommit} />
    case 'number':
      return (
        <Input
          {...common}
          type="number"
          value={typeof value === 'number' ? String(value) : text}
          onChange={(event) => onChange(event.target.value === '' ? '' : Number(event.target.value))}
          onBlur={onCommit}
        />
      )
    case 'boolean':
      return <Switch id={id} label={field.label} checked={value === true} onCheckedChange={(checked) => onChange(checked)} />
    case 'image':
      return <ImageField id={id} label={field.label} image={image} error={error} onSave={onImage} />
    case 'portableText':
      return (
        <RichTextField
          id={id}
          label={field.label}
          initialValue={Array.isArray(value) ? value : []}
          config={richTextConfigFor(field)}
          error={error ?? undefined}
          helper={field.help}
          onChange={(blocks) => onChange(blocks)}
          onBlur={onCommit}
          registerFlush={registerFlush}
        />
      )
    default:
      return (
        <div className={styles.unsupported} id={id} tabIndex={-1}>
          <span className={styles.unsupportedLabel}>{field.label}</span>
          <span>This field can’t be edited here yet. Ask Kuartz.</span>
        </div>
      )
  }
}
