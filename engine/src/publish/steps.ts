import { draftIdOf, type SanityAction, type SanityPort } from '../content/sanity'
import { GitError, type WorkRepo } from '../git/git'
import { isPublishableId } from './pending'
import type { ContentSnapshot } from './state'

/**
 * Opérations des 4 étapes de Publish, séparées du service pour être testées une à une. Toute erreur destinée au client
 * est une `StepFailure` (message ANGLAIS + journal technique facultatif, jamais de secret ni d'URL de hook).
 */

export class StepFailure extends Error {
  constructor(
    message: string,
    readonly log?: string,
  ) {
    super(message)
    this.name = 'StepFailure'
  }
}

const MAIN = 'refs/heads/main'
const DRAFT = 'refs/heads/draft'
const LOG_MAX = 4_000
const HTTP_TIMEOUT_MS = 20_000

/** Journal borné, sans jeton ni URL avec identifiants. */
export function cleanLog(text: string | undefined): string | undefined {
  if (!text) return undefined
  const cleaned = text
    .replace(/https?:\/\/[^\s'"]+/g, (url) => {
      try {
        const parsed = new URL(url)
        return `${parsed.protocol}//${parsed.host}/…`
      } catch {
        return '[url]'
      }
    })
    .replace(/\b(sk-ant-[\w-]+|sk[a-zA-Z0-9]{20,})\b/g, '[secret]')
    .trim()
  return cleaned.length > LOG_MAX ? `${cleaned.slice(0, LOG_MAX)}\n…` : cleaned
}

// ─── Étape 1 : Sanity ────────────────────────────────────────────────────────

/**
 * Publie les brouillons EN UNE SEULE requête de l'API Actions (tout ou rien côté Sanity), chacun avec
 * `ifDraftRevisionId` = la révision vue au moment de Publish. Les documents dont le brouillon a disparu depuis
 * (publié ou abandonné ailleurs) sont sautés. Renvoie les ids publiés.
 */
export async function publishContent(sanity: SanityPort, items: readonly ContentSnapshot[]): Promise<{ published: string[]; skipped: string[] }> {
  if (!items.length) return { published: [], skipped: [] }
  for (const item of items) if (!isPublishableId(item.id)) throw new StepFailure('A draft has an invalid id: nothing was published.')
  const drafts = await sanity.getDocuments(items.map((item) => draftIdOf(item.id)))
  const todo = items.filter((_, index) => drafts[index] !== null)
  const skipped = items.filter((_, index) => drafts[index] === null).map((item) => item.id)
  const changed = todo.filter((item, index) => {
    const draft = drafts[items.indexOf(item)]
    return draft?._rev !== item.rev
  })
  if (changed.length) {
    throw new StepFailure(
      `${changed.map((item) => item.path).join(', ')} changed after you pressed Publish. Nothing was published: review the list and publish again.`,
    )
  }
  if (!todo.length) return { published: [], skipped }
  const actions: SanityAction[] = todo.map((item) => ({
    actionType: 'sanity.action.document.publish',
    draftId: draftIdOf(item.id),
    publishedId: item.id,
    ifDraftRevisionId: item.rev,
  }))
  try {
    await sanity.action(actions)
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error)
    if (/revision/i.test(text)) {
      throw new StepFailure('A draft changed during the publication. Nothing was published: review the list and publish again.', cleanLog(text))
    }
    throw new StepFailure('Sanity refused the publication. Nothing was published: the previous content is still live.', cleanLog(text))
  }
  return { published: todo.map((item) => item.id), skipped }
}

// ─── Étape 2 : git ───────────────────────────────────────────────────────────

export type BranchState = { main: string; draft: string }

export async function branches(repo: WorkRepo): Promise<BranchState> {
  const [main, draft] = await Promise.all([repo.run(['rev-parse', '--verify', MAIN]), repo.run(['rev-parse', '--verify', DRAFT])])
  return { main, draft }
}

/** Commits de draft absents de main, du plus ancien au plus récent. */
export async function draftCommits(repo: WorkRepo, state: BranchState): Promise<string[]> {
  if (state.main === state.draft) return []
  return (await repo.run(['rev-list', '--reverse', `${state.main}..${state.draft}`])).split('\n').filter(Boolean)
}

/**
 * Contrôles avant l'avance rapide : main ancêtre de draft (sinon divergence : un humain doit réconcilier) et chaque
 * commit de draft absent de main appartient à une modification validée attendue (`allowed`). Renvoie les commits.
 */
export async function checkDraftAhead(repo: WorkRepo, state: BranchState, allowed: ReadonlySet<string>): Promise<string[]> {
  if (!(await repo.isAncestor(state.main, state.draft))) {
    throw new StepFailure('The live code (main) has diverged from the draft: a developer must reconcile them. Nothing more was published.')
  }
  const commits = await draftCommits(repo, state)
  const unknown = commits.filter((commit) => !allowed.has(commit))
  if (unknown.length) {
    throw new StepFailure(
      'The draft has code changes that are not part of this publication (validated later, or not validated): publish again to review them.',
      unknown.map((commit) => commit.slice(0, 12)).join('\n'),
    )
  }
  return commits
}

/** La copie de travail du clone doit être sur draft, à jour, propre (restes d'une demande interrompue nettoyés). */
export async function prepareClone(repo: WorkRepo, state: BranchState): Promise<void> {
  const branch = await repo.branch()
  if (branch !== 'draft') throw new StepFailure(`The engine's clone is on branch "${branch}" instead of draft: ask Kuartz to look at it.`)
  if ((await repo.head()) !== state.draft) throw new StepFailure('The draft moved during the publication: publish again.')
  if (!(await repo.isClean())) await repo.discardWorkingChanges()
}

/** main ← draft en avance rapide SANS extraire main : `update-ref` avec l'ancienne valeur (échoue si main a bougé). */
export async function fastForwardMain(repo: WorkRepo, state: BranchState, reason: string): Promise<void> {
  try {
    await repo.run(['update-ref', '-m', reason, MAIN, state.draft, state.main])
  } catch (error) {
    throw new StepFailure('The live code (main) moved during the publication: a developer must reconcile it.', cleanLog(errorText(error)))
  }
}

export const tagName = (number: number) => `publication-${number}`

/** Tag `publication-N` sur le commit publié (écrasé s'il existe : le numéro appartient à cette publication). */
export async function tagPublication(repo: WorkRepo, number: number, commit: string): Promise<string> {
  const tag = tagName(number)
  await repo.run(['tag', '--force', tag, commit])
  return tag
}

/** Numéro de la prochaine publication : après le magasin ET après les tags publication-N du clone. */
export async function nextPublicationNumber(repo: WorkRepo, fromStore: number): Promise<number> {
  const tags = await listPublicationTags(repo).catch(() => [])
  return Math.max(fromStore, ...tags.map((tag) => tag.number + 1))
}

export type PublicationTag = { number: number; tag: string; commit: string; at: string; author: string }

export async function listPublicationTags(repo: WorkRepo): Promise<PublicationTag[]> {
  const out = await repo.run([
    'for-each-ref',
    '--format=%(refname:strip=2)%09%(objectname)%09%(*objectname)%09%(creatordate:iso-strict)%09%(if)%(taggername)%(then)%(taggername)%(else)%(authorname)%(end)',
    'refs/tags/publication-*',
  ])
  const tags: PublicationTag[] = []
  for (const line of out.split('\n')) {
    const [tag, object, peeled, at, author] = line.split('\t')
    const match = /^publication-(\d{1,6})$/.exec(tag ?? '')
    if (!match) continue
    tags.push({ number: Number(match[1]), tag, commit: peeled || object, at: at ?? '', author: author ?? '' })
  }
  return tags.sort((a, b) => a.number - b.number)
}

/** Push de main (vers la branche suivie du dépôt source) et du tag ; jamais de force : une divergence est refusée. */
export async function pushPublication(repo: WorkRepo, branch: string, tag: string): Promise<void> {
  if (!/^[A-Za-z0-9._/-]{1,100}$/.test(branch) || branch.startsWith('-') || branch.includes('..')) {
    throw new StepFailure('The source branch to push to is invalid: ask Kuartz to look at the engine setup.')
  }
  try {
    await repo.run(['push', '--quiet', 'origin', `${MAIN}:refs/heads/${branch}`, `refs/tags/${tag}:refs/tags/${tag}`], { timeoutMs: 120_000 })
  } catch (error) {
    throw new StepFailure(
      'The code is published in the engine, but pushing it to the source repository failed. Retry, or ask Kuartz to push by hand.',
      cleanLog(errorText(error)),
    )
  }
}

// ─── Étapes 3 et 4 : réseau ──────────────────────────────────────────────────

/** Déclenche le hook de déploiement Vercel (POST sans corps). L'URL est un secret : jamais journalisée. */
export async function triggerDeployHook(fetchImpl: typeof fetch, url: string): Promise<string | undefined> {
  let response: Response
  try {
    response = await fetchImpl(url, { method: 'POST', signal: AbortSignal.timeout(HTTP_TIMEOUT_MS), redirect: 'manual' })
  } catch (error) {
    throw new StepFailure('Vercel could not be reached to start the deployment. The previous version is still live.', cleanLog(errorText(error)))
  }
  const text = await response.text().catch(() => '')
  if (!response.ok) {
    throw new StepFailure(`Vercel refused the deployment (HTTP ${response.status}). The previous version is still live.`, cleanLog(text))
  }
  try {
    const body = JSON.parse(text) as { job?: { id?: unknown } }
    return typeof body.job?.id === 'string' ? body.job.id.slice(0, 80) : undefined
  } catch {
    return undefined
  }
}

/** Revalidation du cache du site : POST SITE_REVALIDATE_URL, en-tête `x-kz-revalidate`, corps vide = tout le site. */
export async function revalidateSite(fetchImpl: typeof fetch, url: string, secret: string): Promise<void> {
  let response: Response
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-kz-revalidate': secret },
      body: '{}',
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      redirect: 'manual',
    })
  } catch (error) {
    throw new StepFailure('The site could not be reached to refresh its cache. Retry in a moment.', cleanLog(errorText(error)))
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new StepFailure(`The site refused to refresh its cache (HTTP ${response.status}). Retry, or ask Kuartz to check REVALIDATE_SECRET.`, cleanLog(text))
  }
}

export function errorText(error: unknown): string {
  if (error instanceof GitError) return [error.message, error.stderr].filter(Boolean).join('\n')
  return error instanceof Error ? error.message : String(error)
}
