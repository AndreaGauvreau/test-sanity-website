'use client'

import { useEffect, useRef } from 'react'

import { Tag, useReducedMotion } from '@/admin/ui'

import { arrayItems, childOf } from '../lib/form'
import type { SectionModel } from './ContentView'
import styles from './DraftPreview.module.css'

/**
 * « Draft preview » de C1 : plan schématique de la page (comme la maquette du Figma), une bande par section du
 * manifeste, dans l'ordre du site ; la section ouverte y est surlignée (« Canvas selection ») et amenée à l'écran.
 * Ce n'est PAS un rendu du brouillon : le rendu réel est dans l'éditeur IA (aperçu du moteur, D1) — voir le CLAUDE.md
 * (limite connue et demande de contrat au pont de l'aperçu).
 */
export function DraftPreview({
  sections,
  value,
  active,
  hasDraft,
}: {
  sections: SectionModel[]
  value: Record<string, unknown>
  active: string | null
  hasDraft: boolean
}) {
  const reduced = useReducedMotion()
  const pageRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!active) return
    const node = pageRef.current?.querySelector<HTMLElement>(`[data-section="${CSS.escape(active)}"]`)
    const container = pageRef.current
    if (!node || !container) return
    // Défilement du cadre seulement (jamais de la page entière).
    const top = node === container.querySelector('[data-section]') ? 0 : node.offsetTop - 20
    container.scrollTo({ top: Math.max(0, top), behavior: reduced ? 'auto' : 'smooth' })
  }, [active, reduced])

  return (
    <aside className={styles.preview} aria-label="Draft preview">
      <div className={styles.bar}>
        <span className={styles.barTitle}>Draft preview</span>
        {hasDraft ? (
          <Tag tone="warning" dot>
            Draft
          </Tag>
        ) : (
          <Tag tone="neutral">Published</Tag>
        )}
      </div>
      <div ref={pageRef} className={styles.page} aria-hidden="true">
        <div className={styles.nav}>
          <span className={styles.logo} />
          <span className={styles.spacer} />
          <span className={styles.block} style={{ width: 30, height: 8 }} />
          <span className={styles.block} style={{ width: 30, height: 8 }} />
          <span className={styles.block} style={{ width: 44, height: 16 }} />
        </div>
        {sections.map(({ section }, index) => {
          const sectionValue = childOf(value, section.name)
          const arrays = section.fields.filter((f) => f.kind === 'array')
          const cards = arrays.length && index > 0 ? Math.min(4, Math.max(1, arrayItems(childOf(sectionValue, arrays[0].name)).length || 3)) : 0
          const ctas = section.fields.filter((f) => f.kind === 'cta').length
          const isActive = active === section.name
          const hero = index === 0
          return (
            <div key={section.name} data-section={section.name} data-active={isActive || undefined} className={styles.section}>
              {isActive ? <span className={styles.selectionLabel}>{section.label}</span> : null}
              <span className={styles.block} style={{ width: hero ? 240 : 180, height: hero ? 16 : 12 }} />
              {hero ? <span className={styles.block} style={{ width: 180, height: 16 }} /> : null}
              <span className={styles.block} style={{ width: hero ? 260 : 300, height: 8 }} />
              {cards ? (
                <div className={styles.cards}>
                  {Array.from({ length: cards }, (_, i) => (
                    <span key={i} className={styles.card} />
                  ))}
                </div>
              ) : null}
              {ctas ? (
                <div className={styles.ctas}>
                  {Array.from({ length: Math.min(ctas, 2) }, (_, i) => (
                    <span key={i} className={styles.block} style={{ width: i === 0 ? 90 : 70, height: 20 }} />
                  ))}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </aside>
  )
}
