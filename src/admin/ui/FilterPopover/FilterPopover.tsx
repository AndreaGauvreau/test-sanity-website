'use client'

import {
  cloneElement,
  isValidElement,
  useId,
  useRef,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
  type RefObject,
} from 'react'
import { Button } from '../Button'
import { IconButton } from '../IconButton'
import type { ListItems, ListOption } from '../OptionList'
import { Popover, type Placement } from '../Popover'
import { Select } from '../Select'
import { cx } from '../utils/cx'
import { mergeRefs } from '../utils/refs'
import { useControllableState } from '../utils/useControllableState'
import styles from './FilterPopover.module.css'

export type FilterField = {
  value: string
  label: string
  /** Opérateurs (défaut : is / is not). */
  operators?: ListItems
  /** Valeurs possibles de ce champ (statuts, catégories, auteurs…). */
  options: ListItems
}

export type FilterCondition = {
  id: string
  field: string
  operator: string
  value: string | null
}

export const DEFAULT_FILTER_OPERATORS: ListOption[] = [
  { value: 'is', label: 'is' },
  { value: 'is-not', label: 'is not' },
]

let conditionCounter = 0
const newId = () => `filter-${Date.now().toString(36)}-${(conditionCounter += 1)}`

type TriggerProps = {
  ref?: Ref<HTMLElement>
  'aria-haspopup'?: 'dialog'
  'aria-expanded'?: boolean
  'aria-controls'?: string
  onClick?: (event: MouseEvent<HTMLElement>) => void
  onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void
}

export type FilterPopoverProps = {
  fields: readonly FilterField[]
  conditions?: readonly FilterCondition[]
  defaultConditions?: readonly FilterCondition[]
  onConditionsChange?: (conditions: FilterCondition[]) => void
  /** Déclencheur (IconButton « Filter ») : ouvre / ferme au clic. Sinon, `open` + `anchorRef`. */
  trigger?: ReactElement<TriggerProps>
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  anchorRef?: RefObject<HTMLElement | null>
  placement?: Placement
  title?: ReactNode
  className?: string
}

/**
 * Fenêtre de filtres (Figma « Filter popover » 336:1030) : 420 px, pad 12, gap 10 ; en-tête « Filters » + Clear ;
 * une ligne par condition (Select champ 120, opérateur 80, valeur 150, ✕) ; « + Add filter ». Popover non
 * modal (role="dialog") : échelle depuis le déclencheur, Échap / clic extérieur / focus sorti le referment
 * (une liste de Select ouverte dedans passe devant : Échap ferme d'abord la liste).
 */
export function FilterPopover({
  fields,
  conditions: conditionsProp,
  defaultConditions = [],
  onConditionsChange,
  trigger,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  anchorRef: anchorRefProp,
  placement = 'bottom-end',
  title = 'Filters',
  className,
}: FilterPopoverProps) {
  const id = useId()
  const titleId = `${id}-title`
  const ownAnchor = useRef<HTMLElement | null>(null)
  const anchorRef = anchorRefProp ?? ownAnchor
  const [open, setOpen] = useControllableState(openProp, defaultOpen, onOpenChange)
  const [conditions, setConditions] = useControllableState<readonly FilterCondition[]>(conditionsProp, defaultConditions, (next) =>
    onConditionsChange?.([...next]),
  )

  const fieldOptions: ListOption[] = fields.map((f) => ({ value: f.value, label: f.label }))
  const fieldOf = (value: string) => fields.find((f) => f.value === value)

  const update = (cid: string, patch: Partial<FilterCondition>) =>
    setConditions(conditions.map((c) => (c.id === cid ? { ...c, ...patch } : c)))

  const add = () => {
    const field = fields[0]
    if (!field) return
    const operators = field.operators ?? DEFAULT_FILTER_OPERATORS
    const firstOperator = operators.find((o): o is ListOption => 'value' in o)?.value ?? 'is'
    setConditions([...conditions, { id: newId(), field: field.value, operator: firstOperator, value: null }])
  }

  let triggerNode: ReactNode = null
  if (trigger && isValidElement(trigger)) {
    const tp = trigger.props
    triggerNode = cloneElement(trigger, {
      ref: mergeRefs(ownAnchor, tp.ref),
      'aria-haspopup': 'dialog',
      'aria-expanded': open,
      'aria-controls': open ? id : undefined,
      onClick: (event: MouseEvent<HTMLElement>) => {
        tp.onClick?.(event)
        if (!event.defaultPrevented) setOpen(!open)
      },
    })
  }

  return (
    <>
      {triggerNode}
      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={anchorRef}
        placement={placement}
        id={id}
        role="dialog"
        aria-labelledby={titleId}
        initialFocus="panel"
        closeOnFocusOut
        className={cx(styles.panel, className)}
      >
        <div className={styles.header}>
          <span id={titleId} className={styles.title}>
            {title}
          </span>
          <Button variant="ghost" size="small" onClick={() => setConditions([])} disabled={conditions.length === 0}>
            Clear
          </Button>
        </div>
        {conditions.length === 0 ? <p className={styles.empty}>No filters applied.</p> : null}
        {conditions.map((condition, index) => {
          const field = fieldOf(condition.field)
          const n = index + 1
          return (
            <div key={condition.id} role="group" aria-label={`Filter ${n}`} className={styles.condition}>
              <Select
                label={`Filter ${n} field`}
                hideLabel
                options={fieldOptions}
                value={condition.field}
                onValueChange={(value) => update(condition.id, { field: value, value: null })}
                className={styles.field}
              />
              <Select
                label={`Filter ${n} operator`}
                hideLabel
                options={field?.operators ?? DEFAULT_FILTER_OPERATORS}
                value={condition.operator}
                onValueChange={(value) => update(condition.id, { operator: value })}
                className={styles.operator}
              />
              <Select
                label={`Filter ${n} value`}
                hideLabel
                options={field?.options ?? []}
                value={condition.value}
                placeholder="Select…"
                onValueChange={(value) => update(condition.id, { value })}
                className={styles.value}
              />
              <IconButton
                icon="close"
                label={`Remove filter ${n}`}
                tooltip={false}
                onClick={() => setConditions(conditions.filter((c) => c.id !== condition.id))}
              />
            </div>
          )
        })}
        <div>
          <Button variant="ghost" size="small" iconLeft="plus" onClick={add} disabled={fields.length === 0}>
            Add filter
          </Button>
        </div>
      </Popover>
    </>
  )
}
