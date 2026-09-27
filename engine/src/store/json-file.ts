import { randomBytes } from 'node:crypto'
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import path from 'node:path'

/**
 * Un document JSON persistant, écrit ATOMIQUEMENT : fichier temporaire dans le même dossier, fsync, puis `rename` (un
 * crash au milieu laisse l'ancienne version intacte, jamais un fichier tronqué). Les écritures sont sérialisées (une à
 * la fois, dans l'ordre) ; la valeur en mémoire fait foi entre deux écritures.
 */
export type JsonFile<T> = {
  readonly file: string
  /** Valeur courante (en mémoire). Ne pas la modifier directement : passer par `update`. */
  get(): T
  /** Applique `change` à une copie, remplace la valeur en mémoire tout de suite, puis l'écrit sur le disque. */
  update(change: (draft: T) => T | void): Promise<T>
  /** Attend la fin des écritures en cours. */
  flush(): Promise<void>
}

export async function writeFileAtomic(file: string, content: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true })
  const temp = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`
  const handle = await open(temp, 'w', 0o600)
  try {
    await handle.writeFile(content, 'utf8')
    await handle.sync()
  } finally {
    await handle.close()
  }
  try {
    await rename(temp, file)
  } catch (error) {
    await rm(temp, { force: true })
    throw error
  }
}

/**
 * Ouvre (ou crée avec `initial`) un fichier JSON. `migrate` reçoit la valeur lue (inconnue) et renvoie une valeur sûre :
 * un fichier illisible n'est JAMAIS écrasé en silence (exception : c'est l'historique des demandes).
 */
export async function openJsonFile<T>(file: string, initial: () => T, migrate: (raw: unknown) => T = (raw) => raw as T): Promise<JsonFile<T>> {
  let value: T
  try {
    value = migrate(JSON.parse(await readFile(file, 'utf8')))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw new Error(`Engine store file is unreadable: ${file} (${error instanceof Error ? error.message : String(error)})`)
    }
    value = initial()
    await writeFileAtomic(file, JSON.stringify(value, null, 2))
  }

  let queue: Promise<void> = Promise.resolve()
  const store: JsonFile<T> = {
    file,
    get: () => value,
    update(change) {
      const draft = structuredClone(value)
      const next = (change(draft) ?? draft) as T
      value = next
      const snapshot = JSON.stringify(next, null, 2)
      const write = queue.then(() => writeFileAtomic(file, snapshot))
      // La file continue même après une erreur d'écriture ; l'appelant, lui, la reçoit.
      queue = write.catch(() => {})
      return write.then(() => next)
    },
    flush: () => queue,
  }
  return store
}
