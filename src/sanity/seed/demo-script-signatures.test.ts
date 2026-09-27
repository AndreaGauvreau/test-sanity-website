import { describe, expect, it } from 'vitest'

import { signableScript, verifyScript } from '../../lib/script-signature'
import { demoScripts } from './demo-collections'
import { planDemoScriptSignatures } from './demo-script-signatures'

const secret = 'd'.repeat(40)
const demo = demoScripts[0]

describe('planDemoScriptSignatures (SEC-04)', () => {
  it('signe le script d’exemple identique au dépôt (publié et brouillon), signature valide', async () => {
    const plan = await planDemoScriptSignatures(
      [
        { _id: 'siteSettings', scripts: [{ ...demo }] },
        { _id: 'drafts.siteSettings', scripts: [{ ...demo, enabled: null }] },
      ],
      secret,
    )
    expect(plan.map((item) => item.documentId)).toEqual(['siteSettings', 'drafts.siteSettings'])
    expect(await verifyScript(secret, { ...signableScript(demo), signature: plan[0].signature })).toBe(true)
  })

  it('ne signe jamais un script modifié ni un script inconnu ; ne resigne pas un script déjà signé', async () => {
    const [first] = await planDemoScriptSignatures([{ _id: 'siteSettings', scripts: [demo] }], secret)
    const plan = await planDemoScriptSignatures(
      [
        {
          _id: 'siteSettings',
          scripts: [
            { ...demo, code: `${demo.code}<script>steal()</script>` },
            { _key: 'other', placement: 'bodyEnd', page: 'all', run: 'once', code: '<script></script>' },
            { ...demo, signature: first.signature },
          ],
        },
      ],
      secret,
    )
    expect(plan).toEqual([])
  })
})
