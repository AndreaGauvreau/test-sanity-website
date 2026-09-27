import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

import { ADMIN_ROLES, can, type Capability } from '@/admin/core/contracts/roles'

import { isShellPathRefused, requiredShellCapability } from './access'

/**
 * Droit exigé par une URL de la coque, lu par le layout AVANT tout streaming (FOLLOWUPS #21) : une page refusée
 * répond une vraie 404. La table doit rester alignée sur les `requireCapability` des pages (test de dérive).
 */

describe('requiredShellCapability', () => {
  it('pages réservées : Code (Kuartz), Team (client), Publish et Versions, CMS, Media', () => {
    expect(requiredShellCapability('/admin/settings/code')).toBe('settings.code')
    expect(requiredShellCapability('/admin/settings/team')).toBe('settings.team')
    expect(requiredShellCapability('/admin/publish')).toBe('publish.run')
    expect(requiredShellCapability('/admin/publish/versions')).toBe('publish.run')
    expect(requiredShellCapability('/admin/cms')).toBe('content.write')
    expect(requiredShellCapability('/admin/cms/blog/abc')).toBe('content.write')
    expect(requiredShellCapability('/admin/media')).toBe('content.write')
  })

  it('pages ouvertes à tous les rôles connectés, et chemins voisins qui ne sont pas des préfixes', () => {
    for (const path of ['/admin', '/admin/settings/general', '/admin/settings/usage', '/admin/pages/home/seo', '/admin/xyz']) {
      expect(requiredShellCapability(path)).toBeNull()
    }
    expect(requiredShellCapability('/admin/settings/teamwork')).toBeNull()
    expect(requiredShellCapability('/admin/mediakit')).toBeNull()
  })

  it('ignore la requête, le fragment et la barre finale ; décode le chemin ; en-tête absent → null', () => {
    expect(requiredShellCapability('/admin/settings/team?tab=1')).toBe('settings.team')
    expect(requiredShellCapability('/admin/settings/team/')).toBe('settings.team')
    expect(requiredShellCapability('/admin/settings/code#x')).toBe('settings.code')
    expect(requiredShellCapability('/admin/settings/%74eam')).toBe('settings.team')
    expect(requiredShellCapability('/admin/settings/%E0%A4%A')).toBeNull()
    expect(requiredShellCapability(null)).toBeNull()
    expect(requiredShellCapability(undefined)).toBeNull()
    expect(requiredShellCapability('')).toBeNull()
  })
})

describe('isShellPathRefused', () => {
  it('Kuartz : Team refusé, Code permis ; client : l’inverse ; editor : ni Code ni Team', () => {
    expect(isShellPathRefused('kuartz', '/admin/settings/team')).toBe(true)
    expect(isShellPathRefused('kuartz', '/admin/settings/code')).toBe(false)
    expect(isShellPathRefused('client', '/admin/settings/code')).toBe(true)
    expect(isShellPathRefused('client', '/admin/settings/team')).toBe(false)
    expect(isShellPathRefused('editor', '/admin/settings/code')).toBe(true)
    expect(isShellPathRefused('editor', '/admin/settings/team')).toBe(true)
  })

  it('pages sans droit particulier : jamais refusées', () => {
    for (const role of ADMIN_ROLES) {
      expect(isShellPathRefused(role, '/admin')).toBe(false)
      expect(isShellPathRefused(role, '/admin/pages/home')).toBe(false)
      expect(isShellPathRefused(role, null)).toBe(false)
    }
  })
})

// ─── Dérive : la table suit les gardes réelles des pages de la coque ─────────────────────────────────────────

const SHELL_DIR = join(process.cwd(), 'src/app/admin/(shell)')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

/** Capacité exigée par un fichier de route (`requireCapability('x')`), ou null. */
function guardOf(file: string): Capability | null {
  const match = /requireCapability\(\s*'([a-z.]+)'/.exec(readFileSync(file, 'utf8'))
  return (match?.[1] as Capability | undefined) ?? null
}

/** Dossier de la coque → URL d'exemple (groupes retirés, segments dynamiques remplacés par une valeur). */
function sampleUrl(dir: string): string {
  const segments = relative(SHELL_DIR, dir)
    .split(sep)
    .filter((s) => s !== '' && !/^\(.*\)$/.test(s))
    .map((s) => (s.startsWith('[') ? 'sample' : s))
  return ['/admin', ...segments].join('/').replace(/\/$/, '')
}

describe('dérive entre la table et les pages de src/app/admin/(shell)', () => {
  const pages = walk(SHELL_DIR).filter((f) => f.endsWith(`${sep}page.tsx`))

  it('trouve les pages de la coque', () => {
    expect(pages.length).toBeGreaterThan(5)
  })

  it.each(pages.map((p) => [relative(SHELL_DIR, p), p]))('%s : même droit que sa garde (page ou layout parent)', (_, page) => {
    // Garde de la page, sinon du layout le plus proche entre la page et la coque.
    const dir = dirname(page)
    let expected = guardOf(page)
    for (let d = dir; expected === null && d !== SHELL_DIR && d.startsWith(SHELL_DIR); d = dirname(d)) {
      const layout = join(d, 'layout.tsx')
      if (existsSync(layout)) expected = guardOf(layout)
    }
    const url = sampleUrl(dir)
    expect(requiredShellCapability(url), url).toBe(expected)
    // Et la table n'exige jamais un droit qu'aucun rôle n'a.
    if (expected) expect(ADMIN_ROLES.some((r) => can(r, expected))).toBe(true)
  })
})
