import { createClient } from 'next-sanity'

import { apiVersion, dataset, projectId, studioUrl } from '../env'

export const client = createClient({
  projectId,
  dataset,
  apiVersion,
  // API CDN (apicdn.sanity.io) : réponses mises en cache au plus près du visiteur.
  useCdn: true,
  perspective: 'published',
  // En Draft Mode, encode la source de chaque texte (stega) pour le clic-pour-éditer.
  stega: { studioUrl },
})
