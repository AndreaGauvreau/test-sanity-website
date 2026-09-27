import { domainToASCII } from 'node:url'

/**
 * Filtre UNIQUE des adresses dans tout texte montré au client de l'admin (SEC-08) : questions et options d'ask_client,
 * message final de Claude, réponses d'Ask AI (ask-ai l'importe sous ce nom). Des consignes injectées via le contenu du
 * site pourraient sinon faire afficher, dans une interface de confiance, « reconnectez-vous sur <domaine tiers> ».
 *
 * Retire : URL à schéma (`https://…`, `hxxp://…`), `//…`, `javascript:` / `data:` / `vbscript:` / `file:` / `blob:`,
 * adresses e-mail, noms de domaine NUS (`conduit-billing.help/login`), IPv4 ; IDN (Unicode, TLD non latins), punycode
 * (`xn--`), séparateurs IDN (`。` `．` `｡`) et points « désamorcés » (`[.]`, `(.)`, `{.}`) compris. Les caractères de
 * format invisibles (zero-width…) sont retirés d'abord. Seuls restent les hôtes de la liste blanche (et leurs
 * sous-domaines), comparés en punycode.
 */

/** Ce qui remplace une adresse retirée (lu par le client, en anglais). */
export const LINK_REMOVED = '[link removed]'

// Point entre deux labels : ASCII, points IDN, ou désamorcé.
const DOT = String.raw`(?:[.。．｡]|\[\.\]|\(\.\)|\{\.\})`
// Label de 1 à 63 caractères (lettres de tout alphabet, chiffres, marques combinantes, tirets internes).
const LABEL = String.raw`[\p{L}\p{N}](?:[\p{L}\p{N}\p{M}-]{0,61}[\p{L}\p{N}\p{M}])?`
// TLD : punycode, ou 2 lettres au moins (tout alphabet : « рф ») ; jamais de chiffres seuls (« 4.79 », « 1.5rem »).
const TLD = String.raw`(?:xn--[a-z0-9-]{1,59}|\p{L}[\p{L}\p{M}]{1,62})`
// 127 labels au plus (limite DNS) : borne le retour arrière.
const HOST = String.raw`(?:${LABEL}${DOT}){1,127}${TLD}`
const IPV4 = String.raw`\d{1,3}(?:${DOT}\d{1,3}){3}`
// Caractères d'une URL : tout sauf blancs, chevrons et guillemets (y compris ceux de quoteData ‹ ›).
const URL_CHARS = String.raw`[^\s<>"'“”«»‹›]`
const PORT_PATH = String.raw`(?::\d{1,5})?(?:[/?#]${URL_CHARS}*)?`

const ADDRESS = new RegExp(
  [
    // 1. schéma://… (tout schéma : https, hxxps, ftp…)
    String.raw`(?<scheme>\b[a-z][a-z0-9+.-]{1,20}:\/\/${URL_CHARS}*)`,
    // 2. schémas dangereux sans //
    String.raw`(?<danger>\b(?:javascript|data|vbscript|file|blob):(?=\S)${URL_CHARS}*)`,
    // 3. //… (relatif au protocole), ou « // » seul
    String.raw`(?<slashes>\/\/${URL_CHARS}*)`,
    // 4. e-mail (mailto: compris)
    String.raw`(?<email>(?:mailto:)?[\p{L}\p{N}._%+-]{1,64}@(?<emailHost>${HOST}|${IPV4}))`,
    // 5. domaine nu ou IPv4, avec port et chemin ; jamais au milieu d'un mot ou d'un nom déjà commencé
    String.raw`(?<![\p{L}\p{N}\p{M}_@./\\。．｡-])(?<bare>(?<bareHost>${HOST}|${IPV4})${PORT_PATH})`,
  ].join('|'),
  'giu',
)

/**
 * « TLD » qui sont des extensions de fichiers techniques, pas des domaines de premier niveau : `Next.js`,
 * `Hero.module.css` ne sont pas des adresses. Aucune n'est un TLD délégué.
 */
const FILE_EXTENSIONS: ReadonlySet<string> = new Set([
  'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'mts', 'cts', 'css', 'scss', 'sass', 'less', 'json', 'mdx', 'html', 'htm',
  'svg', 'png', 'jpg', 'jpeg', 'webp', 'avif', 'gif', 'ico', 'txt', 'yml', 'yaml', 'toml', 'lock', 'env', 'log', 'map',
])

// Ponctuation finale laissée au texte (« …help/login. » → l'adresse s'arrête avant le point).
const TRAILING = /[.,;:!?'’"”»›)\]}]$/u

/** Rend la ponctuation finale d'une correspondance ; une parenthèse fermante n'est rendue que si elle est en trop. */
function splitTrailing(match: string): [string, string] {
  let core = match
  let tail = ''
  while (core.length > 1 && TRAILING.test(core)) {
    const last = core[core.length - 1]
    const open = { ')': '(', ']': '[', '}': '{' }[last]
    if (open && core.split(open).length > core.split(last).length - 1) break
    tail = last + tail
    core = core.slice(0, -1)
  }
  return [core, tail]
}

/** Hôte en punycode minuscule (`bücher.de` → `xn--bcher-kva.de`), séparateurs IDN et désamorcés remis en points. */
function asciiHost(host: string): string | null {
  const dotted = host
    .replace(/\[\.\]|\(\.\)|\{\.\}|[。．｡]/g, '.')
    .replace(/\.+$/, '')
    .toLowerCase()
  const ascii = domainToASCII(dotted)
  return ascii || null
}

function allowedHosts(allowedDomains: readonly string[]): string[] {
  return allowedDomains.flatMap((domain) => {
    const host = asciiHost(domain.trim().replace(/^\*?\.+/, ''))
    return host ? [host] : []
  })
}

const isAllowed = (host: string | null, allowed: readonly string[]) =>
  host !== null && allowed.some((domain) => host === domain || host.endsWith(`.${domain}`))

/** Hôte d'une URL à schéma, ou null si elle ne se lit pas (retirée). */
function urlHost(url: string): string | null {
  try {
    return asciiHost(new URL(url).hostname)
  } catch {
    return null
  }
}

const PICTOGRAPHIC = /\p{Extended_Pictographic}|️/u

/**
 * Retire les caractères de format invisibles (zero-width, contrôles bidi…), qui servent à couper une adresse. Le
 * « zero width joiner » d'un emoji composé (👩‍💻) reste.
 */
export function stripInvisible(text: string): string {
  return text.replace(/\p{Cf}/gu, (char, offset: number, whole: string) => {
    if (char !== '‍') return ''
    const before = [...whole.slice(Math.max(0, offset - 2), offset)].pop() ?? ''
    const after = [...whole.slice(offset + 1, offset + 3)][0] ?? ''
    return PICTOGRAPHIC.test(before) && PICTOGRAPHIC.test(after) ? char : ''
  })
}

type Groups = Partial<Record<'scheme' | 'danger' | 'slashes' | 'email' | 'emailHost' | 'bare' | 'bareHost', string>>

/**
 * Texte montré au client sans adresse web hors de la liste blanche : chaque adresse devient `[link removed]`. Liste
 * vide : toutes les adresses sont retirées. `allowedDomains` : domaines du site (`conduit.com` couvre `www.conduit.com`),
 * en Unicode ou en punycode.
 */
export function sanitizeClientText(text: string, allowedDomains: readonly string[]): string {
  const allowed = allowedHosts(allowedDomains)
  return stripInvisible(text).replace(ADDRESS, (...args: unknown[]) => {
    const match = args[0] as string
    const groups = args[args.length - 1] as Groups
    const [core, tail] = splitTrailing(match)
    let host: string | null = null
    if (groups.scheme !== undefined) host = urlHost(core)
    else if (groups.slashes !== undefined) host = urlHost(`https:${core}`)
    else if (groups.email !== undefined) host = asciiHost(groups.emailHost ?? '')
    else if (groups.bare !== undefined) {
      host = asciiHost(groups.bareHost ?? '')
      const tld = (groups.bareHost ?? '').split(/\[\.\]|\(\.\)|\{\.\}|[.。．｡]/).pop()?.toLowerCase() ?? ''
      // Nom de fichier technique (`Next.js`, `Hero.module.css`) : pas une adresse.
      if (!groups.bare.slice(groups.bareHost?.length ?? 0) && FILE_EXTENSIONS.has(tld)) return match
    }
    // danger (javascript:, data:…) : jamais gardé.
    return (groups.danger === undefined && isAllowed(host, allowed) ? core : LINK_REMOVED) + tail
  })
}

/** Le texte contient-il une adresse hors liste blanche ? (un caractère invisible seul n'en est pas une) */
export const containsAddress = (text: string, allowedDomains: readonly string[]) =>
  sanitizeClientText(text, allowedDomains) !== stripInvisible(text)
