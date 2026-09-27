/**
 * Traduction des erreurs des server actions en message affichable (anglais). PUR (reconnaît les erreurs par leur nom
 * pour rester importable sans `server-only`). Jamais de détail technique ni de jeton dans le message.
 */

const GENERIC = "Couldn't save this change. Please try again."

export function actionErrorMessage(err: unknown, fallback = GENERIC): string {
  if (err && typeof err === 'object') {
    const name = (err as { name?: unknown }).name
    const message = (err as { message?: unknown }).message
    // AdminAuthError (core/auth) et SanityWriteError (core/sanity) portent un message anglais prêt à afficher.
    if ((name === 'AdminAuthError' || name === 'SanityWriteError') && typeof message === 'string' && message) return message
  }
  return fallback
}

/** Faut-il journaliser l'erreur côté serveur ? (erreurs inattendues seulement, pas les refus prévus) */
export function isUnexpectedError(err: unknown): boolean {
  const name = (err as { name?: unknown } | null)?.name
  return name !== 'AdminAuthError' && name !== 'SanityWriteError'
}
