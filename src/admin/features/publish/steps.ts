import type { PublishStatus, PublishStep } from '@/admin/core/contracts/engine'

/**
 * Carte « After “Publish” » de E1 (Step × 4) : textes du Figma, état de chaque étape d'après la publication en cours
 * ou la dernière en échec. PUR, testé.
 */

export type ChecklistState = 'todo' | 'running' | 'done' | 'skipped' | 'failed'

export type AfterPublishStep = {
  step: PublishStep
  title: string
  description: string
  state: ChecklistState
}

export function stepTexts(domain: string): Record<PublishStep, { title: string; description: string }> {
  return {
    1: { title: 'Content goes live in Sanity', description: 'In seconds, no build.' },
    2: { title: 'Only if code changed: draft → main', description: 'Merged by the admin, never by hand.' },
    3: { title: 'Vercel builds and deploys', description: 'About 1 minute.' },
    4: {
      title: `Live on ${domain}`,
      description: 'If the build fails, the previous version stays live and the error shows here.',
    },
  }
}

const RUN_TO_STATE = {
  waiting: 'todo',
  running: 'running',
  done: 'done',
  skipped: 'skipped',
  failed: 'failed',
} as const satisfies Record<string, ChecklistState>

/**
 * Les 4 étapes : au repos, toutes « à faire » ; pendant une publication (ou après un échec), l'état du moteur.
 * Une étape sautée garde son titre et prend la raison du moteur (« No code changed. ») ; une étape en échec prend
 * le message d'erreur (« the error shows here »).
 */
export function afterPublishSteps(status: PublishStatus | null, domain: string): AfterPublishStep[] {
  const texts = stepTexts(domain)
  const run = status && (status.state === 'publishing' || status.state === 'failed') ? status.run : undefined
  return ([1, 2, 3, 4] as const).map((step) => {
    const fromRun = run?.steps.find((s) => s.step === step)
    const state: ChecklistState = fromRun ? RUN_TO_STATE[fromRun.status] : 'todo'
    let description = texts[step].description
    if (state === 'skipped' && fromRun?.detail) description = fromRun.detail
    if (state === 'failed') description = run?.error?.message ?? fromRun?.detail ?? description
    return { step, title: texts[step].title, description, state }
  })
}
