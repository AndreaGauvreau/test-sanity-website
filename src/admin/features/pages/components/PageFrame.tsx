import Link from 'next/link'
import type { ReactNode } from 'react'

import { buttonClassName, ButtonContent, ContentArea, PageHeader } from '@/admin/ui'

import { PageTabs, type PageTab } from './PageTabs'
import styles from './PageFrame.module.css'

/**
 * Cadre commun de C1, C2, C6 (Server Component) : en-tête d'écran (titre + chemin, « Open in AI editor »,
 * « Preview ↗ ») et onglets Content | SEO (liens de route), puis le contenu de l'onglet.
 */
export function PageFrame({
  title,
  meta,
  editorHref,
  previewHref,
  tabs,
  active,
  children,
}: {
  title: string
  meta: string
  /** Lien « Open in AI editor » (G1) ; absent : bouton masqué (page sans éditeur IA ou sans le droit). */
  editorHref?: string | null
  /** Page publique dans un nouvel onglet. */
  previewHref?: string | null
  tabs: PageTab[]
  active: PageTab['value']
  children: ReactNode
}) {
  return (
    <ContentArea padding="tabs" gap={20} className={styles.content}>
      <PageHeader
        title={title}
        meta={meta}
        actions={
          editorHref || previewHref ? (
            <>
              {editorHref ? (
                <Link href={editorHref} className={buttonClassName({ variant: 'secondary', size: 'small' })}>
                  <ButtonContent size="small" iconLeft="ai">
                    Open in AI editor
                  </ButtonContent>
                </Link>
              ) : null}
              {previewHref ? (
                <a
                  href={previewHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonClassName({ variant: 'ghost', size: 'small' })}
                >
                  <ButtonContent size="small" iconRight="external">
                    Preview
                  </ButtonContent>
                  <span className="kz-visually-hidden"> (opens in a new tab)</span>
                </a>
              ) : null}
            </>
          ) : null
        }
      />
      <PageTabs items={tabs} value={active} />
      {children}
    </ContentArea>
  )
}
