import { signableScript, signScript, verifyScript } from '../../lib/script-signature'
import { demoScripts } from './demo-collections'

/**
 * Signature des scripts d'exemple du dépôt (SEC-04), pour scripts/migrate-admin.ts : le site n'injecte que les
 * scripts signés. Ne signe QUE les scripts dont les champs signés sont IDENTIQUES à ceux de `demoScripts`
 * (même clé, même code…) : un script modifié dans Sanity n'est jamais « blanchi » par la migration.
 * Pur (hors Web Crypto) : renvoie les signatures à écrire, sans écrire.
 */

type StoredScript = {
  _key: string
  placement?: string | null
  page?: string | null
  run?: string | null
  enabled?: boolean | null
  code?: string | null
  signature?: string | null
}

export type DemoSignature = { documentId: string; key: string; signature: string }

export async function planDemoScriptSignatures(
  documents: readonly { _id: string; scripts?: readonly StoredScript[] | null }[],
  secret: string,
): Promise<DemoSignature[]> {
  const plan: DemoSignature[] = []
  for (const document of documents) {
    for (const stored of document.scripts ?? []) {
      const demo = demoScripts.find((script) => script._key === stored._key)
      if (!demo) continue
      const signable = signableScript(stored)
      if (JSON.stringify(signable) !== JSON.stringify(signableScript(demo))) continue
      if (await verifyScript(secret, { ...signable, signature: stored.signature })) continue
      plan.push({ documentId: document._id, key: stored._key, signature: await signScript(secret, signable) })
    }
  }
  return plan
}
