import type { SanityClient } from '@sanity/client'

/**
 * Garde anti-production des scripts d'écriture (`sanity exec … --with-user-token`).
 *
 * Le dataset vient de sanity.cli.ts (NEXT_PUBLIC_SANITY_DATASET de .env.local). Un script qui écrit
 * refuse de tourner si ce dataset est `production` (ou contient « prod »), ou si l'environnement vise
 * production par une autre variable : aucune option ne lève cette garde. Pour production, une migration
 * se décide à part (voir src/sanity/CLAUDE.md, « Migrations »).
 */
export function assertNotProduction(client: Pick<SanityClient, 'config'>): string {
  const { dataset, projectId } = client.config()
  const targets = [dataset, process.env.NEXT_PUBLIC_SANITY_DATASET, process.env.SANITY_STUDIO_DATASET]
  const production = targets.find((name) => typeof name === 'string' && /prod/i.test(name))
  if (!dataset || production) {
    throw new Error(
      `Refus : ce script écrit dans Sanity et le dataset visé est « ${production ?? dataset ?? '(aucun)'} ». ` +
        'Il ne tourne que sur un dataset de développement (NEXT_PUBLIC_SANITY_DATASET=development).',
    )
  }
  console.log(`Garde : projet ${projectId}, dataset ${dataset} (pas production) — écriture permise.`)
  return dataset
}
