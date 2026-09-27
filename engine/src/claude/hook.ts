import type { HookCallback } from '@anthropic-ai/claude-agent-sdk'
import type { Scope, ZonesFile } from '../../../src/admin/core/contracts'
import { checkToolUse, type Verdict } from '../guards/guards'
import type { ToolAccess } from '../guards/types'

/**
 * Hook PreToolUse de Claude et périmètre des outils d'une demande.
 *
 * La décision elle-même (`checkToolUse` : quels fichiers se lisent, se cherchent, se modifient ; quels outils existent)
 * appartient à engine-guards (`engine/src/guards/guards.ts`) : ce module l'adapte au format du SDK et calcule ce que le
 * périmètre choisi par le client ouvre (`toolAccessFor`, porté de `job.ts > toolAccessFor` du POC).
 */

export type { ToolAccess, Verdict }

/** Ce que le hook journalise quand il refuse (étape `warn` du contrat). */
export type HookEvent = { kind: 'warn'; label: string }

/**
 * Hook PreToolUse sans matcher : TOUS les outils passent par lui. Un refus renvoie `permissionDecision: 'deny'` avec la
 * raison, que Claude lit, et une étape `warn` apparaît dans l'activité. `decide` est injectable pour les tests.
 */
export function createGuardHook(
  cwd: string,
  access: ToolAccess,
  onEvent: (event: HookEvent) => void,
  decide: typeof checkToolUse = checkToolUse,
): HookCallback {
  return async (input) => {
    if (input.hook_event_name !== 'PreToolUse') return {}
    const verdict = decide(cwd, access, input.tool_name, (input.tool_input ?? {}) as Record<string, unknown>)
    if (verdict.allow) return {}
    onEvent({ kind: 'warn', label: verdict.reason })
    return {
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: verdict.reason },
    }
  }
}

/** Demande vue pour le périmètre : 🖌 / T et zones visées. */
export type AccessRequest = { scope: { style: boolean; text: boolean }; targets: readonly { zone: string }[] }

/** « style » / « text » du contrat → booléens. */
export const scopeOf = (scope: readonly Scope[]) => ({ style: scope.includes('style'), text: scope.includes('text') })

/**
 * Fichiers modifiables et outil de texte, selon le périmètre choisi par le client :
 * 🖌 Style n'ouvre que les CSS des zones visées (jamais un composant) ; T Texte ouvre les fichiers de texte d'une zone
 * dont le texte est écrit dans le code ; set_text s'ouvre s'il y a au moins un champ Sanity modifiable
 * (`textFieldCount` = `editableFields(...).length`, voir text.ts). Zone inconnue ou héritée d'Object : ignorée.
 */
export function toolAccessFor(zones: ZonesFile['zones'], request: AccessRequest, textFieldCount: number): ToolAccess {
  const files = new Set<string>()
  for (const { zone: id } of request.targets) {
    if (!Object.hasOwn(zones, id)) continue
    const zone = zones[id]
    if (request.scope.style) for (const file of zone.files) if (file.endsWith('.css')) files.add(file)
    if (request.scope.text && zone.text?.source === 'code') for (const file of zone.text.files) files.add(file)
  }
  return { files: [...files], textTool: textFieldCount > 0 }
}
