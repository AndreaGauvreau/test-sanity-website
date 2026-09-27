'use client'

import { useId, useRef, useState, type ReactNode } from 'react'

import { autosave } from '@/admin/core/autosave'
import type { FieldDef } from '@/admin/core/contracts'
import { validateFieldValue, visibleLength } from '@/admin/core/sanity/validate'
import { Button, Callout, Field, IconButton, ImagePreview, Input, Select, Switch, Tag, Textarea } from '@/admin/ui'
import { urlFor } from '@/sanity/lib/image'

import {
  arrayItems,
  childOf,
  mergeArrayItems,
  moveTarget,
  previousSavedKey,
  imageAssetId,
  isFixedLength,
  itemPath,
  joinPath,
  newArrayItem,
  normalizeText,
  referenceId,
  textValue,
  toImage,
  toReference,
  type ArrayOp,
  type Obj,
} from '../lib/form'
import type { SaveResult } from '../server/save'
import { isHiddenField } from '../lib/manifest'
import { useForm } from './FormContext'
import { useFieldSave } from './useFieldSave'
import styles from './fields.module.css'

/**
 * Champs du formulaire généré depuis le manifeste (C1). Un composant par genre de FieldDef ; chacun valide tout de
 * suite dans le navigateur (validateFieldValue, la même fonction que le serveur) et s'enregistre seul dans le
 * brouillon (useFieldSave → server action). Les tableaux à longueur variable s'enregistrent ÉLÉMENT PAR ÉLÉMENT par
 * leur clé (ajout, modification, retrait, déplacement : écritures sans course de core/sanity), ceux à longueur fixe
 * champ par champ.
 */

export type FieldProps = {
  field: FieldDef
  /** Chemin Sanity du champ dans le document de la page. */
  path: string
  value: unknown
  /** Libellé affiché (« Button 1 · label » pour un sous-champ de bouton). */
  label?: string
}

function HiddenBadge() {
  return (
    <Tag tone="neutral" icon="eye-off" className={styles.hiddenTag} title="Not shown on screen: read by screen readers and search engines.">
      Hidden on screen
    </Tag>
  )
}

function fieldLabel(field: FieldDef, label?: string): ReactNode {
  const text = label ?? field.label
  return isHiddenField(field) ? (
    <span className={styles.labelRow}>
      {text}
      <HiddenBadge />
    </span>
  ) : (
    text
  )
}

/**
 * Aide sous le champ : aide du manifeste et compteur « n / max » (C1 : longueurs affichées sous le champ). Un champ
 * obligatoire vidé affiche aussitôt « <Label> is required. » (même message que le serveur).
 */
function helperText(field: FieldDef, text: string): string | undefined {
  const parts: string[] = []
  if (field.help) parts.push(field.help)
  if (field.maxLength) parts.push(`${visibleLength(text)} / ${field.maxLength}`)
  return parts.length ? parts.join(' · ') : undefined
}

// ─── Textes (string, text, url, slug, number, date) ─────────────────────────

function TextField({ field, path, value, label }: FieldProps) {
  const form = useForm()
  const initial = textValue(field.kind === 'slug' ? childOf(value, 'current') ?? value : value)
  const [text, setText] = useState(initial)
  const [localError, setLocalError] = useState<string | null>(null)
  const toValue = (raw: string): unknown => {
    if (field.kind === 'number') return raw === '' ? null : Number(raw)
    if (field.kind === 'slug') return raw === '' ? null : { _type: 'slug', current: raw }
    return normalizeText(raw)
  }
  const saver = useFieldSave((next: unknown) => form.saveField(path, next), toValue(initial))

  const onChange = (raw: string) => {
    setText(raw)
    const next = toValue(raw)
    const message = validateFieldValue(label ? { ...field, label } : field, next)
    setLocalError(message)
    if (message) saver.cancel()
    else saver.schedule(next)
  }

  const error = localError ?? saver.error ?? undefined
  const common = {
    label: fieldLabel(field, label),
    value: text,
    placeholder: field.placeholder,
    disabled: form.readOnly,
    error,
    helper: helperText(field, text),
    onBlur: () => void saver.flush(),
    'aria-required': field.required || undefined,
  }
  if (field.kind === 'text' || field.maxLines !== undefined) {
    return <Textarea {...common} onChange={(e) => onChange(e.target.value)} rows={field.maxLines ?? 3} />
  }
  return (
    <Input
      {...common}
      type={field.kind === 'number' ? 'number' : field.kind === 'date' ? 'date' : 'text'}
      inputMode={field.kind === 'url' ? 'url' : undefined}
      spellCheck={field.kind === 'url' || field.kind === 'slug' ? false : undefined}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

// ─── Booléen ───────────────────────────────────────────────────────────────

function BooleanField({ field, path, value, label }: FieldProps) {
  const form = useForm()
  const [checked, setChecked] = useState(value === true)
  const saver = useFieldSave((next: boolean) => form.saveField(path, next), value === true, 0)
  return (
    <Field label={undefined} error={saver.error ?? undefined} helper={field.help}>
      <Switch
        label={label ?? field.label}
        checked={checked}
        disabled={form.readOnly}
        onCheckedChange={(next) => {
          setChecked(next)
          saver.schedule(next)
        }}
      />
    </Field>
  )
}

// ─── Liste fermée ──────────────────────────────────────────────────────────

const NONE = '__none__'

function SelectField({ field, path, value, label }: FieldProps) {
  const form = useForm()
  const [selected, setSelected] = useState(typeof value === 'string' ? value : null)
  const saver = useFieldSave((next: string | null) => form.saveField(path, next), selected, 0)
  const options = [
    ...(field.required ? [] : [{ value: NONE, label: 'None' }]),
    ...(field.options ?? []).map((o) => ({ value: o.value, label: o.label })),
  ]
  return (
    <Select
      label={fieldLabel(field, label)}
      options={options}
      value={selected ?? (field.required ? null : NONE)}
      disabled={form.readOnly}
      helper={field.help}
      error={saver.error ?? undefined}
      onValueChange={(next) => {
        const v = next === NONE ? null : next
        setSelected(v)
        saver.schedule(v)
      }}
    />
  )
}

// ─── Référence (élément d'une collection) ──────────────────────────────────

function ReferenceField({ field, path, value, label }: FieldProps) {
  const form = useForm()
  const [selected, setSelected] = useState(referenceId(value))
  const saver = useFieldSave((next: string | null) => form.saveField(path, toReference(next)), selected, 0)
  const items = (field.to ?? []).flatMap((type) => form.referenceOptions[type] ?? [])
  const known = selected && !items.some((o) => o.value === selected) ? [{ value: selected, label: 'Unavailable item' }] : []
  const options = [...(field.required ? [] : [{ value: NONE, label: 'None' }]), ...items, ...known]
  return (
    <Select
      label={fieldLabel(field, label)}
      options={options}
      value={selected ?? (field.required ? null : NONE)}
      disabled={form.readOnly || options.length === 0}
      placeholder={items.length === 0 ? 'No items yet' : 'Select…'}
      helper={field.help}
      error={saver.error ?? undefined}
      onValueChange={(next) => {
        const v = next === NONE ? null : next
        setSelected(v)
        saver.schedule(v)
      }}
    />
  )
}

// ─── Image ─────────────────────────────────────────────────────────────────

function imageSrc(assetId: string | null): string | null {
  if (!assetId) return null
  try {
    return urlFor({ asset: { _ref: assetId } } as Parameters<typeof urlFor>[0]).width(750).url()
  } catch {
    return null
  }
}

function ImageField({ field, path, value, label }: FieldProps) {
  const form = useForm()
  const [assetId, setAssetId] = useState(imageAssetId(value))
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const saver = useFieldSave((next: string | null) => form.saveField(path, toImage(next)), assetId, 0)
  const labelId = useId()

  const onFile = async (file: File) => {
    setUploading(true)
    setError(null)
    autosave.saving()
    const result = await form.uploadImage(path, file)
    setUploading(false)
    if (result.ok) {
      setAssetId(result.assetId)
      saver.markSaved(result.assetId)
      autosave.saved()
    } else {
      setError(result.error)
      autosave.failed(result.error)
    }
  }

  return (
    <Field label={fieldLabel(field, label)} labelId={labelId} helper={field.help} error={error ?? saver.error ?? undefined}>
      <div className={styles.imageRow} role="group" aria-labelledby={labelId}>
        <ImagePreview
          src={imageSrc(assetId)}
          width={240}
          emptyLabel="No image"
          onRemove={
            form.readOnly || field.required
              ? undefined
              : () => {
                  setAssetId(null)
                  saver.schedule(null)
                }
          }
        />
        <Button
          variant="subtle"
          size="small"
          loading={uploading}
          disabled={form.readOnly}
          onClick={() => inputRef.current?.click()}
        >
          {assetId ? 'Replace' : 'Upload'}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="kz-visually-hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) void onFile(file)
          }}
        />
      </div>
    </Field>
  )
}

// ─── Bouton (cta) et objet ─────────────────────────────────────────────────

function CtaField({ field, path, value, label }: FieldProps) {
  const title = label ?? field.label
  return (
    <div className={styles.ctaRow} role="group" aria-label={title}>
      {(field.fields ?? []).map((sub) => (
        <FieldControl
          key={sub.name}
          field={sub}
          path={joinPath(path, sub.name)}
          value={childOf(value, sub.name)}
          label={`${title} · ${sub.label.toLowerCase()}`}
        />
      ))}
    </div>
  )
}

function ObjectField({ field, path, value, label }: FieldProps) {
  return (
    <fieldset className={styles.group}>
      <legend className={styles.groupLegend}>{label ?? field.label}</legend>
      {(field.fields ?? []).map((sub) => (
        <FieldControl key={sub.name} field={sub} path={joinPath(path, sub.name)} value={childOf(value, sub.name)} />
      ))}
    </fieldset>
  )
}

// ─── Tableaux ──────────────────────────────────────────────────────────────

/** Longueur fixe (min === max) : les éléments existants, chaque champ enregistré seul. */
function FixedArrayField({ field, path, value, label }: FieldProps) {
  const items = arrayItems(value)
  const itemLabel = field.itemLabel ?? 'Item'
  return (
    <fieldset className={styles.array}>
      <legend className={styles.arrayLegend}>
        {label ?? field.label}
        <span className={styles.arrayMeta}>
          {items.length} {items.length === 1 ? itemLabel.toLowerCase() : `${itemLabel.toLowerCase()}s`}
        </span>
      </legend>
      {items.length < (field.min ?? 0) ? (
        <Callout tone="warning">
          {`This list needs ${field.min} ${itemLabel.toLowerCase()}s. Ask Kuartz to add the missing ones.`}
        </Callout>
      ) : null}
      {items.map((item, index) => (
        <div key={item._key as string} className={styles.item} role="group" aria-label={`${itemLabel} ${index + 1}`}>
          <p className={styles.itemTitle}>{`${itemLabel} ${index + 1}`}</p>
          {(field.fields ?? []).map((sub) => (
            <FieldControl key={sub.name} field={sub} path={joinPath(itemPath(path, item._key as string), sub.name)} value={item[sub.name]} />
          ))}
        </div>
      ))}
    </fieldset>
  )
}

/** Message de validation d'UN élément (sous-champs), sans les bornes du tableau : null = l'élément peut partir. */
function itemError(field: FieldDef, item: Obj): string | null {
  return validateFieldValue({ ...field, min: undefined, max: undefined, required: false }, [item])
}

/**
 * Longueur variable : ajout, suppression et réordonnancement dans les bornes min / max. Chaque opération part SEULE,
 * par la clé de l'élément (`form.saveArray` → `savePageArrayAction` → insertDraftArrayItem / updateDraftArray /
 * moveDraftArrayItem) : un ajout fait ailleurs entre-temps n'est jamais effacé (FOLLOWUPS #40). Les opérations d'un
 * même tableau passent l'une après l'autre (file locale) ; un élément neuf reste local tant qu'il est invalide, puis
 * part en `insert`, ensuite en `update`. Quand la file est vide, le tableau renvoyé par le serveur est fusionné avec
 * la saisie locale (mergeArrayItems).
 */
function VariableArrayField({ field, path, value, label }: FieldProps) {
  const form = useForm()
  const [items, setItemsState] = useState<Obj[]>(() => arrayItems(value))
  const itemsRef = useRef(items)
  const [localError, setLocalError] = useState<string | null>(null)
  const [opError, setOpError] = useState<string | null>(null)
  // Clés des éléments ajoutés ici et pas encore écrits ; clés retirées ici (une sauvegarde en retard les ignore).
  const unsaved = useRef(new Set<string>())
  const removed = useRef(new Set<string>())
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const pending = useRef(0)
  const itemLabel = field.itemLabel ?? 'Item'
  const title = label ?? field.label

  const setItems = (next: Obj[]) => {
    itemsRef.current = next
    setItemsState(next)
    setLocalError(validateFieldValue(field, next.length ? next : null))
  }

  /**
   * File des opérations du tableau. `build` est appelée au moment d'envoyer (après les précédentes) : elle voit l'état
   * à jour (élément déjà inséré ou non, ordre local). null → rien à envoyer. `track` : signale l'enregistrement dans
   * la Top bar (les modifications d'élément le font déjà via useFieldSave).
   */
  const enqueue = (build: () => ArrayOp | null, track: boolean): Promise<SaveResult> => {
    pending.current++
    const task = queue.current.then(async (): Promise<SaveResult> => {
      try {
        const op = build()
        if (!op) return { ok: true }
        if (track) autosave.saving()
        const result = await form.saveArray(path, op)
        if (!result.ok) {
          if (track) {
            setOpError(result.error)
            autosave.failed(result.error)
          }
          return result
        }
        if (op.op === 'insert') unsaved.current.delete(op.item._key as string)
        if (track) {
          setOpError(null)
          autosave.saved()
        }
        // Tableau du serveur appliqué seulement file vide : une opération encore en attente garde l'ordre local.
        if (result.items && pending.current === 1) setItems(mergeArrayItems(itemsRef.current, result.items, unsaved.current))
        return { ok: true }
      } catch {
        const message = "Couldn't save. Check your connection and try again."
        if (track) {
          setOpError(message)
          autosave.failed(message)
        }
        return { ok: false, error: message }
      } finally {
        pending.current--
      }
    })
    queue.current = task
    return task
  }

  /** Enregistrement d'un élément (appelé par useFieldSave de sa carte) : insert s'il est neuf, sinon update. */
  const saveItem = (item: Obj): Promise<SaveResult> => {
    const key = item._key as string
    return enqueue(() => {
      if (removed.current.has(key)) return null
      if (unsaved.current.has(key)) return { op: 'insert', item, after: previousSavedKey(itemsRef.current, key, unsaved.current) }
      return { op: 'update', item }
    }, false)
  }

  const changeItem = (next: Obj) => setItems(itemsRef.current.map((it) => (it._key === next._key ? next : it)))

  const removeItem = (key: string) => {
    removed.current.add(key)
    setItems(itemsRef.current.filter((it) => it._key !== key))
    // Jamais écrit (ni en cours d'écriture, la file passe avant) → rien à envoyer.
    void enqueue(() => (unsaved.current.has(key) ? null : { op: 'remove', key }), true)
  }

  const moveItem = (key: string, direction: -1 | 1) => {
    const list = [...itemsRef.current]
    const from = list.findIndex((it) => it._key === key)
    const to = from + direction
    if (from === -1 || to < 0 || to >= list.length) return
    ;[list[from], list[to]] = [list[to], list[from]]
    setItems(list)
    void enqueue(() => {
      if (unsaved.current.has(key) || removed.current.has(key)) return null
      const target = moveTarget(itemsRef.current, key, unsaved.current)
      return target ? { op: 'move', key, to: target } : null
    }, true)
  }

  const canAdd = !form.readOnly && (field.max === undefined || items.length < field.max)
  const canRemove = !form.readOnly && items.length > (field.min ?? 0)

  return (
    <fieldset className={styles.array}>
      <legend className={styles.arrayLegend}>
        {title}
        <span className={styles.arrayMeta}>
          {field.max !== undefined ? `${items.length} / ${field.max}` : `${items.length}`}
        </span>
      </legend>
      {items.map((item, index) => (
        <ArrayItemCard
          key={item._key as string}
          field={field}
          item={item}
          index={index}
          count={items.length}
          canRemove={canRemove}
          readOnly={form.readOnly}
          onChange={changeItem}
          onSave={saveItem}
          onRemove={removeItem}
          onMove={moveItem}
        />
      ))}
      <div className={styles.arrayFooter}>
        <Button
          variant="subtle"
          size="small"
          iconLeft="plus"
          disabled={!canAdd}
          onClick={() => {
            // L'élément neuf reste local tant que ses champs obligatoires sont vides (erreur affichée).
            const item = newArrayItem(itemsRef.current, undefined, field.itemType)
            unsaved.current.add(item._key as string)
            setItems([...itemsRef.current, item])
          }}
        >
          {`Add ${itemLabel.toLowerCase()}`}
        </Button>
        {field.max !== undefined && items.length >= field.max ? <span className={styles.arrayNote}>{`${field.max} at most`}</span> : null}
      </div>
      {localError || opError ? (
        <p className={styles.arrayError} role="alert">
          {localError ?? opError}
        </p>
      ) : null}
    </fieldset>
  )
}

/** Carte d'un élément de tableau à longueur variable : sous-champs locaux, enregistrement de l'élément (debounce). */
function ArrayItemCard({
  field,
  item,
  index,
  count,
  canRemove,
  readOnly,
  onChange,
  onSave,
  onRemove,
  onMove,
}: {
  field: FieldDef
  item: Obj
  index: number
  count: number
  canRemove: boolean
  readOnly: boolean
  onChange: (item: Obj) => void
  onSave: (item: Obj) => Promise<SaveResult>
  onRemove: (key: string) => void
  onMove: (key: string, direction: -1 | 1) => void
}) {
  const saver = useFieldSave(onSave, item)
  const itemLabel = field.itemLabel ?? 'Item'
  const name = `${itemLabel.toLowerCase()} ${index + 1}`
  const key = item._key as string
  return (
    <div className={styles.item} role="group" aria-label={`${itemLabel} ${index + 1}`}>
      <div className={styles.itemHeader}>
        <p className={styles.itemTitle}>{`${itemLabel} ${index + 1}`}</p>
        <IconButton icon="chevron-up" size="xsmall" label={`Move ${name} up`} disabled={readOnly || index === 0} onClick={() => onMove(key, -1)} />
        <IconButton
          icon="chevron-down"
          size="xsmall"
          label={`Move ${name} down`}
          disabled={readOnly || index === count - 1}
          onClick={() => onMove(key, 1)}
        />
        <IconButton icon="trash" size="xsmall" label={`Remove ${name}`} disabled={!canRemove} onClick={() => onRemove(key)} />
      </div>
      {(field.fields ?? []).map((sub) => (
        <LocalField
          key={sub.name}
          field={sub}
          value={item[sub.name]}
          disabled={readOnly}
          onChange={(value) => {
            const next = { ...item, [sub.name]: value ?? undefined }
            onChange(next)
            if (itemError(field, next)) saver.cancel()
            else saver.schedule(next)
          }}
        />
      ))}
      {saver.error ? (
        <p className={styles.arrayError} role="alert">
          {saver.error}
        </p>
      ) : null}
    </div>
  )
}

/** Sous-champ d'un élément de tableau à longueur variable : contrôle local, l'enregistrement est celui du tableau. */
function LocalField({ field, value, disabled, onChange }: { field: FieldDef; value: unknown; disabled: boolean; onChange: (value: unknown) => void }) {
  const [text, setText] = useState(textValue(value))
  const error = validateFieldValue(field, field.kind === 'select' ? (value ?? null) : normalizeText(text))
  if (field.kind === 'select') {
    return (
      <Select
        label={field.label}
        options={(field.options ?? []).map((o) => ({ value: o.value, label: o.label }))}
        value={typeof value === 'string' ? value : null}
        disabled={disabled}
        helper={field.help}
        error={value === undefined ? undefined : (error ?? undefined)}
        onValueChange={(next) => onChange(next)}
      />
    )
  }
  if (field.kind !== 'string' && field.kind !== 'text' && field.kind !== 'url') {
    return <Callout tone="neutral">{`${field.label} can't be edited here.`}</Callout>
  }
  const Control = field.kind === 'text' ? Textarea : Input
  return (
    <Control
      label={field.label}
      value={text}
      placeholder={field.placeholder}
      disabled={disabled}
      helper={helperText(field, text)}
      error={text === '' && value === undefined ? undefined : (error ?? undefined)}
      onChange={(e: { target: { value: string } }) => {
        setText(e.target.value)
        onChange(normalizeText(e.target.value))
      }}
    />
  )
}

// ─── Aiguillage ────────────────────────────────────────────────────────────

export function FieldControl(props: FieldProps) {
  const { field } = props
  switch (field.kind) {
    case 'string':
    case 'text':
    case 'url':
    case 'slug':
    case 'number':
    case 'date':
      return <TextField {...props} />
    case 'boolean':
      return <BooleanField {...props} />
    case 'select':
      return <SelectField {...props} />
    case 'reference':
      return <ReferenceField {...props} />
    case 'image':
      return <ImageField {...props} />
    case 'cta':
      return <CtaField {...props} />
    case 'object':
      return <ObjectField {...props} />
    case 'array':
      return isFixedLength(field) ? <FixedArrayField {...props} /> : <VariableArrayField {...props} />
    case 'portableText':
      return (
        <Callout tone="neutral">{`${props.label ?? field.label}: rich text can't be edited in this form yet. Ask Kuartz.`}</Callout>
      )
  }
}

