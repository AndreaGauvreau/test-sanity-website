import type { TokensFile, ZonesFile } from '../../../src/admin/core/contracts'
import { buildDesignSystem, type DesignSystem } from '../guards/design-system'

/**
 * Données de TEST modelées sur Conduit (docs/admin/research/site-conduit.md). Ce n'est pas le vrai
 * `src/editor/zones.json` (site-adapter) : les tests du module ne dépendent pas de son contenu exact.
 */

const PAGE = { type: 'dockSchedulingPage', id: 'dockSchedulingPage' } as const
const HERO_FILES = ['src/components/sections/Hero/Hero.module.css', 'src/components/sections/Hero/Hero.tsx']

export const ZONES: ZonesFile = {
  controls: {},
  zones: {
    hero: {
      label: 'Section',
      section: 'Hero',
      files: HERO_FILES,
      selectors: ['.hero', '.actions'],
      controls: [],
      children: ['hero.title', 'hero.lede', 'hero.primaryCta'],
    },
    'hero.title': {
      label: 'Title',
      section: 'Hero',
      files: HERO_FILES,
      selectors: ['.title'],
      controls: [],
      text: { source: 'sanity', document: PAGE, fields: { 'hero.title': 80 } },
    },
    'hero.lede': {
      label: 'Lede',
      section: 'Hero',
      files: HERO_FILES,
      selectors: ['.lede'],
      controls: [],
      hideable: true,
      text: { source: 'sanity', document: PAGE, fields: { 'hero.lede': 200 } },
    },
    'hero.primaryCta': {
      label: 'Primary button',
      section: 'Hero',
      files: ['src/components/ui/Button/Button.module.css', 'src/components/ui/Button/Button.tsx'],
      selectors: ['.button'],
      controls: [],
      reach: 'every primary button of the site',
      text: { source: 'sanity', document: PAGE, fields: { 'hero.primaryCta.label': 30 } },
    },
    'features.card': {
      label: 'Card',
      section: 'Features',
      files: ['src/components/sections/Features/Features.module.css', 'src/components/sections/Features/Features.tsx'],
      selectors: ['.card', '.cardTitle', '.text'],
      controls: [],
      text: {
        source: 'sanity',
        document: PAGE,
        fields: { 'features.items[_key=="$key"].title': 40, 'features.items[_key=="$key"].text': 160 },
      },
    },
    'performance.benefit': {
      label: 'Benefit',
      section: 'Performance',
      files: ['src/components/sections/Performance/Performance.module.css', 'src/components/sections/Performance/Performance.tsx'],
      selectors: ['.benefit', '.benefitTitle', '.benefitText'],
      controls: [],
      text: {
        source: 'sanity',
        document: PAGE,
        // Contrat vérifié par engine-guards : un champ fermé figure aussi dans `fields`.
        fields: {
          'performance.benefits[_key=="$key"].title': 60,
          'performance.benefits[_key=="$key"].text': 160,
          'performance.benefits[_key=="$key"].icon': 20,
        },
        lines: { 'performance.benefits[_key=="$key"].title': 2 },
        closed: ['performance.benefits[_key=="$key"].icon'],
      },
    },
    'getStarted.title': {
      label: 'Title',
      section: 'Get started',
      files: ['src/components/sections/GetStarted/GetStarted.module.css', 'src/components/sections/GetStarted/GetStarted.tsx'],
      selectors: ['.title', '.muted'],
      controls: [],
      text: { source: 'sanity', document: PAGE, fields: { 'getStarted.title': 60, 'getStarted.titleMuted': 60 } },
    },
    'insights.card': {
      label: 'Article card',
      section: 'Insights',
      files: ['src/components/ui/PostCard/PostCard.module.css', 'src/components/ui/PostCard/PostCard.tsx'],
      selectors: ['.card', '.title'],
      controls: [],
      reach: 'every article card of the site',
      text: { source: 'sanity', document: { type: 'post', from: 'data-edit-doc' }, fields: { title: 90, category: 30 }, closed: ['category'] },
    },
    'integrations.logos': {
      label: 'Logos',
      section: 'Integrations',
      files: ['src/components/sections/Integrations/Integrations.module.css', 'src/components/sections/Integrations/Integrations.tsx'],
      selectors: ['.logos', '.logo'],
      controls: [],
      text: { source: 'code', files: ['src/components/sections/Integrations/Integrations.tsx'] },
    },
  },
}

/** Tokens modelés sur `src/styles/tokens.css` de Conduit (clé = nom de la custom property sans « -- », contrat zones.ts). */
export const TOKENS: TokensFile = {
  color: {
    label: 'Colors',
    tokens: {
      'color-text': { label: 'Text', value: '#232325' },
      'color-text-muted': { label: 'Text muted', value: '#717278' },
      'color-text-accent': { label: 'Text accent', value: '#ff5100' },
      'color-text-inverse': { label: 'Text inverse', value: '#ffffff' },
      'color-surface': { label: 'Surface', value: '#ffffff' },
      'color-surface-subtle': { label: 'Surface subtle', value: '#f8fafb' },
      'color-surface-brand': { label: 'Surface brand', value: '#193c80' },
      'color-accent': { label: 'Accent', value: '#ff5100' },
    },
  },
  font: {
    label: 'Fonts',
    locked: true,
    tokens: { 'font-sans': { label: 'Geist', value: 'var(--font-geist), ui-sans-serif, system-ui, sans-serif' } },
  },
  text: {
    label: 'Text styles',
    tokens: {
      'text-title-xl': { label: 'Title XL', value: '500 clamp(1.75rem, 1.25rem + 1.1111vw, 2.25rem) / 1 var(--font-sans)' },
      'text-title-xl-tracking': { label: 'Title XL tracking', value: '-0.04em' },
      'text-title-lg': { label: 'Title LG', value: '500 1.5rem / 1.2 var(--font-sans)' },
      'text-title-lg-tracking': { label: 'Title LG tracking', value: '-0.04em' },
      'text-body': { label: 'Body', value: '400 0.875rem / 1.2857 var(--font-sans)' },
      'text-body-strong': { label: 'Body strong', value: '500 0.875rem / 1.2857 var(--font-sans)' },
      'text-body-tracking': { label: 'Body tracking', value: '-0.016em' },
    },
  },
  layout: {
    label: 'Layout',
    locked: true,
    tokens: {
      'page-max': { label: 'Page max width', value: '80rem' },
      gutter: { label: 'Gutter', value: 'clamp(1.5rem, 5.5556vw, 5rem)' },
      'page-inset': { label: 'Page inset', value: 'max(var(--gutter), (100% - var(--page-max)) / 2)' },
      'section-space': { label: 'Section space', value: 'clamp(4rem, 3.25rem + 3.3333vw, 6.25rem)' },
      'section-space-lg': { label: 'Section space LG', value: 'clamp(4.5rem, 3.5rem + 4.4444vw, 7.5rem)' },
    },
  },
}

/** Points de rupture de Conduit (mobile-first, min-width). */
export const BREAKPOINTS = ['50.625rem', '64rem', '80rem', '90rem'] as const

export const RULES_FIXTURE = '# Conduit editor rules (fixture)\n\n- Rule one.\n'

/** Design system de test, construit par engine-guards (validation et politique réelles). */
export const designSystem = (rules: string | null = RULES_FIXTURE): DesignSystem =>
  buildDesignSystem({ tokens: TOKENS, zones: ZONES, rules, declared: DECLARED }, { breakpoints: [...BREAKPOINTS] })

/** Custom properties déclarées par tokens.css (comme les lit loadDesignSystem) : `--gutter`, pas `--layout-gutter`. */
export const DECLARED: ReadonlySet<string> = new Set(
  Object.values(TOKENS).flatMap((group) => Object.keys(group.tokens).map((key) => `--${key}`)),
)
