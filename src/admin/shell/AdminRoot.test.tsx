/** @vitest-environment jsdom */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { AdminRoot, COMPUTER_ONLY_MESSAGE } from './AdminRoot'

afterEach(cleanup)

describe('AdminRoot — racine de /admin et garde < 1024 px', () => {
  it('pose data-kz-admin, data-theme="dark" et les polices sur le même élément', () => {
    const { container } = render(
      <AdminRoot fontClassName="font-a font-b">
        <p>Screen</p>
      </AdminRoot>,
    )
    const root = container.firstElementChild as HTMLElement
    expect(root.hasAttribute('data-kz-admin')).toBe(true)
    expect(root.getAttribute('data-theme')).toBe('dark')
    expect(root.className).toContain('font-a font-b')
    expect(screen.getByText('Screen')).toBeTruthy()
  })

  it('le message du Figma est présent, hors de l’admin (affiché seulement sous 1024 px)', () => {
    const { container } = render(<AdminRoot>x</AdminRoot>)
    const guard = container.querySelector('[data-kz-computer-guard]')!
    expect(guard.textContent).toBe(COMPUTER_ONLY_MESSAGE)
    expect(COMPUTER_ONLY_MESSAGE).toBe('This admin is designed for a computer.')
    expect(container.querySelector('[data-kz-admin-app]')!.contains(guard)).toBe(false)
  })

  it('CSS : sous 1024 px l’admin est masqué et la garde affichée ; au-dessus la garde est masquée', () => {
    const css = readFileSync(join(process.cwd(), 'src/admin/shell/AdminRoot.module.css'), 'utf8')
    expect(css).toMatch(/\.guard\s*\{\s*display:\s*none;/)
    const media = css.slice(css.indexOf('@media (max-width: 1023.98px)'))
    expect(media).toMatch(/\.app\s*\{\s*display:\s*none;/)
    expect(media).toMatch(/\.guard\s*\{\s*display:\s*flex;/)
  })

  it('géométrie de la coque exposée sur la racine (portails compris) : --kz-sidebar-width, --kz-topbar-height', () => {
    const root = readFileSync(join(process.cwd(), 'src/admin/shell/AdminRoot.module.css'), 'utf8')
    const rootRule = root.slice(root.indexOf('.root {'), root.indexOf('}', root.indexOf('.root {')))
    expect(rootRule).toMatch(/--kz-sidebar-width:\s*240px;/)
    expect(rootRule).toMatch(/--kz-topbar-height:\s*48px;/)
    // La coque s'en sert elle-même : une seule source pour la largeur de la sidebar.
    const shell = readFileSync(join(process.cwd(), 'src/admin/shell/Shell.module.css'), 'utf8')
    expect(shell).toMatch(/\.sidebar\s*\{[^}]*flex:\s*0 0 var\(--kz-sidebar-width\)/)
  })
})
