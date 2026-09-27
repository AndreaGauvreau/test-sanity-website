/**
 * Variables Sanity de l'admin, lues à la demande (jamais au chargement du module, pour les tests et le build).
 * Noms seulement dans la documentation ; aucune valeur n'est journalisée.
 */
export type AdminSanityEnv = { projectId: string; dataset: string; apiVersion: string }

export function readSanityEnv(env: Record<string, string | undefined> = process.env): AdminSanityEnv {
  const projectId = env.NEXT_PUBLIC_SANITY_PROJECT_ID
  const dataset = env.NEXT_PUBLIC_SANITY_DATASET
  if (!projectId || !dataset) throw new Error('NEXT_PUBLIC_SANITY_PROJECT_ID / NEXT_PUBLIC_SANITY_DATASET are missing.')
  return { projectId, dataset, apiVersion: env.NEXT_PUBLIC_SANITY_API_VERSION || '2026-09-01' }
}
