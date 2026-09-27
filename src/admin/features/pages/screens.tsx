import 'server-only'

import { notFound } from 'next/navigation'
import { Suspense } from 'react'

import { adminConfig } from '@/admin.config'
import { requireSession } from '@/admin/core/auth/session'
import { can, type PageDef, type Session } from '@/admin/core/contracts'
import { EmptyState } from '@/admin/ui'
import { siteName } from '@/lib/site'

import { ArticleSeoView } from './components/ArticleSeoView'
import { ContentView } from './components/ContentView'
import { PageFrame } from './components/PageFrame'
import { HeadingStructureSkeleton, JsonLdBlocks, JsonLdSkeleton, PageHeadingStructure, PageJsonLd } from './components/PageHtmlBlocks'
import type { PageTab } from './components/PageTabs'
import { SeoView } from './components/SeoView'
import {
  articleOf,
  articleSeoHref,
  editorHref,
  findPage,
  pageHref,
  pageSeoHref,
  sectionSource,
  sectionSummary,
} from './lib/manifest'
import {
  loadArticleJsonLd,
  loadArticleOptions,
  loadArticleTemplate,
  loadPageDocument,
  loadReferenceOptions,
  loadSiteSettings,
  publicUrl,
} from './server/data'

/**
 * Écrans C1, C2, C6 (Server Components). Les routes de src/app/admin/(shell)/pages/ ne font que les appeler.
 * Chaque écran : session EN PREMIER, page du manifeste (inconnue → notFound), données serveur, puis composants
 * client pour l'interactivité (aucune donnée sensible transmise : ni jeton, ni code de script).
 */

type Params = Promise<{ pageId: string }>

async function resolvePage(params: Params): Promise<{ session: Session; page: PageDef }> {
  const session = await requireSession('page')
  const { pageId } = await params
  const page = findPage(pageId)
  if (!page) notFound()
  return { session, page }
}

function tabsFor(page: PageDef): PageTab[] {
  return [
    { value: 'content', label: 'Content', href: pageHref(page.id) },
    { value: 'seo', label: 'SEO', href: pageSeoHref(page.id) },
  ]
}

function frameProps(session: Session, page: PageDef, active: 'content' | 'seo') {
  // « Open in AI editor » (G1) : `back` = l'écran courant, pour que « ‹ Admin » de l'éditeur y revienne.
  const back = active === 'seo' ? pageSeoHref(page.id) : pageHref(page.id)
  return {
    title: page.label,
    meta: page.path,
    editorHref: page.aiEditor && can(session.role, 'ai.editor') ? editorHref(page.id, back) : null,
    previewHref: publicUrl(page.path),
    tabs: tabsFor(page),
  }
}

function NoDocument({ page, missing }: { page: PageDef; missing?: boolean }) {
  return (
    <EmptyState
      icon="page"
      title={missing ? 'This page has no content in Sanity yet' : 'This page has no editable content'}
      description={
        missing
          ? `The document behind ${page.label} doesn't exist yet. Ask Kuartz to create it.`
          : `The text of ${page.label} is written in code. Need to change it? Ask Kuartz.`
      }
    />
  )
}

// ─── C1 · Content ─────────────────────────────────────────────────────────

export async function PageContentScreen({ params }: { params: Params }) {
  const { session, page } = await resolvePage(params)
  const frame = frameProps(session, page, 'content')
  if (!page.document) {
    return (
      <PageFrame {...frame} active="content">
        <NoDocument page={page} />
      </PageFrame>
    )
  }
  const [doc, referenceOptions] = await Promise.all([loadPageDocument(page.document.id), loadReferenceOptions(page)])
  if (!doc.value) {
    return (
      <PageFrame {...frame} active="content">
        <NoDocument page={page} missing />
      </PageFrame>
    )
  }
  const value = doc.value
  const sections = page.sections.map((section) => ({
    section,
    summary: sectionSummary(section, (value[section.name] as Record<string, unknown> | undefined) ?? null),
    source: sectionSource(section),
  }))
  return (
    <PageFrame {...frame} active="content">
      <ContentView
        pageId={page.id}
        sections={sections}
        value={value}
        hasDraft={doc.hasDraft}
        readOnly={!can(session.role, 'content.write')}
        referenceOptions={referenceOptions}
      />
    </PageFrame>
  )
}

// ─── C2 · SEO ─────────────────────────────────────────────────────────────

function valueAt(doc: Record<string, unknown> | null, path: string | undefined): unknown {
  if (!doc || !path) return undefined
  return path.split('.').reduce<unknown>((acc, key) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined), doc)
}

export async function PageSeoScreen({ params }: { params: Params }) {
  const { session, page } = await resolvePage(params)
  const frame = frameProps(session, page, 'seo')
  if (!page.document || !page.seo) {
    return (
      <PageFrame {...frame} active="seo">
        <NoDocument page={page} />
      </PageFrame>
    )
  }
  const [doc, settings] = await Promise.all([loadPageDocument(page.document.id), loadSiteSettings()])
  if (!doc.value) {
    return (
      <PageFrame {...frame} active="seo">
        <NoDocument page={page} missing />
      </PageFrame>
    )
  }
  const seo = page.seo
  const text = (path: string | undefined) => {
    const v = valueAt(doc.value, path)
    return typeof v === 'string' ? v : ''
  }
  const ogImage = valueAt(doc.value, seo.ogImage) as { asset?: { _ref: string } } | undefined
  return (
    <PageFrame {...frame} active="seo">
      <SeoView
        pageId={page.id}
        path={page.path}
        domain={adminConfig.site.domain}
        siteName={settings.title || siteName}
        defaultTitle={page.path === '/' ? null : page.label}
        initial={{
          metaTitle: text(seo.metaTitle),
          metaDescription: text(seo.metaDescription),
          ogImage: ogImage?.asset?._ref ? ogImage : null,
          allowIndexing: valueAt(doc.value, seo.allowIndexing) !== false,
        }}
        settings={settings}
        readOnly={!can(session.role, 'content.write')}
        jsonLd={
          <Suspense fallback={<JsonLdSkeleton />}>
            <PageJsonLd path={page.path} />
          </Suspense>
        }
        headings={
          <Suspense fallback={<HeadingStructureSkeleton />}>
            <PageHeadingStructure path={page.path} />
          </Suspense>
        }
      />
    </PageFrame>
  )
}

// ─── C6 · SEO de la page article ──────────────────────────────────────────

export async function ArticleSeoScreen({ params }: { params: Params }) {
  const { session, page } = await resolvePage(params)
  const article = articleOf(page)
  if (!article || !page.article) notFound()
  const collection = article.collection
  const tabs: PageTab[] = [
    { value: 'content', label: 'Content', href: collection ? `/admin/cms/${collection.id}` : pageHref(page.id) },
    { value: 'seo', label: 'SEO', href: articleSeoHref(page.id) },
  ]
  const [settings, template, { options, total }, jsonLd] = await Promise.all([
    loadSiteSettings(),
    loadArticleTemplate(article.documentId, page.article.collection),
    loadArticleOptions(page.article.collection),
    loadArticleJsonLd(`${page.id}/slug`),
  ])
  const label = collection?.label ?? page.label
  // « post », « testimonial », « question » (CollectionDef.singular) : « with this question », « 9 FAQ questions ».
  const item = (collection?.singular ?? 'item').toLowerCase()
  return (
    <PageFrame
      title="slug:"
      meta={`${page.article.path} · article page`}
      editorHref={null}
      previewHref={options[0] ? publicUrl(page.article.path.replace(':slug', options[0].slug)) : null}
      tabs={tabs}
      active="seo"
    >
      <ArticleSeoView
        pageId={page.id}
        domain={adminConfig.site.domain}
        siteName={settings.title || siteName}
        pathPattern={page.article.path}
        collectionLabel={label}
        itemLabel={item}
        itemsLabel={total === 1 ? item : `${item}s`}
        variables={article.variables}
        imageFields={article.imageFields}
        initial={template.template}
        settings={settings}
        articles={options}
        total={total}
        readOnly={!can(session.role, 'content.write')}
        jsonLd={<JsonLdBlocks blocks={jsonLd} />}
      />
    </PageFrame>
  )
}
