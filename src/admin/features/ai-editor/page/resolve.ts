import type { AdminConfig, PageDef } from '@/admin/core/contracts'

/**
 * Page de l'éditeur IA d'après `?page=<id>` : seulement une PageDef du manifeste avec `aiEditor: true`
 * (G1 : l'éditeur ne s'ouvre que depuis une page qui le permet). Pur ; null → 404.
 */
export function resolveEditorPage(config: Pick<AdminConfig, 'pages'>, param: string | string[] | undefined): PageDef | null {
  if (typeof param !== 'string' || !/^[a-z0-9-]{1,64}$/i.test(param)) return null
  return config.pages.find((p) => p.id === param && p.aiEditor) ?? null
}
