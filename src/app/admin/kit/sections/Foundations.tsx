import { Icon, ICON_NAMES } from '@/admin/ui'
import { Family, Item, styles } from './ui'

const SEMANTIC = [
  'bg-app', 'bg-primary', 'bg-elevated', 'bg-input', 'bg-input-hover', 'bg-subtle', 'bg-overlay', 'bg-strong', 'bg-inverse', 'bg-scrim',
  'bg-tint-neutral', 'bg-tint-info', 'bg-tint-success', 'bg-tint-warning', 'bg-tint-danger', 'bg-tint-variable', 'bg-ghost-hover', 'bg-ghost-pressed',
  'text-primary', 'text-secondary', 'text-tertiary', 'text-muted', 'text-disabled', 'text-link', 'text-on-accent', 'text-inverse', 'text-variable',
  'border-default', 'border-subtle', 'border-strong', 'border-focus', 'border-edge',
  'interactive-primary', 'interactive-primary-hover', 'interactive-primary-pressed', 'interactive-danger', 'interactive-danger-hover',
  'interactive-danger-pressed', 'interactive-success', 'interactive-warning',
  'icon-default', 'icon-muted', 'icon-active', 'icon-error', 'icon-success', 'icon-warning', 'icon-primary',
  'code-text', 'code-tag', 'code-brace', 'code-value', 'brand-claude',
]

const TEXT_STYLES = [
  ['heading-1', 'Heading 1 · Inter Bold 32'],
  ['heading-2', 'Heading 2 · Inter Bold 24'],
  ['heading-3', 'Heading 3 · Inter Semi Bold 20'],
  ['heading-4', 'Heading 4 · Inter Semi Bold 16'],
  ['body-large', 'Body Large · Inter Medium 14'],
  ['body', 'Body · Inter Medium 13'],
  ['body-small', 'Body Small · Inter Medium 12'],
  ['caption', 'Caption · Inter Medium 10'],
  ['label-large', 'Label Large · Inter Semi Bold 14'],
  ['label', 'Label · Inter Semi Bold 12'],
  ['label-small', 'Label Small · Inter Semi Bold 10 · 2 %'],
  ['code', 'Code · Geist Mono 12 / 160 %'],
] as const

const ICON_MODES = ['default', 'active', 'on-accent', 'disabled', 'danger', 'primary', 'success', 'warning', 'inverse', 'claude'] as const

export function Foundations() {
  return (
    <Family id="foundations" title="Foundations">
      <Item id="colors" title="Colors" figma="134:21" note="Semantic tokens (Dark). Components never use primitives.">
        <div className={styles.swatches}>
          {SEMANTIC.map((name) => (
            <div key={name} className={styles.swatch}>
              <span className={styles.swatchColor} style={{ background: `var(--k-${name})` }} />
              <span className={styles.swatchName}>--k-{name}</span>
            </div>
          ))}
        </div>
      </Item>
      <Item id="typography" title="Typography" figma="134:81">
        <div className={styles.stack}>
          {TEXT_STYLES.map(([key, label]) => (
            <div key={key} className={styles.typeRow}>
              <span className={styles.caption}>--k-text-{key}</span>
              <span style={{ font: `var(--k-text-${key})`, letterSpacing: `var(--k-text-${key}-tracking)` }}>{label}</span>
            </div>
          ))}
        </div>
      </Item>
      <Item id="elevation" title="Elevation">
        <div className={styles.row}>
          <div className={styles.elevation} style={{ boxShadow: 'var(--k-elevation-popover)' }}>
            Elevation/Popover
          </div>
          <div className={styles.elevation} style={{ boxShadow: 'var(--k-elevation-modal)' }}>
            Elevation/Modal
          </div>
        </div>
      </Item>
      <Item id="icons" title={`Icons (${ICON_NAMES.length})`} figma="307:73" note="18 px and 12 px path sets, duotone in currentColor (background tone at 30 %).">
        <div className={styles.icons}>
          {ICON_NAMES.map((name) => (
            <div key={name} className={styles.iconCell} title={name}>
              <span className={styles.iconPair}>
                <Icon name={name} size={18} />
                <Icon name={name} size={12} />
              </span>
              <span className={styles.caption}>{name}</span>
            </div>
          ))}
        </div>
      </Item>
      <Item id="icon-color" title="Icon color modes" note='data-icon-color="…" on the parent sets --k-icon-current.'>
        <div className={styles.row}>
          {ICON_MODES.map((mode) => (
            <span
              key={mode}
              data-icon-color={mode}
              className={styles.iconCell}
              style={mode === 'inverse' || mode === 'on-accent' ? { background: mode === 'inverse' ? 'var(--k-bg-inverse)' : 'var(--k-interactive-primary)' } : undefined}
            >
              <Icon name={mode === 'claude' ? 'claude' : 'ai'} />
              <span className={styles.caption} style={mode === 'inverse' ? { color: 'var(--k-text-inverse)' } : mode === 'on-accent' ? { color: 'var(--k-text-on-accent)' } : undefined}>
                {mode}
              </span>
            </span>
          ))}
        </div>
      </Item>
    </Family>
  )
}
