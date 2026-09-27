'use client'

import { useState } from 'react'
import type { PublishState } from '@/admin/core/contracts'
import {
  Button,
  ContentArea,
  IconButton,
  Menu,
  MenuGroup,
  MenuItem,
  MenuPanel,
  MenuSeparator,
  NavItem,
  NavSection,
  PageHeader,
  PublishButton,
  SectionHeader,
  SegmentedControl,
  Sidebar,
  TabPanel,
  Tabs,
  Tag,
  TopBar,
  type SidebarSection,
} from '@/admin/ui'
import { Cell, Family, Item, SAMPLE_FAVICON, styles } from './ui'

const PUBLISH_STATES: PublishState[] = ['idle', 'pending', 'publishing', 'published', 'failed']

function sidebarSections(role: 'kuartz' | 'client', active: string): SidebarSection[] {
  const item = (id: string, label: string, icon: SidebarSection['items'][number]['icon'], extra: Partial<SidebarSection['items'][number]> = {}) => ({
    id,
    label,
    icon,
    href: '#',
    active: active === id,
    ...extra,
  })
  return [
    {
      id: 'settings',
      label: 'SITE SETTINGS',
      items: [
        item('general', 'General', 'sliders'),
        role === 'kuartz'
          ? item('code', 'Code', 'code', { tag: <Tag tone="info">KUARTZ</Tag> })
          : item('team', 'Team', 'team', { tag: <Tag tone="success">CLIENT</Tag> }),
        item('usage', 'Usage', 'usage'),
      ],
    },
    {
      id: 'pages',
      label: 'PAGES',
      items: [
        item('home', 'Home', 'house'),
        item('page-x', '/page-x', 'page'),
        item('blog', '/blog', 'page', { children: [item('blog-slug', 'slug:', 'database', { count: 12 })] }),
        item('404', '/404', 'page'),
      ],
    },
    {
      id: 'cms',
      label: 'CMS',
      items: [item('cms-blog', 'Blog', 'database', { count: 12 }), item('cms-testimonials', 'Testimonials', 'database', { count: 3 }), item('cms-faq', 'FAQ', 'database', { count: 9 })],
    },
    { id: 'assets', label: 'ASSETS', items: [item('media', 'Media', 'image')] },
  ]
}

export function CompositesNavigation() {
  const [tab, setTab] = useState('pending')
  const [mode, setMode] = useState('select')
  const [expanded, setExpanded] = useState(true)
  const [sort, setSort] = useState('date')
  const [order, setOrder] = useState('newest')
  const [active, setActive] = useState('general')

  return (
    <Family id="navigation" title="Navigation">
      <Item id="nav-item" title="Nav item" figma="332:431" note="default · hover (live) · active · count · tag · chevron (listing page that unfolds) · article page (depth 1).">
        <div className={styles.stack} style={{ width: 224, gap: 0 }}>
          <NavItem label="General" icon="sliders" active={active === 'general'} onClick={() => setActive('general')} />
          <NavItem label="Code" icon="code" tag={<Tag tone="info">KUARTZ</Tag>} active={active === 'code'} onClick={() => setActive('code')} />
          <NavItem label="Blog" icon="database" count={12} active={active === 'blog'} onClick={() => setActive('blog')} />
          <NavItem label="/blog" icon="page" expanded={expanded} onExpandedChange={setExpanded} href="#" />
          {expanded ? <NavItem label="slug:" icon="database" count={12} depth={1} href="#" /> : null}
        </div>
      </Item>

      <Item id="nav-section" title="Nav section" figma="332:443">
        <div className={styles.stack} style={{ width: 224, gap: 0 }}>
          <NavSection label="SITE SETTINGS" />
          <NavSection label="Pages" action={<IconButton size="xsmall" icon="plus" label="Add page" />} />
        </div>
      </Item>

      <Item id="tabs" title="Tab + Tabs" figma="332:459 · 332:479" note="Content tabs: tablist, ← → Home End (automatic activation). Route tabs (all with href): a nav of links with aria-current.">
        <div className={`${styles.stack} ${styles.w520}`} style={{ width: 480 }}>
          <Tabs
            idBase="kit-tabs"
            aria-label="Publish"
            value={tab}
            onValueChange={setTab}
            items={[
              { value: 'pending', label: 'Pending (3)' },
              { value: 'versions', label: 'Versions' },
              { value: 'activity', label: 'Activity' },
            ]}
          />
          {['pending', 'versions', 'activity'].map((v) => (
            <TabPanel key={v} idBase="kit-tabs" value={v} active={tab === v} className={styles.caption}>
              Panel: {v}
            </TabPanel>
          ))}
          <Tabs
            aria-label="Page sections"
            value="content"
            items={[
              { value: 'content', label: 'Content', href: '#tabs' },
              { value: 'seo', label: 'SEO', href: '#tabs' },
            ]}
          />
        </div>
      </Item>

      <Item id="segmented-control" title="Segment + Segmented control" figma="332:507 · 332:522" note="radiogroup: arrows select. Icon segments carry a tooltip.">
        <div className={styles.row}>
          <Cell label="2 · label">
            <SegmentedControl aria-label="Mode" value={mode} onValueChange={setMode} items={[{ value: 'view', label: 'View' }, { value: 'select', label: 'Select' }]} />
          </Cell>
          <Cell label="3 · label">
            <SegmentedControl aria-label="Viewport" defaultValue="desktop" items={[{ value: 'desktop', label: 'Desktop' }, { value: 'tablet', label: 'Tablet' }, { value: 'mobile', label: 'Mobile' }]} />
          </Cell>
          <Cell label="2 · icon">
            <SegmentedControl aria-label="Tool" value={mode} onValueChange={setMode} items={[{ value: 'view', label: 'View', icon: 'eye', shortcut: 'V' }, { value: 'select', label: 'Select', icon: 'select', shortcut: 'S' }]} />
          </Cell>
          <Cell label="3 · icon">
            <SegmentedControl aria-label="Device" defaultValue="desktop" items={[{ value: 'desktop', label: 'Desktop', icon: 'desktop' }, { value: 'tablet', label: 'Tablet', icon: 'tablet' }, { value: 'mobile', label: 'Mobile', icon: 'mobile' }]} />
          </Cell>
          <Cell label="disabled">
            <SegmentedControl aria-label="Disabled" disabled defaultValue="a" items={[{ value: 'a', label: 'View' }, { value: 'b', label: 'Select' }]} />
          </Cell>
        </div>
      </Item>

      <Item id="menu" title="Menu item + Menu" figma="332:585 · 332:656" note="Static panel (all item states) and a live menu button: ↓ / ↑ / Enter open, roving focus, letters jump, Esc / Tab close.">
        <div className={styles.row} style={{ alignItems: 'flex-start', gap: 40 }}>
          <MenuPanel initialFocus="none" width={216} aria-label="Menu item states">
            <MenuGroup label="Sort by">
              <MenuItem selected>Date added</MenuItem>
              <MenuItem selected={false}>Name</MenuItem>
              <MenuItem icon="calendar" shortcut="⌘ ↵">
                Schedule
              </MenuItem>
              <MenuItem disabled>Disabled</MenuItem>
              <MenuItem danger icon="trash">
                Delete
              </MenuItem>
            </MenuGroup>
          </MenuPanel>
          <Menu trigger={<IconButton icon="sort" label="Sort" variant="secondary" />} aria-label="Sort">
            <MenuGroup label="Sort by">
              {[
                ['date', 'Date added'],
                ['name', 'Name'],
                ['size', 'File size'],
              ].map(([v, l]) => (
                <MenuItem key={v} selected={sort === v} onSelect={() => setSort(v)}>
                  {l}
                </MenuItem>
              ))}
            </MenuGroup>
            <MenuSeparator />
            {[
              ['newest', 'Newest first'],
              ['oldest', 'Oldest first'],
            ].map(([v, l]) => (
              <MenuItem key={v} selected={order === v} onSelect={() => setOrder(v)}>
                {l}
              </MenuItem>
            ))}
          </Menu>
          <Menu trigger={<Button variant="secondary" size="small" iconRight="chevron-down">Actions</Button>}>
            <MenuItem icon="external" href="#menu">
              Preview
            </MenuItem>
            <MenuItem icon="history">Discard changes</MenuItem>
            <MenuSeparator />
            <MenuItem icon="trash" danger>
              Delete
            </MenuItem>
          </Menu>
        </div>
      </Item>

      <Item id="sidebar" title="Sidebar" figma="333:1247" note="Presentational: the shell passes the site, the sections and items, the user, Ask AI and Log out.">
        <div className={styles.row} style={{ alignItems: 'stretch' }}>
          <div style={{ height: 900 }}>
            <Sidebar
              site={{ name: 'Conduit', domain: 'conduit.com', screen: 'Overview' }}
              sections={sidebarSections('kuartz', 'general')}
              user={{ name: 'Andrea', role: 'Kuartz', tone: 'blue' }}
              onAskAI={() => {}}
              onLogout={() => {}}
              hub={{ href: '#' }}
            />
          </div>
          <div style={{ height: 900 }}>
            <Sidebar
              site={{ name: 'Conduit', domain: 'conduit.com', screen: 'CMS', logo: SAMPLE_FAVICON }}
              sections={sidebarSections('client', 'cms-blog')}
              user={{ name: 'Marie', role: 'Client', tone: 'green', initials: 'M' }}
              onAskAI={() => {}}
              onLogout={() => {}}
            />
          </div>
        </div>
      </Item>

      <Item id="top-bar" title="Top bar" figma="333:1407" note="The 5 publishing states; the Publish button is a slot (PublishButton).">
        <div className={styles.stack} style={{ gap: 0 }}>
          {PUBLISH_STATES.map((state) => (
            <TopBar
              key={state}
              state={state}
              pendingCount={3}
              onReview={() => {}}
              siteUrl="https://conduit.com"
              publish={<PublishButton state={state} pendingCount={3} />}
            />
          ))}
        </div>
      </Item>

      <Item id="page-header" title="Page header" figma="333:1416">
        <div className={styles.stack} style={{ gap: 32 }}>
          <PageHeader title="Media" meta="48 files · 312 MB" tools={
            <>
              <IconButton icon="plus" label="Upload" />
              <IconButton icon="sort" label="Sort" />
              <IconButton icon="filter" label="Filter" />
              <IconButton icon="search" label="Search" />
            </>
          } />
          <PageHeader
            title="Home"
            meta="/"
            actions={
              <>
                <Button variant="secondary" size="small" iconLeft="ai">
                  Open in AI editor
                </Button>
                <Button variant="ghost" size="small" iconRight="external">
                  Preview
                </Button>
              </>
            }
            tabs={<Tabs aria-label="Home sections" value="content" items={[{ value: 'content', label: 'Content', href: '#page-header' }, { value: 'seo', label: 'SEO', href: '#page-header' }]} />}
          />
          <PageHeader headingLevel={2} title="Media" meta="48 files · 312 MB" description="Images, videos and files used on the site. A file that is in use cannot be deleted." />
        </div>
      </Item>

      <Item id="section-header" title="Section header" figma="333:1433">
        <div className={styles.stack} style={{ width: 720, maxWidth: '100%' }}>
          <SectionHeader
            title="Scripts"
            description="Code added to every page or to a selection of pages of the published site."
            action={
              <Button variant="secondary" size="small" iconLeft="plus">
                Add
              </Button>
            }
          />
          <SectionHeader title="Danger zone" />
        </div>
      </Item>

      <Item id="content-area" title="Content area" figma="screens B1 · C3" note="Shell content: pad 28 40 40 40, 1 120 px wide (dashed outline shows the frame).">
        <div style={{ outline: '1px dashed var(--k-border-strong)', maxWidth: '100%', overflow: 'hidden' }}>
          <ContentArea gap={24}>
            <PageHeader title="Overview" meta="conduit.com" />
            <div style={{ height: 60, borderRadius: 12, background: 'var(--k-bg-elevated)' }} />
          </ContentArea>
        </div>
      </Item>
    </Family>
  )
}
