// Heure à laquelle le serveur a généré ce HTML.
// En `npm run prod`, elle ne bouge pas tant que la page sort du cache, puis
// change quelques secondes après une publication dans l'admin : c'est la
// preuve visible du cache + invalidation. En `npm run dev`, chaque requête
// régénère la page, donc elle change à chaque rechargement.
export function RenderStamp() {
  const now = new Date()
  const time = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const ms = String(now.getMilliseconds()).padStart(3, '0')

  return (
    <p className="stamp">
      HTML généré par le serveur à {time}.{ms}
    </p>
  )
}
