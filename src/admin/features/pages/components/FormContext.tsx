'use client'

import { createContext, useContext, type ReactNode } from 'react'

import type { ArrayOp } from '../lib/form'
import type { ArraySaveResult, SaveResult } from '../server/save'

/**
 * Contexte du formulaire généré (C1) : page éditée, droits, options des références et fonctions d'écriture.
 * Les fonctions d'écriture sont injectées (server action en vrai, faux client dans les tests jsdom).
 */
export type FormContextValue = {
  pageId: string
  /** Sans le droit content.write : champs désactivés. */
  readOnly: boolean
  /** Options des champs référence, par type Sanity ciblé. */
  referenceOptions: Record<string, { value: string; label: string }[]>
  saveField: (path: string, value: unknown) => Promise<SaveResult>
  /** Un élément d'un tableau à longueur variable, par sa clé (écriture sans course côté serveur). */
  saveArray: (path: string, op: ArrayOp) => Promise<ArraySaveResult>
  /** Envoi d'une image pour un champ image (route d'envoi) : id d'asset et URL. */
  uploadImage: (path: string, file: File) => Promise<{ ok: true; assetId: string; url: string } | { ok: false; error: string }>
}

const FormContext = createContext<FormContextValue | null>(null)

export function FormProvider({ value, children }: { value: FormContextValue; children: ReactNode }) {
  return <FormContext.Provider value={value}>{children}</FormContext.Provider>
}

export function useForm(): FormContextValue {
  const context = useContext(FormContext)
  if (!context) throw new Error('useForm must be used inside <FormProvider>')
  return context
}

/** POST multipart vers la route d'envoi d'images de la page. */
export async function postImage(
  pageId: string,
  body: { target: 'seo' | 'article' | 'field'; path?: string; file: File },
): Promise<{ ok: true; assetId: string; url: string } | { ok: false; error: string }> {
  const data = new FormData()
  data.set('target', body.target)
  if (body.path) data.set('path', body.path)
  data.set('file', body.file)
  try {
    const response = await fetch(`/admin/pages/${encodeURIComponent(pageId)}/image`, { method: 'POST', body: data })
    const json = (await response.json().catch(() => null)) as { ok?: boolean; assetId?: string; url?: string; error?: { message?: string } } | null
    if (response.ok && json?.ok && json.assetId && json.url) return { ok: true, assetId: json.assetId, url: json.url }
    return { ok: false, error: json?.error?.message ?? "Couldn't upload this image. Try again." }
  } catch {
    return { ok: false, error: "Couldn't upload this image. Check your connection and try again." }
  }
}
