/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest'

import {
  LIVE_PAGE_HEIGHT,
  LIVE_SCALE,
  MINIATURE,
  assetHash,
  centerScroll,
  cleanPageHtml,
  containBox,
  fallbackArea,
  faviconLayout,
  findAssetElements,
  frameBox,
  livePagePath,
  miniatureModes,
  pickTarget,
  socialLayout,
  type Box,
} from './usage-preview'
import { lightboxBounds, lightboxCaption, lightboxImageSize, lightboxModalWidth, originFrom, previewRatio } from './preview'
import type { UsagePreview } from './usage'

const HASH = '9c3511be851bd0f3eaf2a14385de57d7de0584fa'
const OTHER = '14c0cde81ab666068128ab524756acb839f11262'
const CDN = `https://cdn.sanity.io/images/dwa2djm3/development/${HASH}-800x806.jpg`

function page(html: string): Document {
  const doc = document.implementation.createHTMLDocument('page')
  doc.body.innerHTML = html
  return doc
}

describe('cleanPageHtml (copie nettoyée de la page pour l’iframe srcdoc)', () => {
  // Page telle que Next la sert en production : scripts, préchargements, RSC en ligne, GTM (script + <noscript>).
  const served = `<!DOCTYPE html><html lang="en" class="geist_variable"><head>
    <meta charset="utf-8"><meta http-equiv="refresh" content="0;url=https://evil.example/">
    <base href="https://old.example/">
    <link rel="stylesheet" href="/_next/static/chunks/site.css" data-precedence="next">
    <link rel="preload" as="script" fetchpriority="low" href="/_next/static/chunks/webpack.js">
    <link rel="modulepreload" href="/_next/static/chunks/app.js">
    <link rel="prefetch" href="/blog">
    <link rel="preconnect" href="https://www.googletagmanager.com">
    <link rel="preload" as="font" href="/_next/static/media/font.woff2" crossorigin="">
    <link rel="preload" as="image" imagesrcset="${CDN}?w=640 640w">
    <style>.hero{background:#000}</style>
    <script src="/_next/static/chunks/main.js" async></script>
    <script>(function(w,d,s,l,i){})(window,document,'script','dataLayer','GTM-KK83GHRF')</script>
    <script type="application/ld+json">{"@type":"Article"}</script>
  </head><body class="site">
    <noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-KK83GHRF" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
    <main onclick="alert(1)">
      <img id="cover" alt="Forklift" loading="lazy" onload="track()" onerror="track()" srcset="${CDN}?w=640 640w" src="/_next/image?url=${encodeURIComponent(CDN)}&w=1080&q=75" style="background-image:url(data:image/svg+xml;base64,AAAA)">
      <picture><source srcset="${CDN}?fm=webp 1x" type="image/webp"><img id="pic" src="/fallback.jpg"></picture>
      <video id="clip" src="/intro.mp4" autoplay muted poster="${CDN}?w=960"><source src="/intro.webm" type="video/webm"><track src="/captions.vtt"></video>
      <audio src="/jingle.mp3" autoplay></audio>
      <a id="bad" href="javascript:alert(1)">x</a><a id="ok" href="/blog">Blog</a>
      <iframe src="https://www.youtube.com/embed/x"></iframe><object data="/x.swf"></object><embed src="/y.swf">
      <svg><script>alert(1)</script><circle r="1"></circle></svg>
    </main>
    <script>self.__next_f.push([1,"payload"])</script>
  </body></html>`
  const cleaned = () => {
    const html = cleanPageHtml(served, 'http://127.0.0.1:4040/blog/how-to')
    return { html, doc: new DOMParser().parseFromString(html, 'text/html') }
  }

  it('retire tout ce qui exécute ou appelle du code : script (JS, JSON-LD, SVG), noscript (iframe GTM), iframe, object, embed, audio, préchargements de JS', () => {
    const { html, doc } = cleaned()
    expect(doc.querySelectorAll('script, noscript, iframe, object, embed, audio').length).toBe(0)
    expect(html).not.toContain('googletagmanager')
    expect(html).not.toContain('__next_f')
    expect(html).not.toMatch(/webpack\.js|app\.js|main\.js/)
    expect(doc.querySelector('link[rel="prefetch"], link[rel="modulepreload"], link[rel="preconnect"], link[as="script"]')).toBeNull()
    expect(doc.querySelector('meta[http-equiv]')).toBeNull()
  })

  it('retire les attributs on* et les URL javascript:', () => {
    const { doc } = cleaned()
    const withHandlers = Array.from(doc.querySelectorAll('*')).filter((el) => Array.from(el.attributes).some((a) => a.name.startsWith('on')))
    expect(withHandlers).toEqual([])
    expect(doc.getElementById('bad')?.hasAttribute('href')).toBe(false)
    expect(doc.getElementById('ok')?.getAttribute('href')).toBe('/blog')
  })

  it('garde feuilles de style, polices et images (img, srcset, /_next/image, picture/source), l’affiche d’une vidéo sans sa source ni lecture ; classe du <html> et du <body>', () => {
    const { doc } = cleaned()
    expect(doc.querySelector('link[rel="stylesheet"]')?.getAttribute('href')).toBe('/_next/static/chunks/site.css')
    expect(doc.querySelector('style')?.textContent).toContain('.hero')
    expect(doc.querySelector('link[as="font"]')).not.toBeNull()
    expect(doc.querySelector('link[as="image"]')).not.toBeNull()
    const cover = doc.getElementById('cover')!
    expect(cover.getAttribute('srcset')).toContain(HASH)
    expect(cover.getAttribute('src')).toContain('/_next/image?url=')
    expect(cover.getAttribute('loading')).toBe('lazy')
    expect(doc.querySelector('picture source')?.getAttribute('srcset')).toContain(HASH)
    const clip = doc.getElementById('clip')!
    expect(clip.getAttribute('poster')).toContain(HASH)
    expect([clip.hasAttribute('src'), clip.hasAttribute('autoplay'), clip.getAttribute('preload'), clip.children.length]).toEqual([false, false, 'none', 0])
    expect(doc.documentElement.getAttribute('class')).toBe('geist_variable')
    expect(doc.body.getAttribute('class')).toBe('site')
    // La recherche de l'élément fonctionne sur la copie.
    expect(findAssetElements(doc, HASH).map((el) => el.id)).toEqual(['cover', 'pic', 'clip'])
  })

  it('pose <base href> (origine + chemin de la page) en tête du <head>, à la place de l’ancienne ; doctype (mode standard)', () => {
    const { html, doc } = cleaned()
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(doc.querySelectorAll('base')).toHaveLength(1)
    expect(doc.head.firstElementChild?.tagName).toBe('BASE')
    expect(doc.querySelector('base')?.getAttribute('href')).toBe('http://127.0.0.1:4040/blog/how-to')
  })
})

describe('assetHash', () => {
  it('hash de l’id Sanity (image et fichier) ; id trop court ou inconnu : null', () => {
    expect(assetHash(`image-${HASH}-800x806-jpg`)).toBe(HASH)
    expect(assetHash(`file-${HASH}-mp4`)).toBe(HASH)
    expect(assetHash('image-abc-2400x1600-jpg')).toBeNull()
    expect(assetHash('drafts.post-1')).toBeNull()
  })
})

describe('findAssetElements (recherche de l’élément par le hash)', () => {
  it('img src, img srcset, /_next/image?url= encodé, <source> d’un <picture> (→ son img), video poster, background-image, dans l’ordre du document', () => {
    const encoded = encodeURIComponent(`${CDN}?w=1200&auto=format`)
    const doc = page(`
      <header><img id="logo" src="https://cdn.sanity.io/images/p/d/${OTHER}-100x40.png"></header>
      <div id="hero" style="background-image: url('${CDN}?w=1600')"></div>
      <img id="src" src="${CDN}?w=640">
      <img id="srcset" srcset="${CDN}?w=640 640w, ${CDN}?w=1280 1280w" sizes="100vw">
      <img id="next" src="/_next/image?url=${encoded}&w=1080&q=75">
      <picture id="pic"><source srcset="${CDN}?fm=webp 1x" type="image/webp"><img id="picImg" src="/fallback.jpg"></picture>
      <video id="video" poster="${CDN}?w=960"></video>
      <p id="text" style="color: red" data-note="${HASH}">no</p>
    `)
    expect(findAssetElements(doc, HASH).map((el) => el.id)).toEqual(['hero', 'src', 'srcset', 'next', 'picImg', 'video'])
  })

  it('currentSrc (image choisie dans le srcset, sans attribut correspondant) ; rien d’autre ne correspond', () => {
    const doc = page(`<img id="a" src="/placeholder.gif"><img id="b" src="https://cdn.sanity.io/images/p/d/${OTHER}-1x1.png">`)
    Object.defineProperty(doc.getElementById('a')!, 'currentSrc', { value: `${CDN}?w=640` })
    expect(findAssetElements(doc, HASH).map((el) => el.id)).toEqual(['a'])
    expect(findAssetElements(doc, 'abc')).toEqual([])
    expect(findAssetElements(page('<p>rien</p>'), HASH)).toEqual([])
  })
})

describe('pickTarget', () => {
  const box = (width: number, height: number): Box => ({ x: 0, y: 0, width, height })
  it('premier élément visible (boîte non vide) ; rang de l’occurrence ; sinon le dernier visible ; aucun : null', () => {
    const boxes: Record<string, Box> = { hidden: box(0, 0), a: box(100, 50), b: box(200, 80) }
    const of = (id: string) => boxes[id]
    expect(pickTarget(['hidden', 'a', 'b'], 0, of)?.element).toBe('a')
    expect(pickTarget(['hidden', 'a', 'b'], 1, of)?.element).toBe('b')
    expect(pickTarget(['hidden', 'a', 'b'], 5, of)?.element).toBe('b')
    expect(pickTarget(['hidden'], 0, of)).toBeNull()
  })
})

describe('centerScroll et frameBox (défilement et cadre rouge, calcul pur)', () => {
  const viewport = { width: 1280, height: LIVE_PAGE_HEIGHT }
  const doc = { width: 1280, height: 4000 }

  it('centre l’élément dans la fenêtre de l’iframe, borné au document', () => {
    // Couverture d'article (1200 × 630 à y 900) : son centre (1215) au centre de la fenêtre (285.5).
    expect(centerScroll({ x: 40, y: 900, width: 1200, height: 630 }, viewport, doc)).toEqual({ left: 0, top: 930 })
    // En haut de page : pas de défilement négatif.
    expect(centerScroll({ x: 0, y: 20, width: 300, height: 100 }, viewport, doc)).toEqual({ left: 0, top: 0 })
    // En bas de page : borné à la hauteur du document.
    expect(centerScroll({ x: 0, y: 3950, width: 300, height: 40 }, viewport, doc)).toEqual({ left: 0, top: 4000 - LIVE_PAGE_HEIGHT })
    // Page plus courte que la fenêtre.
    expect(centerScroll({ x: 0, y: 200, width: 300, height: 40 }, viewport, { width: 1280, height: 400 })).toEqual({ left: 0, top: 0 })
  })

  it('cadre = boîte × échelle (278 / 1280), bornée à la miniature ; minimum lisible ; hors champ : null', () => {
    expect(LIVE_SCALE).toBeCloseTo(0.2171875, 7)
    expect(LIVE_PAGE_HEIGHT * LIVE_SCALE).toBeGreaterThanOrEqual(MINIATURE.height)
    // Après défilement, la couverture est à y = -30 dans la fenêtre (plus haute que la fenêtre) : bornée en haut et en bas.
    expect(frameBox({ x: 40, y: -30, width: 1200, height: 630 }, LIVE_SCALE)).toEqual({ x: 8.69, y: 0, width: 260.63, height: 124 })
    // Image moyenne : échelle simple.
    expect(frameBox({ x: 640, y: 100, width: 400, height: 300 }, LIVE_SCALE)).toEqual({ x: 139, y: 21.72, width: 86.88, height: 65.16 })
    // Icône de 16 px : agrandie à 8 px autour de son centre.
    expect(frameBox({ x: 100, y: 100, width: 16, height: 16 }, LIVE_SCALE)).toEqual({ x: 19.46, y: 19.46, width: 8, height: 8 })
    expect(frameBox({ x: 0, y: 900, width: 100, height: 100 }, LIVE_SCALE)).toBeNull()
  })
})

describe('miniatureModes (choix du mode)', () => {
  const place = (preview?: UsagePreview) => ({ preview })
  it('page vivante / FaviconPreview / SocialPreview / repli ; au plus 3 pages vivantes, le reste en repli', () => {
    const modes = miniatureModes([
      place({ kind: 'page', path: '/blog/a' }),
      place({ kind: 'favicon', theme: 'dark' }),
      place({ kind: 'social', domain: 'conduit.com', title: 'Home' }),
      place(),
      place({ kind: 'page', path: '/blog/a' }),
      place({ kind: 'page', path: '/' }),
      place({ kind: 'page', path: '/faq/b' }),
      place({ kind: 'page', path: 'https://evil.example/x' }),
    ])
    expect(modes).toEqual([
      { kind: 'live', path: '/blog/a', occurrence: 0 },
      { kind: 'favicon', theme: 'dark' },
      { kind: 'social', domain: 'conduit.com', title: 'Home' },
      { kind: 'fallback', reason: 'none' },
      // 2e emplacement sur la même page : 2e apparition de l'image.
      { kind: 'live', path: '/blog/a', occurrence: 1 },
      { kind: 'live', path: '/', occurrence: 0 },
      // 4e page : au-delà du plafond de 3 pages vivantes.
      { kind: 'fallback', reason: 'limit' },
      // Jamais une autre origine.
      { kind: 'fallback', reason: 'none' },
    ])
  })
  it('un fichier (PDF…) n’a pas d’élément à entourer : repli', () => {
    expect(miniatureModes([place({ kind: 'page', path: '/' })], 'file')).toEqual([{ kind: 'fallback', reason: 'none' }])
  })
})

describe('livePagePath (iframe de même origine seulement)', () => {
  it('garde un chemin du site, normalisé, sans fragment ; refuse les URL et les chemins « // »', () => {
    expect(livePagePath('/blog/how-to')).toBe('/blog/how-to')
    expect(livePagePath('/faq/a b?x=1#top')).toBe('/faq/a%20b?x=1')
    expect(livePagePath('/blog/../admin')).toBe('/admin')
    expect(livePagePath('//evil.example/x')).toBeNull()
    expect(livePagePath('/\\evil.example')).toBeNull()
    expect(livePagePath('https://conduit.com/')).toBeNull()
    expect(livePagePath('javascript:alert(1)')).toBeNull()
    expect(livePagePath(undefined)).toBeNull()
  })
})

describe('miniatures du kit et repli (géométrie)', () => {
  it('favicon : cadre navigateur 180 × 110 centré, cadre rouge autour du favicon (x 72, y 35, 16 px)', () => {
    expect(faviconLayout()).toEqual({ stage: { x: 49, y: 7, width: 180, height: 110 }, frame: { x: 117, y: 38, width: 24, height: 24 } })
  })
  it('carte sociale réduite dans la hauteur de la miniature, cadre rouge sur son image 1200 / 630', () => {
    const { scale, stage, frame } = socialLayout()
    expect(scale).toBeCloseTo(114 / 300, 6)
    expect(stage).toEqual({ x: 63, y: 5, width: 152, height: 114 })
    expect(frame).toEqual({ x: 63.38, y: 5.38, width: 151.24, height: 79.4 })
    expect(frame.y + frame.height).toBeLessThan(stage.y + stage.height)
  })
  it('repli : l’image dans son ratio (contain), centrée, place pour la mention', () => {
    expect(containBox({ width: 640, height: 640 }, fallbackArea(false))).toEqual({ x: 87, y: 10, width: 104, height: 104 })
    expect(containBox({ width: 2400, height: 1600 }, fallbackArea(true))).toEqual({ x: 74.5, y: 8, width: 129, height: 86 })
    expect(containBox(null, { x: 0, y: 0, width: 160, height: 160 })).toEqual({ x: 0, y: 35, width: 160, height: 90 })
  })
})

describe('aperçu de la fiche et grand aperçu (lib/preview.ts)', () => {
  it('ratio de l’aperçu = dimensions de l’asset', () => {
    expect(previewRatio({ width: 640, height: 640 })).toBe('640 / 640')
    expect(previewRatio({ width: undefined, height: 10 })).toBeNull()
  })
  it('image dans son ratio, au plus ~90vw × 85vh et dans la fenêtre modale ; petite image agrandie ; jamais au-delà sinon', () => {
    const screen = { width: 1440, height: 900 }
    expect(lightboxBounds(screen)).toEqual({ width: 1296, height: 724 })
    expect(lightboxImageSize({ width: 2400, height: 1600 }, screen)).toEqual({ width: 1086, height: 724 })
    expect(lightboxImageSize({ width: 640, height: 640 }, screen)).toEqual({ width: 640, height: 640 })
    expect(lightboxImageSize({ width: 64, height: 64 }, screen)).toEqual({ width: 320, height: 320 })
    expect(lightboxImageSize({ width: 600, height: 3000 }, screen)).toEqual({ width: 145, height: 724 })
    expect(lightboxModalWidth(145)).toBe(360)
    expect(lightboxModalWidth(1086)).toBe(1128)
  })
  it('origine de l’animation : centre de la miniature dans le repère de la fenêtre ; légende', () => {
    expect(originFrom({ x: 1100, y: 200, width: 288, height: 192 }, { x: 156, y: 88 })).toBe('1088px 208px')
    expect(lightboxCaption({ width: 2400, height: 1600, extension: 'jpg', size: 1_258_291 })).toBe('2400 × 1600 · JPG · 1.2 MB')
    expect(lightboxCaption({ extension: 'mp4', size: 14_994_637 })).toBe('MP4 · 14.3 MB')
  })
})
