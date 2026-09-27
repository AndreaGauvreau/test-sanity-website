/**
 * Tarifs Claude ($ par million de jetons) : la table vit dans les contrats partagés
 * (`src/admin/core/contracts/pricing.ts`), source unique pour le moteur (coût estimé, `complete()`) et l'admin
 * (indication de prix de la carte « AI settings » de B5). Ce fichier la réexporte pour les modules du moteur.
 */
export { PRICES_PER_MTOK, priceOf, type Price } from '../../../src/admin/core/contracts/pricing'
