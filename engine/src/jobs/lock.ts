import { awaitingValidation, busy, publishing } from '../server/errors'

/**
 * Verrou partagé entre l'éditeur IA (engine-core) et la publication (engine-publish) : jamais une demande pendant une
 * publication, jamais une publication pendant une demande ou tant qu'une modification attend ✓ Validate / Cancel (la
 * branche draft porterait des commits non validés).
 *
 * Tout est SYNCHRONE : Node n'exécute qu'une chose à la fois, donc « vérifier puis prendre » sans `await` entre les
 * deux est atomique.
 */

/** Ce que l'éditeur dit de son état (implémenté par le service de l'éditeur). */
export type EditorGate = {
  /** 'busy' : une demande est en file ou en cours ; 'awaiting_validation' : une modification attend ; null : libre. */
  blocker(): 'busy' | 'awaiting_validation' | null
}

/** Port lu par l'éditeur avant d'accepter une demande. */
export type PublishLock = { isPublishing(): boolean }

export type EngineLock = PublishLock & {
  /** Branche l'éditeur (une fois, au démarrage). */
  setEditorGate(gate: EditorGate): void
  /**
   * Publication exclusive (engine-publish) : refuse (EngineError 409 busy / awaiting_validation / publishing) si
   * l'éditeur n'est pas libre ou si une publication tourne déjà ; sinon tient le verrou pendant `task`.
   */
  runPublish<T>(task: () => Promise<T>): Promise<T>
  /** Variante manuelle : prend le verrou et renvoie la fonction qui le rend (idempotente). */
  acquirePublish(): () => void
}

export function createEngineLock(): EngineLock {
  let gate: EditorGate | null = null
  let held = false
  const acquire = () => {
    const blocker = gate?.blocker() ?? null
    if (blocker === 'busy') throw busy()
    if (blocker === 'awaiting_validation') throw awaitingValidation()
    if (held) throw publishing()
    held = true
    let released = false
    return () => {
      if (released) return
      released = true
      held = false
    }
  }
  return {
    isPublishing: () => held,
    setEditorGate: (next) => void (gate = next),
    acquirePublish: acquire,
    async runPublish(task) {
      const release = acquire()
      try {
        return await task()
      } finally {
        release()
      }
    },
  }
}
