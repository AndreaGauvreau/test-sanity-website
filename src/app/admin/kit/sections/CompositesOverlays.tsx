'use client'

import { useState } from 'react'
import {
  AnimatePresence,
  Button,
  Callout,
  Drawer,
  FilterPopover,
  IconButton,
  Input,
  Menu,
  MenuItem,
  MenuSeparator,
  Modal,
  ModelUsage,
  Scrim,
  Select,
  SelectionBar,
  Tag,
  Textarea,
  UsageTooltip,
  type FilterCondition,
  type FilterField,
} from '@/admin/ui'
import { Cell, Family, Item, SAMPLE_OG, styles } from './ui'

const FIELDS: FilterField[] = [
  { value: 'status', label: 'Status', options: [{ value: 'live', label: 'Live' }, { value: 'draft', label: 'Draft' }, { value: 'changed', label: 'Changed' }] },
  { value: 'category', label: 'Category', options: [{ value: 'guides', label: 'Guides' }, { value: 'news', label: 'News' }, { value: 'case-study', label: 'Case study' }] },
  { value: 'author', label: 'Author', options: [{ value: 'marie', label: 'Marie Laurent' }, { value: 'paul', label: 'Paul Girard' }] },
]

export function CompositesOverlays() {
  const [modal, setModal] = useState<null | 'default' | 'destructive'>(null)
  const [drawer, setDrawer] = useState(false)
  const [filters, setFilters] = useState<FilterCondition[]>([{ id: 'f1', field: 'status', operator: 'is', value: 'live' }])
  const [selected, setSelected] = useState(3)
  const [deletable, setDeletable] = useState(1)

  return (
    <Family id="overlays" title="Overlays">
      <Item id="scrim" title="Scrim" figma="336:825">
        <div style={{ position: 'relative', width: 480, height: 160, borderRadius: 8, overflow: 'hidden', background: 'var(--k-bg-primary)' }}>
          <p className={styles.caption} style={{ padding: 16 }}>
            Content behind the scrim
          </p>
          <Scrim position="absolute" />
        </div>
      </Item>

      <Item id="modal" title="Modal" figma="336:820" note="dialog: focus trap, Esc, scrim click, focus returns to the trigger. Scale 0.96 → 1, 200 ms ease-out.">
        <div className={styles.row}>
          <Button variant="secondary" onClick={() => setModal('default')}>
            Open modal
          </Button>
          <Button variant="danger" onClick={() => setModal('destructive')}>
            Open destructive modal
          </Button>
        </div>
        <Modal
          open={modal === 'default'}
          onClose={() => setModal(null)}
          title="Edit script"
          description="Scripts run on the published site. Place <script> tags at the end of <body> for faster loading."
          onConfirm={() => setModal(null)}
        >
          <Input label="Name" defaultValue="Google Tag Manager" />
          <Select
            label="Placement"
            defaultValue="body-end"
            options={[
              { value: 'head-end', label: 'End of <head>' },
              { value: 'body-end', label: 'End of <body>' },
            ]}
          />
        </Modal>
        <Modal
          open={modal === 'destructive'}
          onClose={() => setModal(null)}
          tone="destructive"
          title="Delete this post?"
          description="“Carrier portals: a checklist” will be removed from the site at the next publish."
          confirmLabel="Delete"
          onConfirm={() => setModal(null)}
        />
      </Item>

      <Item id="drawer" title="Drawer" figma="336:970 · C4" note="810 px (screen C4 and the component; the Figma description's 440 px is stale). Slides in from the right, 280 ms ease-out.">
        <div className={styles.row}>
          <Button variant="secondary" onClick={() => setDrawer(true)}>
            Open drawer
          </Button>
        </div>
        <Drawer
          open={drawer}
          onClose={() => setDrawer(false)}
          title="Carrier portals: a checklist"
          status={
            <Tag tone="warning" dot>
              Changed
            </Tag>
          }
          actions={
            <Menu trigger={<IconButton icon="more" label="More actions" tooltip={false} />} placement="bottom-end">
              <MenuItem icon="external" href="#drawer">
                Preview
              </MenuItem>
              <MenuItem icon="history">Discard changes</MenuItem>
              <MenuSeparator />
              <MenuItem icon="trash" danger>
                Delete
              </MenuItem>
            </Menu>
          }
          footer={<Callout>Shown on /blog/carrier-portals, /blog and Home › Articles. Need another field? Ask Kuartz — fields are defined in code.</Callout>}
        >
          <Input layout="inline" label="Title" defaultValue="Carrier portals: a checklist" />
          <Input layout="inline" label="Slug" defaultValue="carrier-portals" helper="conduit.com/blog/carrier-portals" />
          <Select layout="inline" label="Category" defaultValue="guides" options={[{ value: 'guides', label: 'Guides' }, { value: 'news', label: 'News' }]} />
          <Input layout="inline" label="Date" defaultValue="Sep 8, 2026" />
          <Textarea layout="inline" label="Excerpt" defaultValue="Before you roll out a carrier portal, check these seven points with your transport team." />
        </Drawer>
      </Item>

      <Item id="filter-popover" title="Filter popover" figma="336:1030" note="Opens from the filter icon; Select lists open above it (Esc closes the list first).">
        <div className={styles.row}>
          <FilterPopover
            fields={FIELDS}
            conditions={filters}
            onConditionsChange={setFilters}
            trigger={<IconButton icon="filter" label="Filter" variant="secondary" pressed={filters.length > 0} />}
            placement="bottom-start"
          />
          <span className={styles.caption}>{filters.length} filter(s)</span>
        </div>
      </Item>

      <Item id="usage-tooltip" title="Usage tooltip" figma="336:1082" note="Hover (300 ms) or click / ↓ on the trigger; stays open while the pointer is over it.">
        <UsageTooltip
          title="hero-truck.jpg · used in 2 places"
          places={[
            { label: 'Home › Hero — background', image: SAMPLE_OG, highlight: { x: 0.59, y: 0.39, width: 0.38, height: 0.65 }, href: '#' },
            { label: 'Blog › How to cut dock wait times — cover', highlight: { x: 0.12, y: 0.57, width: 0.76, height: 0.47 }, href: '#' },
          ]}
        >
          <Button variant="ghost" size="small" iconLeft="locate">
            Used ×2
          </Button>
        </UsageTooltip>
      </Item>

      <Item id="selection-bar" title="Selection bar" figma="336:1218" note="allowed · partial (some files are used) · blocked (all used). Slides down on appear.">
        <div className={styles.stack} style={{ width: 760, maxWidth: '100%' }}>
          <SelectionBar selectedCount={2} totalCount={2} deletableCount={2} onClear={() => {}} onDownload={() => {}} onDelete={() => {}} onSelectAll={() => {}} />
          <SelectionBar selectedCount={3} totalCount={8} deletableCount={1} onClear={() => {}} onDownload={() => {}} onDelete={() => {}} onSelectAll={() => {}} />
          <SelectionBar selectedCount={2} totalCount={8} deletableCount={0} onClear={() => {}} onDownload={() => {}} onDelete={() => {}} onSelectAll={() => {}} />
          <div className={styles.row}>
            <Button variant="secondary" size="small" onClick={() => setSelected((n) => (n ? 0 : 3))}>
              Toggle live selection
            </Button>
            <Button variant="ghost" size="small" onClick={() => setDeletable((d) => (d + 1) % 4)}>
              Deletable: {deletable}
            </Button>
          </div>
          <div style={{ minHeight: 37 }}>
            <AnimatePresence>
              {selected > 0 ? (
                <SelectionBar
                  key="bar"
                  selectedCount={selected}
                  totalCount={8}
                  deletableCount={Math.min(deletable, selected)}
                  onClear={() => setSelected(0)}
                  onSelectAll={(all) => setSelected(all ? 8 : 0)}
                  onDelete={() => {}}
                />
              ) : null}
            </AnimatePresence>
          </div>
        </div>
      </Item>
    </Family>
  )
}

export function CompositesAIEditor() {
  return (
    <Family id="ai-editor" title="AI editor (shared)">
      <Item id="model-usage" title="Model usage" figma="427:1565" note="formatUsageLine / modelLabel from the contract; the accessible name reads the whole line.">
        <div className={styles.stack}>
          <Cell label="default">
            <ModelUsage usage={{ model: 'claude-sonnet-5', inputTokens: 18_240, outputTokens: 1_100, costUsd: 0.0712 }} />
          </Cell>
          <Cell label="small">
            <ModelUsage size="small" usage={{ model: 'claude-opus-5-5', inputTokens: 950, outputTokens: 120, costUsd: 0.0031 }} />
          </Cell>
          <Cell label="estimated cost">
            <ModelUsage usage={{ model: 'claude-haiku-4-5', inputTokens: 1_204_000, outputTokens: 40_000, costUsd: 4.8, costKind: 'estimated' }} />
          </Cell>
          <Cell label="model only · usage only">
            <div className={styles.row}>
              <ModelUsage model="claude-fable-5-1" />
              <ModelUsage showModel={false} usage={{ inputTokens: 300_000, outputTokens: 40_000, costUsd: 0.5 }} />
            </div>
          </Cell>
        </div>
      </Item>
    </Family>
  )
}
