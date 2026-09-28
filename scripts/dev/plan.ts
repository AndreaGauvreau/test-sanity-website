/**
 * Décisions de `npm run dev` (scripts/dev.ts), en fonctions PURES pour être testées sans lancer de processus.
 *
 * `npm run dev` démarre le site + l'admin (next dev) et, si c'est possible, le moteur IA. Ce module dit s'il faut
 * lancer le moteur et quoi afficher ; il lit les fichiers .env comme du TEXTE (jamais chargés dans process.env du
 * lanceur : le site ne doit pas hériter des secrets du moteur, ni l'inverse).
 */

/** Contenu d'un fichier .env → paires clé/valeur (commentaires, lignes vides et `export ` ignorés ; guillemets retirés). */
export function parseDotenv(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!match) continue
    let value = match[2].trim()
    const quote = value[0]
    if ((quote === '"' || quote === "'") && value.length >= 2 && value.endsWith(quote)) value = value.slice(1, -1)
    else value = value.replace(/\s+#.*$/, '')
    out[match[1]] = value
  }
  return out
}

/** Port lu dans un fichier .env (entier de 1 024 à 65 535), ou null. */
export function portOf(value: string | undefined): number | null {
  if (!value || !/^\d{2,5}$/.test(value.trim())) return null
  const port = Number(value.trim())
  return port >= 1024 && port <= 65535 ? port : null
}

export type DevPlanInput = {
  sitePort: number
  sitePortBusy: boolean
  /** ENGINE_MOCK=1 dans .env.local : l'admin parle au moteur simulé. */
  mock: boolean
  /** engine/.env.local existe. */
  engineEnvFile: boolean
  /** ENGINE_PORT d'engine/.env.local (null : absent ou invalide). */
  enginePort: number | null
  enginePortBusy: boolean
}

export type DevPlan = {
  /** Rien n'est lancé (le site ne peut pas démarrer). */
  abort: boolean
  /** Mise en place du clone, synchronisation, puis moteur. */
  startEngine: boolean
  /** Messages à afficher avant de lancer (anglais, comme les journaux du moteur et de Next). */
  notes: string[]
}

export function devPlan(input: DevPlanInput): DevPlan {
  if (input.sitePortBusy) {
    return {
      abort: true,
      startEngine: false,
      notes: [`Port ${input.sitePort} is already in use: is \`npm run dev\` already running? Stop it first (or set PORT).`],
    }
  }
  const siteOnly = (note: string): DevPlan => ({ abort: false, startEngine: false, notes: [note] })
  if (input.mock) return siteOnly('ENGINE_MOCK=1 in .env.local: the admin uses the simulated engine, the real AI engine is not started.')
  if (!input.engineEnvFile) return siteOnly('engine/.env.local is missing: starting without the AI engine (see docs/admin/DEMARRAGE.md).')
  if (input.enginePort === null) return siteOnly('ENGINE_PORT is missing or invalid in engine/.env.local: starting without the AI engine.')
  if (input.enginePortBusy) {
    return siteOnly(`An AI engine already answers on port ${input.enginePort}: using it instead of starting another one.`)
  }
  return { abort: false, startEngine: true, notes: [] }
}

export type Painter = (text: string) => string

/** « [site] ligne » : préfixe coloré (ou non) devant chaque ligne d'un processus. */
export function prefixLine(label: string, line: string, paint: Painter = (text) => text): string {
  return `${paint(`[${label}]`)} ${line}`
}
