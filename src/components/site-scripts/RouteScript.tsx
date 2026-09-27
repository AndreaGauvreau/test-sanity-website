'use client'

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'

type Props = {
  /** Attributs de la balise d'origine (src, async, type="module"…). */
  attributes: Record<string, string>
  content: string
  /** headEnd : ajouté au <head> ; sinon au <body>. */
  target: 'head' | 'body'
}

/**
 * Script « On every page visit » (G6) : exécuté à chaque page vue, navigation interne comprise. Une
 * nouvelle balise <script> est créée à chaque changement de route (le navigateur n'exécute pas un
 * script réinséré), puis retirée à la navigation suivante. Le code vient de siteSettings (Kuartz).
 */
export function RouteScript({ attributes, content, target }: Props) {
  const pathname = usePathname()
  // Clé stable : un rafraîchissement du serveur (router.refresh) recrée l'objet sans changer le script.
  const attributesKey = JSON.stringify(attributes)

  useEffect(() => {
    const script = document.createElement('script')
    for (const [name, value] of Object.entries(JSON.parse(attributesKey) as Record<string, string>)) {
      script.setAttribute(name, value)
    }
    if (content) script.text = content
    const parent = target === 'head' ? document.head : document.body
    parent.appendChild(script)
    return () => {
      script.remove()
    }
    // pathname : une exécution par page vue.
  }, [pathname, attributesKey, content, target])

  return null
}
