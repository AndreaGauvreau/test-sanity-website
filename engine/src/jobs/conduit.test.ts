import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'vitest'
import type { AdminConfig, FieldDef } from '../../../src/admin/core/contracts'
import { resolveTextFields, systemAppend } from '../claude'
import { loadDesignSystem } from '../guards'

/**
 * Test de fumée sur le VRAI design system de Conduit (fichiers de site-adapter, lus sans rien écrire) : il se lance dès
 * que `src/editor/zones.json`, `src/styles/tokens.json` et `src/admin.config.ts` existent (sinon il est sauté).
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const FILES = ['src/editor/zones.json', 'src/styles/tokens.json', 'src/admin.config.ts']
const ready = FILES.every((file) => existsSync(path.join(ROOT, file)))

const zonesOf = (fields: readonly FieldDef[] | undefined): string[] =>
  (fields ?? []).flatMap((field) => [...(field.zone ? [field.zone] : []), ...zonesOf(field.fields)])

describe.skipIf(!ready)('design system réel de Conduit (site-adapter)', () => {
  it('se charge et se valide avec loadDesignSystem ; RULES.md présent ; fichiers des zones existants', async () => {
    const ds = await loadDesignSystem(ROOT)
    assert.ok(Object.keys(ds.zones).length > 0)
    assert.ok(ds.breakpoints.length > 0, 'points de rupture connus')
    assert.ok(systemAppend(ds).length > 100)
    for (const [id, zone] of Object.entries(ds.zones)) {
      for (const file of zone.files) assert.ok(existsSync(path.join(ROOT, file)), `${id} : ${file} absent`)
      if (zone.text?.source === 'sanity' && 'id' in zone.text.document) {
        const resolved = resolveTextFields(zone.text, { key: 'k1' })
        assert.ok(resolved.ok, `${id} : ${!resolved.ok ? resolved.error : ''}`)
      }
    }
  })

  it('les zones citées par admin.config.ts existent dans zones.json', async () => {
    const ds = await loadDesignSystem(ROOT)
    // Chemin calculé : le fichier n'existe peut-être pas encore (le typage ne doit pas en dépendre).
    const file = path.join(ROOT, 'src/admin.config.ts')
    const mod = (await import(/* @vite-ignore */ file)) as Record<string, unknown>
    const config = (mod.default ?? Object.values(mod).find((value) => !!value && typeof value === 'object' && 'pages' in (value as object))) as AdminConfig
    assert.ok(config?.pages, 'admin.config.ts exporte un AdminConfig')
    const cited = config.pages.flatMap((page) => page.sections.flatMap((section) => [...(section.zone ? [section.zone] : []), ...zonesOf(section.fields)]))
    for (const zone of cited) assert.ok(Object.hasOwn(ds.zones, zone), `zone inconnue : ${zone}`)
  })
})
