import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import type { FieldDef, FieldKind, SectionDef, ZonesFile } from '@/admin/core/contracts'
import { POST_TEMPLATE_VARIABLES } from '@/sanity/schemaTypes/articleSeoTemplate'
import { SINGLETON_IDS, schemaTypes } from '@/sanity/schemaTypes'
import {
  arrayMember,
  baseType,
  childField,
  listValues,
  recordRules,
  resolvePath,
  typeIndex,
  type SchemaType,
} from '@/sanity/lib/schema-inspect'

import adminConfig from './admin.config'

// Le manifeste doit décrire le schéma tel qu'il est : champs existants, même genre, mêmes limites.
const index = typeIndex(schemaTypes)
const zones = (JSON.parse(readFileSync(path.join(__dirname, 'editor/zones.json'), 'utf8')) as ZonesFile).zones

/** Genres du manifeste → types Sanity acceptés. */
const KIND_TYPES: Record<FieldKind, string[]> = {
  string: ['string'],
  text: ['text'],
  url: ['url'],
  slug: ['slug'],
  cta: ['cta'],
  image: ['image'],
  portableText: ['array'],
  reference: ['reference'],
  select: ['string'],
  number: ['number'],
  boolean: ['boolean'],
  date: ['date', 'datetime'],
  array: ['array'],
  object: ['object'],
}

type Field = NonNullable<ReturnType<typeof childField>>

/** Compare un champ du manifeste à son champ Sanity ; renvoie les écarts (chemin lisible). */
function compare(def: FieldDef, field: Field | undefined, where: string): string[] {
  if (!field) return [`${where} : absent du schéma`]
  const problems: string[] = []
  const type = baseType(field, index)
  if (!KIND_TYPES[def.kind].includes(type)) problems.push(`${where} : genre ${def.kind}, type Sanity ${type}`)
  const rules = recordRules(field.validation)
  if (Boolean(def.required) !== rules.required) problems.push(`${where} : required ${Boolean(def.required)} ≠ ${rules.required}`)
  if (def.kind === 'slug') {
    if (def.maxLength !== field.options?.maxLength) problems.push(`${where} : maxLength ${def.maxLength} ≠ ${field.options?.maxLength}`)
  } else if (def.kind === 'array') {
    const min = rules.length ?? rules.min
    const max = rules.length ?? rules.max
    if (def.min !== min || def.max !== max) problems.push(`${where} : bornes ${def.min}-${def.max} ≠ ${min}-${max}`)
  } else if (def.maxLength !== rules.max) {
    problems.push(`${where} : maxLength ${def.maxLength} ≠ ${rules.max}`)
  }
  if (def.kind === 'select') {
    const values = def.options?.map((option) => option.value)
    if (JSON.stringify(values) !== JSON.stringify(listValues(field))) problems.push(`${where} : options ${values} ≠ ${listValues(field)}`)
  }
  if (def.kind === 'portableText' && !field.of?.some((member) => member.type === 'block')) {
    problems.push(`${where} : pas de Portable Text`)
  }
  if (def.kind === 'reference' && JSON.stringify(def.to) !== JSON.stringify(field.to?.map((to) => to.type))) {
    problems.push(`${where} : références ${def.to} ≠ ${field.to?.map((to) => to.type)}`)
  }
  if (def.fields) {
    const container = def.kind === 'array' ? arrayMember(field, index) : field
    for (const child of def.fields) {
      problems.push(...compare(child, container ? childField(container, child.name, index) : undefined, `${where}.${child.name}`))
    }
  }
  if (def.zone && !Object.hasOwn(zones, def.zone)) problems.push(`${where} : zone inconnue ${def.zone}`)
  return problems
}

const docType = (name: string) => {
  const type = index.get(name)
  expect(type, `type ${name}`).toBeDefined()
  expect(type?.type).toBe('document')
  return type as SchemaType
}

describe('admin.config ↔ schéma Sanity', () => {
  it('réglages : document unique siteSettings', () => {
    docType(adminConfig.settings.type)
    expect(adminConfig.settings.id).toBe(SINGLETON_IDS.siteSettings)
  })

  it.each(adminConfig.pages.map((page) => [page.id, page] as const))('page %s : sections, champs, limites, zones', (_id, page) => {
    const document = page.document!
    const type = docType(document.type)
    expect(Object.values(SINGLETON_IDS)).toContain(document.id)
    const problems: string[] = []
    for (const section of page.sections as readonly SectionDef[]) {
      const field = childField(type, section.name, index)
      if (!field) {
        problems.push(`${page.id}.${section.name} : section absente du document`)
        continue
      }
      if (section.zone && !Object.hasOwn(zones, section.zone)) problems.push(`${page.id}.${section.name} : zone inconnue`)
      for (const def of section.fields) {
        problems.push(...compare(def, childField(field, def.name, index) ?? undefined, `${page.id}.${section.name}.${def.name}`))
      }
    }
    for (const fieldPath of Object.values(page.seo ?? {})) {
      if (!resolvePath(type, fieldPath, index)) problems.push(`${page.id} : SEO ${fieldPath} absent`)
    }
    expect(problems).toEqual([])
  })

  it('la page d’accueil couvre les 11 sections du document, dans l’ordre du site', () => {
    const home = adminConfig.pages.find((page) => page.id === 'home')!
    expect(home.sections.map((section) => section.name)).toEqual([
      'hero',
      'features',
      'system',
      'performance',
      'customerStory',
      'testimonial',
      'integrations',
      'tour',
      'faq',
      'insights',
      'getStarted',
    ])
  })

  it.each(adminConfig.collections.map((collection) => [collection.id, collection] as const))(
    'collection %s : champs du panneau C4, colonnes, tri, filtres, recherche',
    (_id, collection) => {
      const type = docType(collection.type)
      const problems: string[] = []
      for (const def of collection.fields) {
        problems.push(...compare(def, childField(type, def.name, index) ?? undefined, `${collection.id}.${def.name}`))
      }
      // `status` est calculé (Live / Draft / Changed), `_updatedAt` est un champ système.
      const known = (name: string) => ['status', '_updatedAt', '_createdAt'].includes(name) || Boolean(childField(type, name, index))
      const referenced = [
        collection.titleField,
        collection.imageField,
        collection.slugField,
        collection.defaultSort.field,
        ...collection.columns.map((column) => column.field),
        ...collection.searchFields,
        ...(collection.filters ?? []).map((filter) => filter.field),
      ].filter((name): name is string => Boolean(name))
      for (const name of referenced) if (!known(name)) problems.push(`${collection.id} : ${name} absent`)
      if (collection.orderable && !childField(type, 'orderRank', index)) problems.push(`${collection.id} : orderRank absent`)
      expect(problems).toEqual([])
    },
  )

  it('modèle SEO des pages article : document à id sans point, variables = champs de l’article', () => {
    for (const template of adminConfig.articleSeoTemplates) {
      docType(template.document.type)
      expect(template.document.id).not.toContain('.')
      expect(template.variables.map((variable) => variable.token)).toEqual([...POST_TEMPLATE_VARIABLES])
      const post = docType(template.collection)
      for (const variable of template.variables) {
        expect(resolvePath(post, variable.path.replace(/\.current$/, ''), index), variable.path).not.toBeNull()
      }
    }
    const blog = adminConfig.pages.find((page) => page.id === 'blog')!
    expect(blog.article?.seoTemplate).toEqual(adminConfig.articleSeoTemplates[0].document)
  })

  it('le manifeste est pur : aucun import autre que des types', () => {
    const source = readFileSync(path.join(__dirname, 'admin.config.ts'), 'utf8')
    const imports = source.match(/^import .*$/gm) ?? []
    expect(imports.every((line) => line.startsWith('import type '))).toBe(true)
  })
})
