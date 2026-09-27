import { readFile } from 'node:fs/promises'
import path from 'node:path'
import postcss, { type Declaration, type Rule } from 'postcss'
import { createFakeAgent, fakeScenarios, type AgentRun, type FakeCall, type FakeStep } from '../claude'
import type { FakeClaudeScenario } from '../config'
import { loadDesignSystem } from '../guards'
import type { JobRunAgent } from './types'

/**
 * Faux Claude activable au démarrage (`ENGINE_FAKE_CLAUDE=<scénario>`, mode local ÉCRIT seulement, FOLLOWUPS #12) : le
 * parcours de bout en bout de l'éditeur (admin → moteur → git → Sanity → aperçu → contrôles) sans AUCUN appel à Claude.
 *
 * Construit sur `createFakeAgent` / `fakeScenarios` d'engine-claude : chaque outil passe par le VRAI hook, Edit écrit
 * vraiment le fichier, set_text écrit vraiment le brouillon Sanity, ask_client montre vraiment la question au client.
 * Le scénario s'adapte à la demande en lisant ce que le vrai Claude reçoit (prompt, fichiers permis, design system) :
 *   css    : change la couleur du texte de la règle de la zone demandée (token voisin : texte ↔ texte atténué), puis mesure ;
 *   text   : réécrit le premier champ Sanity modifiable (« … — updated », tronqué à la limite), puis mesure ;
 *   ask    : demande au client quelle couleur prendre (deux options), puis applique SA réponse ;
 *   fail   : le SDK rapporte une erreur d'exécution (retour arrière, « Couldn’t apply ») ;
 *   budget : plafond de budget du SDK dépassé (coût gardé, retour arrière) ;
 *   auto   : text si « T Text » est coché et qu'un champ Sanity est modifiable, sinon css.
 * 2e essai (session reprise après un refus des contrôles) : ne change plus rien et le dit — la demande échoue proprement.
 * Coût simulé : 0,02 $ par appel (budget : 1,52 $), visible dans le fil de l'éditeur (plafond, affichage) mais JAMAIS
 * écrit dans le journal aiUsage : rien n'a été consommé (`recordUsage` de service.ts, `deps.fakeClaude`).
 */

/** Coût d'un appel simulé (dollars) : petit ; montré dans l'éditeur seulement, jamais dans B5 (aucun aiUsage). */
export const FAKE_CALL_USD = 0.02

/** Règles de la zone telles que le prompt les donne : « Rules of “Title” in the CSS Module: .title, .x (and their… ». */
export function zoneSelectors(prompt: string): string[] {
  const match = /Rules of “[^”]*” in the CSS Module: ([^\n]+?) \(and their/.exec(prompt)
  return match ? match[1].split(',').map((selector) => selector.trim()).filter(Boolean) : []
}

export type PromptField = { id: string; max: number; current: string }

/** Champs Sanity modifiables tels que le prompt les liste (« - <id> (<nom>, 70 characters max…) — current: “…” »). */
export function editableFieldsOf(prompt: string): PromptField[] {
  const start = prompt.indexOf('Editable fields:\n')
  if (start < 0) return []
  const fields: PromptField[] = []
  for (const line of prompt.slice(start + 'Editable fields:\n'.length).split('\n')) {
    const match = /^- (\S+) \(.*?(\d+) characters max.*\) — current: “(.*)”$/.exec(line)
    if (!match) break
    fields.push({ id: match[1], max: Number(match[2]), current: match[3] })
  }
  return fields
}

/** Nouveau texte réaliste et valide : l'actuel suivi de « — updated », tronqué par mots sous la limite. */
export function updatedText(current: string, max: number): string {
  const suffix = ' — updated'
  const base = current.trim() || 'Updated text'
  if (base.length + suffix.length <= max) return `${base}${suffix}`
  const words = base.split(/\s+/)
  while (words.length > 1 && words.join(' ').length + suffix.length > max) words.pop()
  const text = `${words.join(' ')}${suffix}`
  return text.length <= max ? text : base.slice(0, Math.max(1, max))
}

/** Token de couleur voisin : atténué ↔ plein, sinon accent, sinon un autre token de texte. */
export function nextColor(current: string | null, colors: readonly string[]): string | null {
  const has = (token: string) => colors.includes(token) && token !== current
  if (current) {
    const plain = current.replace(/-muted\)$/, ')')
    if (plain !== current && has(plain)) return plain
    const muted = current.replace(/\)$/, '-muted)')
    if (has(muted)) return muted
  }
  for (const token of ['var(--color-text-accent)', 'var(--color-text)', 'var(--color-text-muted)']) if (has(token)) return token
  return colors.find((token) => has(token) && token.includes('text')) ?? colors.find(has) ?? null
}

type CssPlan = { file: string; selector: string; current: string | null; colors: string[]; css: string }

/** Fichier CSS permis, règle de base de la zone et tokens de couleur du site (null si le style n'est pas permis). */
async function cssPlan(run: AgentRun): Promise<CssPlan | null> {
  const file = run.toolAccess.files.find((candidate) => candidate.endsWith('.css'))
  const selector = zoneSelectors(run.prompt)[0]
  if (!file || !selector) return null
  const css = await readFile(path.join(run.cwd, file), 'utf8')
  const ds = await loadDesignSystem(run.cwd)
  const colors = [...(ds.policy.roles.color ?? [])]
  let current: string | null = null
  postcss.parse(css).walkRules((rule: Rule) => {
    if (rule.parent?.type !== 'root' || rule.selector.trim() !== selector) return
    rule.walkDecls('color', (decl: Declaration) => void (current ??= decl.value.trim()))
  })
  return { file, selector, current, colors, css }
}

/** Contenu du CSS avec `color: <token>` dans la règle de base de la zone (remplacée ou ajoutée). */
export function withColor(css: string, selector: string, token: string): string {
  const root = postcss.parse(css)
  let done = false
  root.walkRules((rule: Rule) => {
    if (done || rule.parent?.type !== 'root' || rule.selector.trim() !== selector) return
    let replaced = false
    rule.walkDecls('color', (decl: Declaration) => {
      if (decl.parent === rule && !replaced) {
        decl.value = token
        replaced = true
      }
    })
    if (!replaced) rule.append({ prop: 'color', value: token })
    done = true
  })
  return root.toString()
}

const NOTHING_TO_STYLE = 'Style is not allowed for this element (turn on “🖌 Style”): nothing was changed.'
const NOTHING_TO_WRITE = 'No text of this element can be changed here (turn on “T Text”): nothing was changed.'

/** Édition du scénario `ask`, complétée d'après la réponse du client (le faux Claude la lit au moment de l'écrire). */
type PendingEdit = { step: FakeStep & { kind: 'edit' }; plan: CssPlan | null }

/** Appel du faux Claude pour un essai, selon le scénario. */
async function callFor(scenario: FakeClaudeScenario, run: AgentRun, pendingEdit: PendingEdit): Promise<FakeCall> {
  if (run.resume) {
    return { steps: [{ kind: 'say', text: 'I could not fix the reported problems.' }], message: 'I could not fix the reported problems: nothing more was changed.', costUsd: FAKE_CALL_USD }
  }
  const textAllowed = /T Text YES/.test(run.prompt)
  const field = textAllowed && run.textTool ? editableFieldsOf(run.prompt)[0] : undefined
  const pick = scenario === 'auto' ? (field ? 'text' : 'css') : scenario
  switch (pick) {
    case 'fail':
      return { ...fakeScenarios.fails(), costUsd: FAKE_CALL_USD }
    case 'budget':
      return fakeScenarios.overBudget()
    case 'text': {
      if (!field) return { ...fakeScenarios.nothingChanged(NOTHING_TO_WRITE), costUsd: FAKE_CALL_USD }
      return { ...fakeScenarios.setText(field.id, updatedText(field.current, field.max), 'The text was updated (fake Claude, no real call).'), costUsd: FAKE_CALL_USD }
    }
    case 'css': {
      const plan = await cssPlan(run)
      const token = plan ? nextColor(plan.current, plan.colors) : null
      if (!plan || !token) return { ...fakeScenarios.nothingChanged(NOTHING_TO_STYLE), costUsd: FAKE_CALL_USD }
      return {
        steps: [{ kind: 'read', file: plan.file }, { kind: 'edit', file: plan.file, content: withColor(plan.css, plan.selector, token) }, { kind: 'measure' }],
        message: `The text color now uses ${token} (fake Claude, no real call).`,
        costUsd: FAKE_CALL_USD,
      }
    }
    case 'ask': {
      const plan = await cssPlan(run)
      if (!plan) return { ...fakeScenarios.nothingChanged(NOTHING_TO_STYLE), costUsd: FAKE_CALL_USD }
      // Contenu écrit APRÈS la réponse du client (voir createEngineFakeClaude) : ici, le choix recommandé par défaut.
      const edit = pendingEdit.step
      edit.file = plan.file
      edit.content = withColor(plan.css, plan.selector, nextColor(plan.current, plan.colors) ?? plan.current ?? 'inherit')
      pendingEdit.plan = plan
      return {
        ...fakeScenarios.ask(
          [
            {
              question: 'Which color should this text use?',
              options: [
                { label: 'Stronger text color', description: 'Easier to read.', tone: 'recommended' },
                { label: 'Accent color', description: 'Stands out more.', tone: 'neutral' },
              ],
            },
          ],
          [{ kind: 'read', file: plan.file }, edit, { kind: 'measure' }],
          'Done as you chose (fake Claude, no real call).',
        ),
        costUsd: FAKE_CALL_USD,
      }
    }
  }
}

/**
 * `JobRunAgent` du faux Claude pour `scenario` : à passer à createEditorService à la place du vrai runner. Aucun réseau,
 * aucun processus ; la réponse du client à la question du scénario `ask` décide réellement du token écrit.
 */
export function createEngineFakeClaude(scenario: FakeClaudeScenario): JobRunAgent {
  let next: FakeCall | null = null
  const agent = createFakeAgent(() => {
    if (!next) throw new Error('Fake Claude: no call prepared.')
    return next
  })
  return async (run) => {
    const pendingEdit: PendingEdit = { step: { kind: 'edit', file: '' }, plan: null }
    next = await callFor(scenario, run, pendingEdit)
    // Question : le choix du client décide du token (accent, ou le voisin recommandé).
    const askTool = run.askTool
    const wrapped: AgentRun = askTool
      ? {
          ...run,
          askTool: {
            ask: async (questions) => {
              const result = await askTool.ask(questions)
              const plan = pendingEdit.plan
              if ('answer' in result && plan && /Accent color/.test(result.answer)) {
                const accent = plan.colors.find((token) => token === 'var(--color-text-accent)') ?? plan.colors.find((token) => token.includes('accent'))
                if (accent) pendingEdit.step.content = withColor(plan.css, plan.selector, accent)
              }
              return result
            },
          },
        }
      : run
    return agent(wrapped)
  }
}
