import type { PublishStatus } from '@/admin/core/contracts/engine'

import type { CmsStatus } from './status'

/**
 * Dépublier / supprimer un élément EN LIGNE « au prochain Publish » (C3, C4 ; FOLLOWUPS #31). PUR.
 *
 * Le CMS n'écrit jamais l'id publié : il demande au moteur de programmer l'action (`POST /publish/stage`
 * `{ kind, id }`) ; elle apparaît dans E1 (`PendingContentItem.action`) et s'applique au prochain Publish.
 * `POST /publish/unstage { id }` l'annule. L'état programmé se lit dans `PublishStatus.pending.content`.
 */

export type StagedAction = 'unpublish' | 'delete'

/** Id publié → action programmée. */
export type StagedMap = Readonly<Record<string, StagedAction>>

/**
 * Actions programmées parmi les éléments `ids` de la collection. Filtre par id et non par `type` : le moteur
 * simulé ne connaît pas le type d'un document sans brouillon (il met « document »).
 */
export function stagedFrom(status: Pick<PublishStatus, 'pending'> | null | undefined, ids: Iterable<string>): StagedMap {
  const members = new Set(ids)
  const out: Record<string, StagedAction> = {}
  for (const item of status?.pending?.content ?? []) {
    if (!members.has(item.id)) continue
    if (item.action === 'unpublish' || item.action === 'delete') out[item.id] = item.action
  }
  return out
}

/** Menu d'actions du statut (identifiants communs au tableau C3 et au ⋯ de C4). */
export type StatusActionId = 'discard' | 'delete-draft' | 'unpublish' | 'delete-live' | 'unstage'

export type StatusMenuItem = { id: StatusActionId; label: string; icon: 'history' | 'trash' | 'eye-off' | 'eye'; danger?: boolean }

export function statusMenu(status: CmsStatus, staged?: StagedAction): StatusMenuItem[] {
  if (status === 'draft') return [{ id: 'delete-draft', label: 'Delete draft', icon: 'trash', danger: true }]
  if (staged) return [{ id: 'unstage', label: staged === 'unpublish' ? 'Keep online' : 'Don’t delete', icon: staged === 'unpublish' ? 'eye' : 'history' }]
  const live: StatusMenuItem[] = [
    { id: 'unpublish', label: 'Unpublish', icon: 'eye-off' },
    { id: 'delete-live', label: 'Delete', icon: 'trash', danger: true },
  ]
  return status === 'changed' ? [{ id: 'discard', label: 'Discard changes', icon: 'history', danger: true }, ...live] : live
}

/** Libellé de la pastille de statut quand une action est programmée. */
export function stagedLabel(staged: StagedAction): string {
  return staged === 'unpublish' ? 'Unpublishing' : 'Deleting'
}

/** Sélection → brouillons jamais publiés (supprimés tout de suite) et éléments en ligne (suppression programmée). */
export function partitionForDelete<T extends { id: string; status: CmsStatus }>(rows: readonly T[], staged: StagedMap): { drafts: T[]; live: T[]; alreadyStaged: T[] } {
  const drafts: T[] = []
  const live: T[] = []
  const alreadyStaged: T[] = []
  for (const row of rows) {
    if (row.status === 'draft') drafts.push(row)
    else if (staged[row.id] === 'delete') alreadyStaged.push(row)
    else live.push(row)
  }
  return { drafts, live, alreadyStaged }
}

/** Client du moteur (sous-ensemble) : `engineClient.publish` en vrai, un faux en test. */
export type StageClient = {
  stage: (item: { kind: StagedAction; id: string }) => Promise<PublishStatus>
  unstage: (id: string) => Promise<PublishStatus>
}

export type StageResult = { ok: true; staged: StagedMap } | { ok: false; error: string }

function messageOf(err: unknown): string {
  const message = (err as { message?: unknown })?.message
  return typeof message === 'string' && message ? message : 'Something went wrong. Please try again.'
}

/** Programme (ou annule, `kind` null) l'action d'un élément ; renvoie l'état programmé à jour parmi `ids`. */
export async function runStage(client: StageClient, ids: Iterable<string>, id: string, kind: StagedAction | null): Promise<StageResult> {
  try {
    const status = kind ? await client.stage({ kind, id }) : await client.unstage(id)
    return { ok: true, staged: stagedFrom(status, ids) }
  } catch (err) {
    return { ok: false, error: messageOf(err) }
  }
}

/** Toast de succès. */
export function stagedToast(kind: StagedAction | null, singular: string): string {
  if (kind === 'unpublish') return `${singular} will be unpublished at the next Publish.`
  if (kind === 'delete') return `${singular} will be deleted at the next Publish.`
  return `${singular} stays as it is.`
}
