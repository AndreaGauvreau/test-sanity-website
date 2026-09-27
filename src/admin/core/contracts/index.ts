/**
 * Contrats partagés de l'admin et du moteur IA. Types et petites fonctions pures uniquement :
 * ce dossier ne doit importer ni React, ni Next, ni Sanity, ni Node, pour rester utilisable partout
 * (composants serveur et client, route handlers, moteur `engine/`, tests).
 */
export * from './roles'
export * from './session'
export * from './manifest'
export * from './zones'
export * from './engine'
export * from './format'
export * from './pricing'
