import type { AskLink } from '../../../src/admin/core/contracts'
import { editorHref, findAskRoute, resolveAskLinks, type AskRoute } from '../../../src/admin/features/ask-ai/links'
import { sanitizeClientText } from '../claude'

/**
 * Lecture de la réponse du modèle (format ANSWER / LINKS / CHANGE du prompt système) et mise en forme SÛRE :
 * - texte nettoyé (markdown, URL, liens retirés ; chemins de l'admin remplacés par le nom de l'écran), borné, puis passé
 *   au filtre COMMUN des adresses d'engine-claude (`sanitizeClientText`, SEC-08) : domaines nus, IDN, punycode, e-mails,
 *   IPv4, points désamorcés → « [link removed] », sauf les domaines du site (`allowedDomains`) ;
 * - liens : SEULEMENT les routes du catalogue permis au rôle, libellés du catalogue ; tout autre lien est retiré ;
 * - demande de modification (CHANGE: yes, ou réponse qui prétend avoir modifié) → refus au texte FIXE du Figma, avec le
 *   lien de l'éditeur IA : le texte du modèle est alors ignoré (il ne peut ni « faire » ni rédiger la modification).
 */

export const ANSWER_MAX = 700

export const REFUSAL_TEXT = 'I can’t change anything. To edit a text on the page, open it in the AI editor.'
export const REFUSAL_ELSEWHERE_TEXT = 'I can’t change anything. You can make this change yourself in the admin.'
export const EMPTY_ANSWER_TEXT = 'I don’t know. Try asking in another way.'

export type ParsedAnswer = { answer: string; links: AskLink[]; refusedChange: boolean }

type RawParts = { answer: string; links: string[]; change: boolean }

/** Découpe ANSWER / LINKS / CHANGE (tolérant : sans balises, tout le texte est la réponse). */
export function splitModelOutput(text: string): RawParts {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const answer: string[] = []
  const links: string[] = []
  let change = false
  let mode: 'answer' | 'other' = 'answer'
  for (const line of lines) {
    const tag = /^\s*\**\s*(ANSWER|LINKS?|CHANGE)\s*\**\s*:\s*\**\s*(.*)$/i.exec(line)
    if (tag) {
      const name = tag[1].toUpperCase()
      const rest = tag[2].trim()
      if (name === 'ANSWER') {
        mode = 'answer'
        if (rest) answer.push(rest)
      } else if (name.startsWith('LINK')) {
        mode = 'other'
        if (!/^none\.?$/i.test(rest)) links.push(...rest.split(/[\s,]+/).filter(Boolean))
      } else {
        mode = 'other'
        change = /^yes\b/i.test(rest)
      }
      continue
    }
    if (mode === 'answer') answer.push(line)
  }
  return { answer: answer.join('\n').trim(), links, change }
}

/** Phrases qui prétendent avoir modifié quelque chose : jamais vrai (aucun outil), donc refus. */
const CLAIMS_CHANGE =
  /\b(?:i(?:'ve|’ve| have)?|i just|done[,!.]?\s*i)\s+(?:now\s+)?(?:changed|updated|edited|replaced|renamed|deleted|removed|published|uploaded|set|added|created|modified|rewrote|fixed)\b/i

/**
 * Domaines du site laissés dans le texte (liste blanche de `sanitizeClientText`) : `site.domain` et l'hôte de `site.url`
 * s'il s'agit d'un nom de domaine (jamais une IP ni `localhost` : l'URL de développement n'a rien à faire dans une réponse).
 */
export function siteDomains(site: { domain?: string; url?: string }): string[] {
  const out = new Set<string>()
  const add = (host: string | undefined) => {
    const h = (host ?? '').trim().toLowerCase().replace(/^www\./, '')
    if (h && /[a-z]/.test(h) && h.includes('.') && !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(h)) out.add(h)
  }
  add(site.domain)
  try {
    if (site.url) add(new URL(site.url).hostname)
  } catch {
    // URL illisible : seul le domaine compte.
  }
  return [...out]
}

/**
 * Texte affiché : sans markdown, sans URL, sans lien ; chemins de l'admin → nom de l'écran ; toute adresse hors des
 * domaines du site → « [link removed] » (SEC-08) ; ≤ ANSWER_MAX.
 */
export function cleanAnswer(text: string, routes: readonly AskRoute[], allowedDomains: readonly string[] = []): string {
  let out = text
    // [texte](url) → texte
    .replace(/\[([^\]]{1,200})\]\([^)]*\)/g, '$1')
    // Chemins de l'admin cités → nom de l'écran (le lien vit dans les boutons).
    .replace(/(?:https?:\/\/[^\s/]+)?\/admin(?:\/[A-Za-z0-9_-]+)*(?:\?page=[A-Za-z0-9_-]+)?/g, (match) => findAskRoute(routes, match)?.screen ?? '')
    // Toute autre adresse web.
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, '')
    .replace(/<[^>]{0,200}>/g, '')
    .replace(/[*_`#]+/g, '')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ +([.,;:!?])/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  // Filtre commun APRÈS le nettoyage : retirer balises et markdown peut recoller une adresse (« evil<b>.help »).
  out = sanitizeClientText(out, allowedDomains).trim()
  if (out.length > ANSWER_MAX) {
    const cut = out.slice(0, ANSWER_MAX)
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('.\n'))
    out = end > ANSWER_MAX / 2 ? cut.slice(0, end + 1) : `${cut.slice(0, ANSWER_MAX - 1).trimEnd()}…`
    // Couper peut raccourcir un mot en nom de domaine : filtre repassé sur le texte final.
    out = sanitizeClientText(out, allowedDomains)
  }
  return out
}

/**
 * Réponse finale. `allowedDomains` : domaines du site gardés dans le texte (`siteDomains(config.site)`) ; absent =
 * toute adresse est retirée. Pour un refus sans lien utile : l'éditeur IA de `screenPageId` (page ouverte) s'il est dans
 * `editorPageIds`, sinon de la première page qui l'a.
 */
export function finalizeAnswer(
  text: string,
  routes: readonly AskRoute[],
  options: { editorPageIds: readonly string[]; screenPageId?: string | null; allowedDomains?: readonly string[] },
): ParsedAnswer {
  const parts = splitModelOutput(text)
  const links = resolveAskLinks(routes, parts.links)
  const answer = cleanAnswer(parts.answer, routes, options.allowedDomains ?? [])
  const refused = parts.change || CLAIMS_CHANGE.test(parts.answer)
  if (!refused) return { answer: answer || EMPTY_ANSWER_TEXT, links, refusedChange: false }

  const editorLinks = links.filter((link) => link.href.startsWith('/admin/editor'))
  if (editorLinks.length) return { answer: REFUSAL_TEXT, links: editorLinks.slice(0, 1), refusedChange: true }
  if (links.length) return { answer: REFUSAL_ELSEWHERE_TEXT, links, refusedChange: true }
  // Aucun lien utile : l'éditeur IA de la page ouverte, sinon de la première page qui l'a (« Open Home in AI editor »).
  const pageId = options.screenPageId && options.editorPageIds.includes(options.screenPageId) ? options.screenPageId : options.editorPageIds[0]
  const fallback = pageId ? resolveAskLinks(routes, [editorHref(pageId)]) : []
  return { answer: fallback.length ? REFUSAL_TEXT : 'I can’t change anything.', links: fallback, refusedChange: true }
}
