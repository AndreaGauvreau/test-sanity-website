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
  /** Révision du brouillon vue au moment de Publish : `ifDraftRevisionId` (jamais écraser un brouillon plus récent). */
  rev: string
  path: string
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
  /** Avance rapide faite : main est passé de `from` à `to`. */
  merged?: { from: string; to: string }
  pushed?: boolean
  deployTriggered?: boolean
  /** Détails utiles à la fiche de version. */
  deployNote?: string
}

export type PublishExtra = { run: RunInternal | null }

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
