import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import { containsAddress, LINK_REMOVED, sanitizeClientText } from './sanitize'

/**
 * SEC-08 : un seul filtre des adresses pour tout texte montré au client (questions, options, message final, Ask AI).
 * Des consignes injectées via le contenu du site ne doivent pas pouvoir afficher « reconnectez-vous sur <domaine> ».
 */

const clean = (text: string, allowed: string[] = []) => sanitizeClientText(text, allowed)
const R = LINK_REMOVED

describe('sanitizeClientText — adresses retirées', () => {
  it('retire un domaine nu (le cas de la relecture), avec son chemin, sans manger la ponctuation', () => {
    assert.equal(clean('Please sign in again at conduit-billing.help/login.'), `Please sign in again at ${R}.`)
    assert.equal(clean('Go to conduit-billing.help, then pay.'), `Go to ${R}, then pay.`)
    assert.equal(clean('(see billing.conduit-support.com)'), `(see ${R})`)
    assert.equal(clean('Visit WWW.EVIL.COM now'), `Visit ${R} now`)
    assert.equal(clean('host evil.com:8443/x?y=1#z ok'), `host ${R} ok`)
  })

  it('retire les URL complètes, sans schéma connu, et les //', () => {
    assert.equal(clean('Open https://evil.test/a?b=c then'), `Open ${R} then`)
    assert.equal(clean('Open hxxps://evil.test'), `Open ${R}`)
    assert.equal(clean('Open //evil.test/path'), `Open ${R}`)
    assert.equal(clean('a // b'), `a ${R} b`)
    assert.equal(clean('Click javascript:alert(1) or data:text/html,x'), `Click ${R} or ${R}`)
    assert.equal(clean('Write to billing@evil.help today'), `Write to ${R} today`)
    assert.equal(clean('mailto:billing@evil.help'), R)
    assert.equal(clean('Go to 192.168.1.20/login'), `Go to ${R}`)
  })

  it('IDN et punycode : domaines en Unicode, TLD non latins, séparateurs IDN, homoglyphes', () => {
    assert.equal(clean('Pay on bücher-conduit.de'), `Pay on ${R}`)
    assert.equal(clean('Pay on xn--bcher-kva.de'), `Pay on ${R}`)
    assert.equal(clean('Pay on пример.рф'), `Pay on ${R}`)
    assert.equal(clean('Pay on xn--e1afmkfd.xn--p1ai'), `Pay on ${R}`)
    assert.equal(clean('Pay on conduit。help'), `Pay on ${R}`)
    assert.equal(clean('Pay on ｃｏｎｄｕｉｔ．ｈｅｌｐ'), `Pay on ${R}`)
    assert.equal(clean('Pay on conduit[.]help'), `Pay on ${R}`)
    // Caractères invisibles glissés dans le nom : retirés avant la recherche.
    assert.equal(clean('Pay on conduit​.help'), `Pay on ${R}`)
    // « о » cyrillique : ce n'est pas le domaine autorisé.
    assert.equal(clean('Pay on cоnduit.com', ['conduit.com']), `Pay on ${R}`)
  })

  it('garde le texte ordinaire : nombres, ratios, unités, abréviations, noms de fichiers techniques', () => {
    for (const text of [
      'Contrast 4.79:1 on Surface, 3.07:1 before.',
      'The title now takes 2 lines (was 3), e.g. on mobile, i.e. at 375 px.',
      'Size 1.5rem, spacing 0.875rem, U.S. customers, a.k.a. carriers.',
      'Built with Next.js and Hero.module.css.',
      'Keep the image(s) and the 24/7 support.',
      'Dock scheduling for warehouses — clear, concrete, confident.',
      '',
    ]) {
      assert.equal(clean(text), text, text)
    }
    // Emoji composés (ZWJ) intacts.
    assert.equal(clean('Done 👩‍💻'), 'Done 👩‍💻')
  })
})

describe('sanitizeClientText — liste blanche', () => {
  it('garde le domaine autorisé et ses sous-domaines, en URL, nu, en e-mail ; retire les faux amis', () => {
    const allowed = ['conduit.com']
    assert.equal(clean('See conduit.com/pricing.', allowed), 'See conduit.com/pricing.')
    assert.equal(clean('See https://www.conduit.com/a', allowed), 'See https://www.conduit.com/a')
    assert.equal(clean('Mail hello@conduit.com', allowed), 'Mail hello@conduit.com')
    assert.equal(clean('See conduit.com.evil.help', allowed), `See ${R}`)
    assert.equal(clean('See notconduit.com', allowed), `See ${R}`)
    assert.equal(clean('See https://conduit.com@evil.help/x', allowed), `See ${R}`)
  })

  it('compare en punycode : un domaine autorisé en Unicode vaut sous sa forme xn--, et inversement', () => {
    assert.equal(clean('See xn--bcher-kva.de', ['bücher.de']), 'See xn--bcher-kva.de')
    assert.equal(clean('See bücher.de', ['xn--bcher-kva.de']), 'See bücher.de')
    assert.equal(clean('See BÜCHER.DE', ['bücher.de']), 'See BÜCHER.DE')
  })

  it('une liste vide retire tout ; une entrée « *.x » ou « .x » vaut « x »', () => {
    assert.equal(clean('See conduit.com'), `See ${R}`)
    assert.equal(clean('See app.conduit.com', ['*.conduit.com']), 'See app.conduit.com')
    assert.equal(clean('See conduit.com', ['.conduit.com']), 'See conduit.com')
  })
})

describe('containsAddress et performance', () => {
  it('dit si le texte contient une adresse hors liste', () => {
    assert.equal(containsAddress('Sign in at conduit-billing.help', []), true)
    assert.equal(containsAddress('Contrast 4.79:1', []), false)
    assert.equal(containsAddress('See conduit.com', ['conduit.com']), false)
    // Un caractère invisible seul n'est pas une adresse.
    assert.equal(containsAddress('Title​ two', []), false)
  })

  it('reste linéaire sur des entrées hostiles', () => {
    for (const text of ['a-'.repeat(20_000), 'a.'.repeat(20_000) + '1', `${'a'.repeat(62)}.`.repeat(500), '/'.repeat(20_000), 'x@'.repeat(10_000)]) {
      const started = performance.now()
      sanitizeClientText(text, ['conduit.com'])
      assert.ok(performance.now() - started < 200, `${text.slice(0, 10)}… : ${Math.round(performance.now() - started)} ms`)
    }
  })
})
