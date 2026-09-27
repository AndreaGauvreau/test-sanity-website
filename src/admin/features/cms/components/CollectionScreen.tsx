'use client'

import { useRouter, useSelectedLayoutSegment } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import type { CollectionDef } from '@/admin/core/contracts/manifest'
import {
  AnimatePresence,
  Button,
  CMSCell,
  CMSRow,
  CMSTable,
  ContentArea,
  EmptyState,
  Icon,
  Modal,
  PageHeader,
  SelectionBar,
  StatusSelect,
  cx,
  useToast,
  type FilterCondition,
} from '@/admin/ui'

import {
  activeConditions,
  applyListQuery,
  canReorder,
  defaultSort,
  directionOptions,
  parseStoredQuery,
  sortOptions,
  type ListQuery,
  type SortState,
} from '../lib/list-query'
import { keyBetween, isValidRank } from '../lib/order'
import { countLabel, pluralize, type CmsRow } from '../lib/rows'
import { partitionForDelete, runStage, stagedFrom, stagedLabel, stagedToast, statusMenu, type StagedAction, type StagedMap } from '../lib/staging'
import { createItemAction, deleteItemsAction, reorderAction, saveFieldAction, statusAction } from '../server/actions'
import { CollectionContext } from './CollectionContext'
import { ListTools } from './ListTools'
import { loadPublishStatus, stageClient } from './stage-client'
import { moveIndex, useReorder } from './useReorder'
import styles from './CollectionScreen.module.css'

/**
 * Liste d'une collection façon tableur (C3) + barre d'outils G5 + sélection multiple. Rendue par le layout de
 * la collection : le panneau C4 (page enfant, `children`) s'ouvre par-dessus sans recharger la liste.
 */

type Props = {
  collection: CollectionDef
  rows: CmsRow[]
  children?: ReactNode
}

type Confirm =
  | { kind: 'discard' | 'delete-draft' | 'unpublish' | 'delete-live'; row: CmsRow }
  | { kind: 'delete-many'; drafts: string[]; live: string[] }

function storageKey(collection: CollectionDef) {
  return `kz-admin:cms:${collection.id}`
}

export function CollectionScreen({ collection, rows: serverRows, children }: Props) {
  const router = useRouter()
  const toast = useToast()
  const openId = useSelectedLayoutSegment()
  const listHref = `/admin/cms/${collection.id}`
  const hrefOf = (id: string, field?: string) => `${listHref}/${encodeURIComponent(id)}${field ? `?field=${encodeURIComponent(field)}` : ''}`

  // Lignes : celles du serveur, corrigées localement après chaque écriture (sans recharger).
  const [rows, setRows] = useState<CmsRow[]>(serverRows)
  const [seen, setSeen] = useState(serverRows)
  if (seen !== serverRows) {
    setSeen(serverRows)
    setRows(serverRows)
  }

  // Tri, filtres, recherche : gardés par collection pendant la session (G5, « proposé »).
  const [query, setQuery] = useState<ListQuery>(() => ({ sort: defaultSort(collection), conditions: [], search: '' }))
  const [restored, setRestored] = useState(false)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey(collection))
      if (raw) setQuery((q) => ({ ...q, ...parseStoredQuery(JSON.parse(raw), collection) }))
    } catch {
      // Stockage indisponible (navigation privée…) : réglages par défaut.
    }
    setRestored(true)
  }, [collection])
  useEffect(() => {
    if (!restored) return
    try {
      sessionStorage.setItem(storageKey(collection), JSON.stringify(query))
    } catch {
      // Sans stockage : rien à faire.
    }
  }, [collection, query, restored])

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<{ id: string; field: string } | null>(null)
  const [cellErrors, setCellErrors] = useState<Record<string, string>>({})
  const [adding, setAdding] = useState(false)
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [busy, setBusy] = useState(false)

  // Dépublier / supprimer au prochain Publish : état lu dans le moteur (E1), sans bloquer l'affichage de la liste.
  const [staged, setStaged] = useState<StagedMap>({})
  const rowIds = useMemo(() => rows.map((r) => r.id), [rows])
  const rowIdsRef = useRef(rowIds)
  useEffect(() => {
    rowIdsRef.current = rowIds
  })
  useEffect(() => {
    let alive = true
    void loadPublishStatus().then((status) => {
      if (alive && status) setStaged(stagedFrom(status, rowIdsRef.current))
    })
    return () => {
      alive = false
    }
  }, [collection.id, serverRows])

  const visible = useMemo(() => applyListQuery(rows, query), [rows, query])
  const reorderable = canReorder(collection, query)

  const updateRow = useCallback((row: CmsRow) => setRows((prev) => prev.map((r) => (r.id === row.id ? row : r))), [])
  const removeRow = useCallback((id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id))
    setSelected((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }, [])
  /** Programme (kind) ou annule (null) l'action d'un élément en ligne ; renvoie l'erreur éventuelle. */
  const stage = useCallback(
    async (id: string, kind: StagedAction | null): Promise<string | null> => {
      const result = await runStage(stageClient, rowIdsRef.current, id, kind)
      if (!result.ok) return result.error
      setStaged(result.staged)
      router.refresh()
      return null
    },
    [router],
  )
  const context = useMemo(() => ({ updateRow, removeRow, staged, stage }), [updateRow, removeRow, staged, stage])

  // ─── Ordre manuel ──────────────────────────────────────────────────────────
  const onDrop = useCallback(
    (id: string, from: number, to: number) => {
      const order = moveIndex(visible, from, to)
      const index = order.findIndex((r) => r.id === id)
      const before = order[index - 1] ?? null
      const after = order[index + 1] ?? null
      // Affichage optimiste : une clé entre les voisins si possible (le serveur calcule la vraie).
      let optimistic: string | null = null
      try {
        if ((!before || isValidRank(before.rank)) && (!after || isValidRank(after.rank))) optimistic = keyBetween(before?.rank ?? null, after?.rank ?? null)
      } catch {
        optimistic = null
      }
      const previous = rows
      if (optimistic) setRows((prev) => prev.map((r) => (r.id === id ? { ...r, rank: optimistic } : r)))
      void reorderAction({ collectionId: collection.id, id, beforeId: before?.id ?? null, afterId: after?.id ?? null }).then((result) => {
        if (!result.ok) {
          setRows(previous)
          toast.show({ type: 'error', message: result.error })
          return
        }
        setRows((prev) =>
          prev.map((r) => {
            const update = result.updates.find((u) => u.id === r.id)
            return update ? { ...r, rank: update.rank, status: update.status, filters: { ...r.filters, status: update.status } } : r
          }),
        )
      })
    },
    [collection.id, rows, toast, visible],
  )
  const reorder = useReorder({ count: visible.length, enabled: reorderable, onDrop })
  const display = reorder.drag?.mode === 'keyboard' ? moveIndex(visible, reorder.drag.from, reorder.drag.to) : visible

  // Le focus suit la poignée d'une ligne déplacée au clavier.
  const liftedId = reorder.drag?.mode === 'keyboard' ? reorder.drag.id : null
  const liftedTo = reorder.drag?.mode === 'keyboard' ? reorder.drag.to : null
  useEffect(() => {
    if (!liftedId) return
    const grip = document.querySelector<HTMLElement>(`[data-grip="${CSS.escape(liftedId)}"]`)
    if (grip && document.activeElement !== grip) grip.focus()
  }, [liftedId, liftedTo])

  // ─── Actions ───────────────────────────────────────────────────────────────
  const addItem = async () => {
    setAdding(true)
    const result = await createItemAction({ collectionId: collection.id })
    setAdding(false)
    if (!result.ok) {
      toast.show({ type: 'error', message: result.error })
      return
    }
    router.push(hrefOf(result.id), { scroll: false })
    router.refresh()
  }

  const commitCell = async (row: CmsRow, field: string, value: string) => {
    setEditing(null)
    const cell = row.cells[field]
    if (!cell || (cell.raw ?? '') === value) return
    const key = `${row.id}:${field}`
    // Affichage optimiste, annulé si le serveur refuse.
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...(field === collection.titleField ? { title: value } : {}), cells: { ...r.cells, [field]: { ...cell, text: value, raw: value } } } : r)))
    const result = await saveFieldAction({ collectionId: collection.id, id: row.id, field, value })
    if (!result.ok) {
      setRows((prev) => prev.map((r) => (r.id === row.id ? row : r)))
      setCellErrors((prev) => ({ ...prev, [key]: result.error }))
      toast.show({ type: 'error', message: result.error })
      return
    }
    setCellErrors((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
    if (result.row) updateRow(result.row)
  }

  const runStatus = async (kind: 'discard' | 'delete-draft', row: CmsRow) => {
    setBusy(true)
    const result = await statusAction({ collectionId: collection.id, id: row.id, action: kind })
    setBusy(false)
    setConfirm(null)
    if (!result.ok) {
      toast.show({ type: 'error', message: result.error })
      return
    }
    if (result.row) updateRow(result.row)
    else removeRow(row.id)
    toast.show({ type: 'success', message: kind === 'discard' ? 'Changes discarded.' : `${collection.singular} deleted.` })
    // Comptes de la sidebar (coque) et « Unpublished changes » : relus par le serveur.
    router.refresh()
  }

  const stageRow = async (row: CmsRow, kind: StagedAction | null) => {
    setBusy(true)
    const error = await stage(row.id, kind)
    setBusy(false)
    setConfirm(null)
    toast.show(error ? { type: 'error', message: error } : { type: 'success', message: stagedToast(kind, collection.singular) })
  }

  /** Sélection : brouillons supprimés tout de suite, éléments en ligne supprimés au prochain Publish. */
  const deleteMany = async (drafts: string[], live: string[]) => {
    setBusy(true)
    const errors: string[] = []
    let deleted = 0
    if (drafts.length) {
      const result = await deleteItemsAction({ collectionId: collection.id, ids: drafts })
      if (result.ok) {
        result.deleted.forEach(removeRow)
        deleted = result.deleted.length
      } else errors.push(result.error)
    }
    let scheduled = 0
    for (const id of live) {
      const error = await stage(id, 'delete')
      if (error) errors.push(error)
      else scheduled += 1
    }
    setBusy(false)
    setConfirm(null)
    setSelected(new Set())
    router.refresh()
    const parts = [
      deleted ? `${deleted} ${deleted === 1 ? 'draft' : 'drafts'} deleted.` : '',
      scheduled ? `${scheduled} live ${scheduled === 1 ? collection.singular.toLowerCase() : pluralize(collection.singular.toLowerCase())} will be deleted at the next Publish.` : '',
    ].filter(Boolean)
    if (errors.length) toast.show({ type: 'error', message: [...parts, errors[0]].join(' ') })
    else toast.show({ type: 'success', message: parts.join(' ') })
  }

  // ─── Sélection ─────────────────────────────────────────────────────────────
  const selectedRows = rows.filter((r) => selected.has(r.id))
  const toDelete = partitionForDelete(selectedRows, staged)
  const deletableCount = toDelete.drafts.length + toDelete.live.length
  const allVisibleSelected = visible.length > 0 && visible.every((r) => selected.has(r.id))
  const someVisibleSelected = visible.some((r) => selected.has(r.id))
  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  const selectAll = (on: boolean) => setSelected(on ? new Set(visible.map((r) => r.id)) : new Set())

  // ─── Rendu ─────────────────────────────────────────────────────────────────
  const plural = pluralize(collection.singular.toLowerCase())
  const filterFields = (collection.filters ?? []).map((f) => ({ value: f.field, label: f.label, options: f.options.map((o) => ({ value: o.value, label: o.label })) }))
  const sortDirections = directionOptions(query.sort.by)
  const hasQuery = activeConditions(query.conditions).length > 0 || query.search.trim() !== ''
  const columns = collection.columns
  const manyCount = confirm?.kind === 'delete-many' ? confirm.drafts.length + confirm.live.length : 0

  const tools = (
    <ListTools
      add={{ label: `New ${collection.singular.toLowerCase()}`, onAdd: () => void addItem(), loading: adding }}
      sort={{
        options: sortOptions(collection),
        directions: sortDirections,
        value: query.sort,
        onChange: (next: SortState) =>
          setQuery((q) => ({
            ...q,
            sort: next.by === q.sort.by ? next : { by: next.by, direction: directionOptions(next.by)[0]?.value ?? 'asc' },
          })),
      }}
      filter={{
        fields: filterFields,
        conditions: query.conditions as FilterCondition[],
        onChange: (conditions) => setQuery((q) => ({ ...q, conditions })),
      }}
      search={{ value: query.search, onChange: (search) => setQuery((q) => ({ ...q, search })), label: `Search ${collection.label}` }}
    />
  )

  let body: ReactNode
  if (rows.length === 0) {
    body = (
      <EmptyState
        className={styles.empty}
        icon="database"
        title={`No ${plural} yet`}
        description={`${collection.label} items you add appear on the site where this collection is shown.`}
        action={
          <Button variant="secondary" size="small" iconLeft="plus" onClick={() => void addItem()} loading={adding}>
            New {collection.singular.toLowerCase()}
          </Button>
        }
      />
    )
  } else if (visible.length === 0) {
    body = (
      <EmptyState
        className={styles.empty}
        icon="search"
        title="No results"
        description="No item matches these filters or this search."
        action={
          <Button variant="secondary" size="small" onClick={() => setQuery((q) => ({ ...q, conditions: [], search: '' }))}>
            Clear
          </Button>
        }
      />
    )
  } else {
    body = (
      <CMSTable aria-label={`${collection.label} items`} aria-rowcount={visible.length + 1} className={cx(reorder.settling && styles.settling)}>
        <CMSRow header>
          <CMSCell
            type="handle"
            checked={allVisibleSelected || someVisibleSelected}
            indeterminate={someVisibleSelected && !allVisibleSelected}
            onCheckedChange={() => selectAll(!allVisibleSelected)}
            checkboxLabel={allVisibleSelected ? 'Deselect all' : 'Select all'}
          />
          {columns.map((column) => (
            <CMSCell key={column.field} type="header" width={column.width}>
              {column.label}
            </CMSCell>
          ))}
        </CMSRow>
        {display.map((row, index) => {
          const offset = reorder.offsetFor(index)
          const dragging = reorder.drag?.id === row.id
          const grip = reorder.gripProps(row.id, index, row.title || 'Untitled')
          return (
            <CMSRow
              key={row.id}
              selected={row.id === openId}
              data-dragging={dragging || undefined}
              className={cx(dragging && styles.dragging, reorder.drag?.mode === 'pointer' && !dragging && styles.shifting)}
              style={offset ? { transform: `translateY(${offset}px)` } : undefined}
              onOpen={() => router.push(hrefOf(row.id), { scroll: false })}
              openLabel={`Open ${row.title || 'Untitled'}`}
            >
              <CMSCell
                type="handle"
                checked={selected.has(row.id) || row.id === openId}
                onCheckedChange={(on) => toggle(row.id, on)}
                checkboxLabel={`Select ${row.title || 'Untitled'}`}
                // Collection sans ordre manuel : pas de poignée, place gardée (.noGrip) pour aligner les cases.
                grip={collection.orderable}
                className={collection.orderable ? undefined : styles.noGrip}
                gripLabel={`Reorder ${row.title || 'Untitled'}`}
                gripTooltip={reorderable ? 'Drag to reorder' : 'Sort by Manual order, without filters, to reorder'}
                gripProps={
                  collection.orderable
                    ? {
                        ...grip,
                        'data-grip': row.id,
                        'aria-disabled': !reorderable || undefined,
                        'aria-describedby': `${collection.id}-reorder-help`,
                      }
                    : undefined
                }
              />
              {columns.map((column) => {
                if (column.kind === 'status') {
                  return (
                    <CMSCell key={column.field} type="status" width={column.width}>
                      <StatusSelect
                        status={row.status}
                        label={staged[row.id] ? stagedLabel(staged[row.id]) : undefined}
                        actions={statusMenu(row.status, staged[row.id])}
                        disabled={busy}
                        onAction={(action) => {
                          if (action === 'discard' || action === 'delete-draft' || action === 'unpublish' || action === 'delete-live') setConfirm({ kind: action, row })
                          else if (action === 'unstage') void stageRow(row, null)
                        }}
                      />
                    </CMSCell>
                  )
                }
                const cell = row.cells[column.field]
                if (column.kind === 'image') {
                  return (
                    <CMSCell
                      key={column.field}
                      type="image"
                      width={column.width}
                      src={cell?.image ?? undefined}
                      onClick={() => router.push(hrefOf(row.id, column.field), { scroll: false })}
                      className={styles.clickable}
                      title={`Edit ${column.label} in the panel`}
                    />
                  )
                }
                const isEditing = editing?.id === row.id && editing.field === column.field
                const type = column.kind === 'title' ? 'title' : 'text'
                const error = cellErrors[`${row.id}:${column.field}`]
                return (
                  <CMSCell
                    key={column.field}
                    type={type}
                    width={column.width}
                    editing={isEditing}
                    editValue={cell?.raw ?? ''}
                    inputLabel={column.label}
                    tabIndex={0}
                    aria-invalid={error ? true : undefined}
                    title={error}
                    className={cx(!cell?.editable && styles.clickable, error && styles.cellError)}
                    onEditRequest={() => {
                      if (cell?.editable) setEditing({ id: row.id, field: column.field })
                      else router.push(hrefOf(row.id, column.field), { scroll: false })
                    }}
                    onCommit={(value) => void commitCell(row, column.field, value)}
                    onCancel={() => setEditing(null)}
                  >
                    {cell?.text ?? ''}
                  </CMSCell>
                )
              })}
            </CMSRow>
          )
        })}
      </CMSTable>
    )
  }

  return (
    <CollectionContext.Provider value={context}>
      <ContentArea gap={20}>
        <PageHeader title={collection.label} meta={countLabel(rows.length, collection)} tools={tools} toolsLabel={`${collection.label} tools`} />
        <AnimatePresence initial={false}>
          {selected.size > 0 ? (
            <SelectionBar
              key="selection"
              selectedCount={selected.size}
              totalCount={visible.length}
              onSelectAll={selectAll}
              onClear={() => setSelected(new Set())}
            >
              <Button
                variant="secondary"
                size="small"
                iconLeft="trash"
                disabled={deletableCount === 0 || busy}
                onClick={() => setConfirm({ kind: 'delete-many', drafts: toDelete.drafts.map((r) => r.id), live: toDelete.live.map((r) => r.id) })}
              >
                {deletableCount === 0 ? 'Delete' : `Delete ${deletableCount}`}
              </Button>
              {toDelete.live.length > 0 ? (
                <span className={styles.lockNote}>
                  <Icon name="pending" size={12} />
                  <span>
                    {toDelete.live.length} live {toDelete.live.length === 1 ? collection.singular.toLowerCase() : plural} will be deleted at the next Publish
                  </span>
                </span>
              ) : null}
            </SelectionBar>
          ) : null}
        </AnimatePresence>
        {body}
        <p id={`${collection.id}-reorder-help`} className="kz-visually-hidden">
          Press Space to pick up the row, the up and down arrow keys to move it, Space to drop it, Escape to cancel.
        </p>
        <p className="kz-visually-hidden" role="status" aria-live="assertive">
          {reorder.announcement}
        </p>
        {hasQuery && collection.orderable && query.sort.by === 'manual' ? (
          <p className="kz-visually-hidden">Reordering is off while filters or search are active.</p>
        ) : null}
      </ContentArea>
      <Modal
        open={confirm?.kind === 'discard'}
        onClose={() => !busy && setConfirm(null)}
        tone="destructive"
        title="Discard changes?"
        description={`The draft is deleted and this ${collection.singular.toLowerCase()} goes back to its live version.`}
        confirmLabel="Discard changes"
        confirmLoading={busy}
        onConfirm={() => confirm?.kind === 'discard' && void runStatus('discard', confirm.row)}
      />
      <Modal
        open={confirm?.kind === 'delete-draft'}
        onClose={() => !busy && setConfirm(null)}
        tone="destructive"
        title={`Delete this ${collection.singular.toLowerCase()}?`}
        description="It has never been published: it will be deleted for good."
        confirmLabel="Delete draft"
        confirmLoading={busy}
        onConfirm={() => confirm?.kind === 'delete-draft' && void runStatus('delete-draft', confirm.row)}
      />
      <Modal
        open={confirm?.kind === 'unpublish'}
        onClose={() => !busy && setConfirm(null)}
        title={`Unpublish this ${collection.singular.toLowerCase()}?`}
        description="It stays on the site until the next Publish, then it’s taken offline. Its content is kept here as a draft."
        confirmLabel="Unpublish"
        confirmLoading={busy}
        onConfirm={() => confirm?.kind === 'unpublish' && void stageRow(confirm.row, 'unpublish')}
      />
      <Modal
        open={confirm?.kind === 'delete-live'}
        onClose={() => !busy && setConfirm(null)}
        tone="destructive"
        title={`Delete this ${collection.singular.toLowerCase()}?`}
        description="It stays on the site until the next Publish, then it’s removed from the site and deleted for good."
        confirmLabel="Delete"
        confirmLoading={busy}
        onConfirm={() => confirm?.kind === 'delete-live' && void stageRow(confirm.row, 'delete')}
      />
      <Modal
        open={confirm?.kind === 'delete-many'}
        onClose={() => !busy && setConfirm(null)}
        tone="destructive"
        title={`Delete ${manyCount} ${manyCount === 1 ? collection.singular.toLowerCase() : plural}?`}
        description={deleteManyDescription(confirm?.kind === 'delete-many' ? confirm : null, collection.singular.toLowerCase(), plural)}
        confirmLabel="Delete"
        confirmLoading={busy}
        onConfirm={() => confirm?.kind === 'delete-many' && void deleteMany(confirm.drafts, confirm.live)}
      />
      {children}
    </CollectionContext.Provider>
  )
}

/** Texte de confirmation d'une suppression multiple (brouillons tout de suite, en ligne au prochain Publish). */
export function deleteManyDescription(target: { drafts: readonly string[]; live: readonly string[] } | null, singular: string, plural: string): string {
  if (!target) return ''
  const d = target.drafts.length
  const l = target.live.length
  return [
    d ? `${d === 1 ? 'This draft has' : `These ${d} drafts have`} never been published: ${d === 1 ? 'it is' : 'they are'} deleted for good now.` : '',
    l ? `${l === 1 ? `The live ${singular} stays` : `The ${l} live ${plural} stay`} on the site until the next Publish, then ${l === 1 ? 'it is' : 'they are'} removed and deleted.` : '',
  ]
    .filter(Boolean)
    .join(' ')
}
