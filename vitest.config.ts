import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Tests de l'admin (src/admin), du site (src/) et du moteur (engine/).
// Environnement Node par défaut ; un test de composant React déclare `/** @vitest-environment jsdom */` en tête.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'engine/**/*.test.ts'],
    exclude: ['**/node_modules/**', '.next/**', 'dist/**'],
    environment: 'node',
    testTimeout: 20_000,
  },
})
