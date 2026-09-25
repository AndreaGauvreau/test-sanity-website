import 'server-only'

// Token « viewer » (lecture seule) : sert à lire les brouillons en mode aperçu
// (Presentation) et à ouvrir la connexion live des brouillons. Jamais exposé
// au navigateur hors d'une session Draft Mode valide.
export const token = process.env.SANITY_API_READ_TOKEN
