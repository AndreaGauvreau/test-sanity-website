'use client'

import { useEffect, useState } from 'react'
import {
  Button,
  Checkbox,
  CodeBlock,
  FaviconPreview,
  IconButton,
  ImagePreview,
  ImageUpload,
  Input,
  Radio,
  RadioGroup,
  RemoveBadge,
  SearchField,
  Select,
  SettingRow,
  Switch,
  Textarea,
  VariableChip,
  VariableInput,
  resolveVariables,
  useToast,
  type ImageUploadValue,
  type ListItems,
} from '@/admin/ui'
import { Cell, Family, Item, SAMPLE_FAVICON, SAMPLE_OG, styles } from './ui'

const PLACEMENTS: ListItems = [
  { value: 'head-end', label: 'End of <head>' },
  { value: 'body-start', label: 'Start of <body>' },
  { value: 'body-end', label: 'End of <body>' },
]

const SORT: ListItems = [
  { label: 'Sort by', options: [{ value: 'date', label: 'Date added' }, { value: 'name', label: 'Name' }, { value: 'size', label: 'File size' }] },
  { label: 'Order', options: [{ value: 'newest', label: 'Newest first' }, { value: 'oldest', label: 'Oldest first' }, { value: 'random', label: 'Random', disabled: true }] },
]

const PAGES: ListItems = [
  { value: 'all', label: 'All pages' },
  { value: 'home', label: 'Home', icon: 'house' },
  { value: 'page-x', label: '/page-x', icon: 'page' },
  { value: 'page-y', label: '/page-y', icon: 'page' },
  { value: 'blog', label: '/blog', icon: 'page' },
  { value: 'blog-slug', label: 'slug:', icon: 'database', meta: '12', depth: 1 },
  { value: '404', label: '/404', icon: 'page' },
]

const FIELDS = [
  { name: 'title', label: 'Title', icon: 'text' as const },
  { name: 'slug', label: 'Slug', icon: 'link' as const },
  { name: 'date', label: 'Date', icon: 'calendar' as const },
  { name: 'excerpt', label: 'Excerpt', icon: 'text' as const },
  { name: 'cover', label: 'Cover', icon: 'image' as const },
  { name: 'author', label: 'Author', icon: 'user' as const },
  { name: 'category', label: 'Category', icon: 'tag' as const },
]

const SCRIPT = `<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){ dataLayer.push(arguments); }
  gtag('js', new Date());
</script>`

const JSON_LD = `{
  "@context": "https://schema.org",
  "@type": "BlogPosting",
  "headline": "{{title}}",
  "image": "{{cover}}",
  "datePublished": "{{date}}"
}`

export function Forms() {
  const toast = useToast()
  const [title, setTitle] = useState('Conduit — Dock Scheduling')
  const [placement, setPlacement] = useState<string | null>('head-end')
  const [search, setSearch] = useState('hero')
  const [metaTitle, setMetaTitle] = useState('{{title}} | Conduit Blog')
  const [upload, setUpload] = useState<{ name: string; progress: number } | null>(null)
  const [image, setImage] = useState<ImageUploadValue | null>(null)
  const [favicon, setFavicon] = useState<string | null>(SAMPLE_FAVICON)

  // Envoi simulé (la galerie n'envoie rien).
  useEffect(() => {
    if (!upload) return
    if (upload.progress >= 100) {
      setImage({ name: upload.name, size: 188_416, src: SAMPLE_OG })
      setUpload(null)
      return
    }
    const t = setTimeout(() => setUpload({ ...upload, progress: upload.progress + 20 }), 250)
    return () => clearTimeout(t)
  }, [upload])

  const preview = resolveVariables(metaTitle, { title: 'Carrier portals: a checklist' })

  return (
    <Family id="forms" title="Forms">
      <Item id="input" title="Input" figma="327:352" note="empty · filled · focused (click) · disabled · error ; stacked and inline. Counter via showCount + maxLength.">
        <div className={styles.grid}>
          <Input className={styles.w280} label="Label" placeholder="Placeholder" />
          <Input className={styles.w280} label="Label" defaultValue="Conduit — Dock scheduling" />
          <Input className={styles.w280} label="Label" defaultValue="Conduit — Dock scheduling" disabled />
          <Input className={styles.w280} label="Label" defaultValue="Conduit — Dock scheduling" error="Title is required." />
          <Input className={styles.w280} label="Title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} showCount />
          <Input className={styles.w280} label="With icon" icon="search" placeholder="Search pages" helper="Shown in browser tabs and search results." />
        </div>
        <div className={styles.stack}>
          <Input className={styles.w440} layout="inline" label="Label" placeholder="Placeholder" />
          <Input className={styles.w440} layout="inline" label="Label" defaultValue="Conduit — Dock scheduling" error />
        </div>
      </Item>

      <Item id="textarea" title="Textarea" figma="327:436">
        <div className={styles.grid}>
          <Textarea className={styles.w280} label="Label" placeholder="Describe this page in one or two sentences…" />
          <Textarea
            className={styles.w280}
            label="Description"
            defaultValue="Book loading-dock slots in seconds. Conduit syncs carriers, docks and schedules in real time."
            maxLength={160}
            showCount
          />
          <Textarea className={styles.w280} label="Label" defaultValue="Book loading-dock slots in seconds." disabled />
          <Textarea className={styles.w280} label="Label" defaultValue="Book loading-dock slots in seconds." error="Keep it under 160 characters." />
        </div>
        <Textarea className={styles.w440} layout="inline" label="Label" placeholder="Describe this page in one or two sentences…" />
      </Item>

      <Item id="select" title="Select" figma="327:520" note="Listbox in the shared Popover. Keyboard: ↑ ↓ Home End PageUp PageDown, Enter / Space, Escape, Tab, type-ahead.">
        <div className={styles.grid}>
          <Select className={styles.w280} label="Label" options={PLACEMENTS} />
          <Select className={styles.w280} label="Placement" options={PLACEMENTS} value={placement} onValueChange={setPlacement} />
          <Select className={styles.w280} label="Label" options={PLACEMENTS} defaultValue="head-end" disabled />
          <Select className={styles.w280} label="Sort" options={SORT} defaultValue="date" />
          <Select className={styles.w280} label="Page" options={PAGES} defaultValue="blog-slug" />
          <Select className={styles.w280} label="Run" options={[{ value: 'once', label: 'Once' }, { value: 'every', label: 'On every page visit' }]} placeholder="Select…" error="Choose when the script runs." />
        </div>
        <Select className={styles.w440} layout="inline" label="Label" options={PLACEMENTS} defaultValue="body-end" />
      </Item>

      <Item id="search-field" title="Search field" figma="327:554" note={'Press / anywhere to focus the first one. Escape clears, then leaves. size="small" (28 px) lines up with 28 px icon buttons in a toolbar.'}>
        <div className={styles.row}>
          <Cell label="empty">
            <SearchField />
          </Cell>
          <Cell label="filled">
            <SearchField value={search} onValueChange={setSearch} shortcut={false} />
          </Cell>
          <Cell label="no shortcut">
            <SearchField shortcut={false} placeholder="Search media…" />
          </Cell>
          <Cell label="disabled">
            <SearchField shortcut={false} disabled />
          </Cell>
          <Cell label="small · toolbar (28 px)">
            <div className={styles.row} style={{ gap: 4, flexWrap: 'nowrap' }}>
              <IconButton icon="filter" label="Filter" />
              <SearchField size="small" shortcut={false} placeholder="Search items…" />
            </div>
          </Cell>
        </div>
      </Item>

      <Item id="checkbox" title="Checkbox" figma="330:283">
        <div className={styles.row}>
          <Checkbox label="Checkbox label" />
          <Checkbox label="Checkbox label" defaultChecked />
          <Checkbox label="Checkbox label" indeterminate />
          <Checkbox label="Checkbox label" disabled />
          <Checkbox label="Checkbox label" disabled defaultChecked />
          <Checkbox aria-label="Select row" />
        </div>
      </Item>

      <Item id="radio" title="Radio" figma="330:305">
        <div className={styles.row} style={{ alignItems: 'flex-start', gap: 48 }}>
          <RadioGroup label="Run" defaultValue="once">
            <Radio value="once" label="Once" />
            <Radio value="every" label="On every page visit" />
            <Radio value="never" label="Never" disabled />
          </RadioGroup>
          <RadioGroup label="Horizontal" orientation="horizontal" defaultValue="b">
            <Radio value="a" label="Option" />
            <Radio value="b" label="Option" />
          </RadioGroup>
          <RadioGroup aria-label="Disabled group" disabled defaultValue="x">
            <Radio value="x" label="Option" />
            <Radio value="y" label="Option" />
          </RadioGroup>
        </div>
      </Item>

      <Item id="switch" title="Switch" figma="330:329">
        <div className={styles.row}>
          <Switch label="Switch label" />
          <Switch label="Switch label" defaultChecked />
          <Switch label="Switch label" disabled />
          <Switch label="Switch label" disabled defaultChecked />
          <Switch aria-label="Standalone switch" defaultChecked />
        </div>
      </Item>

      <Item id="setting-row" title="Setting row" figma="330:341">
        <div className={styles.w560}>
          <SettingRow title="Search engines" description="Allow search engines to index this page and show it in results." defaultChecked />
          <SettingRow title="Maintenance mode" description="Show a maintenance page to visitors." />
          <SettingRow title="Locked setting" description="Only Kuartz can change this." disabled defaultChecked />
        </div>
      </Item>

      <Item id="image-upload" title="Image upload" figma="330:408" note="empty · dragover (drag a file) · uploading · filled · actions slot (e.g. Choose from Media: under the zone, or in the file row before Replace). The last one is interactive: pick or drop an image (upload is simulated).">
        <div className={styles.gridWide}>
          <ImageUpload label="Social preview" hint="1200 × 630 px" onFile={() => {}} />
          <ImageUpload label="Social preview" hint="1200 × 630 px" onFile={() => {}} uploading={{ name: 'og-home.jpg', progress: 50 }} />
          <ImageUpload label="Social preview" hint="1200 × 630 px" onFile={() => {}} value={{ name: 'og-home.jpg', size: 188_416 }} onRemove={() => {}} />
          <ImageUpload
            label="Cover image (with actions)"
            onFile={() => {}}
            actions={
              <Button variant="ghost" size="small" iconLeft="image" onClick={() => toast.show({ message: 'The Media picker opens here.' })}>
                Choose from Media
              </Button>
            }
          />
          <ImageUpload
            label="Cover image (filled, with actions)"
            onFile={() => {}}
            value={{ name: 'cover.jpg', size: 430_080, src: SAMPLE_OG }}
            onRemove={() => {}}
            actions={
              <Button variant="ghost" size="small" iconLeft="image" onClick={() => toast.show({ message: 'The Media picker opens here.' })}>
                Choose from Media
              </Button>
            }
          />
          <ImageUpload
            label="Social preview (interactive)"
            hint="1200 × 630 px"
            value={image}
            uploading={upload}
            onFile={(file) => setUpload({ name: file.name, progress: 0 })}
            onReject={(r) => toast.show({ type: 'error', message: r.message })}
            onRemove={() => setImage(null)}
          />
        </div>
      </Item>

      <Item id="code-block" title="Code block" figma="330:520" note="Editable (colored with code/* tokens) and read-only (JSON-LD written by Kuartz).">
        <div className={styles.stack}>
          <div className={styles.w520}>
            <CodeBlock label="Code" defaultValue={SCRIPT} />
          </div>
          <div className={styles.w520}>
            <CodeBlock label="JSON-LD (structured data)" value={JSON_LD} readOnly />
          </div>
          <div className={styles.w520}>
            <CodeBlock label="Code" defaultValue="<script src=&quot;https://example.com/x.js&quot;></script>" error="Scripts must come from an allowed domain." minLines={2} />
          </div>
        </div>
      </Item>

      <Item id="remove-badge" title="Remove badge" figma="410:1547">
        <div className={styles.row}>
          <RemoveBadge />
          <RemoveBadge disabled />
        </div>
      </Item>

      <Item id="favicon-preview" title="Favicon preview" figma="410:1592">
        <div className={styles.row} style={{ alignItems: 'flex-start', gap: 16 }}>
          <FaviconPreview theme="light" src={favicon} onFile={() => setFavicon(SAMPLE_FAVICON)} onRemove={() => setFavicon(null)} />
          <FaviconPreview theme="dark" src={favicon} onFile={() => setFavicon(SAMPLE_FAVICON)} onRemove={() => setFavicon(null)} />
          <FaviconPreview theme="light" src={null} onFile={() => {}} />
        </div>
      </Item>

      <Item id="image-preview" title="Image preview" figma="410:1609">
        <div className={styles.row} style={{ alignItems: 'flex-start', gap: 32 }}>
          <ImagePreview src={SAMPLE_OG} alt="Dock scheduling, solved." onRemove={() => {}} />
          <ImagePreview />
        </div>
      </Item>

      <Item id="variable-chip" title="Variable chip" figma="445:1898">
        <div className={styles.row}>
          <VariableChip name="title" />
          <VariableChip name="excerpt" />
          <VariableChip name="cover" />
          <VariableChip name="unknown" invalid />
        </div>
      </Item>

      <Item id="variable-input" title="Variable input" figma="445:1918" note="Type {{ to autocomplete a field, or use the database button. Value is serialized as text with {{field}}.">
        <div className={styles.stack}>
          <div className={styles.w360}>
            <VariableInput
              label="Meta title"
              variables={FIELDS}
              value={metaTitle}
              onValueChange={setMetaTitle}
              helper={`≈ ${preview.length} / 60 with “Carrier portals: a checklist”`}
            />
          </div>
          <span className={styles.caption}>Value: {metaTitle}</span>
          <div className={styles.w360}>
            <VariableInput label="Meta description" variables={FIELDS} defaultValue="{{excerpt}}" helper="≈ 89 / 160 with this post" />
          </div>
          <div className={styles.w360}>
            <VariableInput label="Unknown field" variables={FIELDS} defaultValue="{{subtitle}} — Conduit" error="{{subtitle}} is not a field of this collection." />
          </div>
          <div className={styles.w360}>
            <VariableInput label="Empty" variables={FIELDS} placeholder="Type {{ to insert a field" />
          </div>
        </div>
      </Item>
    </Family>
  )
}
