import { createRequire } from 'node:module'

import { describe, expect, it } from 'vitest'

import { config } from '@/proxy'

/**
 * Le matcher de src/proxy.ts passé par la VRAIE conversion de Next (get-page-static-info) : un matcher invalide
 * ferait quitter `next dev` (process.exit), et un matcher trop large rendrait les envois > 10 Mo (QA-1).
 */
const require = createRequire(import.meta.url)
const { getMiddlewareMatchers } = require('next/dist/build/analysis/get-page-static-info.js') as {
  getMiddlewareMatchers: (m: string[], cfg: object) => { regexp: string }[]
}

const matchers = getMiddlewareMatchers(config.matcher, {}).map((m) => new RegExp(m.regexp))
const proxied = (path: string) => matchers.some((re) => re.test(path))

describe('matcher du proxy', () => {
  it('régression QA-1 : les route handlers d’envoi de l’admin sont hors du proxy (pas de troncature à 10 Mo)', () => {
    expect(proxied('/admin/media/upload')).toBe(false)
    expect(proxied('/admin/pages/home/image')).toBe(false)
    expect(proxied('/admin/pages/about-us/image')).toBe(false)
  })
  it('tout le reste de l’admin, du site et du Studio passe par le proxy', () => {
    for (const path of [
      '/',
      '/blog/x',
      '/admin',
      '/admin/media',
      '/admin/media/uploads',
      '/admin/media/upload-x',
      '/admin/pages/home',
      '/admin/pages/home/images',
      '/admin/pages/a/b/image',
      '/admin/settings/code',
      '/admin/api/engine/health',
      '/studio',
      '/api/revalidate',
    ]) {
      expect(proxied(path), path).toBe(true)
    }
  })
  it('fichiers de build, optimiseur d’images et HMR exclus', () => {
    expect(proxied('/_next/static/chunks/a.js')).toBe(false)
    expect(proxied('/_next/static/media/font.woff2')).toBe(false)
    expect(proxied('/_next/image')).toBe(false)
    expect(proxied('/_next/webpack-hmr')).toBe(false)
  })
  it('régression SEC-06 / FOLLOWUPS #39 : préfixes EXACTS, rien d’autre ne contourne le proxy (ni le jeton d’aperçu)', () => {
    for (const path of [
      '/__nextjs_launch-editor',
      '/__nextjs_original-stack-frames',
      '/__nextjs_source-map',
      '/__nextjs',
      '/_next/staticx',
      '/_next/static',
      '/_next/imagex',
      '/_next/image/x',
      '/_next/webpack-hmrx',
      '/_next/webpack-hmr/x',
      '/_next/data/build/index.json',
      '/_nextjs',
    ]) {
      expect(proxied(path), path).toBe(true)
    }
  })
  it('le littéral reste convertible par Next 16 (sinon next dev quitterait)', () => {
    expect(config.matcher).toHaveLength(1)
    expect(matchers.length).toBeGreaterThan(0)
    expect(matchers.every((re) => re instanceof RegExp)).toBe(true)
  })
})
