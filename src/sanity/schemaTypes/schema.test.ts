import { describe, expect, it } from 'vitest'

import { SITE_SETTINGS_QUERY } from '@/sanity/lib/queries'
import { arrayMember, childField, recordRules, typeIndex } from '@/sanity/lib/schema-inspect'

import { schemaTypes } from '.'

const index = typeIndex(schemaTypes)

describe('schéma : champs demandés par la relecture (vague 3)', () => {
  it('siteSettings.scripts[].signature : chaîne cachée et en lecture seule dans le Studio (SEC-04)', () => {
    const scripts = childField(index.get('siteSettings')!, 'scripts', index)!
    const signature = childField(arrayMember(scripts, index)!, 'signature', index) as { type: string; hidden?: unknown; readOnly?: unknown }
    expect(signature).toMatchObject({ type: 'string', hidden: true, readOnly: true })
  })

  it('SITE_SETTINGS_QUERY lit enabled et signature (vérification au rendu)', () => {
    expect(SITE_SETTINGS_QUERY).toMatch(/scripts\[enabled != false\]\{[^}]*\benabled\b[^}]*\bsignature\b/)
  })

  it('aiUsage.request : chaîne de 120 caractères au plus (contrat AiUsageDoc.request, FOLLOWUPS #16)', () => {
    const request = childField(index.get('aiUsage')!, 'request', index)!
    expect(request.type).toBe('string')
    expect(recordRules(request.validation)).toMatchObject({ required: false, max: 120 })
  })
})
