'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'
import { createEditorStore, type EditorStore } from './store'

/** Contexte du magasin de l'éditeur (voir store.ts). L'écran de l'éditeur (editor-canvas) le fournit. */
const EditorStoreContext = createContext<EditorStore | null>(null)

export function EditorStoreProvider({
  pageId,
  path,
  backHref,
  children,
}: {
  pageId: string
  path: string
  /** Écran d'origine pour « ‹ Admin » (chemin /admin…) ; ajout additif d'editor-sidebar, facultatif. */
  backHref?: string | null
  children: ReactNode
}) {
  const [store] = useState(() => createEditorStore({ pageId, path, backHref: backHref ?? null }))
  return <EditorStoreContext.Provider value={store}>{children}</EditorStoreContext.Provider>
}

export function useEditorStore(): EditorStore {
  const store = useContext(EditorStoreContext)
  if (!store) throw new Error('useEditorStore must be used inside <EditorStoreProvider>')
  return store
}
