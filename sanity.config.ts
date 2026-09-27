'use client'

// Configuration du Studio Sanity. Il est monté dans l'app Next sur /studio
// par src/app/studio/[[...tool]]/page.tsx : même serveur, même port que le site.
// Le Studio est l'outil de Kuartz ; le client passe par l'admin (/admin, src/admin).
//
// Point sensible : les actions natives du Studio sont gardées pour Kuartz, dont « Publish ».
// Publier ici met un texte en ligne SANS le code de l'éditeur IA qui va avec (branche draft) :
// la publication normale passe par Publish dans l'admin (E1). Voir src/sanity/CLAUDE.md.

import { visionTool } from '@sanity/vision'
import { defineConfig } from 'sanity'
import { media } from 'sanity-plugin-media'
import { presentationTool } from 'sanity/presentation'
import { structureTool } from 'sanity/structure'

import { apiVersion, dataset, projectId, studioUrl } from './src/sanity/env'
import { resolve } from './src/sanity/presentation'
import { hiddenCreationTypes, schemaTypes, singletonTypes } from './src/sanity/schemaTypes'
import { structure } from './src/sanity/structure'

// Le même Studio peut aussi tourner hors de Next :
// - `npm run studio` (localhost:3333) : l'aperçu live affiche le site local (localhost:4040) ;
// - `npm run deploy:studio` (kuartz-sanity-test.sanity.studio, utilisable sur mobile) : pas
//   d'aperçu live, le site local n'est pas joignable depuis là (et le Draft Mode ne peut pas
//   s'activer d'un site https vers http://localhost). Contenu, médias et GROQ fonctionnent.
const standalone = process.env.SANITY_STUDIO_STANDALONE === 'true'
const hosted = process.env.SANITY_STUDIO_HOSTED === 'true'

export default defineConfig({
  title: 'Conduit',
  basePath: standalone ? '/' : studioUrl,
  projectId,
  dataset,
  schema: {
    types: schemaTypes,
    // Pas de modèle « nouveau document » pour les documents uniques (id fixe) ni pour le journal IA.
    templates: (templates) => templates.filter(({ schemaType }) => !hiddenCreationTypes.has(schemaType)),
  },
  document: {
    newDocumentOptions: (options, { creationContext }) =>
      creationContext.type === 'global'
        ? options.filter(({ templateId }) => !hiddenCreationTypes.has(templateId))
        : options,
    // Documents uniques : publier, annuler les modifications, restaurer une version. Ni suppression
    // ni duplication. Les actions natives restent pour Kuartz ; « Publish » publie le texte seul,
    // sans le code de l'éditeur IA (le client publie depuis l'admin, E1).
    actions: (actions, { schemaType }) =>
      singletonTypes.has(schemaType)
        ? actions.filter(({ action }) => action && ['publish', 'discardChanges', 'restore'].includes(action))
        : actions,
  },
  plugins: [
    // Contenu : réglages, pages, collections (le journal IA n'y figure pas).
    structureTool({ title: 'Contenu', structure }),
    // Aperçu live : le site dans l'admin, brouillons visibles, clic-pour-éditer.
    ...(hosted
      ? []
      : [
          presentationTool({
            title: 'Aperçu live',
            resolve,
            previewUrl: {
              origin: standalone ? 'http://localhost:4040' : undefined,
              previewMode: { enable: '/api/draft-mode/enable' },
            },
          }),
        ]),
    // Médias : bibliothèque de tous les assets (l'équivalent de la collection `media`).
    media(),
    // GROQ : bac à sable de requêtes, pour tester la lecture en direct.
    visionTool({ title: 'GROQ', defaultApiVersion: apiVersion }),
  ],
})
