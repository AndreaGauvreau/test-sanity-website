import { draftMode } from 'next/headers'
import Script from 'next/script'

import { isEditorPreview } from '@/lib/editor/preview'
import {
  parseScriptCode,
  resolveScriptParts,
  scriptsForPage,
  type ScriptPlacement,
  type SiteScript,
} from '@/lib/site-scripts'
import type { TemplateValues } from '@/lib/template-variables'

import { RouteScript } from './RouteScript'

type Props = {
  scripts: readonly SiteScript[] | null | undefined
  /** « all » (layout), id de page (« home », « blog ») ou page article (« blog/slug »). */
  page: string
  /** Emplacements rendus à cet endroit du HTML (début : headEnd + bodyStart ; fin : bodyEnd). */
  placements: readonly ScriptPlacement[]
  /** Valeurs des {{variables}} d'une page article (G6). */
  values?: TemplateValues
}

/**
 * Scripts de siteSettings (B3, G6), rendus là où le layout ou la page les pose.
 *
 * POINT SENSIBLE — XSS par conception : le code est écrit par Kuartz (droit settings.code) et injecté
 * tel quel ; seules les valeurs des {{variables}} (contenu de l'article) sont échappées. Jamais rendu en
 * Draft Mode ni dans l'aperçu de l'éditeur IA (KZ_EDITOR_PREVIEW) : ce ne sont pas des visiteurs.
 *
 * Correspondance avec Next (le layout du site n'est pas le layout racine, qui ne lui appartient pas) :
 * - <script> JavaScript, « Once » : next/script (id stable, exécuté une fois par chargement du site),
 *   stratégie afterInteractive (headEnd, bodyStart) ou lazyOnload (bodyEnd) ;
 * - <script> JavaScript, « On every page visit » : RouteScript (client), réexécuté à chaque route ;
 * - <script> d'un autre type (JSON-LD…) : rendu tel quel dans le HTML du serveur (lisible par les robots) ;
 * - <style> : <style precedence> de React 19, remonté dans le <head> ;
 * - tout autre HTML du code est ignoré.
 */
export async function SiteScripts({ scripts, page, placements, values }: Props) {
  if (isEditorPreview()) return null
  const { isEnabled: isDraftMode } = await draftMode()
  if (isDraftMode) return null

  const selected = scriptsForPage(scripts, page).filter((script) => placements.includes(script.placement))
  if (selected.length === 0) return null

  return (
    <>
      {selected.flatMap((script) => {
        const parts = resolveScriptParts(parseScriptCode(script.code).parts, values)
        return parts.map((part, index) => {
          const id = `kz-script-${script._key}-${index}`
          if (part.kind === 'css') {
            return (
              <style key={id} href={id} precedence="kz-site-scripts">
                {part.content}
              </style>
            )
          }
          if (part.kind === 'data') {
            return (
              <script
                key={id}
                id={id}
                type={part.type}
                // Contenu écrit par Kuartz (valeurs des variables échappées) : voir le point sensible.
                dangerouslySetInnerHTML={{ __html: part.content }}
              />
            )
          }
          if (script.run === 'everyPageVisit') {
            return (
              <RouteScript
                key={id}
                attributes={part.attributes}
                content={part.content}
                target={script.placement === 'headEnd' ? 'head' : 'body'}
              />
            )
          }
          const { src, ...attributes } = part.attributes
          return (
            <Script
              key={id}
              id={id}
              src={src || undefined}
              strategy={script.placement === 'bodyEnd' ? 'lazyOnload' : 'afterInteractive'}
              {...toReactProps(attributes)}
              {...(part.content ? { dangerouslySetInnerHTML: { __html: part.content } } : {})}
            />
          )
        })
      })}
    </>
  )
}

// Attributs HTML → props React (booléens et noms en camelCase les plus courants des balises de suivi).
const RENAMED: Record<string, string> = {
  crossorigin: 'crossOrigin',
  nomodule: 'noModule',
  referrerpolicy: 'referrerPolicy',
  fetchpriority: 'fetchPriority',
}
const BOOLEAN = new Set(['async', 'defer', 'nomodule'])

function toReactProps(attributes: Record<string, string>): Record<string, string | boolean> {
  const props: Record<string, string | boolean> = {}
  for (const [name, value] of Object.entries(attributes)) {
    if (name === 'id' || name.startsWith('on')) continue
    props[RENAMED[name] ?? name] = BOOLEAN.has(name) ? true : value
  }
  return props
}
