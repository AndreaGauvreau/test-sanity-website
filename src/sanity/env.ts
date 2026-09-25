// Lu à la fois par Next (site + Studio embarqué) et par la CLI Sanity :
// imports relatifs uniquement, pas d'alias `@/`, et rien de lourd ici.

export const apiVersion = process.env.NEXT_PUBLIC_SANITY_API_VERSION || '2026-09-01'

// NEXT_PUBLIC_* pour Next ; SANITY_STUDIO_* pour l'admin lancé hors de Next
// (`npm run studio`, `npm run deploy:studio`), qui n'expose que ce préfixe.
export const projectId = assertValue(
  process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || process.env.SANITY_STUDIO_PROJECT_ID,
  'Variable manquante : NEXT_PUBLIC_SANITY_PROJECT_ID (voir .env.example)',
)

export const dataset = assertValue(
  process.env.NEXT_PUBLIC_SANITY_DATASET || process.env.SANITY_STUDIO_DATASET,
  'Variable manquante : NEXT_PUBLIC_SANITY_DATASET (voir .env.example)',
)

// Route où le Studio est monté dans l'app Next (équivalent du /admin de Payload).
export const studioUrl = '/admin'

function assertValue<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message)
  return value
}
