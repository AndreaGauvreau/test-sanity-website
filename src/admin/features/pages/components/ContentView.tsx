'use client'

import Link from 'next/link'
import { useCallback, useId, useMemo, useState } from 'react'

import type { SectionDef } from '@/admin/core/contracts'
import { Callout, Icon, motion, useMotionVariants, fade } from '@/admin/ui'

import { childOf, setAtPath, toImage } from '../lib/form'
import type { SectionSource } from '../lib/manifest'
import { savePageFieldAction } from '../server/actions'
import { DraftPreview } from './DraftPreview'
import { FieldControl } from './fields'
import { FormProvider, postImage, type FormContextValue } from './FormContext'
import styles from './ContentView.module.css'

export type SectionModel = {
  section: SectionDef
  summary: string
  source: SectionSource | null
}

export type ContentViewProps = {
  pageId: string
  sections: SectionModel[]
  /** Valeur du document (brouillon s'il existe, sinon publié), sans champs système. */
  value: Record<string, unknown>
  hasDraft: boolean
  readOnly: boolean
  referenceOptions: FormContextValue['referenceOptions']
  /** Injection pour les tests (server action par défaut). */
  saveField?: FormContextValue['saveField']
  uploadImage?: FormContextValue['uploadImage']
}

/**
 * Onglet Content (C1) : sections en accordéon dans l'ordre du site, une seule ouverte à la fois (proposé), champs
 * générés depuis le manifeste ; aperçu du brouillon à droite, la section ouverte y est surlignée.
 */
export function ContentView({ pageId, sections, value, hasDraft, readOnly, referenceOptions, saveField, uploadImage }: ContentViewProps) {
  const [open, setOpen] = useState<string | null>(sections[0]?.section.name ?? null)
  // Le premier enregistrement crée le brouillon : le badge de l'aperçu passe à « Draft ».
  const [drafted, setDrafted] = useState(hasDraft)
  // Valeur locale du document, mise à jour après chaque enregistrement réussi (réouverture d'une section).
  const [doc, setDoc] = useState(value)
  const baseId = useId()
  const variants = useMotionVariants(fade)

  const context = useMemo<FormContextValue>(
    () => ({
      pageId,
      readOnly,
      referenceOptions,
      saveField: async (path, next) => {
        const result = await (saveField ?? ((p, v) => savePageFieldAction({ pageId, path: p, value: v })))(path, next)
        if (result.ok) {
          setDrafted(true)
          setDoc((current) => setAtPath(current, path, next))
        }
        return result
      },
      uploadImage: async (path, file) => {
        const result = await (uploadImage ?? ((p, f) => postImage(pageId, { target: 'field', path: p, file: f })))(path, file)
        if (result.ok) {
          setDrafted(true)
          setDoc((current) => setAtPath(current, path, toImage(result.assetId)))
        }
        return result
      },
    }),
    [pageId, readOnly, referenceOptions, saveField, uploadImage],
  )

  const toggle = useCallback((name: string) => setOpen((current) => (current === name ? null : name)), [])

  return (
    <FormProvider value={context}>
      <div className={styles.body}>
        <div className={styles.sections}>
          {readOnly ? <Callout tone="info">{"You can view this page but you don't have access to edit it."}</Callout> : null}
          {sections.map(({ section, summary, source }, index) => {
            const isOpen = open === section.name
            const headerId = `${baseId}-${section.name}-header`
            const panelId = `${baseId}-${section.name}-panel`
            const sectionValue = childOf(doc, section.name)
            return (
              <section key={section.name} className={styles.section} data-open={isOpen || undefined}>
                <h2 className={styles.heading}>
                  <button
                    type="button"
                    id={headerId}
                    className={styles.header}
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => toggle(section.name)}
                  >
                    <Icon name={isOpen ? 'chevron-down' : 'chevron-right'} size={16} set={18} className={styles.chevron} />
                    <span className={styles.title}>{section.label}</span>
                    {isOpen ? (
                      <span className={styles.position}>{`Section ${index + 1} / ${sections.length}`}</span>
                    ) : (
                      <span className={styles.summary}>
                        {source ? <Icon name="database" size={12} set={18} className={styles.sourceIcon} /> : null}
                        {source ? source.label : summary}
                      </span>
                    )}
                  </button>
                </h2>
                {isOpen ? (
                  <motion.div
                    id={panelId}
                    role="region"
                    aria-labelledby={headerId}
                    className={styles.panel}
                    variants={variants}
                    initial="initial"
                    animate="animate"
                  >
                    {source ? (
                      <p className={styles.source}>
                        <Icon name="database" size={12} set={18} />
                        <span>{`Items come from the CMS. `}</span>
                        <Link href={source.href} className={styles.sourceLink}>
                          {source.label.replace('From CMS › ', 'Open ')}
                        </Link>
                      </p>
                    ) : null}
                    {section.fields.map((field) => (
                      <FieldControl key={field.name} field={field} path={`${section.name}.${field.name}`} value={childOf(sectionValue, field.name)} />
                    ))}
                  </motion.div>
                ) : null}
              </section>
            )
          })}
          <Callout tone="neutral" className={styles.askKuartz}>
            Need another field? Ask Kuartz — fields are defined in code.
          </Callout>
        </div>
        <DraftPreview sections={sections} value={doc} active={open} hasDraft={drafted} />
      </div>
    </FormProvider>
  )
}
