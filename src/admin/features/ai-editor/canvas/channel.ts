import {
  editorMessage,
  parseBridgeMessage,
  type BridgeView,
  type EditorMessageBody,
  type TargetRef,
} from '@/admin/editor-bridge/protocol'

/**
 * Canal parent (admin) ⇄ pont (iframe d'aperçu). Sans React : testé avec de fausses fenêtres.
 * Un message n'est accepté que s'il vient de l'iframe (`event.source`) ET de l'origine de l'aperçu
 * (`event.origin`), puis s'il est bien formé ; on ne poste que vers cette origine.
 */
export type PreviewChannelHandlers = {
  /** Le pont vient de démarrer : lui envoyer l'état courant. */
  onHello: () => void
  /** Le pont a reçu un premier état : l'aperçu est prêt. */
  onReady: (path: string) => void
  onSelect: (target: TargetRef, additive: boolean) => void
  /** Échap pressé dans l'aperçu (le focus y est : le document de l'admin ne le voit pas). */
  onEscape: () => void
}

export type PreviewChannel = {
  sync: (view: BridgeView) => void
  refresh: () => void
  dispose: () => void
}

export function connectPreview(options: {
  window: Pick<Window, 'addEventListener' | 'removeEventListener'>
  /** Fenêtre de l'iframe au moment du message (elle change à chaque rechargement). */
  frame: () => Window | null | undefined
  origin: string
  handlers: PreviewChannelHandlers
}): PreviewChannel {
  const { window: win, frame, origin, handlers } = options

  const listener = (event: MessageEvent) => {
    const source = frame()
    if (!source || event.source !== source || event.origin !== origin) return
    const message = parseBridgeMessage(event.data)
    if (!message) return
    switch (message.type) {
      case 'hello':
        return handlers.onHello()
      case 'ready':
        return handlers.onReady(message.path)
      case 'select':
        return handlers.onSelect(message.target, message.additive)
      case 'escape':
        return handlers.onEscape()
    }
  }
  win.addEventListener('message', listener as EventListener)

  const post = (body: EditorMessageBody) => {
    // postMessage vers une origine précise : si l'iframe a quitté l'aperçu, le navigateur ne livre rien.
    frame()?.postMessage(editorMessage(body), origin)
  }

  return {
    sync: (view) => post({ type: 'sync', view }),
    refresh: () => post({ type: 'refresh' }),
    dispose: () => win.removeEventListener('message', listener as EventListener),
  }
}
