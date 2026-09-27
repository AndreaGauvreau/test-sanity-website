import 'server-only'

import type { Session } from '@/admin/core/contracts/session'
import { can } from '@/admin/core/contracts/roles'
import { getWriteClient } from '@/admin/core/sanity/clients'
import { getDocumentState, saveDraftField, setDraftFields } from '@/admin/core/sanity/drafts'
import { SanityWriteError } from '@/admin/core/sanity/paths'
import { storeFromClient, type DraftStore } from '@/admin/core/sanity/store'
import { validateFieldValue } from '@/admin/core/sanity/validate'
import adminConfig from '@/admin.config'

import {
  checkScript,
  isScriptValid,
  newScriptKey,
  pageOptions,
  scriptFieldDefs,
  SCRIPTS_MAX,
  toSanityScript,
  type PageOption,
  type ScriptValues,
} from './scripts'

/**
 * Écritures des scripts dans le BROUILLON de siteSettings (`drafts.siteSettings`), au nom de l'utilisateur.
 * SERVEUR SEULEMENT, appelées par actions.ts APRÈS `requireCapability('settings.code', 'action')`.
 * Chaque fonction revérifie aussi le droit (défense en profondeur : le code est injecté tel quel sur le site).
 *
 * - modification / activation / suppression : chemins à clé `scripts[_key=="…"]` (un autre script modifié en même
 *   temps n'est pas écrasé ; un script supprimé entre-temps → « This item no longer exists. ») ;
 * - ajout / déplacement : le tableau entier est réécrit (lu juste avant avec le jeton de l'utilisateur).
 *
 * `store` : injection pour les tests (faux DraftStore) ; par défaut le client de l'utilisateur.
 */

export type WriteDeps = { store?: DraftStore; options?: readonly PageOption[] }

const SETTINGS_ID = adminConfig.settings.id

function assertCanWriteCode(session: Session): void {
  if (!can(session.role, 'settings.code')) throw new SanityWriteError('forbidden', "You don't have access to this.")
}

function context(session: Session, deps: WriteDeps) {
  assertCanWriteCode(session)
  const store = deps.store ?? storeFromClient(getWriteClient(session))
  const options = deps.options ?? pageOptions(adminConfig)
  return { store, options }
}

/** Contrôle complet d'un script (règles de l'écran + FieldDef) ; lève une erreur de validation au premier refus. */
function assertValidScript(values: ScriptValues, options: readonly PageOption[]): void {
  const check = checkScript(values, options)
  if (!isScriptValid(check)) {
    const message = Object.values(check.errors)[0] as string
    throw new SanityWriteError('validation', message, check.errors as Record<string, string>)
  }
  const defs = scriptFieldDefs(options)
  for (const name of ['name', 'placement', 'page', 'run', 'code'] as const) {
    const message = validateFieldValue(defs[name], values[name])
    if (message) throw new SanityWriteError('validation', message, { [name]: message })
  }
}

function keyPath(key: string, field?: string): string {
  if (!/^[\w-]{1,64}$/.test(key)) throw new SanityWriteError('bad_request', 'Invalid script.')
  return `scripts[_key=="${key}"]${field ? `.${field}` : ''}`
}

async function currentScripts(store: DraftStore): Promise<Record<string, unknown>[]> {
  const state = await getDocumentState(SETTINGS_ID, { store })
  if (!state.value) throw new SanityWriteError('not_found', 'Site settings are missing. Ask Kuartz to create them.')
  const raw = (state.value as Record<string, unknown>).scripts
  return Array.isArray(raw) ? (raw.filter((s) => s && typeof s === 'object') as Record<string, unknown>[]) : []
}

/** Tableau entier : contrôle structurel seulement (clés uniques, nombre max) — chaque script écrit est déjà contrôlé. */
const ARRAY_DEF = { name: 'scripts', label: 'Scripts', kind: 'array', itemLabel: 'Script', max: SCRIPTS_MAX } as const

/** Nouveau script, ajouté en dernier (dernier injecté pour son emplacement). Actif par défaut. */
export async function createScript(session: Session, values: ScriptValues, deps: WriteDeps = {}): Promise<{ key: string }> {
  const { store, options } = context(session, deps)
  const clean = { ...values, name: values.name.trim() }
  assertValidScript(clean, options)
  const scripts = await currentScripts(store)
  if (scripts.length >= SCRIPTS_MAX) throw new SanityWriteError('validation', `You can add up to ${SCRIPTS_MAX} scripts.`)
  const taken = new Set(scripts.map((s) => s._key))
  let key = newScriptKey()
  while (taken.has(key)) key = newScriptKey()
  const next = [...scripts, toSanityScript({ key, ...clean, enabled: true })]
  await setDraftFields(session, SETTINGS_ID, { set: { scripts: next } }, { fields: { scripts: ARRAY_DEF }, store })
  return { key }
}

/** Modifie les champs d'un script existant (chemins à clé, une transaction). */
export async function updateScript(session: Session, key: string, values: ScriptValues, deps: WriteDeps = {}): Promise<{ key: string }> {
  const { store, options } = context(session, deps)
  const clean = { ...values, name: values.name.trim() }
  assertValidScript(clean, options)
  const defs = scriptFieldDefs(options)
  const set: Record<string, unknown> = {}
  const fields: Record<string, (typeof defs)[keyof typeof defs]> = {}
  for (const name of ['name', 'placement', 'page', 'run', 'code'] as const) {
    set[keyPath(key, name)] = clean[name]
    fields[keyPath(key, name)] = defs[name]
  }
  await setDraftFields(session, SETTINGS_ID, { set }, { fields, store })
  return { key }
}

/** Active / désactive (Status Active · Disabled). */
export async function setScriptEnabled(session: Session, key: string, enabled: boolean, deps: WriteDeps = {}): Promise<{ key: string }> {
  const { store, options } = context(session, deps)
  await saveDraftField(session, SETTINGS_ID, keyPath(key, 'enabled'), enabled, { field: scriptFieldDefs(options).enabled, store })
  return { key }
}

/** Supprime un script du brouillon (en ligne seulement après Publish). */
export async function deleteScript(session: Session, key: string, deps: WriteDeps = {}): Promise<{ key: string }> {
  const { store } = context(session, deps)
  await setDraftFields(session, SETTINGS_ID, { unset: [keyPath(key)] }, { store })
  return { key }
}

/** Monte ou descend un script d'un rang (ordre d'injection). */
export async function moveScript(session: Session, key: string, direction: 'up' | 'down', deps: WriteDeps = {}): Promise<{ key: string }> {
  const { store } = context(session, deps)
  keyPath(key)
  const scripts = await currentScripts(store)
  const index = scripts.findIndex((s) => s._key === key)
  if (index === -1) throw new SanityWriteError('not_found', 'This item no longer exists. Reload and try again.')
  const target = direction === 'up' ? index - 1 : index + 1
  if (target < 0 || target >= scripts.length) {
    throw new SanityWriteError('bad_request', direction === 'up' ? 'This script is already first.' : 'This script is already last.')
  }
  const next = [...scripts]
  ;[next[index], next[target]] = [next[target], next[index]]
  await setDraftFields(session, SETTINGS_ID, { set: { scripts: next } }, { fields: { scripts: ARRAY_DEF }, store })
  return { key }
}
