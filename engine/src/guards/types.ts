import type { Scope } from '../../../src/admin/core/contracts/engine'
import type { ControlDef, TokenGroup, TokensFile, ZoneDef, ZonesFile } from '../../../src/admin/core/contracts/zones'
import type { LintContext } from './guards'

/**
 * Types communs des garde-fous. Les types du design system viennent du contrat partagé (`core/contracts/zones.ts`) :
 * ils sont ré-exportés ici pour que les modules du dossier n'importent qu'un seul endroit.
 */

export type { ControlDef, TokenGroup, TokensFile, ZoneDef, ZonesFile }

/**
 * Ce que le client autorise Claude à modifier : 🖌 le style, T le texte, ou les deux. Le contrat (`EditRequest.scope`)
 * l'écrit en liste (`['style', 'text']`) : `scopeFlags` convertit.
 */
export type ScopeFlags = { style: boolean; text: boolean }

export const scopeFlags = (scope: readonly Scope[]): ScopeFlags => ({
  style: scope.includes('style'),
  text: scope.includes('text'),
})

/** Valeur écrite en dur, hors design system : seulement si le client l'a choisie (option 🔴 d'une question). */
export type Hardcoded = { property: string; value: string }

/** Fichier modifié : contenu au dernier commit (`before`) et dans la copie de travail (`after`) ; null = absent. */
export type ChangedFile = { file: string; before: string | null; after: string | null }

/** Refus d'un contrôle statique : fichier, règle, consigne pour Claude (en anglais), extrait. */
export type Violation = { file: string; rule: string; message: string; line?: string }

/**
 * Ce que le périmètre de la demande autorise : fichiers modifiables et outil de texte Sanity (set_text).
 * `lint` (SEC-07) : contexte du contrôle des fichiers (le même que `runStaticChecks`, voir `lintContextFor`) ; avec lui,
 * chaque Edit est jugé sur le fichier FUTUR avant d'être écrit. Sans lui, un Edit de composant est refusé et un Edit de
 * CSS n'est jugé qu'après l'essai. `lint.hardcoded` doit être le tableau VIVANT de la demande (réponses du client).
 */
export type ToolAccess = { files: string[]; textTool: boolean; lint?: LintContext }

/** Ensemble en lecture seule, gelé pour de bon : add, delete et clear lèvent une erreur (mineur #83 du POC). */
export function frozenSet<T>(values: Iterable<T>): ReadonlySet<T> {
  const set = new Set(values)
  const refuse = () => {
    throw new TypeError('Frozen set: read-only.')
  }
  Object.defineProperties(set, {
    add: { value: refuse },
    delete: { value: refuse },
    clear: { value: refuse },
  })
  return Object.freeze(set)
}
