import type { AdminConfig, FieldDef, SectionDef } from '@/admin/core/contracts'

/**
 * Manifeste du site Conduit pour l'admin (contrat AdminConfig, src/admin/core/contracts/manifest.ts).
 * PUR : aucun import hors types. L'admin ne connaît le site que par ce fichier.
 *
 * Source de vérité des champs : le schéma Sanity (src/sanity/schemaTypes). src/admin.config.test.ts
 * vérifie que chaque champ déclaré ici existe dans le type Sanity, avec le même genre et les mêmes limites
 * (longueurs, bornes des tableaux, valeurs des listes). Libellés en anglais (interface de l'admin).
 * `zone` : zone de l'éditeur IA qui affiche le champ (src/editor/zones.json, lien « Open in AI editor »).
 * `itemType` (tableaux) : `_type` des éléments à créer ; `richText` (Portable Text) : options de l'éditeur riche ;
 * `source` (section) : id de la collection qui alimente la section (C1 « From CMS › … ») — tous vérifiés par le test.
 */

// ─── Briques ────────────────────────────────────────────────────────────────────────────────

const HREF_HELP = 'A full URL or a site path (/blog). Empty: inactive link (#).'

/** Bouton (type Sanity `cta`) : libellé (30) + destination. */
function cta(name: string, label: string, zone?: string, required = false): FieldDef {
  return {
    name,
    label,
    kind: 'cta',
    ...(required ? { required: true } : {}),
    ...(zone ? { zone } : {}),
    fields: [
      { name: 'label', label: 'Label', kind: 'string', required: true, maxLength: 30, help: 'Normal case: capitals come from the style.' },
      { name: 'href', label: 'Link', kind: 'url', help: HREF_HELP },
    ],
  }
}

const eyebrow = (zone: string, maxLength = 30): FieldDef => ({
  name: 'eyebrow',
  label: 'Eyebrow',
  kind: 'string',
  required: true,
  maxLength,
  help: 'The small label above the title.',
  zone,
})

/**
 * Section « Page » des pages listing /testimonials et /faq (documents testimonialsPage, faqPage) : textes de
 * l'en-tête et message sans élément. Vides : textes par défaut du site (src/lib/page-defaults.ts).
 */
function listingContent(defaults: { eyebrow: string; title: string; lede: string; emptyText: string }) {
  return {
    name: 'content',
    label: 'Page',
    fields: [
      { name: 'eyebrow', label: 'Eyebrow', kind: 'string', maxLength: 30, help: `The small label above the title. Empty: “${defaults.eyebrow}”.` },
      { name: 'title', label: 'Title', kind: 'string', maxLength: 60, help: `Page title (H1). Empty: “${defaults.title}”.` },
      { name: 'lede', label: 'Subtitle', kind: 'text', maxLength: 200, help: `The sentence under the title. Empty: “${defaults.lede}”.` },
      { name: 'emptyText', label: 'Empty list message', kind: 'string', maxLength: 80, help: `Shown while the collection is empty. Empty: “${defaults.emptyText}”.` },
    ],
  } satisfies SectionDef
}

const SEO = { metaTitle: 'seo.metaTitle', metaDescription: 'seo.metaDescription', ogImage: 'seo.ogImage', allowIndexing: 'seo.allowIndexing' }

const STATUS_FILTER = {
  field: 'status',
  label: 'Status',
  options: [
    { value: 'live', label: 'Live' },
    { value: 'draft', label: 'Draft' },
    { value: 'changed', label: 'Changed' },
  ],
} as const

/**
 * Date de mise en ligne (B5 « online since … ») : NEXT_PUBLIC_SITE_LAUNCHED_AT au format AAAA-MM-JJ, posée au
 * lancement du site. Absente ou invalide : pas de date (B5 compte alors depuis la première demande IA).
 */
export function siteLaunchedAt(raw: string | undefined): string | undefined {
  const value = raw?.trim() ?? ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value) ? value : undefined
}

const launchedAt = siteLaunchedAt(process.env.NEXT_PUBLIC_SITE_LAUNCHED_AT)

/** Texte riche (FieldDef.richText) : reflet des options `block` du schéma (src/admin.config.test.ts le vérifie). */
const POST_BODY_RICH_TEXT = {
  styles: ['normal', 'h2', 'h3', 'blockquote'],
  lists: ['bullet', 'number'],
  decorators: ['strong', 'em'],
  annotations: ['link'],
  blocks: ['image'],
}
const FAQ_ANSWER_RICH_TEXT = { styles: ['normal'], lists: [], decorators: ['strong', 'em'], annotations: ['link'], blocks: [] }

// ─── Manifeste ──────────────────────────────────────────────────────────────────────────────

const adminConfig = {
  site: {
    name: 'Conduit',
    domain: 'conduit.com',
    // URL publique (View site ↗). Variable publique : le manifeste est lu côté client aussi.
    url: process.env.NEXT_PUBLIC_SITE_URL || 'http://127.0.0.1:4040',
    ...(launchedAt ? { launchedAt } : {}),
  },
  settings: { type: 'siteSettings', id: 'siteSettings' },
  pages: [
    {
      id: 'home',
      label: 'Home',
      path: '/',
      document: { type: 'dockSchedulingPage', id: 'dockSchedulingPage' },
      aiEditor: true,
      seo: SEO,
      jsonLd: {
        file: 'src/components/sections/Faq/Faq.tsx',
        summary: 'FAQPage built from the published FAQ questions that have an answer.',
      },
      sections: [
        {
          name: 'hero',
          label: 'Hero',
          zone: 'hero',
          fields: [
            { name: 'title', label: 'Title', kind: 'string', required: true, maxLength: 70, help: 'The main title of the page (H1).', zone: 'hero.title' },
            { name: 'lede', label: 'Subtitle', kind: 'text', required: true, maxLength: 320, zone: 'hero.lede' },
            cta('primaryCta', 'Button 1', 'hero.primaryCta'),
            cta('secondaryCta', 'Button 2', 'hero.secondaryCta'),
            {
              name: 'ratings',
              label: 'Ratings',
              kind: 'array',
              max: 2,
              itemLabel: 'Rating',
              itemType: 'rating',
              zone: 'hero.rating',
              fields: [
                {
                  name: 'platform',
                  label: 'Platform',
                  kind: 'select',
                  required: true,
                  help: 'Chooses the logo shown before the text.',
                  options: [
                    { value: 'g2', label: 'G2' },
                    { value: 'capterra', label: 'Capterra' },
                  ],
                },
                { name: 'label', label: 'Text', kind: 'string', required: true, maxLength: 30, placeholder: '4.7 stars on G2' },
                { name: 'href', label: 'Review page', kind: 'url' },
              ],
            },
          ],
        },
        {
          name: 'features',
          label: 'Features',
          zone: 'features',
          fields: [
            {
              name: 'title',
              label: 'Section title (hidden)',
              kind: 'string',
              required: true,
              maxLength: 60,
              visuallyHidden: true,
              help: 'Not shown on screen: read by screen readers and search engines.',
            },
            {
              name: 'items',
              label: 'Cards',
              kind: 'array',
              required: true,
              min: 3,
              max: 3,
              itemLabel: 'Card',
              itemType: 'feature',
              zone: 'features.card',
              fields: [
                { name: 'title', label: 'Title', kind: 'string', required: true, maxLength: 50, zone: 'features.card.title' },
                { name: 'text', label: 'Text', kind: 'text', required: true, maxLength: 320, zone: 'features.card.text' },
              ],
            },
          ],
        },
        {
          name: 'system',
          label: 'Conduit System',
          zone: 'system',
          fields: [
            eyebrow('system.eyebrow'),
            { name: 'title', label: 'Title', kind: 'string', required: true, maxLength: 60, zone: 'system.title' },
            { name: 'lede', label: 'Subtitle', kind: 'text', required: true, maxLength: 220, zone: 'system.lede' },
            cta('cta', 'Button', 'system.cta'),
            {
              name: 'modules',
              label: 'Modules',
              kind: 'array',
              required: true,
              min: 3,
              max: 3,
              itemLabel: 'Module',
              itemType: 'module',
              zone: 'system.module',
              fields: [
                { name: 'title', label: 'Title', kind: 'string', required: true, maxLength: 30, zone: 'system.module.title' },
                { name: 'text', label: 'Text', kind: 'text', required: true, maxLength: 140, zone: 'system.module.text' },
                cta('link', 'Link', 'system.module.link'),
              ],
            },
          ],
        },
        {
          name: 'performance',
          label: 'Performance',
          zone: 'performance',
          fields: [
            eyebrow('performance.eyebrow'),
            { name: 'title', label: 'Title', kind: 'string', required: true, maxLength: 50, zone: 'performance.title' },
            {
              name: 'benefits',
              label: 'Benefits',
              kind: 'array',
              required: true,
              min: 3,
              max: 3,
              itemLabel: 'Benefit',
              itemType: 'benefit',
              zone: 'performance.benefit',
              fields: [
                {
                  name: 'icon',
                  label: 'Icon',
                  kind: 'select',
                  required: true,
                  options: [
                    { value: 'chartPieSlice', label: 'Pie chart' },
                    { value: 'speedometer', label: 'Speedometer' },
                    { value: 'calendarDots', label: 'Calendar' },
                  ],
                },
                {
                  name: 'title',
                  label: 'Title',
                  kind: 'text',
                  required: true,
                  maxLength: 60,
                  maxLines: 2,
                  help: 'Two short lines: press Enter where the title should break.',
                  zone: 'performance.benefit.title',
                },
                { name: 'text', label: 'Text', kind: 'text', required: true, maxLength: 150, zone: 'performance.benefit.text' },
              ],
            },
          ],
        },
        {
          name: 'customerStory',
          label: 'Customer story',
          zone: 'customerStory',
          fields: [
            eyebrow('customerStory.eyebrow'),
            { name: 'title', label: 'Title', kind: 'string', required: true, maxLength: 70, zone: 'customerStory.title' },
            cta('cta', 'Case study link', 'customerStory.cta'),
            { name: 'summary', label: 'Summary', kind: 'text', required: true, maxLength: 180, zone: 'customerStory.summary' },
            {
              name: 'stats',
              label: 'Key figures',
              kind: 'array',
              required: true,
              min: 1,
              max: 2,
              itemLabel: 'Figure',
              itemType: 'stat',
              zone: 'customerStory.stat',
              fields: [
                { name: 'value', label: 'Value', kind: 'string', required: true, maxLength: 8, placeholder: '80%', zone: 'customerStory.stat.value' },
                { name: 'label', label: 'Caption', kind: 'string', required: true, maxLength: 40, zone: 'customerStory.stat.label' },
              ],
            },
            {
              name: 'results',
              label: 'Results',
              kind: 'array',
              required: true,
              min: 1,
              max: 5,
              itemLabel: 'Result',
              itemType: 'result',
              zone: 'customerStory.result',
              fields: [{ name: 'label', label: 'Text', kind: 'string', required: true, maxLength: 60, zone: 'customerStory.result' }],
            },
          ],
        },
        {
          name: 'testimonial',
          label: 'Testimonial',
          zone: 'testimonial',
          source: { collection: 'testimonials', label: 'From CMS › Testimonials' },
          fields: [
            {
              name: 'item',
              label: 'Testimonial shown',
              kind: 'reference',
              to: ['testimonial'],
              help: 'From CMS › Testimonials. Empty: the first testimonial of the collection.',
              zone: 'testimonial.quote',
            },
            cta('cta', 'Button', 'testimonial.cta'),
            {
              name: 'title',
              label: 'Title for screen readers',
              kind: 'string',
              required: true,
              maxLength: 60,
              visuallyHidden: true,
              help: 'Not shown on screen: announces the section to screen readers and search engines.',
            },
          ],
        },
        {
          name: 'integrations',
          label: 'Integrations',
          zone: 'integrations',
          fields: [
            eyebrow('integrations.eyebrow'),
            { name: 'title', label: 'Title', kind: 'string', required: true, maxLength: 60, zone: 'integrations.title' },
            { name: 'body', label: 'Text', kind: 'text', required: true, maxLength: 200, zone: 'integrations.body' },
            cta('cta', 'Integrations link', 'integrations.cta'),
            { name: 'statValue', label: 'Key figure', kind: 'string', required: true, maxLength: 8, placeholder: '160+', zone: 'integrations.stat' },
            { name: 'statLabel', label: 'Key figure caption', kind: 'string', required: true, maxLength: 45, zone: 'integrations.stat' },
          ],
        },
        {
          name: 'tour',
          label: 'Tour',
          zone: 'tour',
          fields: [
            { name: 'title', label: 'Title', kind: 'string', required: true, maxLength: 40, zone: 'tour.title' },
            { name: 'lede', label: 'Text', kind: 'text', required: true, maxLength: 120, zone: 'tour.lede' },
            cta('cta', 'Button', 'tour.cta', true),
          ],
        },
        {
          name: 'faq',
          label: 'FAQ',
          zone: 'faq',
          source: { collection: 'faq', label: 'From CMS › FAQ' },
          fields: [
            eyebrow('faq.eyebrow', 40),
            { name: 'title', label: 'Title', kind: 'string', required: true, maxLength: 60, zone: 'faq.title' },
            {
              name: 'supportText',
              label: 'Help card text',
              kind: 'text',
              required: true,
              maxLength: 100,
              maxLines: 2,
              help: 'Line breaks are kept on large screens.',
              zone: 'faq.support.text',
            },
            cta('supportCta', 'Help card button', 'faq.support.cta'),
          ],
        },
        {
          name: 'insights',
          label: 'Articles',
          zone: 'insights',
          source: { collection: 'blog', label: '4 latest Blog posts' },
          fields: [
            eyebrow('insights.eyebrow'),
            { name: 'title', label: 'Title', kind: 'string', required: true, maxLength: 50, zone: 'insights.title' },
          ],
        },
        {
          name: 'getStarted',
          label: 'Get started',
          zone: 'getStarted',
          fields: [
            eyebrow('getStarted.eyebrow'),
            { name: 'title', label: 'Title', kind: 'string', required: true, maxLength: 60, zone: 'getStarted.title' },
            {
              name: 'titleMuted',
              label: 'Title (muted end)',
              kind: 'string',
              maxLength: 40,
              help: 'Continues the title in half-transparent white. Optional.',
              zone: 'getStarted.title.muted',
            },
            { name: 'text', label: 'Text', kind: 'text', required: true, maxLength: 160, zone: 'getStarted.text' },
            cta('primaryCta', 'Button 1', 'getStarted.primaryCta'),
            cta('secondaryCta', 'Button 2', 'getStarted.secondaryCta'),
          ],
        },
      ],
    },
    {
      id: 'blog',
      label: 'Blog',
      path: '/blog',
      document: { type: 'blogPage', id: 'blogPage' },
      aiEditor: false,
      seo: SEO,
      sections: [
        {
          name: 'content',
          label: 'Page',
          fields: [
            { name: 'title', label: 'Title', kind: 'string', maxLength: 40, help: 'Page title (H1). Empty: “Blog”.' },
            {
              name: 'emptyText',
              label: 'No posts message',
              kind: 'string',
              maxLength: 80,
              help: 'Shown while no post is published. Empty: “No articles published yet.”',
            },
          ],
        },
      ],
      article: {
        collection: 'post',
        path: '/blog/:slug',
        seoTemplate: { type: 'articleSeoTemplate', id: 'articleSeo-post' },
      },
    },
    {
      id: 'testimonials',
      label: 'Testimonials',
      path: '/testimonials',
      document: { type: 'testimonialsPage', id: 'testimonialsPage' },
      // Pas de zones de l'éditeur IA sur cette page (comme /blog) : formulaire C1 seulement.
      aiEditor: false,
      seo: SEO,
      sections: [
        listingContent({
          eyebrow: 'Testimonials',
          title: 'What our customers say',
          lede: 'Operations teams share how Conduit changed the way their docks run.',
          emptyText: 'No testimonials published yet.',
        }),
      ],
      article: {
        collection: 'testimonial',
        path: '/testimonials/:slug',
        seoTemplate: { type: 'articleSeoTemplate', id: 'articleSeo-testimonial' },
      },
    },
    {
      id: 'faq',
      label: 'FAQ',
      path: '/faq',
      document: { type: 'faqPage', id: 'faqPage' },
      aiEditor: false,
      seo: SEO,
      jsonLd: {
        file: 'src/app/(site)/faq/page.tsx',
        summary: 'FAQPage built from the published FAQ questions that have an answer (same as the Home FAQ section).',
      },
      sections: [
        listingContent({
          eyebrow: 'FAQ',
          title: 'Frequently asked questions',
          lede: 'Everything you need to know about Conduit Dock Scheduling.',
          emptyText: 'No questions published yet.',
        }),
      ],
      article: {
        collection: 'faq',
        path: '/faq/:slug',
        seoTemplate: { type: 'articleSeoTemplate', id: 'articleSeo-faq' },
      },
    },
  ],
  collections: [
    {
      id: 'blog',
      type: 'post',
      label: 'Blog',
      singular: 'Post',
      icon: 'database',
      titleField: 'title',
      imageField: 'image',
      slugField: 'slug',
      articlePath: '/blog/:slug',
      columns: [
        { field: 'title', label: 'Title', kind: 'title', width: 240 },
        { field: 'status', label: 'Status', kind: 'status', width: 120 },
        { field: 'slug', label: 'Slug', kind: 'text', width: 220 },
        { field: 'image', label: 'Cover', kind: 'image', width: 96 },
        { field: 'category', label: 'Category', kind: 'select', width: 130 },
        { field: 'publishedAt', label: 'Date', kind: 'date', width: 120 },
        { field: 'author', label: 'Author', kind: 'text', width: 150 },
        { field: 'excerpt', label: 'Excerpt', kind: 'text', width: 320 },
      ],
      fields: [
        { name: 'title', label: 'Title', kind: 'string', required: true, maxLength: 90, zone: 'post.card.title' },
        { name: 'slug', label: 'Slug', kind: 'slug', required: true, maxLength: 96, help: 'Generated from the title. Changing it changes the public URL.' },
        {
          name: 'category',
          label: 'Category',
          kind: 'select',
          required: true,
          options: [
            { value: 'Operations', label: 'Operations' },
            { value: "Buyer's guide", label: "Buyer's guide" },
            { value: 'Analysis', label: 'Analysis' },
          ],
          zone: 'post.card.category',
        },
        { name: 'publishedAt', label: 'Date', kind: 'date', required: true },
        { name: 'author', label: 'Author', kind: 'string', maxLength: 60 },
        { name: 'excerpt', label: 'Excerpt', kind: 'text', required: true, maxLength: 160 },
        { name: 'image', label: 'Cover image', kind: 'image', required: true, help: 'Alt text is stored on the image, in Media.' },
        { name: 'content', label: 'Body', kind: 'portableText', required: true, richText: POST_BODY_RICH_TEXT },
      ],
      orderable: true,
      defaultSort: { field: '_updatedAt', direction: 'desc' },
      searchFields: ['title', 'excerpt', 'author'],
      filters: [
        STATUS_FILTER,
        {
          field: 'category',
          label: 'Category',
          options: [
            { value: 'Operations', label: 'Operations' },
            { value: "Buyer's guide", label: "Buyer's guide" },
            { value: 'Analysis', label: 'Analysis' },
          ],
        },
      ],
    },
    {
      id: 'testimonials',
      type: 'testimonial',
      label: 'Testimonials',
      singular: 'Testimonial',
      icon: 'database',
      titleField: 'name',
      slugField: 'slug',
      articlePath: '/testimonials/:slug',
      columns: [
        { field: 'name', label: 'Name', kind: 'title', width: 200 },
        { field: 'status', label: 'Status', kind: 'status', width: 120 },
        { field: 'slug', label: 'Slug', kind: 'text', width: 220 },
        { field: 'company', label: 'Company', kind: 'text', width: 220 },
        { field: 'role', label: 'Role', kind: 'text', width: 180 },
        { field: 'quote', label: 'Quote', kind: 'text', width: 360 },
      ],
      fields: [
        { name: 'quote', label: 'Quote', kind: 'text', required: true, maxLength: 320, help: 'Without quotation marks: the site adds them.', zone: 'testimonial.quote.text' },
        { name: 'name', label: 'Name', kind: 'string', required: true, maxLength: 50, zone: 'testimonial.quote.author' },
        { name: 'role', label: 'Role', kind: 'string', maxLength: 60, zone: 'testimonial.quote.author' },
        { name: 'company', label: 'Company', kind: 'string', required: true, maxLength: 60, zone: 'testimonial.quote.author' },
        { name: 'slug', label: 'Slug', kind: 'slug', required: true, maxLength: 96, help: 'Generated from the name. Changing it changes the public URL.' },
        { name: 'caseStudyUrl', label: 'Case study link', kind: 'url', help: 'Default destination of the “Read the case study” button.' },
      ],
      orderable: true,
      defaultSort: { field: 'orderRank', direction: 'asc' },
      searchFields: ['name', 'company', 'quote'],
      filters: [STATUS_FILTER],
    },
    {
      id: 'faq',
      type: 'faq',
      label: 'FAQ',
      singular: 'Question',
      icon: 'database',
      titleField: 'question',
      slugField: 'slug',
      articlePath: '/faq/:slug',
      columns: [
        { field: 'question', label: 'Question', kind: 'title', width: 420 },
        { field: 'status', label: 'Status', kind: 'status', width: 120 },
        { field: 'slug', label: 'Slug', kind: 'text', width: 260 },
      ],
      fields: [
        { name: 'question', label: 'Question', kind: 'string', required: true, maxLength: 100, zone: 'faq.item.question' },
        { name: 'slug', label: 'Slug', kind: 'slug', required: true, maxLength: 96, help: 'Generated from the question. Changing it changes the public URL.' },
        {
          name: 'answer',
          label: 'Answer',
          kind: 'portableText',
          required: true,
          help: 'A question without an answer is not shown on the site.',
          richText: FAQ_ANSWER_RICH_TEXT,
        },
      ],
      orderable: true,
      defaultSort: { field: 'orderRank', direction: 'asc' },
      searchFields: ['question'],
      filters: [STATUS_FILTER],
    },
  ],
  articleSeoTemplates: [
    {
      collection: 'post',
      document: { type: 'articleSeoTemplate', id: 'articleSeo-post' },
      // Mêmes variables que POST_TEMPLATE_VARIABLES (schéma) et src/lib/template-variables.ts.
      variables: [
        { token: 'title', label: 'Title', path: 'title' },
        { token: 'slug', label: 'Slug', path: 'slug.current' },
        { token: 'date', label: 'Date', path: 'publishedAt' },
        { token: 'excerpt', label: 'Excerpt', path: 'excerpt' },
        { token: 'cover', label: 'Cover', path: 'image' },
        { token: 'author', label: 'Author', path: 'author' },
        { token: 'category', label: 'Category', path: 'category' },
      ],
    },
    {
      collection: 'testimonial',
      document: { type: 'articleSeoTemplate', id: 'articleSeo-testimonial' },
      // Mêmes variables que TESTIMONIAL_TEMPLATE_VARIABLES (schéma) et src/lib/article-values.ts.
      variables: [
        { token: 'name', label: 'Name', path: 'name' },
        { token: 'slug', label: 'Slug', path: 'slug.current' },
        { token: 'company', label: 'Company', path: 'company' },
        { token: 'role', label: 'Role', path: 'role' },
        { token: 'quote', label: 'Quote', path: 'quote' },
      ],
    },
    {
      collection: 'faq',
      document: { type: 'articleSeoTemplate', id: 'articleSeo-faq' },
      // Mêmes variables que FAQ_TEMPLATE_VARIABLES (schéma) et src/lib/article-values.ts ; {{answer}} = texte
      // brut de la réponse, 160 caractères au plus.
      variables: [
        { token: 'question', label: 'Question', path: 'question' },
        { token: 'slug', label: 'Slug', path: 'slug.current' },
        { token: 'answer', label: 'Answer (plain text, 160 characters)', path: 'answer' },
      ],
    },
  ],
} satisfies AdminConfig

export default adminConfig

export { adminConfig }
