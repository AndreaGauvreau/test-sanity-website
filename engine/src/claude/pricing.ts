/**
 * Tarifs Claude en dollars par million de jetons, pour ESTIMER un appel interrompu (le SDK ne rapporte alors aucun coût)
 * et pour chiffrer les appels de `complete()` (l'API Messages ne renvoie que des jetons).
 *
 * Source : skill `claude-api` chargé le 2026-09-27 (tableau des modèles « cached: 2026-06-24 », shared/prompt-caching.md) :
 * - Opus 5.5 : 4 $ en entrée, 20 $ en sortie, lecture de cache 0,20 $ ;
 * - Sonnet 5 : 2 $ / 10 $ ; Haiku 4.5 (`claude-haiku-4-5-20251001`, alias `claude-haiku-4-5`) : 1 $ / 5 $ ;
 * - écriture de cache = 1,25 × l'entrée pour la durée de 5 min (celle du SDK, de Claude Code et de complete()) ; la
 *   durée d'1 h coûterait 2 ×, elle n'est pas utilisée ; lecture de cache = 0,1 × l'entrée (sauf Fable 5.1 : 0,025 ×).
 * Tarifs de l'API Anthropic en direct (pas Bedrock ni Vertex). À revérifier quand un modèle change de prix : le test
 * « pricing » de `cost.test.ts` fige ces valeurs.
 */

export type Price = Readonly<{ input: number; output: number; cacheRead: number; cacheWrite: number }>

export const PRICES_PER_MTOK: Readonly<Record<string, Price>> = Object.freeze({
  'claude-opus-5-5': Object.freeze({ input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 }),
  'claude-sonnet-5': Object.freeze({ input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 }),
  'claude-haiku-4-5-20251001': Object.freeze({ input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 }),
  // Alias sans date du même modèle (ASK_MODEL peut porter l'un ou l'autre).
  'claude-haiku-4-5': Object.freeze({ input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 }),
  // Repris du POC (mêmes sources) : si EDITOR_MODEL les désigne.
  'claude-opus-5': Object.freeze({ input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 }),
  'claude-fable-5-1': Object.freeze({ input: 10, output: 50, cacheRead: 0.25, cacheWrite: 12.5 }),
})

/** Tarif d'un modèle, ou null s'il est inconnu (jamais une clé héritée d'Object : « constructor » n'est pas un modèle). */
export function priceOf(model: string): Price | null {
  return Object.hasOwn(PRICES_PER_MTOK, model) ? PRICES_PER_MTOK[model] : null
}
