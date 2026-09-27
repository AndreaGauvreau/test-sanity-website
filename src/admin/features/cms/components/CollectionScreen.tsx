'use client'

import { useRouter, useSelectedLayoutSegment } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import type { CollectionDef } from '@/admin/core/contracts/manifest'
import {
  AnimatePresence,
  Button,
  CMSCell,
  CMSRow,
  CMSTable,
  Checkbox,
  ContentArea,
  EmptyState,
  Icon,
  Modal,
  PageHeader,
  SelectionBar,
  StatusSelect,
  Tooltip,
  cx,
  useToast,
  type FilterCondition,
  type StatusAction,
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
import type { CmsStatus } from '../lib/status'
import { createItemAction, deleteItemsAction, reorderAction, saveFieldAction, statusAction } from '../server/actions'
import { CollectionContext } from './CollectionContext'
import { ListTools } from './ListTools'
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

const STATUS_ACTIONS: Record<CmsStatus, StatusAction[]> = {
  // Dépublier se fera au prochain Publish : pas encore relié au moteur (voir CLAUDE.md).
  live: [{ id: 'unpublish', label: 'Unpublish', icon: 'eye-off', disabled: true }],
  draft: [{ id: 'delete-draft', label: 'Delete draft', icon: 'trash', danger: true }],
  changed: [{ id: 'discard', label: 'Discard changes', icon: 'history', danger: true }],
}

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
  const [confirm, setConfirm] = useState<{ kind: 'discard' | 'delete-draft'; row: CmsRow } | { kind: 'delete-many'; ids: string[] } | null>(null)
  const [busy, setBusy] = useState(false)

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
  const context = useMemo(() => ({ updateRow, removeRow }), [updateRow, removeRow])

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
  }

  const deleteMany = async (ids: string[]) => {
    setBusy(true)
    const result = await deleteItemsAction({ collectionId: collection.id, ids })
    setBusy(false)
    setConfirm(null)
    if (!result.ok) {
      toast.show({ type: 'error', message: result.error })
      router.refresh()
      return
    }
    result.deleted.forEach(removeRow)
    const n = result.deleted.length
    toast.show({ type: 'success', message: `${n} ${n === 1 ? collection.singular.toLowerCase() : pluralize(collection.singular.toLowerCase())} deleted.` })
  }

  // ─── Sélection ─────────────────────────────────────────────────────────────
  const selectedRows = rows.filter((r) => selected.has(r.id))
  const deletable = selectedRows.filter((r) => r.status === 'draft')
  const locked = selectedRows.length - deletable.length
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
          <span className={styles.filler} aria-hidden="true" />
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
              <div role="cell" className={styles.handle}>
                {collection.orderable ? (
                  <Tooltip label={reorderable ? 'Drag to reorder' : 'Sort by Manual order, without filters, to reorder'} placement="right">
                    <button
                      type="button"
                      data-grip={row.id}
                      className={styles.grip}
                      aria-label={`Reorder ${row.title || 'Untitled'}`}
                      aria-disabled={!reorderable || undefined}
                      aria-describedby={`${collection.id}-reorder-help`}
                      {...grip}
                    >
                      <Icon name="grip" size={12} />
                    </button>
                  </Tooltip>
                ) : (
                  <span className={styles.gripSpace} />
                )}
                <Checkbox aria-label={`Select ${row.title || 'Untitled'}`} checked={selected.has(row.id) || row.id === openId} onCheckedChange={(on) => toggle(row.id, on)} />
              </div>
              {columns.map((column) => {
                if (column.kind === 'status') {
                  return (
                    <CMSCell key={column.field} type="status" width={column.width}>
                      <StatusSelect
                        status={row.status}
                        actions={STATUS_ACTIONS[row.status]}
                        onAction={(action) => {
                          if (action === 'discard' || action === 'delete-draft') setConfirm({ kind: action, row })
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
              {/* Tableau plus étroit que l'écran (FAQ) : pousse le bouton « open » au bord droit. */}
              <span className={styles.filler} aria-hidden="true" />
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
              <Button variant="secondary" size="small" iconLeft="trash" disabled={deletable.length === 0 || busy} onClick={() => setConfirm({ kind: 'delete-many', ids: deletable.map((r) => r.id) })}>
                {deletable.length === 0 ? 'Delete' : `Delete ${deletable.length} ${deletable.length === 1 ? 'draft' : 'drafts'}`}
              </Button>
              {locked > 0 ? (
                <span className={styles.lockNote}>
                  <Icon name="lock" size={12} />
                  <span>
                    {locked} live {locked === 1 ? collection.singular.toLowerCase() : plural} can’t be deleted here
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
        open={confirm?.kind === 'delete-many'}
        onClose={() => !busy && setConfirm(null)}
        tone="destructive"
        title={`Delete ${confirm?.kind === 'delete-many' ? confirm.ids.length : 0} ${confirm?.kind === 'delete-many' && confirm.ids.length === 1 ? 'draft' : 'drafts'}?`}
        description={`These ${plural} have never been published: they will be deleted for good. Live ${plural} are kept.`}
        confirmLabel="Delete"
        confirmLoading={busy}
        onConfirm={() => confirm?.kind === 'delete-many' && void deleteMany(confirm.ids)}
      />
      {children}
    </CollectionContext.Provider>
  )
}
