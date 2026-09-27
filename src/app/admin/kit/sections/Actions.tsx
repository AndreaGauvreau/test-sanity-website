'use client'

import { useState } from 'react'
import { Button, Chip, IconButton, type ButtonVariant } from '@/admin/ui'
import { Cell, Family, Item, styles } from './ui'

const VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'subtle', 'ghost', 'danger']

export function Actions() {
  const [loading, setLoading] = useState(false)
  const [pressed, setPressed] = useState(false)
  return (
    <Family id="actions" title="Actions">
      <Item
        id="button"
        title="Button"
        figma="111:286"
        note="5 variants × medium / small. Hover, pressed (scale 0.98) and focus-visible are live: hover, click or Tab through the grid."
      >
        <div className={styles.matrix} style={{ gridTemplateColumns: 'repeat(6, auto)' }}>
          {VARIANTS.map((variant) => (
            <div key={variant} style={{ display: 'contents' }}>
              <Cell label={`${variant} · medium`}>
                <Button variant={variant}>Button</Button>
              </Cell>
              <Cell label="small">
                <Button variant={variant} size="small">
                  Button
                </Button>
              </Cell>
              <Cell label="icon left">
                <Button variant={variant} iconLeft="plus">
                  Add item
                </Button>
              </Cell>
              <Cell label="icon right · small">
                <Button variant={variant} size="small" iconRight="external">
                  View site
                </Button>
              </Cell>
              <Cell label="disabled">
                <Button variant={variant} disabled>
                  Button
                </Button>
              </Cell>
              <Cell label="loading · small">
                <Button variant={variant} size="small" loading>
                  Saving…
                </Button>
              </Cell>
            </div>
          ))}
        </div>
        <div className={styles.row}>
          <Button
            loading={loading}
            onClick={() => {
              setLoading(true)
              setTimeout(() => setLoading(false), 1500)
            }}
          >
            {loading ? 'Saving…' : 'Click to load'}
          </Button>
        </div>
      </Item>

      <Item id="icon-button" title="Icon button" figma="321:393" note="ghost / secondary / primary × small (28) / xsmall (20). Every icon button has a tooltip with its label (hover or focus).">
        <div className={styles.matrix} style={{ gridTemplateColumns: 'repeat(6, auto)' }}>
          {(['ghost', 'secondary', 'primary'] as const).map((variant) =>
            (['small', 'xsmall'] as const).map((size) => (
              <div key={`${variant}-${size}`} style={{ display: 'contents' }}>
                <Cell label={`${variant} · ${size}`}>
                  <IconButton icon="plus" label="Add" variant={variant} size={size} />
                </Cell>
                <Cell label="pressed">
                  <IconButton icon="filter" label="Filter" variant={variant} size={size} pressed />
                </Cell>
                <Cell label="disabled">
                  <IconButton icon="trash" label="Delete" variant={variant} size={size} disabled />
                </Cell>
                <Cell label="shortcut">
                  <IconButton icon="search" label="Search" shortcut="/" variant={variant} size={size} />
                </Cell>
                <Cell label="loading">
                  <IconButton icon="send" label="Send" variant={variant} size={size} loading />
                </Cell>
                <Cell label="toggle">
                  <IconButton icon="eye" label="Preview" variant={variant} size={size} pressed={pressed} onClick={() => setPressed((p) => !p)} />
                </Cell>
              </div>
            )),
          )}
        </div>
      </Item>

      <Item id="chip" title="Chip" figma="321:421" note="Toggle pill (aria-pressed). Several chips can be on at once.">
        <div className={styles.row}>
          <Cell label="off">
            <Chip icon="style">Style</Chip>
          </Cell>
          <Cell label="on">
            <Chip icon="style" defaultPressed>
              Style
            </Chip>
          </Cell>
          <Cell label="disabled">
            <Chip icon="style" disabled>
              Style
            </Chip>
          </Cell>
          <Cell label="no icon">
            <Chip>Text</Chip>
          </Cell>
          <Cell label="interactive">
            <span className={styles.row} style={{ gap: 8 }}>
              <Chip icon="style">Style</Chip>
              <Chip icon="text" defaultPressed>
                Text
              </Chip>
            </span>
          </Cell>
        </div>
      </Item>
    </Family>
  )
}
