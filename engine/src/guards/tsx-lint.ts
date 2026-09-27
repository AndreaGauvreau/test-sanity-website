import ts from 'typescript'
import { frozenSet, type ScopeFlags as Scope, type Violation, type ZoneDef } from './types'

/**
 * Contrôle des composants modifiés par Claude : arbre TypeScript entier avant/après, dans tous les modes.
 * Le « squelette » (balises, attributs, imports, expressions) ne change jamais ; seul peut changer le texte visible
 * (avec T Texte), dans la zone sélectionnée : l'élément qui porte son data-edit et son sous-arbre. Aucune className ne
 * s'ajoute, ne se retire ni ne change, quel que soit le mode : le style passe uniquement par les règles CSS de la zone.
 */

export type TsxRisk = 'script' | 'dangerous-html' | 'event-handler' | 'inline-style' | 'process-env' | 'import' | 'javascript-url'

/**
 * Zone sélectionnée : sa valeur de data-edit, et les fichiers où son texte est écrit (zones.json, `text.files` d'une zone
 * dont le texte est dans le code ; aucun si le texte vient du CMS). Un texte ne change que dans ces fichiers, dans le
 * sous-arbre de la zone ; un attribut de texte, aussi hors de ce sous-arbre si le fichier ne contient pas la zone :
 * `<PageTitle title="Blog" intro="…" />` de la page du blog.
 */
export type TsxZone = { id: string; textFiles: string[] }

/** La zone `id` de zones.json vue par le contrôle TSX (runChecks : `tsxZone(request.zone, ds.zones[request.zone])`). */
export const tsxZone = (id: string, def: ZoneDef | undefined): TsxZone => ({
  id,
  textFiles: def?.text?.source === 'code' ? [...def.text.files] : [],
})

/** Place d'un texte : zones (data-edit) de l'élément qui le porte et de ses ancêtres ; attribut (title, intro…) ou texte JSX. */
export type TsxPlace = { zones: string[]; attribute: boolean }

export type TsxSnapshot = {
  /**
   * Suite des nœuds de l'arbre (avec les commentaires, l'opérateur d'un unaire, let/const, import type) ;
   * `#texte` et `#classe` marquent la place d'un texte visible ou d'une className, `#texte-vide` celle d'un texte
   * qui n'affiche rien (vide, blancs, `&nbsp;`, U+200B…).
   */
  skeleton: string[]
  /** Textes visibles, dans l'ordre, blancs réduits. */
  texts: string[]
  /** Place de chaque texte visible, dans le même ordre. */
  textPlaces: TsxPlace[]
  /**
   * Valeur écrite de chaque className, dans l'ordre, et ses jetons (nœuds, texte des identifiants et des littéraux,
   * commentaires, comme le squelette) : deux valeurs qui ne diffèrent que par les blancs ont les mêmes jetons.
   */
  classNames: { text: string; tokens: string[] }[]
  dataEdit: string[]
  risks: Record<TsxRisk, number>
  parseErrors: string[]
}

/** Attributs dont une chaîne littérale est du texte visible (ou lu par un lecteur d'écran). */
export const TEXT_ATTRIBUTES: ReadonlySet<string> = frozenSet(['title', 'intro', 'alt', 'aria-label'])

const DANGEROUS_TAGS = new Set(['script', 'iframe', 'link', 'style', 'object', 'embed'])

const RISK_MESSAGES: Record<TsxRisk, string> = {
  script: 'Forbidden tag added (<script>, <iframe>, <link>, <style>, <object>, <embed>).',
  'dangerous-html': '`dangerouslySetInnerHTML` added: forbidden.',
  'event-handler': 'Event handler (onClick…) added: forbidden.',
  'inline-style': 'No `style={{…}}`: use the CSS Module.',
  'process-env': '`process.env` added: no environment variable in a component.',
  import: 'Import added or changed: forbidden.',
  'javascript-url': 'javascript: URL forbidden.',
}

const STRUCTURE_CHANGE =
  'Component structure changed: no tag, attribute, import or {…} expression is added, removed, moved or changed, whatever the mode. This is a developer’s job: put the component back as it was and tell the client.'

const TEXT_OUT_OF_FILES = (text: string) =>
  `Text changed in a file where this zone’s text is not written: “${text}”. Put it back as it was ` +
  '(a text that comes from the CMS is changed with set_text).'

const TEXT_OUT_OF_ZONE = (text: string, id: string) =>
  `Text outside the zone changed: “${text}”. Only the text of the data-edit="${id}" element and of what it contains ` +
  'may change: put this one back as it was.'

const CLASSNAME_CHANGE = (detail: string) =>
  `${detail} No className is added, removed or changed in a component, whatever the mode: style ` +
  'goes only through the zone’s CSS rules. Put the component back as it was.'

const normalize = (text: string) => text.replace(/\s+/g, ' ').trim()

/** Entités numériques, et entités nommées de JSX qui valent un blanc ou un caractère invisible. */
const ENTITY = /&(?:#x([\da-f]+)|#(\d+)|(?:nbsp|ensp|emsp|thinsp|zwnj|zwj|lrm|rlm|shy));/gi

/** Blancs (U+00A0 compris), caractères de contrôle ou de format (U+200B à U+200D, U+2060, U+FEFF…), blanc braille. */
const INVISIBLE = /[\s\p{Cc}\p{Cf}\p{Default_Ignorable_Code_Point}⠀]/gu

/** Texte qui n'affiche rien : vide, ou fait seulement de blancs, d'entités ou de caractères invisibles (`&nbsp;`, U+200B…). */
function isBlank(text: string): boolean {
  const decoded = text.replace(ENTITY, (entity, hex?: string, decimal?: string) => {
    if (hex === undefined && decimal === undefined) return ''
    const code = hex === undefined ? Number(decimal) : parseInt(hex, 16)
    return code <= 0x10ffff ? String.fromCodePoint(code) : entity
  })
  return decoded.replace(INVISIBLE, '') === ''
}

const scriptKind = (file: string) =>
  file.endsWith('.tsx') ? ts.ScriptKind.TSX : file.endsWith('.jsx') ? ts.ScriptKind.JSX : file.endsWith('.js') ? ts.ScriptKind.JS : ts.ScriptKind.TS

/** Nom d'une balise JSX, pour repérer <script>, <iframe>… (une balise HTML s'écrit en minuscules ; <Link> est un composant). */
const tagOf = (node: ts.Node, sf: ts.SourceFile) =>
  ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node) ? node.tagName.getText(sf) : null

/**
 * Fonction du site qui écrit le marquage d'une zone (`src/lib/editor/preview.ts`) : `{...editAttrs('hero.title')}` sur
 * une balise, ou `edit={editAttrs('tour.cta')}` passé à un composant (Button, Eyebrow) qui l'étale sur sa racine.
 */
export const EDIT_ATTRS = 'editAttrs'

/** Zone marquée par un appel `editAttrs('<zone>', …)` (premier argument littéral) ; null pour tout autre nœud ou `editAttrs(null, …)`. */
function editAttrsZone(node: ts.Node): string | null {
  if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression) || node.expression.text !== EDIT_ATTRS) return null
  const [first] = node.arguments
  return first && ts.isStringLiteralLike(first) ? first.text : null
}

/**
 * Zones portées par un élément JSX ; aucune pour un autre nœud. Trois écritures : `data-edit="…"` (littéral),
 * `{...editAttrs('…')}` (étalé sur la balise) et `edit={editAttrs('…')}` (quel que soit le nom de l'attribut : le
 * composant étale le marquage sur sa racine, ses enfants sont dans la zone).
 */
function dataEditOf(node: ts.Node, sf: ts.SourceFile): string[] {
  const element = ts.isJsxElement(node) ? node.openingElement : ts.isJsxSelfClosingElement(node) ? node : null
  if (!element) return []
  return element.attributes.properties.flatMap((property) => {
    if (ts.isJsxSpreadAttribute(property)) {
      const zone = editAttrsZone(property.expression)
      return zone === null ? [] : [zone]
    }
    if (!ts.isJsxAttribute(property) || !property.initializer) return []
    const value = property.initializer
    if (property.name.getText(sf) === 'data-edit' && ts.isStringLiteral(value)) return [value.text]
    const zone = ts.isJsxExpression(value) && value.expression ? editAttrsZone(value.expression) : null
    return zone === null ? [] : [zone]
  })
}

/**
 * Ce qui change le sens d'un nœud sans être un nœud visité par forEachChild : l'opérateur d'un unaire (`!x` → `+x`),
 * let/const/using d'une déclaration, `import type` (l'import disparaît à l'exécution).
 */
function detailOf(node: ts.Node): string | null {
  if (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) return ts.tokenToString(node.operator) ?? null
  if (ts.isVariableDeclarationList(node)) return `flags ${node.flags & ts.NodeFlags.BlockScoped}`
  if (
    ts.isImportClause(node) ||
    ts.isImportSpecifier(node) ||
    ts.isExportSpecifier(node) ||
    ts.isExportDeclaration(node) ||
    ts.isImportEqualsDeclaration(node)
  ) {
    return node.isTypeOnly ? 'type' : null
  }
  return null
}

/** Entrée d'un nœud dans le squelette : son type, avec le texte d'un identifiant ou d'un littéral, ou son détail. */
function nodeEntry(node: ts.Node): string {
  const kind = ts.SyntaxKind[node.kind]
  const literal =
    ts.isIdentifier(node) || ts.isPrivateIdentifier(node)
      ? node.text
      : ts.isLiteralExpression(node) || ts.isTemplateLiteralToken(node)
        ? node.text
        : detailOf(node)
  return literal === null ? kind : `${kind}:${literal}`
}

export function tsxSnapshot(file: string, source: string): TsxSnapshot {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKind(file))
  const snapshot: TsxSnapshot = {
    skeleton: [],
    texts: [],
    textPlaces: [],
    classNames: [],
    dataEdit: [],
    risks: { script: 0, 'dangerous-html': 0, 'event-handler': 0, 'inline-style': 0, 'process-env': 0, import: 0, 'javascript-url': 0 },
    parseErrors: [],
  }
  const { skeleton, texts, risks } = snapshot

  /** Ajouts dangereux, comptés partout, y compris dans une className (hors squelette). */
  const countRisks = (node: ts.Node) => {
    if (DANGEROUS_TAGS.has(tagOf(node, sf) ?? '')) risks.script++
    if (ts.isIdentifier(node) && node.text === 'process') risks['process-env']++
    if (ts.isIdentifier(node) && node.text === 'dangerouslySetInnerHTML') risks['dangerous-html']++
    if (ts.isImportDeclaration(node) || ts.isImportEqualsDeclaration(node)) risks.import++
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) risks.import++
    if ((ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node)) && /javascript:/i.test(node.text)) risks['javascript-url']++
  }

  /**
   * Commentaires placés avant le nœud (entre sa position pleine et son premier caractère) : un pragma `@jsxImportSource`
   * ou `@jsx` change le module importé. Un texte JSX n'a pas de commentaire, même s'il contient `//`.
   */
  const commentPositions = new Set<number>()
  const recordComments = (node: ts.Node, entries: string[]) => {
    if (ts.isJsxText(node) || commentPositions.has(node.pos)) return
    commentPositions.add(node.pos)
    const trivia = normalize(source.slice(node.pos, node.getStart(sf)))
    if (trivia) entries.push(`Commentaire:${trivia}`)
  }

  /** Jetons d'une valeur de className : ses nœuds et ses commentaires, relevés comme ceux du squelette. */
  const tokensOf = (value: ts.Node) => {
    const tokens: string[] = []
    const walk = (node: ts.Node) => {
      recordComments(node, tokens)
      tokens.push(nodeEntry(node))
      ts.forEachChild(node, walk)
    }
    walk(value)
    return tokens
  }

  /** Zones (data-edit) des éléments JSX qui contiennent le nœud visité, l'élément lui-même compris. */
  const enclosing: string[] = []

  /**
   * Texte visible (texte JSX ou attribut title, intro…). Un texte qui n'affiche rien est une place à part, `#texte-vide` :
   * vider un texte change la structure (`{intro && <p …>}` ferait disparaître une zone).
   */
  const recordText = (text: string, attribute: boolean) => {
    if (isBlank(text)) {
      skeleton.push('#texte-vide')
      return
    }
    skeleton.push('#texte')
    texts.push(text)
    snapshot.textPlaces.push({ zones: [...enclosing], attribute })
  }

  const visit = (node: ts.Node, record: boolean) => {
    countRisks(node)
    // Marquage par editAttrs('<zone>'…), où qu'il soit écrit (étalé, passé en attribut ou ailleurs) : compté comme un
    // data-edit littéral (FOLLOWUPS #2, Conduit n'écrit plus de data-edit en dur).
    const marked = editAttrsZone(node)
    if (marked !== null) snapshot.dataEdit.push(marked)
    if (record) recordComments(node, skeleton)
    if (ts.isJsxText(node)) {
      // Blancs seuls entre deux balises : mise en forme, sans place dans le squelette.
      const text = normalize(node.text)
      if (text && record) recordText(text, false)
      return
    }
    if (ts.isJsxAttribute(node) && record) {
      const name = node.name.getText(sf)
      const value = node.initializer
      skeleton.push(`@${name}`)
      if (/^on[A-Z]/.test(name)) risks['event-handler']++
      if (name === 'style') risks['inline-style']++
      if (name === 'dangerouslySetInnerHTML') risks['dangerous-html']++
      if (name === 'data-edit' && value && ts.isStringLiteral(value)) snapshot.dataEdit.push(value.text)
      if (name === 'className' && value) {
        // La valeur d'une className est rangée à part, hors squelette : elle ne change jamais (classname-change).
        skeleton.push('#classe')
        snapshot.classNames.push({ text: value.getText(sf), tokens: tokensOf(value) })
        ts.forEachChild(value, (child) => visit(child, false))
        countRisks(value)
        return
      }
      if (TEXT_ATTRIBUTES.has(name) && value && ts.isStringLiteral(value)) {
        recordText(normalize(value.text), true)
        return
      }
      if (value) visit(value, record)
      return
    }
    if (record) skeleton.push(nodeEntry(node))
    // Les attributs de texte d'un élément (son aria-label, son title…) et ses enfants sont dans ses zones.
    const own = record ? dataEditOf(node, sf) : []
    enclosing.push(...own)
    ts.forEachChild(node, (child) => visit(child, record))
    enclosing.length -= own.length
  }
  ts.forEachChild(sf, (child) => visit(child, true))

  // Champ interne du compilateur, non typé : les erreurs de syntaxe relevées à l'analyse.
  const diagnostics = (sf as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics ?? []
  snapshot.parseErrors = diagnostics.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '))
  return snapshot
}

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((value, i) => value === b[i])

function countBy(values: string[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return counts
}

/**
 * Composant avant/après (null : absent), jugé pour une demande de périmètre `scope` sur la zone `zone`.
 * Aucune className ne s'ajoute, ne se retire ni ne change, quel que soit le mode (`classname-change`) : une classe prise
 * à une autre zone, ou libérée puis reprise, lierait deux zones. Squelettes égaux, un texte ne change que dans un fichier
 * de `zone.textFiles`, dans le sous-arbre de la zone (ou dans un attribut de texte si le fichier ne contient pas la zone).
 */
export function lintTsxFiles(
  file: string,
  before: string | null,
  after: string | null,
  scope: Scope,
  zone: TsxZone | readonly TsxZone[],
): Violation[] {
  if (after === null) return [{ file, rule: 'file-deleted', message: 'File deleted: forbidden.' }]
  if (before === null) return [{ file, rule: 'file-created', message: 'New component: forbidden.' }]
  const was = tsxSnapshot(file, before)
  const now = tsxSnapshot(file, after)
  if (now.parseErrors.length) {
    return [{ file, rule: 'tsx-parse', message: `The component no longer parses: ${now.parseErrors[0]}` }]
  }

  const violations: Violation[] = []
  for (const risk of Object.keys(RISK_MESSAGES) as TsxRisk[]) {
    if (now.risks[risk] > was.risks[risk]) violations.push({ file, rule: risk, message: RISK_MESSAGES[risk] })
  }
  const zonesBefore = countBy(was.dataEdit)
  const zonesAfter = countBy(now.dataEdit)
  for (const id of new Set([...zonesBefore.keys(), ...zonesAfter.keys()])) {
    if (zonesBefore.get(id) !== zonesAfter.get(id)) {
      violations.push({ file, rule: 'data-edit', message: `The data-edit="${id}" attribute must stay intact.` })
    }
  }
  // Aucune className ajoutée, retirée ou modifiée (les blancs ne comptent pas), quel que soit le mode.
  if (was.classNames.length !== now.classNames.length) {
    const detail = `className added or removed (${was.classNames.length} before, ${now.classNames.length} after).`
    violations.push({ file, rule: 'classname-change', message: CLASSNAME_CHANGE(detail) })
  } else {
    const changed = was.classNames.flatMap((className, i) => {
      const next = now.classNames[i]
      return sameList(className.tokens, next.tokens) ? [] : [`\`${className.text}\` became \`${next.text}\``]
    })
    if (changed.length) {
      const detail = `className changed: ${changed.join(', ')}.`
      violations.push({ file, rule: 'classname-change', message: CLASSNAME_CHANGE(detail) })
    }
  }
  if (!sameList(was.skeleton, now.skeleton)) {
    violations.push({ file, rule: 'structure-change', message: STRUCTURE_CHANGE })
    return violations
  }

  // Squelettes égaux : mêmes textes aux mêmes places, dans les mêmes zones (data-edit fait partie du squelette).
  const changedTexts = was.texts.flatMap((text, i) => (text === now.texts[i] ? [] : [i]))
  if (changedTexts.length && !scope.text) {
    violations.push({ file, rule: 'text-change', message: 'Style mode: the visible text must not change.' })
  } else {
    // Le texte d'une zone ne s'écrit que dans ses fichiers de texte : jamais pour une zone dont le texte vient du CMS.
    // Portage (demande à plusieurs éléments) : un texte passe s'il est permis pour l'une des zones visées ; une seule
    // zone : le jugement du POC, à l'identique.
    const targets = 'id' in zone ? [zone as TsxZone] : [...(zone as readonly TsxZone[])]
    const allowedFor = (target: TsxZone, i: number) => {
      const place = was.textPlaces[i]
      const zoneInFile = was.dataEdit.includes(target.id)
      return target.textFiles.includes(file) && (place.zones.includes(target.id) || (place.attribute && !zoneInFile))
    }
    // Zone citée dans le message : la première dont le texte s'écrit dans ce fichier.
    const cited = targets.find((target) => target.textFiles.includes(file))
    for (const i of changedTexts) {
      if (targets.some((target) => allowedFor(target, i))) continue
      const message = cited ? TEXT_OUT_OF_ZONE(was.texts[i], cited.id) : TEXT_OUT_OF_FILES(was.texts[i])
      violations.push({ file, rule: 'text-zone', message })
    }
  }
  return violations
}
