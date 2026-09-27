'use client'

import { useState } from 'react'
import {
  AIUsage,
  Avatar,
  Checkbox,
  CMSCell,
  CMSRow,
  CMSTable,
  DetailRow,
  HeadingRow,
  IconButton,
  ListItem,
  LockBadge,
  MediaCard,
  RowOpen,
  SearchPreview,
  SocialPreview,
  StatCard,
  StatusSelect,
  Table,
  TableCell,
  TableHeaderCell,
  TableRow,
  Tag,
  VersionItem,
  type CmsStatus,
  type TableSort,
  type UsagePlace,
} from '@/admin/ui'
import { Cell, Family, Item, SAMPLE_FAVICON, SAMPLE_OG, styles } from './ui'

// Miniatures d'usage : la même image d'exemple, cadre rouge sur l'emplacement du média.
const PLACES: UsagePlace[] = [
  { label: 'Home › Hero — background', image: SAMPLE_OG, highlight: { x: 0.59, y: 0.39, width: 0.38, height: 0.65 }, href: '#' },
  { label: 'Blog › How to cut dock wait times — cover', image: SAMPLE_OG, highlight: { x: 0.12, y: 0.57, width: 0.76, height: 0.47 }, href: '#' },
]

const POSTS: { title: string; status: CmsStatus; slug: string; cover?: string; category: string; date: string; author: string }[] = [
  { title: 'How to cut dock wait times', status: 'live', slug: 'how-to-cut-dock-wait-times', category: 'Guides', date: 'Sep 12, 2026', author: 'Marie Laurent' },
  { title: 'Carrier portals: a checklist', status: 'changed', slug: 'carrier-portals', cover: SAMPLE_OG, category: 'Guides', date: 'Sep 8, 2026', author: 'Paul Girard' },
  { title: 'Q3 product update', status: 'draft', slug: 'q3-product-update', category: 'News', date: '—', author: 'Marie Laurent' },
  { title: 'How a Lyon DC cut idle time by 40% in a month', status: 'live', slug: 'lyon-dc-idle-time', category: 'Case study', date: 'Jul 3, 2026', author: 'Paul Girard' },
]

function CmsTableDemo() {
  const [rows, setRows] = useState(POSTS)
  const [checked, setChecked] = useState<Record<string, boolean>>({ 'carrier-portals': true })
  const [editing, setEditing] = useState<string | null>(null)
  const all = rows.every((r) => checked[r.slug])
  const some = rows.some((r) => checked[r.slug])
  return (
    <CMSTable aria-label="Blog posts">
      <CMSRow header>
        <CMSCell
          type="handle"
          checkboxLabel="Select all posts"
          checked={some}
          indeterminate={some && !all}
          onCheckedChange={() => setChecked(Object.fromEntries(rows.map((r) => [r.slug, !all])))}
        />
        <CMSCell type="header" width={240}>Title</CMSCell>
        <CMSCell type="header" width={120}>Status</CMSCell>
        <CMSCell type="header" width={220}>Slug</CMSCell>
        <CMSCell type="header" width={96}>Cover</CMSCell>
        <CMSCell type="header" width={130}>Category</CMSCell>
        <CMSCell type="header" width={120}>Date</CMSCell>
        <CMSCell type="header" width={150}>Author</CMSCell>
      </CMSRow>
      {rows.map((row) => (
        <CMSRow key={row.slug} selected={checked[row.slug]} onOpen={() => {}} openLabel={`Open ${row.title}`}>
          <CMSCell
            type="handle"
            checkboxLabel={`Select ${row.title}`}
            checked={!!checked[row.slug]}
            onCheckedChange={(c) => setChecked((prev) => ({ ...prev, [row.slug]: c }))}
          />
          <CMSCell
            type="title"
            editing={editing === row.slug}
            onEditRequest={() => setEditing(row.slug)}
            onCommit={(value) => {
              setRows((prev) => prev.map((r) => (r.slug === row.slug ? { ...r, title: value } : r)))
              setEditing(null)
            }}
            onCancel={() => setEditing(null)}
            inputLabel="Title"
          >
            {row.title}
          </CMSCell>
          <CMSCell type="status">
            <StatusSelect status={row.status} />
          </CMSCell>
          <CMSCell type="text" width={220}>{row.slug}</CMSCell>
          <CMSCell type="image" src={row.cover} />
          <CMSCell type="text" width={130}>{row.category}</CMSCell>
          <CMSCell type="text" width={120}>{row.date}</CMSCell>
          <CMSCell type="text" width={150}>{row.author}</CMSCell>
        </CMSRow>
      ))}
    </CMSTable>
  )
}

function TableDemo() {
  const [sort, setSort] = useState<TableSort>('descending')
  const [selected, setSelected] = useState(true)
  return (
    <Table aria-label="Team">
      <thead>
        <tr>
          <TableHeaderCell width={40} aria-label="Selection" />
          <TableHeaderCell width={280}>Name</TableHeaderCell>
          <TableHeaderCell width={160} sort={sort} onSort={() => setSort((s) => (s === 'descending' ? 'ascending' : 'descending'))}>
            Role
          </TableHeaderCell>
          <TableHeaderCell width={160}>Invited by</TableHeaderCell>
          <TableHeaderCell width={160}>Model</TableHeaderCell>
          <TableHeaderCell width={48} align="end">
            <span className="kz-visually-hidden">Actions</span>
          </TableHeaderCell>
        </tr>
      </thead>
      <tbody>
        {[
          { name: 'Marie Dupont', role: 'Admin', tone: 'success' as const, by: 'Andrea', sel: selected },
          { name: 'Paul Girard', role: 'Editor', tone: 'neutral' as const, by: 'Marie', sel: false },
        ].map((r) => (
          <TableRow key={r.name} selected={r.sel}>
            <TableCell type="checkbox">
              <Checkbox
                aria-label={`Select ${r.name}`}
                checked={r.sel}
                onCheckedChange={() => r.name === 'Marie Dupont' && setSelected((s) => !s)}
              />
            </TableCell>
            <TableCell type="title">{r.name}</TableCell>
            <TableCell type="tag">
              <Tag tone={r.tone}>{r.role}</Tag>
            </TableCell>
            <TableCell type="user" avatar={<Avatar name={r.by} size={20} tone="green" decorative />}>
              {r.by}
            </TableCell>
            <TableCell type="model">Sonnet 5</TableCell>
            <TableCell type="actions">
              <IconButton icon="more" label={`More actions for ${r.name}`} />
            </TableCell>
          </TableRow>
        ))}
      </tbody>
    </Table>
  )
}

export function CompositesDataDisplay() {
  const [version, setVersion] = useState(0)
  return (
    <Family id="composites-data" title="Data display — composites">
      <Item id="list-item" title="List item" figma="337:1064" note="Hover is live. With href / onClick, the whole row is clickable (stretched link); the action stays on top.">
        <div className={`${styles.stack} ${styles.w560}`}>
          <ListItem
            avatar={<Avatar name="Marie Dupont" initials="M" size={28} tone="green" decorative />}
            title="Marie Dupont"
            subtitle="marie@conduit.com"
            meta="Editor"
            action={<IconButton icon="more" label="More actions for Marie Dupont" />}
          />
          <ListItem icon="page" title="/blog" subtitle="Listing page" tag={<Tag>Content</Tag>} meta="Updated 2 h ago" href="#" action={<IconButton icon="more" label="More actions for /blog" />} />
          <ListItem icon="code" title="Google Tag Manager" meta="All pages" />
        </div>
      </Item>

      <Item id="table-cell" title="Table cell" figma="337:1191" note="Table + TableRow (hover / selected carried by the row) + TableHeaderCell (sortable) + TableCell types.">
        <div className={styles.w560} style={{ width: 880, maxWidth: '100%' }}>
          <TableDemo />
        </div>
      </Item>

      <Item id="media-card" title="Media card" figma="337:1453" note="Hover shows the checkbox and a border/strong outline; selected = border/focus 2 px. « Used ×2 » opens the Usage tooltip.">
        <div className={styles.row} style={{ alignItems: 'flex-start' }}>
          <MediaCard name="hero-truck.jpg" size="1.2 MB" usage="Used ×2" usagePlaces={PLACES} defaultSelected />
          <MediaCard name="demo-tour.mp4" type="video" size="14.3 MB" usage="Used ×1" usagePlaces={PLACES.slice(0, 1)} />
          <MediaCard name="brochure.pdf" type="file" typeLabel="PDF" size="5.2 MB" usage="Unused" />
          <MediaCard name="og-home.jpg" src={SAMPLE_OG} size="310 KB" usage="Used ×3" badge={<LockBadge label="Used in 3 places — remove it from the site before deleting." />} />
        </div>
      </Item>

      <Item id="version-item" title="Version item" figma="337:1486">
        <div className={styles.stack} style={{ width: 380, gap: 2 }} role="list" aria-label="Versions">
          {['Today 09:10 · Andrea', 'Yesterday 17:42 · Marie', 'Sep 24 11:05 · Andrea'].map((label, i) => (
            <div role="listitem" key={label}>
              <VersionItem label={label} status={i === 0 ? 'live' : i === 2 ? 'failed' : undefined} selected={version === i} onClick={() => setVersion(i)} />
            </div>
          ))}
        </div>
      </Item>

      <Item id="detail-row" title="Detail row" figma="337:1498">
        <div className={styles.row} style={{ alignItems: 'flex-start', gap: 48 }}>
          <div className={styles.stack} style={{ width: 360 }}>
            <DetailRow label="Published by" value="Andrea (Kuartz)" />
            <DetailRow label="Build" value="Vercel · 42 s" />
          </div>
          <div className={styles.stack} style={{ width: 360 }}>
            <DetailRow layout="inline" label="Published by" value="Andrea (Kuartz)" />
            <DetailRow layout="inline" label="Commit" value="a1b2c3d · Update hero title" />
          </div>
        </div>
      </Item>

      <Item id="stat-card" title="Stat card" figma="338:1177">
        <div className={styles.row} style={{ alignItems: 'stretch', flexWrap: 'nowrap', overflowX: 'auto' }}>
          <StatCard style={{ width: 260 }} icon="usage" label="Total cost this month" value="$4.80" hint="1.2M input · 147k output tokens" />
          <StatCard style={{ width: 260 }} icon="globe" label="Production" value="Ready" hint="Vercel · deployed today 14:02" />
          <StatCard style={{ width: 260 }} label="Team" value="4 members" />
        </div>
      </Item>

      <Item id="ai-usage" title="AI usage" figma="352:1557" note="Period Select is live; figures via formatTokens / formatCost (contract).">
        <div className={styles.row} style={{ alignItems: 'flex-start' }}>
          <AIUsage
            style={{ width: 384 }}
            totals={{ inputTokens: 1_200_000, outputTokens: 147_000, costUsd: 4.8 }}
            features={[
              { label: 'AI editor', usage: { model: 'claude-sonnet-5', inputTokens: 900_000, outputTokens: 107_000, costUsd: 4.3 } },
              { label: 'Ask AI', usage: { model: 'claude-haiku-4-5', inputTokens: 300_000, outputTokens: 40_000, costUsd: 0.5 } },
            ]}
          />
          <AIUsage style={{ width: 384 }} totals={null} loading />
          <AIUsage style={{ width: 384 }} defaultPeriod="all-time" totals={{ inputTokens: 0, outputTokens: 0, costUsd: 0 }} />
        </div>
      </Item>

      <Item id="search-preview" title="Search preview" figma="338:1231">
        <SearchPreview
          siteName="Conduit"
          url="https://conduit.com"
          title="Conduit — Dock scheduling for modern warehouses"
          description="Book loading-dock slots in seconds. Conduit syncs carriers, docks and schedules in real time, so trucks spend less time waiting at the gate and more time on the road."
        />
      </Item>

      <Item id="social-preview" title="Social preview" figma="338:1245">
        <div className={styles.row} style={{ alignItems: 'flex-start' }}>
          <SocialPreview image={SAMPLE_OG} domain="conduit.com" title="Conduit — Dock scheduling for modern warehouses" description="Book loading-dock slots in seconds." />
          <SocialPreview domain="conduit.com" title="No image yet" description="The image placeholder shows the image icon." />
        </div>
      </Item>

      <Item id="heading-row" title="Heading row" figma="338:1337">
        <ul className={`${styles.stack} ${styles.w520}`} style={{ gap: 4, padding: 0, margin: 0 }} aria-label="Headings">
          <HeadingRow as="li" level={1} text="Dock scheduling for modern warehouses" />
          <HeadingRow as="li" level={2} text="Why docks get congested" />
          <HeadingRow as="li" level={4} text="Carrier portals" status="warning" note="Level skipped" />
          <HeadingRow as="li" level={3} text="Three quick wins" />
          <HeadingRow as="li" level={1} text="A second H1" status="warning" note="Only one H1 per page" />
        </ul>
      </Item>

      <Item id="lock-badge" title="Lock badge" figma="453:1923" note="Hover or focus (Tab) shows the reason.">
        <div className={styles.row}>
          <div style={{ position: 'relative', width: 184, height: 124, borderRadius: 8, background: 'var(--k-bg-subtle)' }}>
            <LockBadge corner label="Used in 2 places — remove it from the site before deleting." />
          </div>
          <LockBadge label="Used in 2 places — remove it from the site before deleting." />
        </div>
      </Item>

      <Item id="status-select" title="Status select" figma="468:1971" note="Menu button: Live → Unpublish, Draft → Delete draft, Changed → Discard changes.">
        <div className={styles.row}>
          {(['live', 'draft', 'changed'] as const).map((s) => (
            <Cell key={s} label={s}>
              <StatusSelect status={s} />
            </Cell>
          ))}
          <Cell label="read-only">
            <StatusSelect status="live" actions={[]} />
          </Cell>
          <Cell label="disabled">
            <StatusSelect status="draft" disabled />
          </Cell>
        </div>
      </Item>

      <Item id="cms-cell" title="CMS cell + Row open" figma="468:2013 · 468:2027" note="Spreadsheet table (C3): fixed widths per column type, horizontal scroll. Click a title to edit (Enter / click away saves, Esc cancels). Hover a row for Row open.">
        <div style={{ maxWidth: 1120 }}>
          <CmsTableDemo />
        </div>
        <div className={styles.row} style={{ marginTop: 16 }}>
          <div style={{ position: 'relative', width: 240, height: 44, background: 'var(--k-bg-input-hover)', borderRadius: 4 }}>
            <RowOpen onOpen={() => {}} label="Open (static)" />
          </div>
        </div>
      </Item>
    </Family>
  )
}
