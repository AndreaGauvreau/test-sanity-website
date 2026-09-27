import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import { ADMIN_ICON_SVG, ADMIN_ICON_URL } from '@/admin/shell/admin-icon'

/** Régression : chaque écran de l'admin laissait un 404 /favicon.ico (aucune icône déclarée sous /admin). */
vi.mock('@/admin/shell/AdminRoot', () => ({ AdminRoot: () => null }))
vi.mock('@/admin/ui/fonts', () => ({ adminFontClassName: 'f' }))

describe("icône de l'admin", () => {
  it('reprend exactement admin.svg du Design System', () => {
    const ds = readFileSync(join(process.cwd(), 'docs/admin/figma/design-system/icons/admin.svg'), 'utf8')
    expect(ADMIN_ICON_SVG.trim()).toBe(ds.trim())
  })

  it('est déclarée par les métadonnées du layout /admin, en data: (ni /favicon.ico, ni requête via le proxy)', async () => {
    const { metadata } = await import('@/app/admin/layout')
    const icons = metadata.icons as { icon: { url: string; type: string }; shortcut: string }
    expect(icons.icon).toEqual({ url: ADMIN_ICON_URL, type: 'image/svg+xml' })
    expect(icons.shortcut).toBe(ADMIN_ICON_URL)
    expect(ADMIN_ICON_URL.startsWith('data:image/svg+xml,')).toBe(true)
    expect(decodeURIComponent(ADMIN_ICON_URL.slice('data:image/svg+xml,'.length))).toBe(ADMIN_ICON_SVG)
  })
})
