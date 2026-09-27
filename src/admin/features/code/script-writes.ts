import 'server-only'

import type { Session } from '@/admin/core/contracts/session'
import { can } from '@/admin/core/contracts/roles'
import { getWriteClient } from '@/admin/core/sanity/clients'
import {
  getDocumentState,
  insertItem,
  saveDraftField,
  setDraftFields,
  updateDraftArray,
} from '@/admin/core/sanity/drafts'
import { SanityWriteError } from '@/admin/core/sanity/paths'
import { storeFromClient, type DraftStore } from '@/admin/core/sanity/store'
import { validateFieldValue } from '@/admin/core/sanity/validate'
import adminConfig from '@/admin.config'

import {
  checkScript,
  isScriptValid,
  newScriptKey,
  normalizeScripts,
  pageOptions,
  scriptFieldDefs,
  SCRIPTS_MAX,
  toSanityScript,
  type PageOption,
  type ScriptItem,
  type ScriptValues,
} from './scripts'
import { isRawSigned, isSigningReady, signItem, SIGNING_MISSING } from './signing'

/**
 * Écritures des scripts dans le BROUILLON de siteSettings (`drafts.siteSettings`), au nom de l'utilisateur.
 * SERVEUR SEULEMENT, appelées par actions.ts APRÈS `requireCapability('settings.code', 'action')`.
 * Chaque fonction revérifie aussi le droit (défense en profondeur : le code est injecté tel quel sur le site).
 *
 * - modification / activation / Re-sign : chemins à clé `scripts[_key=="…"]` (un autre script modifié en même temps
 *   n'est pas écrasé ; un script supprimé entre-temps → « This item no longer exists. ») ;
 * - ajout / déplacement / suppression : aides de tableau SANS COURSE de core/sanity (`updateDraftArray` +
 *   `insertItem` : écriture conditionnée par `ifRevisionID`, relecture et nouvel essai sur 409) — un script
 *   ajouté ou modifié en même temps par un autre onglet n'est jamais effacé (FOLLOWUPS #40).
 *
 * SEC-04 (signature, signing.ts) : toute écriture qui pose des valeurs signées écrit dans le MÊME patch les six
 * valeurs signées (placement, page, run, code, enabled + la clé) ET leur signature — ce qui est signé est exactement
 * ce qui est écrit, même si quelqu'un modifie le script entre la lecture et l'écriture. Jamais de signature d'un
 * script modifié hors de l'admin sans revue : Enable le refuse ; seuls Save (code revu dans la fenêtre) et Re-sign
 * (valeurs vues comparées aux valeurs actuelles) le signent. L'ajout, le déplacement et la suppression recopient les
 * autres scripts tels quels (signature comprise) : les transformations ci-dessous ne touchent jamais un autre élément. Secret absent → SIGNING_MISSING, rien n'est écrit.
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

const GONE = 'This item no longer exists. Reload and try again.'
export const MODIFIED_OUTSIDE = 'This script was modified outside the admin. Check its code, then re-sign it.'
export const CHANGED_SINCE = 'This script changed since the page loaded. Reload and check it again.'

/** Script actuel (brouillon, sinon publié) : élément brut (pour vérifier sa signature) et valeurs normalisées. */
async function currentScript(store: DraftStore, key: string): Promise<{ raw: Record<string, unknown>; item: ScriptItem }> {
  keyPath(key)
  const raw = (await currentScripts(store)).find((s) => s._key === key)
  const item = raw ? normalizeScripts([raw])[0] : undefined
  if (!raw || !item) throw new SanityWriteError('not_found', GONE)
  return { raw, item }
}

/** Chemins à clé des valeurs signées + signature, pour un patch `set` (SEC-04). */
async function signedSet(item: Omit<ScriptItem, 'signed'>): Promise<Record<string, unknown>> {
  const signature = await signItem(item)
  return {
    [keyPath(item.key, 'placement')]: item.placement,
    [keyPath(item.key, 'page')]: item.page,
    [keyPath(item.key, 'run')]: item.run,
    [keyPath(item.key, 'code')]: item.code,
    [keyPath(item.key, 'enabled')]: item.enabled,
    [keyPath(item.key, 'signature')]: signature,
  }
}

function requireSigning(): void {
  if (!isSigningReady()) throw new SanityWriteError('unavailable', SIGNING_MISSING)
}

/** Tableau entier : contrôle structurel seulement (clés uniques, nombre max) — chaque script écrit est déjà contrôlé. */
const ARRAY_DEF = { name: 'scripts', label: 'Scripts', kind: 'array', itemLabel: 'Script', max: SCRIPTS_MAX } as const

const SETTINGS_MISSING = 'Site settings are missing. Ask Kuartz to create them.'

/** Écriture de tableau sans course ; « ni publié ni brouillon » (message générique de core/sanity) → message de B3. */
async function writeScripts<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write()
  } catch (err) {
    if (err instanceof SanityWriteError && err.code === 'not_found' && err.message === 'This item no longer exists.') {
      throw new SanityWriteError('not_found', SETTINGS_MISSING)
    }
    throw err
  }
}

/**
 * Nouveau script, ajouté en dernier (dernier injecté pour son emplacement). Actif par défaut.
 * Clé choisie AVANT la signature (elle est signée) ; l'insertion sans course garde les scripts ajoutés entre-temps.
 */
export async function createScript(session: Session, values: ScriptValues, deps: WriteDeps = {}): Promise<{ key: string }> {
  const { store, options } = context(session, deps)
  const clean = { ...values, name: values.name.trim() }
  assertValidScript(clean, options)
  requireSigning()
  const item = { key: newScriptKey(), ...clean, enabled: true }
  const entry = toSanityScript(item, await signItem(item))
  await writeScripts(() =>
    updateDraftArray(
      session,
      SETTINGS_ID,
      'scripts',
      (items) => {
        // Transformation PURE (rappelée après un 409) : le plafond porte sur le tableau RELU.
        if (items.length >= SCRIPTS_MAX) throw new SanityWriteError('validation', `You can add up to ${SCRIPTS_MAX} scripts.`)
        return insertItem(items, entry, 'end')
      },
      { field: ARRAY_DEF, store },
    ),
  )
  return { key: item.key }
}

/**
 * Modifie les champs d'un script existant (chemins à clé, une transaction) et le RE-SIGNE (SEC-04) : Kuartz a revu le
 * code dans la fenêtre, y compris celui d'un script modifié hors de l'admin. L'état (enabled) est relu et réécrit.
 */
export async function updateScript(session: Session, key: string, values: ScriptValues, deps: WriteDeps = {}): Promise<{ key: string }> {
  const { store, options } = context(session, deps)
  const clean = { ...values, name: values.name.trim() }
  assertValidScript(clean, options)
  requireSigning()
  const { item } = await currentScript(store, key)
  const defs = scriptFieldDefs(options)
  const fields: Record<string, (typeof defs)[keyof typeof defs]> = {}
  for (const name of ['name', 'placement', 'page', 'run', 'code'] as const) fields[keyPath(key, name)] = defs[name]
  const set = { [keyPath(key, 'name')]: clean.name, ...(await signedSet({ ...clean, key, enabled: item.enabled })) }
  await setDraftFields(session, SETTINGS_ID, { set }, { fields, store })
  return { key }
}

/**
 * Active / désactive (Status Active · Disabled). L'état fait partie de la signature (SEC-04) :
 * - script signé → réécrit avec sa nouvelle signature ;
 * - script modifié hors de l'admin → Enable refusé (MODIFIED_OUTSIDE : revoir puis Re-sign) ; Disable accepté, sans
 *   signer (il ne tournait déjà pas).
 */
export async function setScriptEnabled(session: Session, key: string, enabled: boolean, deps: WriteDeps = {}): Promise<{ key: string }> {
  const { store, options } = context(session, deps)
  if (enabled) requireSigning()
  const { raw, item } = await currentScript(store, key)
  const valid = isSigningReady() && (await isRawSigned(raw))
  if (!valid) {
    if (enabled) throw new SanityWriteError('validation', MODIFIED_OUTSIDE)
    await saveDraftField(session, SETTINGS_ID, keyPath(key, 'enabled'), false, { field: scriptFieldDefs(options).enabled, store })
    return { key }
  }
  await setDraftFields(session, SETTINGS_ID, { set: await signedSet({ ...item, enabled }) }, { fields: { [keyPath(key, 'enabled')]: scriptFieldDefs(options).enabled }, store })
  return { key }
}

/** Valeurs signées vues par Kuartz dans B3 au moment de « Re-sign ». */
export type ScriptSignedValues = Pick<ScriptItem, 'placement' | 'page' | 'run' | 'code' | 'enabled'>

/**
 * Re-sign (Kuartz, SEC-04) : signe un script modifié hors de l'admin APRÈS revue. `expected` = les valeurs affichées ;
 * si le script actuel diffère (modifié entre-temps), refus (CHANGED_SINCE) sans rien signer. Les valeurs signées sont
 * réécrites avec la signature dans le même patch : c'est exactement ce que Kuartz a vu qui tourne.
 */
export async function resignScript(session: Session, key: string, expected: ScriptSignedValues, deps: WriteDeps = {}): Promise<{ key: string }> {
  const { store } = context(session, deps)
  requireSigning()
  const { item } = await currentScript(store, key)
  const same =
    item.placement === expected.placement &&
    item.page === expected.page &&
    item.run === expected.run &&
    item.code === expected.code &&
    item.enabled === expected.enabled
  if (!same) throw new SanityWriteError('validation', CHANGED_SINCE)
  await setDraftFields(session, SETTINGS_ID, { set: await signedSet(item) }, { store })
  return { key }
}

/** Supprime un script du brouillon (en ligne seulement après Publish), sans course ; les autres restent tels quels. */
export async function deleteScript(session: Session, key: string, deps: WriteDeps = {}): Promise<{ key: string }> {
  const { store } = context(session, deps)
  keyPath(key)
  await writeScripts(() =>
    updateDraftArray(
      session,
      SETTINGS_ID,
      'scripts',
      (items) => {
        if (!items.some((s) => s._key === key)) throw new SanityWriteError('not_found', GONE)
        return items.filter((s) => s._key !== key)
      },
      { store },
    ),
  )
  return { key }
}

/** Monte ou descend un script d'un rang (ordre d'injection), sans course ; signatures recopiées telles quelles. */
export async function moveScript(session: Session, key: string, direction: 'up' | 'down', deps: WriteDeps = {}): Promise<{ key: string }> {
  const { store } = context(session, deps)
  keyPath(key)
  await writeScripts(() =>
    updateDraftArray(
      session,
      SETTINGS_ID,
      'scripts',
      (items) => {
        const index = items.findIndex((s) => s._key === key)
        if (index === -1) throw new SanityWriteError('not_found', GONE)
        const target = direction === 'up' ? index - 1 : index + 1
        if (target < 0 || target >= items.length) {
          throw new SanityWriteError('bad_request', direction === 'up' ? 'This script is already first.' : 'This script is already last.')
        }
        const next = [...items]
        ;[next[index], next[target]] = [next[target], next[index]]
        return next
      },
      { store },
    ),
  )
  return { key }
}
