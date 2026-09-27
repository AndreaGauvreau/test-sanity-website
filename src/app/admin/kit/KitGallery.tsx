'use client'

import type { ReactNode } from 'react'
import { ToastProvider } from '@/admin/ui'
import { Actions } from './sections/Actions'
import { Composites } from './sections/Composites'
import { DataDisplay } from './sections/DataDisplay'
import { Feedback } from './sections/Feedback'
import { Forms } from './sections/Forms'
import { Foundations } from './sections/Foundations'
import styles from './kit.module.css'

const NAV: { group: string; items: [string, string][] }[] = [
  { group: 'Foundations', items: [['colors', 'Colors'], ['typography', 'Typography'], ['elevation', 'Elevation'], ['icons', 'Icons'], ['icon-color', 'Icon color']] },
  { group: 'Actions', items: [['button', 'Button'], ['icon-button', 'Icon button'], ['chip', 'Chip']] },
  {
    group: 'Feedback',
    items: [['tag', 'Tag'], ['kbd', 'Kbd'], ['tooltip', 'Tooltip'], ['progress-bar', 'Progress bar'], ['callout', 'Callout'], ['toast', 'Toast'], ['empty-state', 'Empty state'], ['publish-button', 'Publish button']],
  },
  {
    group: 'Forms',
    items: [
      ['input', 'Input'], ['textarea', 'Textarea'], ['select', 'Select'], ['search-field', 'Search field'], ['checkbox', 'Checkbox'], ['radio', 'Radio'],
      ['switch', 'Switch'], ['setting-row', 'Setting row'], ['image-upload', 'Image upload'], ['code-block', 'Code block'], ['remove-badge', 'Remove badge'],
      ['favicon-preview', 'Favicon preview'], ['image-preview', 'Image preview'], ['variable-chip', 'Variable chip'], ['variable-input', 'Variable input'],
    ],
  },
  {
    group: 'Data display',
    items: [
      ['avatar', 'Avatar'], ['list-item', 'List item'], ['table-cell', 'Table cell'], ['media-card', 'Media card'], ['version-item', 'Version item'],
      ['detail-row', 'Detail row'], ['stat-card', 'Stat card'], ['ai-usage', 'AI usage'], ['search-preview', 'Search preview'],
      ['social-preview', 'Social preview'], ['heading-row', 'Heading row'], ['lock-badge', 'Lock badge'], ['status-select', 'Status select'],
      ['cms-cell', 'CMS cell · Row open'],
    ],
  },
  {
    group: 'Navigation',
    items: [
      ['nav-item', 'Nav item'], ['nav-section', 'Nav section'], ['tabs', 'Tabs'], ['segmented-control', 'Segmented control'], ['menu', 'Menu'],
      ['sidebar', 'Sidebar'], ['top-bar', 'Top bar'], ['page-header', 'Page header'], ['section-header', 'Section header'], ['content-area', 'Content area'],
    ],
  },
  {
    group: 'Overlays',
    items: [['scrim', 'Scrim'], ['modal', 'Modal'], ['drawer', 'Drawer'], ['filter-popover', 'Filter popover'], ['usage-tooltip', 'Usage tooltip'], ['selection-bar', 'Selection bar']],
  },
  { group: 'AI editor', items: [['model-usage', 'Model usage']] },
]

export function KitGallery({ badge }: { badge?: ReactNode }) {
  return (
    <ToastProvider>
      <div className={styles.page}>
        <nav className={styles.nav} aria-label="Kit sections">
          <span className={styles.navTitle}>Kuartz kit</span>
          {NAV.map((g) => (
            <div key={g.group} style={{ display: 'contents' }}>
              <span className={styles.navGroup}>{g.group}</span>
              {g.items.map(([id, label]) => (
                <a key={id} href={`#${id}`} className={styles.navLink}>
                  {label}
                </a>
              ))}
            </div>
          ))}
        </nav>
        <main className={styles.main}>
          <header className={styles.header}>
            <h1 className={styles.h1}>
              Kit {badge}
            </h1>
            <p className={styles.lead}>
              Development gallery of the admin UI kit (src/admin/ui), from the Figma design system « Kuartz — Carte système ». Dark theme.
              Every component in every state; hover, focus and pressed states are live.
            </p>
          </header>
          <Foundations />
          <Actions />
          <Feedback />
          <Forms />
          <DataDisplay />
          <Composites />
        </main>
      </div>
    </ToastProvider>
  )
}
