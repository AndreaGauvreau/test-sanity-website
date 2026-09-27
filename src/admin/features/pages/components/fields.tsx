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
  type Obj,
} from '../lib/form'
import { isHiddenField } from '../lib/manifest'
import { useForm } from './FormContext'
import { useFieldSave } from './useFieldSave'
import styles from './fields.module.css'

/**
 * Champs du formulaire généré depuis le manifeste (C1). Un composant par genre de FieldDef ; chacun valide tout de
 * suite dans le navigateur (validateFieldValue, la même fonction que le serveur) et s'enregistre seul dans le
 * brouillon (useFieldSave → server action). Les tableaux à longueur variable s'enregistrent en entier (ajout,
 * suppression), ceux à longueur fixe champ par champ.
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

/**
 * Longueur variable : ajout et suppression dans les bornes min / max. Le tableau entier est enregistré (FieldDef du
 * tableau : bornes, clés, sous-champs) ; un élément incomplet n'est pas envoyé tant qu'il est invalide.
 */
function VariableArrayField({ field, path, value, label }: FieldProps) {
  const form = useForm()
  const [items, setItems] = useState<Obj[]>(() => arrayItems(value))
  const [localError, setLocalError] = useState<string | null>(null)
  const saver = useFieldSave((next: Obj[]) => form.saveField(path, next), items)
  const itemLabel = field.itemLabel ?? 'Item'
  const title = label ?? field.label

  const commit = (next: Obj[], immediate = false) => {
    setItems(next)
    const message = validateFieldValue(field, next.length ? next : null)
    setLocalError(message)
    if (message) {
      saver.cancel()
      return
    }
    saver.schedule(next)
    if (immediate) void saver.flush()
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
        <div key={item._key as string} className={styles.item} role="group" aria-label={`${itemLabel} ${index + 1}`}>
          <div className={styles.itemHeader}>
            <p className={styles.itemTitle}>{`${itemLabel} ${index + 1}`}</p>
            <IconButton
              icon="trash"
              size="xsmall"
              label={`Remove ${itemLabel.toLowerCase()} ${index + 1}`}
              disabled={!canRemove}
              onClick={() => commit(items.filter((_, i) => i !== index), true)}
            />
          </div>
          {(field.fields ?? []).map((sub) => (
            <LocalField
              key={sub.name}
              field={sub}
              value={item[sub.name]}
              disabled={form.readOnly}
              onChange={(next) => commit(items.map((it, i) => (i === index ? { ...it, [sub.name]: next ?? undefined } : it)))}
            />
          ))}
        </div>
      ))}
      <div className={styles.arrayFooter}>
        <Button
          variant="subtle"
          size="small"
          iconLeft="plus"
          disabled={!canAdd}
          onClick={() => {
            // L'élément neuf reste local tant que ses champs obligatoires sont vides (erreur affichée).
            const next = [...items, newArrayItem(items)]
            setItems(next)
            setLocalError(validateFieldValue(field, next))
          }}
        >
          {`Add ${itemLabel.toLowerCase()}`}
        </Button>
        {field.max !== undefined && items.length >= field.max ? <span className={styles.arrayNote}>{`${field.max} at most`}</span> : null}
      </div>
      {localError || saver.error ? (
        <p className={styles.arrayError} role="alert">
          {localError ?? saver.error}
        </p>
      ) : null}
    </fieldset>
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

