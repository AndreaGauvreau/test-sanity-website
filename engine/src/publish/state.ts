import type { AdminRole, PublishRun, PublishStep } from '../../../src/admin/core/contracts'
import type { PublicationsData } from '../store/store'

/**
 * État interne d'une publication, rangé dans `publications.json > extra.publish` (le contrat `PublishRun` ne porte que
 * ce que voit l'admin). Écrit AVANT chaque étape : une reprise (`retry`, redémarrage du moteur) sait ce qui est fait.
 */

export type ContentSnapshot = {
  /** Id publié. */
  id: string
  type: string
  /**
   * Révision du brouillon vue au moment de Publish : `ifDraftRevisionId` (jamais écraser un brouillon plus récent).
   * Pour une action programmée (dépublier / supprimer) : révision du document vu, indicative.
   */
  rev: string
  path: string
  /** Absent = publier le brouillon ; sinon action programmée depuis le CMS (POST /publish/stage). */
  action?: 'unpublish' | 'delete'
}

export type DesignSnapshot = { changeId: string; commit: string; title: string }

export type RunInternal = {
  /** Numéro réservé (publication-N), le même pour la reprise. */
  number: number
  by: { id: string; name: string; role: AdminRole }
  content: ContentSnapshot[]
  design: DesignSnapshot[]
  /** Modifications IA validées SANS commit (textes seulement) : publiées avec leurs brouillons à l'étape 1. */
  textChanges: string[]
  /** Du code attendait (main ≠ draft) au moment de Publish. */
  codeChanged: boolean
  /** Sha de draft dont le typecheck a réussi (fait AVANT l'étape 1 : un code qui ne compile pas ne publie rien). */
  compiled?: string
  /** Avance rapide faite : main est passé de `from` à `to`. */
  merged?: { from: string; to: string }
  pushed?: boolean
  deployTriggered?: boolean
  /** Détails utiles à la fiche de version. */
  deployNote?: string
}

export type PublishExtra = { run: RunInternal | null }

/** Action programmée pour le prochain Publish (POST /publish/stage), par id publié. */
export type StagedAction = { action: 'unpublish' | 'delete'; type: string; by: string; at: string }

/**
 * Marques du contenu, rangées dans `publications.json > extra.content` :
 * - `staged` : dépublier / supprimer au prochain Publish ;
 * - `held` : documents DÉPUBLIÉS par une publication, id → révision du brouillon laissé par Sanity. Ce brouillon n'est
 *   pas « à publier » (sinon le Publish suivant remettrait en ligne ce qu'on vient de retirer) tant qu'il n'a pas été
 *   modifié depuis (révision différente) ou libéré par POST /publish/unstage.
 */
export type ContentMarks = { staged: Record<string, StagedAction>; held: Record<string, string> }

export const STEP_LABELS: Readonly<Record<PublishStep, string>> = {
  1: 'Content goes live in Sanity',
  2: 'Only if code changed: draft → main',
  3: 'Vercel builds and deploys',
  4: 'Live on the site',
}

export function stepLabel(step: PublishStep, domain: string | null): string {
  return step === 4 && domain ? `Live on ${domain}` : STEP_LABELS[step]
}

export function freshSteps(domain: string | null): PublishRun['steps'] {
  return ([1, 2, 3, 4] as const).map((step) => ({ step, label: stepLabel(step, domain), status: 'waiting' as const }))
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** Lecture tolérante de `extra.publish` (fichier écrit par nous, mais jamais de confiance aveugle). */
export function readExtra(data: PublicationsData): PublishExtra {
  const raw = data.extra.publish
  if (!isRecord(raw) || !isRecord(raw.run)) return { run: null }
  const run = raw.run as RunInternal
  if (typeof run.number !== 'number' || !Array.isArray(run.content) || !Array.isArray(run.design)) return { run: null }
  return { run: { ...run, textChanges: Array.isArray(run.textChanges) ? run.textChanges : [] } }
}

export function writeExtra(data: PublicationsData, extra: PublishExtra): void {
  data.extra.publish = structuredClone(extra) as unknown as Record<string, unknown>
}

const isStaged = (value: unknown): value is StagedAction =>
  isRecord(value) &&
  (value.action === 'unpublish' || value.action === 'delete') &&
  typeof value.type === 'string' &&
  typeof value.by === 'string' &&
  typeof value.at === 'string'

/** Lecture tolérante de `extra.content` (entrées mal formées ignorées). */
export function readMarks(data: PublicationsData): ContentMarks {
  const raw = isRecord(data.extra.content) ? data.extra.content : {}
  const staged: Record<string, StagedAction> = {}
  const held: Record<string, string> = {}
  if (isRecord(raw.staged)) for (const [id, entry] of Object.entries(raw.staged)) if (isStaged(entry)) staged[id] = { ...entry }
  if (isRecord(raw.held)) for (const [id, rev] of Object.entries(raw.held)) if (typeof rev === 'string') held[id] = rev
  return { staged, held }
}

export function writeMarks(data: PublicationsData, marks: ContentMarks): void {
  data.extra.content = structuredClone(marks) as unknown as Record<string, unknown>
}
