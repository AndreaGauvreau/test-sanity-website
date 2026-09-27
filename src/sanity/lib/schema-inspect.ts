/**
 * Lecture du schéma Sanity pour les TESTS (manifeste de l'admin, zones de l'éditeur) : types, champs et
 * règles de validation. Les règles sont exécutées avec une règle « enregistreuse » qui note required, max,
 * min et length (sans Sanity ni Studio). Jamais importé par le site.
 */

type AnyField = {
  name: string
  type: string
  fields?: AnyField[]
  of?: AnyField[]
  to?: { type: string }[]
  options?: { list?: (string | { value: string })[]; maxLength?: number }
  validation?: unknown
  hidden?: unknown
}

export type SchemaType = AnyField & { title?: string }

export type Rules = { required: boolean; max?: number; min?: number; length?: number }

/** Exécute une fonction de validation Sanity et relève ses contraintes. */
export function recordRules(validation: unknown): Rules {
  const rules: Rules = { required: false }
  if (typeof validation !== 'function') return rules
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        return (...args: unknown[]) => {
          if (prop === 'required') rules.required = true
          if (prop === 'max' && typeof args[0] === 'number') rules.max = args[0]
          if (prop === 'min' && typeof args[0] === 'number') rules.min = args[0]
          if (prop === 'length' && typeof args[0] === 'number') rules.length = args[0]
          return proxy
        }
      },
    },
  )
  ;(validation as (rule: unknown) => unknown)(proxy)
  return rules
}

export function typeIndex(types: readonly unknown[]): Map<string, SchemaType> {
  return new Map((types as SchemaType[]).map((type) => [type.name, type]))
}

/** Champs d'un type (objet nommé, objet en ligne, document). */
export function fieldsOf(field: AnyField, index: Map<string, SchemaType>): AnyField[] | undefined {
  if (field.fields) return field.fields
  const named = index.get(field.type)
  return named?.fields
}

/** Type « de base » d'un champ : string, text, image, cta, array, object… (un objet nommé garde son nom). */
export function baseType(field: AnyField, index: Map<string, SchemaType>): string {
  const named = index.get(field.type)
  if (named && named.type !== 'document' && named.type !== 'object') return named.type
  return field.type
}

/** Champ d'un type par son nom. */
export function childField(parent: AnyField, name: string, index: Map<string, SchemaType>): AnyField | undefined {
  return fieldsOf(parent, index)?.find((field) => field.name === name)
}

/** Membre (objet) d'un tableau : son type en ligne ou nommé. */
export function arrayMember(field: AnyField, index: Map<string, SchemaType>): AnyField | undefined {
  const member = field.of?.find((item) => item.type === 'object' || index.get(item.type)?.type === 'object')
  if (!member) return undefined
  return member.fields ? member : (index.get(member.type) as AnyField | undefined)
}

/**
 * Champ désigné par un chemin Sanity depuis un type de document : « hero.title »,
 * « features.items[_key=="$key"].title », « testimonial.cta.label ». Null si le chemin n'existe pas.
 */
export function resolvePath(root: AnyField, path: string, index: Map<string, SchemaType>): AnyField | null {
  let current: AnyField | undefined = root
  for (const raw of path.split('.')) {
    if (!current) return null
    const inArray = raw.endsWith(']')
    const name = raw.replace(/\[.*\]$/, '')
    const next: AnyField | undefined = childField(current, name, index)
    if (!next) return null
    if (inArray) {
      if (next.type !== 'array') return null
      current = arrayMember(next, index)
    } else current = next
  }
  return current ?? null
}

/** Valeurs d'une liste fermée (options.list). */
export function listValues(field: AnyField): string[] | undefined {
  return field.options?.list?.map((item) => (typeof item === 'string' ? item : item.value))
}
