'use client'

import {
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from 'react'
import { Field, type FieldLayout } from '../Field'
import type { IconName } from '../icons'
import { IconButton } from '../IconButton'
import { firstEnabled, nextEnabled, OptionList, type ListOption } from '../OptionList'
import { Popover } from '../Popover'
import { cx } from '../utils/cx'
import { useControllableState } from '../utils/useControllableState'
import chipStyles from '../VariableChip/VariableChip.module.css'
import { parseVariables } from './serialize'
import styles from './VariableInput.module.css'

export type VariableField = {
  /** Nom du champ (« title » → {{title}}). */
  name: string
  /** Libellé dans la liste d'insertion (« Title »). */
  label?: string
  icon?: IconName
}

export type VariableInputProps = {
  label?: ReactNode
  hideLabel?: boolean
  helper?: ReactNode
  error?: ReactNode | boolean
  layout?: FieldLayout
  /** Valeur sérialisée : texte + {{champ}}. */
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  /** Champs insérables (ceux de la collection). Un {{champ}} hors de cette liste s'affiche en rouge. */
  variables: readonly VariableField[]
  placeholder?: string
  disabled?: boolean
  /** Titre de la liste d'insertion (défaut « Fields »). */
  listLabel?: string
  /** Nom de champ de formulaire : un <input type="hidden"> porte la valeur sérialisée. */
  name?: string
  id?: string
  className?: string
  ref?: Ref<HTMLDivElement>
}

const ZWSP = '​'

/** Lit le contenu éditable et le remet en texte {{…}}. */
function serializeDom(root: HTMLElement): string {
  let out = ''
  root.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) out += (node.textContent ?? '').replaceAll(ZWSP, '')
    else if (node instanceof HTMLElement) {
      if (node.dataset.variable) out += `{{${node.dataset.variable}}}`
      else if (node.tagName !== 'BR') out += serializeDom(node)
    }
  })
  return out.replace(/\n/g, ' ')
}

/** Position du curseur en caractères de la valeur sérialisée ({{nom}} compte pour sa longueur). */
function getCaretOffset(root: HTMLElement): number | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || !root.contains(sel.anchorNode)) return null
  const anchor = sel.anchorNode
  let offset = 0
  for (const node of Array.from(root.childNodes)) {
    if (node === anchor) {
      const text = (node.textContent ?? '').slice(0, sel.anchorOffset)
      return offset + text.replaceAll(ZWSP, '').length
    }
    if (node.nodeType === Node.TEXT_NODE) offset += (node.textContent ?? '').replaceAll(ZWSP, '').length
    else if (node instanceof HTMLElement && node.dataset.variable) offset += node.dataset.variable.length + 4
  }
  // Curseur posé sur la racine elle-même (entre deux nœuds).
  if (anchor === root) {
    let o = 0
    Array.from(root.childNodes)
      .slice(0, sel.anchorOffset)
      .forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) o += (node.textContent ?? '').replaceAll(ZWSP, '').length
        else if (node instanceof HTMLElement && node.dataset.variable) o += node.dataset.variable.length + 4
      })
    return o
  }
  return offset
}

function setCaretOffset(root: HTMLElement, target: number) {
  const sel = window.getSelection()
  if (!sel) return
  const range = document.createRange()
  let offset = 0
  for (const node of Array.from(root.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? ''
      const len = text.replaceAll(ZWSP, '').length
      if (target <= offset + len) {
        range.setStart(node, Math.min(text.length, target - offset + (text.startsWith(ZWSP) ? 1 : 0)))
        range.collapse(true)
        sel.removeAllRanges()
        sel.addRange(range)
        return
      }
      offset += len
    } else if (node instanceof HTMLElement && node.dataset.variable) {
      offset += node.dataset.variable.length + 4
      if (target <= offset) {
        range.setStartAfter(node)
        range.collapse(true)
        sel.removeAllRanges()
        sel.addRange(range)
        return
      }
    }
  }
  range.selectNodeContents(root)
  range.collapse(false)
  sel.removeAllRanges()
  sel.addRange(range)
}

function makeChip(name: string, known: boolean, label: string): HTMLSpanElement {
  const chip = document.createElement('span')
  chip.setAttribute('contenteditable', 'false')
  chip.dataset.variable = name
  chip.className = cx(chipStyles.chip, !known && chipStyles.invalid, styles.chip)
  chip.textContent = label
  if (!known) chip.title = `Unknown field: ${name}`
  return chip
}

/**
 * Champ texte + champs CMS (Figma « Variable input » 445:1918) : texte libre et puces Variable chip,
 * bouton d'insertion (icône database) à droite, aide dessous. Taper « {{ » ouvre l'autocomplétion.
 * Valeur sérialisée en texte avec {{champ}} (contrôlée ou non). Une seule ligne.
 */
export function VariableInput({
  label,
  hideLabel,
  helper,
  error,
  layout,
  value: valueProp,
  defaultValue = '',
  onValueChange,
  variables,
  placeholder,
  disabled,
  listLabel = 'Fields',
  name,
  id: idProp,
  className,
  ref,
}: VariableInputProps) {
  const autoId = useId()
  const id = idProp ?? autoId
  const labelId = `${id}-label`
  const helperId = `${id}-helper`
  const listId = `${id}-list`
  const editorRef = useRef<HTMLDivElement | null>(null)
  const boxRef = useRef<HTMLDivElement | null>(null)
  const insertRef = useRef<HTMLButtonElement | null>(null)
  const lastValue = useRef<string | null>(null)
  const savedRange = useRef<Range | null>(null)
  const [value, setValue] = useControllableState(valueProp, defaultValue, onValueChange)
  const [mode, setMode] = useState<null | 'insert' | 'complete'>(null)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)

  const known = useMemo(() => new Map(variables.map((v) => [v.name, v])), [variables])
  const options: ListOption[] = useMemo(() => {
    const q = query.toLowerCase()
    return variables
      .filter((v) => !q || v.name.toLowerCase().includes(q) || (v.label ?? '').toLowerCase().includes(q))
      .map((v) => ({ value: v.name, label: v.label ?? v.name, icon: v.icon, meta: `{{${v.name}}}` }))
  }, [variables, query])

  const invalid = error != null && error !== false && error !== ''
  const hasHelper = (invalid && error !== true) || helper != null
  const optionId = useCallback((i: number) => `${id}-opt-${i}`, [id])

  // Reconstruit le DOM éditable quand la valeur vient de l'extérieur (ou au premier rendu).
  const render = useCallback(
    (text: string) => {
      const root = editorRef.current
      if (!root) return
      root.replaceChildren()
      const segments = parseVariables(text)
      segments.forEach((s, i) => {
        if (s.kind === 'text') root.append(document.createTextNode(s.text))
        else {
          const field = known.get(s.name)
          root.append(makeChip(s.name, !!field, s.name))
          if (i === segments.length - 1) root.append(document.createTextNode(ZWSP))
        }
      })
    },
    [known],
  )

  useLayoutEffect(() => {
    if (value === lastValue.current) return
    lastValue.current = value
    render(value)
  }, [value, render])

  // Les puces se recolorent si la liste des champs change.
  useLayoutEffect(() => {
    lastValue.current = null
    render(value)
    lastValue.current = value
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [known])

  const commit = (next: string) => {
    lastValue.current = next
    setValue(next)
  }

  const placeCaretAfter = (node: Node) => {
    const sel = window.getSelection()
    if (!sel) return
    let target = node.nextSibling
    if (!target || target.nodeType !== Node.TEXT_NODE) {
      target = document.createTextNode(ZWSP)
      node.parentNode?.insertBefore(target, node.nextSibling)
    }
    const range = document.createRange()
    const offset = target.textContent?.startsWith(ZWSP) ? 1 : 0
    range.setStart(target, offset)
    range.collapse(true)
    sel.removeAllRanges()
    sel.addRange(range)
  }

  /** Transforme en puces les {{champ}} tapés à la main, puis publie la valeur. */
  const syncFromDom = () => {
    const root = editorRef.current
    if (!root) return
    const text = serializeDom(root)
    const typed = Array.from(root.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && /\{\{\s*[A-Za-z_][A-Za-z0-9_]*\s*\}\}/.test(n.textContent ?? ''))
    if (typed) {
      // Position du curseur en caractères sérialisés, retrouvée après reconstruction (une puce = sa longueur {{nom}}).
      const caret = getCaretOffset(root)
      render(text)
      if (caret != null) setCaretOffset(root, caret)
    }
    if (text === '' && root.childNodes.length) root.replaceChildren()
    commit(text)
    detectCompletion()
  }

  /** « {{ » suivi d'un début de nom juste avant le curseur → autocomplétion. */
  const detectCompletion = () => {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return closeList()
    const node = sel.anchorNode
    if (!node || node.nodeType !== Node.TEXT_NODE || !editorRef.current?.contains(node)) return closeList()
    const before = (node.textContent ?? '').slice(0, sel.anchorOffset).replaceAll(ZWSP, '')
    const m = before.match(/\{\{\s*([A-Za-z0-9_]*)$/)
    if (!m) {
      if (mode === 'complete') closeList()
      return
    }
    setQuery(m[1])
    setActive(0)
    setMode('complete')
  }

  const closeList = () => {
    setMode(null)
    setQuery('')
  }

  const saveRange = () => {
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)) savedRange.current = sel.getRangeAt(0).cloneRange()
  }

  const insertVariable = (fieldName: string) => {
    const root = editorRef.current
    if (!root) return
    root.focus({ preventScroll: true })
    const sel = window.getSelection()
    let range: Range | null = null
    if (mode === 'complete' && sel && sel.rangeCount > 0) {
      // Supprime « {{requête » avant le curseur.
      range = sel.getRangeAt(0)
      const node = range.startContainer
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent ?? ''
        const upto = text.slice(0, range.startOffset)
        const start = upto.lastIndexOf('{{')
        if (start >= 0) {
          range.setStart(node, start)
          range.deleteContents()
        }
      }
    } else if (savedRange.current && root.contains(savedRange.current.startContainer)) {
      range = savedRange.current
    }
    if (!range) {
      range = document.createRange()
      range.selectNodeContents(root)
      range.collapse(false)
    }
    const chip = makeChip(fieldName, known.has(fieldName), fieldName)
    range.deleteContents()
    range.insertNode(chip)
    placeCaretAfter(chip)
    closeList()
    commit(serializeDom(root))
    saveRange()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (mode === 'complete' && options.length) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActive((i) => nextEnabled(options, i, 1))
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActive((i) => nextEnabled(options, i, -1))
        return
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault()
        const option = options[active]
        if (option) insertVariable(option.value)
        return
      }
    }
    if (event.key === 'Enter') event.preventDefault()
    // Début / fin : gérés ici, les navigateurs butent sur une puce non éditable en bout de ligne.
    if ((event.key === 'End' || event.key === 'Home') && !event.shiftKey && editorRef.current) {
      event.preventDefault()
      setCaretOffset(editorRef.current, event.key === 'End' ? serializeDom(editorRef.current).length : 0)
    }
  }

  const onPaste = (event: ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault()
    const text = event.clipboardData.getData('text/plain').replace(/\s*\n\s*/g, ' ')
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
    range.deleteContents()
    const node = document.createTextNode(text)
    range.insertNode(node)
    range.setStartAfter(node)
    range.collapse(true)
    sel.removeAllRanges()
    sel.addRange(range)
    syncFromDom()
  }

  const onListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        setActive((i) => nextEnabled(options, i, 1))
        break
      case 'ArrowUp':
        event.preventDefault()
        setActive((i) => nextEnabled(options, i, -1))
        break
      case 'Home':
        event.preventDefault()
        setActive(firstEnabled(options))
        break
      case 'End':
        event.preventDefault()
        setActive(firstEnabled(options, true))
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        if (options[active]) insertVariable(options[active].value)
        break
      case 'Tab':
        closeList()
        break
    }
  }

  const listOpen = mode !== null && options.length > 0

  // Menu ouvert par le bouton : la liste prend le focus (aria-activedescendant sur la liste).
  useLayoutEffect(() => {
    if (mode !== 'insert') return
    const frame = requestAnimationFrame(() => document.getElementById(listId)?.focus({ preventScroll: true }))
    return () => cancelAnimationFrame(frame)
  }, [mode, listId])

  return (
    <Field
      label={label}
      hideLabel={hideLabel}
      labelId={labelId}
      helper={helper}
      error={error}
      helperId={helperId}
      layout={layout}
      className={cx(styles.field, className)}
      helperClassName={styles.helper}
    >
      <div
        ref={boxRef}
        className={cx(styles.box, invalid && styles.invalid, disabled && styles.disabled)}
        onPointerDown={(event) => {
          if (event.target === event.currentTarget && !disabled) {
            event.preventDefault()
            const root = editorRef.current
            if (!root) return
            root.focus()
            const range = document.createRange()
            range.selectNodeContents(root)
            range.collapse(false)
            const sel = window.getSelection()
            sel?.removeAllRanges()
            sel?.addRange(range)
          }
        }}
      >
        <div
          ref={(node) => {
            editorRef.current = node
            if (typeof ref === 'function') ref(node)
            else if (ref) (ref as { current: HTMLDivElement | null }).current = node
          }}
          id={id}
          role="textbox"
          aria-multiline="false"
          aria-labelledby={label != null ? labelId : undefined}
          aria-describedby={hasHelper ? helperId : undefined}
          aria-invalid={invalid || undefined}
          aria-disabled={disabled || undefined}
          aria-autocomplete="list"
          aria-expanded={mode === 'complete' && listOpen}
          aria-controls={mode === 'complete' && listOpen ? listId : undefined}
          aria-activedescendant={mode === 'complete' && listOpen ? optionId(active) : undefined}
          contentEditable={!disabled}
          suppressContentEditableWarning
          spellCheck={false}
          data-placeholder={placeholder}
          className={styles.content}
          onInput={syncFromDom}
          onKeyDown={onKeyDown}
          onKeyUp={(event) => {
            saveRange()
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') detectCompletion()
          }}
          onPointerDown={(event) => {
            // Un clic sur une puce (non éditable) place le curseur juste après elle.
            const chip = (event.target as HTMLElement).closest?.('[data-variable]')
            if (!chip || disabled) return
            event.preventDefault()
            editorRef.current?.focus({ preventScroll: true })
            placeCaretAfter(chip)
            saveRange()
          }}
          onPointerUp={saveRange}
          onBlur={saveRange}
          onPaste={onPaste}
          onDrop={(event) => event.preventDefault()}
        />
        <IconButton
          ref={insertRef}
          icon="database"
          label="Insert field"
          size="xsmall"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={mode === 'insert'}
          aria-controls={mode === 'insert' ? listId : undefined}
          onPointerDown={saveRange}
          onClick={() => {
            if (mode === 'insert') return closeList()
            setQuery('')
            setActive(0)
            setMode('insert')
          }}
        />
      </div>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <Popover
        open={listOpen}
        onClose={closeList}
        anchorRef={mode === 'insert' ? insertRef : boxRef}
        placement={mode === 'insert' ? 'bottom-end' : 'bottom-start'}
        initialFocus="none"
        returnFocus={mode === 'insert'}
        instant={mode === 'complete'}
        closeOnFocusOut
      >
        <div className={styles.listTitle} aria-hidden="true">
          {listLabel}
        </div>
        <OptionList
          id={listId}
          items={options}
          activeIndex={active}
          onActiveIndexChange={setActive}
          onSelect={insertVariable}
          optionId={optionId}
          aria-label={listLabel}
          focusable={mode === 'insert'}
          onKeyDown={mode === 'insert' ? onListKeyDown : undefined}
          className={styles.list}
        />
      </Popover>
    </Field>
  )
}
