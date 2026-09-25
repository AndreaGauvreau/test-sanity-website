import { home } from './home'
import { post } from './post'

export const schemaTypes = [home, post]

// Types à document unique : pas de bouton « créer », pas de suppression.
export const singletonTypes = new Set(['home'])
