import { defineCliConfig } from 'sanity/cli'

// Utilisé par la CLI (`npx sanity …`, `npm run seed`, `npm run typegen`, `npm run studio`).
// Les valeurs viennent de .env.local, comme pour le site.
export default defineCliConfig({
  api: {
    projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
    dataset: process.env.NEXT_PUBLIC_SANITY_DATASET,
  },
  // `npm run deploy:studio` → https://kuartz-sanity-test.sanity.studio
  deployment: {
    appId: 'txkcir5yb8f2ovcsta3rys19',
  },
  // `npm run typegen` : schéma → schema.json → types des requêtes GROQ.
  schemaExtraction: {
    path: './schema.json',
    enforceRequiredFields: true,
  },
  typegen: {
    path: './src/**/*.{ts,tsx}',
    schema: './schema.json',
    generates: './src/sanity/types.ts',
  },
})
