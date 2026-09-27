/**
 * Zones de l'éditeur IA : ce que Claude a le droit de toucher, élément par élément.
 * Repris du POC (zones.json de LyonDrive, corrections 7 et 8 de la batterie), adapté à Sanity.
 *
 * Fichiers du site (agent site-adapter) :
 * - `src/editor/zones.json`  : { controls, zones } au format ZonesFile ci-dessous ;
 * - `src/editor/RULES.md`    : les règles données à Claude (une seule source, testée contre la politique CSS) ;
 * - `src/styles/tokens.json` : les tokens du site, groupés, dérivés de `src/styles/tokens.css` (test de synchro).
 *
 * Marquage du DOM, rendu SEULEMENT en mode aperçu de l'éditeur (jamais sur le site public) :
 * - `data-edit="<zoneId>"`       sur l'élément de la zone ;
 * - `data-edit-doc="<_id>"`      sur un ancêtre, id PUBLIÉ du document (sans « drafts. », nettoyé du stega) ;
 * - `data-edit-key="<_key>"`     sur l'élément d'un tableau Sanity (cartes, modules…).
 *
 * CONTRAT PARTAGÉ — propriétaire : l'orchestrateur. Lu par le site, le pont de l'aperçu et le moteur.
 */

export type ControlDef = {
  label: string
  /** Propriété CSS réglée. */
  property: string
  /** Groupe de tokens permis (clé de tokens.json). */
  group?: string
  /** Valeurs permises quand ce n'est pas un groupe de tokens. */
  options?: Record<string, string>
}

/** Texte stocké dans Sanity. */
export type SanityTextBinding = {
  source: 'sanity'
  /** Singleton (id fixe) ou document lu sur l'attribut data-edit-doc de l'élément (élément de collection). */
  document: { type: string; id: string } | { type: string; from: 'data-edit-doc' }
  /**
   * Chemin Sanity du champ → longueur visible maximale.
   * `$key` est remplacé par la `_key` lue sur data-edit-key : ex. « features.items[_key=="$key"].title ».
   * Jamais d'index numérique : l'ordre d'un tableau peut changer entre la sélection et l'écriture.
   */
  fields: Record<string, number>
  /** Champs à retours à la ligne significatifs → nombre de lignes maximal. */
  lines?: Record<string, number>
  /** Champs dont la valeur est fermée (liste) : jamais réécrits comme du texte. */
  closed?: string[]
}

/** Texte écrit en dur dans le code du site. */
export type CodeTextBinding = { source: 'code'; files: string[] }

export type ZoneDef = {
  /** Libellé court en anglais (« Title »), affiché dans la puce « Hero · Title ». */
  label: string
  /** Section à laquelle la zone appartient (« Hero »). */
  section: string
  /** Fichiers que la zone met en jeu (CSS Module + composant). */
  files: string[]
  /** Classes du CSS Module qui appartiennent à la zone ; la première est celle de l'élément data-edit. */
  selectors: string[]
  /** Réglages proposés (clés de ZonesFile.controls). */
  controls: string[]
  hint?: string
  text?: SanityTextBinding | CodeTextBinding
  /** Zones intérieures : le conteneur ne leur pose que du placement. */
  children?: string[]
  /** Masquable selon l'écran (display: none en mobile-first, rétabli à un point de rupture déclaré). */
  hideable?: true
  /** Logotype : exempté du seuil de contraste (plancher 1,5:1). */
  logotype?: true
  /** Où le style s'applique aussi, pour le dire au client (« every page of the site »). */
  reach?: string
}

export type ZonesFile = {
  controls: Record<string, ControlDef>
  zones: Record<string, ZoneDef>
}

export type Token = { label: string; value: string }
export type TokenGroup = { label: string; locked?: boolean; tokens: Record<string, Token> }
/** src/styles/tokens.json : groupes de tokens (clé = nom de la custom property sans « -- »). */
export type TokensFile = Record<string, TokenGroup>
