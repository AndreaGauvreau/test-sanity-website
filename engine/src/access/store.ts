import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'
import { chmod, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { ClaudeAccessTest } from '../../../src/admin/core/contracts'

/**
 * Accès à Claude enregistré depuis l'admin (B5 · « Claude connection ») : `<ENGINE_WORKSPACE>/data/claude-access.json`,
 * permissions 0600, écriture atomique (fichier temporaire 0600 puis renommage). Jamais dans Sanity, jamais dans git
 * (le dossier data/ est hors du clone), jamais dans une réponse ni un journal.
 *
 * La clé API est CHIFFRÉE : AES-256-GCM, clé dérivée d'ENGINE_SECRET par HKDF-SHA256 (sel aléatoire de 16 octets par
 * enregistrement, info « kuartz-engine/claude-access/v1 »), IV de 12 octets, données associées liées au format. Qui lit
 * le fichier sans ENGINE_SECRET n'obtient rien ; ENGINE_SECRET changé → la clé est illisible (il faut la ressaisir).
 */

export const ACCESS_FILE = 'claude-access.json'
const HKDF_INFO = 'kuartz-engine/claude-access/v1'
const AAD = Buffer.from('kuartz-claude-access:api-key:v1')

type Sealed = { salt: string; iv: string; tag: string; data: string }

type AccessFile = {
  version: 1
  saved: 'api-key' | 'subscription'
  key?: Sealed
  lastTest?: ClaudeAccessTest
  updatedAt: string
}

/** Contenu lu (clé déchiffrée en mémoire seulement). `problem` : fichier présent mais illisible (anglais). */
export type StoredAccess = {
  saved: 'api-key' | 'subscription' | null
  apiKey: string | null
  lastTest?: ClaudeAccessTest
  problem?: string
}

export const UNREADABLE_KEY =
  'The saved API key can’t be read on this engine (the engine secret changed?). Enter the key again.'

const deriveKey = (secret: string, salt: Buffer) => Buffer.from(hkdfSync('sha256', Buffer.from(secret, 'utf8'), salt, HKDF_INFO, 32))

export function seal(secret: string, plaintext: string): Sealed {
  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', deriveKey(secret, salt), iv)
  cipher.setAAD(AAD)
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return { salt: salt.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') }
}

/** Déchiffre, ou null (secret différent, fichier retouché). */
export function unseal(secret: string, sealed: Sealed): string | null {
  try {
    const decipher = createDecipheriv('aes-256-gcm', deriveKey(secret, Buffer.from(sealed.salt, 'base64')), Buffer.from(sealed.iv, 'base64'))
    decipher.setAAD(AAD)
    decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(sealed.data, 'base64')), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}

const isSealed = (value: unknown): value is Sealed =>
  typeof value === 'object' && value !== null && ['salt', 'iv', 'tag', 'data'].every((k) => typeof (value as Record<string, unknown>)[k] === 'string')

const isTest = (value: unknown): value is ClaudeAccessTest =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as ClaudeAccessTest).at === 'string' &&
  typeof (value as ClaudeAccessTest).ok === 'boolean' &&
  typeof (value as ClaudeAccessTest).message === 'string'

export type AccessStore = {
  file: string
  read(): Promise<StoredAccess>
  saveApiKey(apiKey: string): Promise<void>
  saveSubscription(): Promise<void>
  saveTest(test: ClaudeAccessTest): Promise<void>
  clear(): Promise<void>
}

export function openAccessStore(input: { dataDir: string; secret: string; now?: () => Date }): AccessStore {
  const file = path.join(input.dataDir, ACCESS_FILE)
  const now = input.now ?? (() => new Date())

  const readRaw = async (): Promise<AccessFile | null> => {
    let text: string
    try {
      text = await readFile(file, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
    // Permissions resserrées si quelqu'un les a élargies.
    const mode = (await stat(file)).mode & 0o777
    if (mode & 0o077) await chmod(file, 0o600)
    try {
      const parsed = JSON.parse(text) as Partial<AccessFile>
      if (parsed.version !== 1 || (parsed.saved !== 'api-key' && parsed.saved !== 'subscription')) return null
      return {
        version: 1,
        saved: parsed.saved,
        ...(isSealed(parsed.key) ? { key: parsed.key } : {}),
        ...(isTest(parsed.lastTest) ? { lastTest: parsed.lastTest } : {}),
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
      }
    } catch {
      return null
    }
  }

  const write = async (content: AccessFile) => {
    await mkdir(input.dataDir, { recursive: true })
    const tmp = `${file}.${randomBytes(6).toString('hex')}.tmp`
    await writeFile(tmp, `${JSON.stringify(content, null, 2)}\n`, { mode: 0o600 })
    await rename(tmp, file)
    await chmod(file, 0o600)
  }

  return {
    file,
    async read() {
      const raw = await readRaw()
      if (!raw) return { saved: null, apiKey: null }
      const lastTest = raw.lastTest ? { lastTest: raw.lastTest } : {}
      if (raw.saved === 'subscription') return { saved: 'subscription', apiKey: null, ...lastTest }
      const apiKey = raw.key ? unseal(input.secret, raw.key) : null
      return apiKey ? { saved: 'api-key', apiKey, ...lastTest } : { saved: 'api-key', apiKey: null, problem: UNREADABLE_KEY }
    },
    // Changer d'accès efface le dernier test (il valait pour l'ancien accès).
    saveApiKey: (apiKey) => write({ version: 1, saved: 'api-key', key: seal(input.secret, apiKey), updatedAt: now().toISOString() }),
    saveSubscription: () => write({ version: 1, saved: 'subscription', updatedAt: now().toISOString() }),
    async saveTest(test) {
      const raw = await readRaw()
      if (!raw) return
      await write({ ...raw, lastTest: test })
    },
    clear: () => rm(file, { force: true }),
  }
}
