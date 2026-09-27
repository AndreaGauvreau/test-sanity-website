'use client'

import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'

import {
  AnimatePresence,
  Button,
  ContentArea,
  EmptyState,
  MediaCard,
  Modal,
  PageHeader,
  SelectionBar,
  cx,
  formatBytes,
  useToast,
  type FilterCondition,
} from '@/admin/ui'
import { ListTools } from '@/admin/features/cms/components/ListTools'

import {
  applyMediaQuery,
  DEFAULT_MEDIA_SORT,
  librarySummary,
  MEDIA_FILTER_FIELDS,
  MEDIA_SORT_OPTIONS,
  mediaDirectionOptions,
  partitionForDelete,
  typeLabel,
  usageLabel,
  type MediaAsset,
  type MediaQuery,
  type MediaSort,
} from '../lib/assets'
import { UPLOAD_ACCEPT } from '../lib/upload-limits'
import { deleteAssetsAction } from '../server/actions'
import { MediaDetails } from './MediaDetails'
import { downloadAll, uploadFile } from './upload'
import styles from './MediaLibrary.module.css'

/**
 * Médiathèque (C5) : grille de Media cards, fiche à droite, barre de sélection (Download, « Delete 1 unused »,
 * « 2 used files are locked »), barre d'outils G5 (+ importer : sélecteur ou glisser-déposer ; tri date / nom /
 * taille ; filtres type / usage ; recherche). Un fichier utilisé sur le site ne peut pas être supprimé.
 */

const STORAGE_KEY = 'kz-admin:media'

export function MediaLibrary({ assets: initialAssets }: { assets: MediaAsset[] }) {
  const toast = useToast()
  const [assets, setAssets] = useState(initialAssets)
  const [seen, setSeen] = useState(initialAssets)
  if (seen !== initialAssets) {
    setSeen(initialAssets)
    setAssets(initialAssets)
  }
  const [query, setQuery] = useState<MediaQuery>({ sort: DEFAULT_MEDIA_SORT, conditions: [], search: '' })
  const [restored, setRestored] = useState(false)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY)
      const stored = raw ? (JSON.parse(raw) as Partial<MediaQuery>) : null
      if (stored && typeof stored === 'object') {
        setQuery((q) => ({
          sort: MEDIA_SORT_OPTIONS.some((o) => o.value === stored.sort?.by) && (stored.sort?.direction === 'asc' || stored.sort?.direction === 'desc') ? (stored.sort as MediaSort) : q.sort,
          conditions: Array.isArray(stored.conditions)
            ? stored.conditions.filter((c) => c && typeof c.id === 'string' && MEDIA_FILTER_FIELDS.some((f) => f.value === c.field))
            : q.conditions,
          search: typeof stored.search === 'string' ? stored.search.slice(0, 200) : q.search,
        }))
      }
    } catch {
      // Stockage indisponible : réglages par défaut.
    }
    setRestored(true)
  }, [])
  useEffect(() => {
    if (!restored) return
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(query))
    } catch {
      // Sans stockage : rien à faire.
    }
  }, [query, restored])

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [activeId, setActiveId] = useState<string | null>(initialAssets[0]?.id ?? null)
  const [uploading, setUploading] = useState(0)
  const [replacing, setReplacing] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string[] | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)
  const fileInput = useRef<HTMLInputElement | null>(null)

  const visible = useMemo(() => applyMediaQuery(assets, query), [assets, query])
  const active = assets.find((a) => a.id === activeId) ?? null
  const selectedAssets = assets.filter((a) => selected.has(a.id))
  const { deletable } = partitionForDelete(selectedAssets)
  const hasQuery = query.search.trim() !== '' || query.conditions.some((c) => c.value)

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  // ─── Envoi ─────────────────────────────────────────────────────────────────
  const upload = async (files: File[]) => {
    if (files.length === 0) return
    const id = `media-upload-${Date.now()}`
    setUploading((n) => n + files.length)
    toast.show({ id, type: 'loading', message: files.length === 1 ? `Uploading ${files[0].name}…` : `Uploading ${files.length} files…` })
    let done = 0
    const errors: string[] = []
    for (const file of files) {
      const result = await uploadFile(file)
      setUploading((n) => n - 1)
      if (result.ok) {
        done += 1
        setAssets((prev) => [result.asset, ...prev.filter((a) => a.id !== result.asset.id)])
        setActiveId(result.asset.id)
      } else errors.push(`${file.name}: ${result.error}`)
    }
    if (errors.length === 0) {
      toast.update(id, { type: 'success', message: done === 1 ? `${files[0].name} uploaded.` : `${done} files uploaded.`, duration: 5000 })
    } else {
      toast.update(id, { type: 'error', message: errors.length === 1 && files.length === 1 ? errors[0] : `${done} uploaded, ${errors.length} failed. ${errors[0]}`, duration: 8000 })
    }
  }

  const replace = async (asset: MediaAsset, file: File) => {
    setReplacing(asset.id)
    const id = `media-replace-${asset.id}`
    toast.show({ id, type: 'loading', message: `Replacing ${asset.name}…` })
    const result = await uploadFile(file, { replace: asset.id })
    setReplacing(null)
    if (!result.ok) {
      toast.update(id, { type: 'error', message: result.error, duration: 8000 })
      return
    }
    setAssets((prev) => [result.asset, ...prev.filter((a) => a.id !== result.asset.id)])
    setActiveId(result.asset.id)
    toast.update(id, {
      type: 'success',
      message: result.updated
        ? `Replaced in ${result.updated} ${result.updated === 1 ? 'place' : 'places'}. It goes live with the next Publish.`
        : `${result.asset.name} uploaded.`,
      duration: 6000,
    })
  }

  // ─── Suppression ───────────────────────────────────────────────────────────
  const remove = async (ids: string[]) => {
    setDeleting(true)
    const result = await deleteAssetsAction({ ids })
    setDeleting(false)
    setConfirmDelete(null)
    if (!result.ok) {
      toast.show({ type: 'error', message: result.error })
      return
    }
    const gone = new Set(result.deleted)
    setAssets((prev) => prev.filter((a) => !gone.has(a.id)))
    setSelected((prev) => new Set([...prev].filter((id) => !gone.has(id))))
    if (activeId && gone.has(activeId)) setActiveId(null)
    const n = result.deleted.length
    const lockedNote = result.locked.length ? ` ${result.locked.length} ${result.locked.length === 1 ? 'file is' : 'files are'} still used and ${result.locked.length === 1 ? 'was' : 'were'} kept.` : ''
    toast.show({ type: n ? 'success' : 'info', message: `${n} ${n === 1 ? 'file' : 'files'} deleted.${lockedNote}` })
  }

  // ─── Glisser-déposer de fichiers sur la médiathèque ────────────────────────
  const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes('Files')
  const dropHandlers = {
    onDragEnter: (event: DragEvent<HTMLDivElement>) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      dragDepth.current += 1
      setDragging(true)
    },
    onDragOver: (event: DragEvent<HTMLDivElement>) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'
    },
    onDragLeave: () => {
      dragDepth.current = Math.max(0, dragDepth.current - 1)
      if (dragDepth.current === 0) setDragging(false)
    },
    onDrop: (event: DragEvent<HTMLDivElement>) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      dragDepth.current = 0
      setDragging(false)
      void upload(Array.from(event.dataTransfer.files))
    },
  }

  const tools = (
    <ListTools
      add={{ label: 'Upload files', onAdd: () => fileInput.current?.click(), loading: uploading > 0 }}
      sort={{
        options: MEDIA_SORT_OPTIONS,
        directions: mediaDirectionOptions(query.sort.by),
        value: query.sort,
        onChange: (next: MediaSort) =>
          setQuery((q) => ({ ...q, sort: next.by === q.sort.by ? next : { by: next.by, direction: mediaDirectionOptions(next.by)[0].value } })),
      }}
      filter={{
        fields: MEDIA_FILTER_FIELDS.map((f) => ({ value: f.value, label: f.label, options: f.options.map((o) => ({ ...o })) })),
        conditions: query.conditions as FilterCondition[],
        onChange: (conditions) => setQuery((q) => ({ ...q, conditions })),
      }}
      search={{ value: query.search, onChange: (search) => setQuery((q) => ({ ...q, search })), label: 'Search media' }}
    />
  )

  let grid
  if (assets.length === 0) {
    grid = (
      <EmptyState
        className={styles.empty}
        icon="image"
        title="No files yet"
        description="Upload images, videos and PDFs, or drop them here. They can then be used on the site."
        action={
          <Button variant="secondary" size="small" iconLeft="upload" onClick={() => fileInput.current?.click()}>
            Upload files
          </Button>
        }
      />
    )
  } else if (visible.length === 0) {
    grid = (
      <EmptyState
        className={styles.empty}
        icon="search"
        title="No results"
        description="No file matches these filters or this search."
        action={
          <Button variant="secondary" size="small" onClick={() => setQuery((q) => ({ ...q, conditions: [], search: '' }))}>
            Clear
          </Button>
        }
      />
    )
  } else {
    grid = (
      <ul className={styles.grid} aria-label="Files">
        {visible.map((asset) => {
          const used = asset.usages.length
          return (
            <li key={asset.id} className={styles.cell}>
              <MediaCard
                name={asset.name}
                size={formatBytes(asset.size)}
                usage={usageLabel(used)}
                usagePlaces={asset.usages.map((u) => ({ id: u.id, label: u.label, href: u.siteHref }))}
                type={asset.kind}
                typeLabel={typeLabel(asset)}
                src={asset.thumb ?? undefined}
                selected={selected.has(asset.id)}
                onSelectedChange={(on) => toggle(asset.id, on)}
                onOpen={() => setActiveId(asset.id)}
                aria-current={asset.id === activeId ? 'true' : undefined}
              />
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <ContentArea gap={16}>
      <PageHeader title="Media" meta={librarySummary(assets)} tools={tools} toolsLabel="Media tools" />
      <AnimatePresence initial={false}>
        {selected.size > 0 ? (
          <SelectionBar
            key="selection"
            selectedCount={selected.size}
            totalCount={visible.length}
            onSelectAll={(on) => setSelected(on ? new Set(visible.map((a) => a.id)) : new Set())}
            onClear={() => setSelected(new Set())}
            onDownload={() => downloadAll(selectedAssets)}
            deletableCount={deletable.length}
            onDelete={() => setConfirmDelete(deletable.map((a) => a.id))}
          />
        ) : null}
      </AnimatePresence>
      <div className={cx(styles.body, dragging && styles.dropping)} {...dropHandlers}>
        <div className={styles.gridWrap}>
          {grid}
          {dragging ? (
            <div className={styles.dropOverlay} aria-hidden="true">
              Drop files to upload
            </div>
          ) : null}
        </div>
        {active ? (
          <MediaDetails
            key={active.id}
            asset={active}
            replacing={replacing === active.id}
            onReplace={(file) => void replace(active, file)}
            onDelete={() => setConfirmDelete([active.id])}
            onAltSaved={(altText) => setAssets((prev) => prev.map((a) => (a.id === active.id ? { ...a, altText } : a)))}
          />
        ) : assets.length ? (
          <aside className={cx(styles.details, styles.detailsEmpty)} aria-label="Details">
            <p>Select a file to see its details and where it’s used.</p>
          </aside>
        ) : null}
      </div>
      <p className="kz-visually-hidden" role="status" aria-live="polite">
        {hasQuery ? `${visible.length} of ${assets.length} files shown.` : ''}
      </p>
      <input
        ref={fileInput}
        type="file"
        multiple
        accept={UPLOAD_ACCEPT}
        hidden
        tabIndex={-1}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? [])
          event.target.value = ''
          void upload(files)
        }}
      />
      <Modal
        open={confirmDelete !== null}
        onClose={() => !deleting && setConfirmDelete(null)}
        tone="destructive"
        title={confirmDelete && confirmDelete.length === 1 ? 'Delete this file?' : `Delete ${confirmDelete?.length ?? 0} files?`}
        description="Unused files are deleted for good. Files used on the site are kept."
        confirmLabel="Delete"
        confirmLoading={deleting}
        onConfirm={() => confirmDelete && void remove(confirmDelete)}
      />
    </ContentArea>
  )
}
