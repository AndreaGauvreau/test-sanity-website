import { tool, type createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import { EDITOR_VIEWPORTS, MEASURED_VIEWPORTS_TEXT } from '../../../src/admin/core/contracts/engine'
import type { AskTool } from './questions'
import type { TextTool } from './text'

/**
 * Outils en mémoire du serveur MCP `kuartz` : set_text, measure, ask_client — TOUJOURS déclarés, TOUJOURS dans cet
 * ordre, avec une définition FIXE (nom, description, schéma) : leurs définitions ouvrent le prompt envoyé au modèle
 * (outils → système → messages) et le cache du prompt ne sert d'une demande à l'autre que si elles ne changent pas
 * (tâche 23 du POC). Ce que la demande permet se décide À L'APPEL : hook PreToolUse, puis ces gestionnaires.
 */

/** Outil measure : l'élément tel qu'il s'affiche dans l'aperçu, décrit pour Claude (measure.ts d'engine-guards). */
export type MeasureTool = { measure: () => Promise<string> }

export type ToolHandlers = { textTool?: TextTool; measureTool?: MeasureTool; askTool?: AskTool }

export type KuartzTools = NonNullable<Parameters<typeof createSdkMcpServer>[0]['tools']>

// Largeurs citées, tirées des formats de l'éditeur (contrat EDITOR_VIEWPORTS) : fixes d'une demande à l'autre (cache).
// Mesurées : 375, 810 et 1280 px (Tablet = point de rupture tablette du site) ; une ligne gagnée compte à 375 px.
const MOBILE = EDITOR_VIEWPORTS.mobile

export const MEASURE_DESCRIPTION =
  `Measures the selected element as it renders right now in the draft preview, at ${MEASURED_VIEWPORTS_TEXT} px: ` +
  'lines, size, weight, color, effective background and WCAG contrast of each text (10 at most), width, ' +
  'grid (columns, rows), alignment, margins inside the parent, visual order of the children. ' +
  'Call it after your changes to check a requested result.'

export const SET_TEXT_DESCRIPTION =
  'Saves the new text of one Sanity field of the selected element, in the draft. ' +
  'The editable fields (their exact ids) and their limits are in the request. ' +
  'Plain text, no HTML or Markdown (asterisks for emphasis only where the request allows it). ' +
  'Call the tool again to fix a refused text.'

/**
 * Description de l'outil ask_client : les quatre cas où Claude interroge le client plutôt que de trancher seul, et tout
 * ce que questionProblems refuse, pour que Claude n'ait pas à reformuler. Tient sous 2 048 caractères (plafond de Claude
 * Code pour une description d'outil MCP : au-delà, la fin est coupée).
 */
export const ASK_CLIENT_DESCRIPTION =
  'Asks the client one or more questions and waits for the answer. Use it: ' +
  '(1) when part of the request does not exactly match the design system (color, transparency, size, radius, spacing…); ' +
  '(2) when information only the client knows is missing (price, hours, number, address); ' +
  '(3) when the requested text contradicts what the element does (a link that goes elsewhere, an offer absent from the site); ' +
  `(4) when a rewritten text would gain a line at ${MOBILE} px. ` +
  '2 to 4 options per question: tone "recommended" = the closest token variant, or the advised version; ' +
  '"neutral" = leave this point unchanged; "discouraged" = the exact hard-coded value, outside the design system, with ' +
  'hardcoded { property, value } (on this option only): never for font-family, font, opacity, display, position or transform, ' +
  'nor for an image, outline, shadow or offset (background-image, outline, outline-offset, box-shadow, top, right, bottom, ' +
  'left, inset…), nor for a property the editor does not allow; never url(), @import, a web address, calc() or a negative ' +
  'value (nor min(), max(), clamp() or any other math function). ' +
  'No question, topic or option, whatever its tone, cites url(), @import or a web address. ' +
  `Any option whose text gains a line at ${MOBILE} px carries effect "longer-text" and says in its label or description how many ` +
  'lines the text will take on mobile (never the neutral option, and at least one option without it). ' +
  'A question that breaks these rules is refused: rephrase it. ' +
  'The client can always answer freely. ' +
  'For (2), no option proposes a value: the client gives it as a free answer; options: do not add it (neutral) and, if ' +
  'useful, a wording without that fact. ' +
  'Group your questions in one call, before changing the points concerned and, for (2) and (3), before any set_text. ' +
  `A line gained at ${MOBILE} px is seen after set_text and measure: then ask a new question.`

/** Schéma d'ask_client (zod 4) : bornes reprises du POC, effet `longer-text` du contrat. */
export const QUESTIONS_SCHEMA = {
  questions: z
    .array(
      z.object({
        topic: z.string().max(30).optional().describe('Short topic: “Color”, “Size”…'),
        question: z.string().min(1).max(300),
        options: z
          .array(
            z.object({
              label: z.string().min(1).max(80),
              description: z.string().max(300).optional(),
              tone: z.enum(['recommended', 'neutral', 'discouraged']),
              hardcoded: z
                .object({ property: z.string().min(1).max(60), value: z.string().min(1).max(120) })
                .optional()
                .describe('Discouraged option only: the CSS property and the exact hard-coded value.'),
              effect: z
                .enum(['longer-text'])
                .optional()
                .describe(
                  `Option whose text gains a line at ${MOBILE} px (never the neutral option, never every option; its label or description says how many lines the text will take on mobile): the client’s consent is required to apply a longer text.`,
                ),
            }),
          )
          .min(2)
          .max(4),
      }),
    )
    .min(1)
    .max(3),
}

export const SET_TEXT_SCHEMA = { field: z.string(), value: z.string() }

/** Réponse d'un outil qui ne sert pas dans cette demande : Claude lit l'erreur et passe à autre chose. */
const unavailable = (text: string) => ({ content: [{ type: 'text' as const, text }], isError: true })

/**
 * Les trois outils, dans l'ordre. `pauseClock` suspend le délai de Claude pendant l'attente d'une réponse du client.
 */
export function kuartzTools(handlers: ToolHandlers, pauseClock: <T>(task: () => Promise<T>) => Promise<T>): KuartzTools {
  const { textTool, measureTool, askTool } = handlers
  return [
    tool('set_text', SET_TEXT_DESCRIPTION, SET_TEXT_SCHEMA, async ({ field, value }) => {
      // Le hook refuse déjà set_text sans « T » ni mise en avant : ce refus ne sert qu'en dernier recours.
      if (!textTool) return unavailable('Text not enabled: no editable text for this request.')
      const error = await textTool.onSet(field, value)
      return { content: [{ type: 'text', text: error ?? `Text saved in the draft for ${field}.` }], isError: error !== null }
    }),
    tool('measure', MEASURE_DESCRIPTION, {}, async () => {
      if (!measureTool) return unavailable('Measure unavailable: visual checks are turned off.')
      return { content: [{ type: 'text', text: await measureTool.measure() }] }
    }),
    tool('ask_client', ASK_CLIENT_DESCRIPTION, QUESTIONS_SCHEMA, async ({ questions }) => {
      if (!askTool) return unavailable('Questions unavailable.')
      const result = await pauseClock(() => askTool.ask(questions))
      return 'error' in result
        ? { content: [{ type: 'text', text: result.error }], isError: true }
        : { content: [{ type: 'text', text: result.answer }] }
    }),
  ]
}
