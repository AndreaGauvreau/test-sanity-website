/**
 * Le site peut-il s'afficher dans un cadre de l'admin ? (Figma B1 : « Site qui refuse l'affichage en iframe
 * (en-têtes) : message Preview unavailable + lien ».) PUR : lit X-Frame-Options et CSP frame-ancestors.
 *
 * @param headers   en-têtes de la réponse du site
 * @param parentOrigin origine de l'admin qui affiche le cadre
 * @param siteOrigin   origine finale du site (après redirections)
 */
export function canFrame(headers: { get(name: string): string | null }, parentOrigin: string, siteOrigin: string): boolean {
  const sameOrigin = parentOrigin === siteOrigin
  const csp = headers.get('content-security-policy')
  if (csp) {
    const directive = csp
      .split(';')
      .map((d) => d.trim())
      .find((d) => /^frame-ancestors(\s|$)/i.test(d))
    if (directive) {
      // CSP frame-ancestors a priorité sur X-Frame-Options (navigateurs actuels).
      const sources = directive.split(/\s+/).slice(1)
      if (sources.includes("'none'")) return false
      return sources.some((source) => {
        if (source === '*') return true
        if (source === "'self'") return sameOrigin
        return matchesSource(source, parentOrigin)
      })
    }
  }
  const xfo = headers.get('x-frame-options')?.trim().toUpperCase()
  if (xfo === 'DENY') return false
  if (xfo === 'SAMEORIGIN') return sameOrigin
  return true
}

function matchesSource(source: string, origin: string): boolean {
  try {
    const target = new URL(origin)
    if (/^https?:$/.test(source)) return target.protocol === source
    const withScheme = /^[a-z]+:\/\//i.test(source) ? source : `${target.protocol}//${source}`
    const url = new URL(withScheme.replace('*.', 'wildcard.'))
    if (url.protocol !== target.protocol) return false
    const host = url.hostname
    const hostOk = source.includes('*.')
      ? target.hostname.endsWith(host.replace(/^wildcard\./, '.'))
      : host === target.hostname
    const portOk = !url.port || url.port === target.port
    return hostOk && portOk
  } catch {
    return false
  }
}
