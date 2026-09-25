'use client'

// Configuration de l'admin (Sanity Studio). Il est monté dans l'app Next sur /admin
// par src/app/admin/[[...tool]]/page.tsx : même serveur, même port que le site.

import { visionTool } from '@sanity/vision'
import { defineConfig } from 'sanity'
import { media } from 'sanity-plugin-media'
import { presentationTool } from 'sanity/presentation'
import { structureTool } from 'sanity/structure'

import { apiVersion, dataset, projectId, studioUrl } from './src/sanity/env'
import { resolve } from './src/sanity/presentation'
import { schemaTypes, singletonTypes } from './src/sanity/schemaTypes'
import { structure } from './src/sanity/structure'

// Sur un document unique : publier, annuler, restaurer. Ni duplication ni suppression.
const singletonActions = new Set(['publish', 'discardChanges', 'restore'])

// Le même admin peut aussi tourner hors de Next :
// - `npm run studio` (localhost:3333) : l'aperçu live affiche le site local (localhost:4040) ;
// - `npm run deploy:studio` (kuartz-sanity-test.sanity.studio, utilisable sur mobile) : pas
//   d'aperçu live, le site local n'est pas joignable depuis là (et le Draft Mode ne peut pas
//   s'activer d'un site https vers http://localhost). Contenu, médias et GROQ fonctionnent.
const standalone = process.env.SANITY_STUDIO_STANDALONE === 'true'
const hosted = process.env.SANITY_STUDIO_HOSTED === 'true'

export default defineConfig({
  title: 'LyonDrive',
  basePath: standalone ? '/' : studioUrl,
  projectId,
  dataset,
  schema: {
    types: schemaTypes,
  },
  document: {
    // Singleton : absent des menus « Créer », mais son modèle reste déclaré pour que
    // les valeurs par défaut s'appliquent à la création depuis la colonne de gauche.
    newDocumentOptions: (options) => options.filter(({ templateId }) => !singletonTypes.has(templateId)),
    actions: (actions, { schemaType }) =>
      singletonTypes.has(schemaType)
        ? actions.filter(({ action }) => action && singletonActions.has(action))
        : actions,
  },
  plugins: [
    // Contenu : l'équivalent des collections de Payload.
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
