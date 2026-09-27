import type { ReactNode } from 'react'

import { CodeBlock, HeadingRow, Icon, Tag } from '@/admin/ui'

import { analyzeHeadings } from '../lib/html'
import { loadHeadings, loadJsonLd } from '../server/data'
import styles from './SeoView.module.css'

/**
 * Blocs de C2 lus dans le HTML public de la page (Server Components asynchrones, rendus sous <Suspense> : la
 * lecture de la page ne retarde pas le formulaire). Les textes extraits sont rendus par React (échappés).
 */

const JSON_LD_LABEL = 'JSON-LD (structured data)'

/** JSON-LD en lecture seule (« Written in code by Kuartz »). */
export function JsonLdBlocks({ blocks, error }: { blocks: string[]; error?: string }) {
  if (error) {
    return <CodeBlock label={JSON_LD_LABEL} readOnly value={`Couldn't read the page. ${error}`} highlight={false} lineNumbers={false} />
  }
  if (blocks.length === 0) {
    return <CodeBlock label={JSON_LD_LABEL} readOnly value="No structured data on this page." highlight={false} lineNumbers={false} />
  }
  return (
    <div className={styles.jsonLd}>
      {blocks.map((block, index) => (
        <CodeBlock key={index} label={blocks.length > 1 ? `${JSON_LD_LABEL} · ${index + 1}` : JSON_LD_LABEL} readOnly value={block} />
      ))}
    </div>
  )
}

export async function PageJsonLd({ path }: { path: string }) {
  const result = await loadJsonLd(path)
  return result.ok ? <JsonLdBlocks blocks={result.blocks} /> : <JsonLdBlocks blocks={[]} error={result.error} />
}

export function JsonLdSkeleton() {
  return <CodeBlock label={JSON_LD_LABEL} readOnly value="Reading the page…" highlight={false} lineNumbers={false} aria-busy="true" />
}

// ─── Arbre des titres ──────────────────────────────────────────────────────

function HeadingCard({ children }: { children: ReactNode }) {
  return (
    <section className={styles.headingCard} aria-labelledby="kz-heading-structure">
      <div className={styles.headingHeader}>
        <h2 id="kz-heading-structure" className={styles.headingTitle}>
          Heading structure
        </h2>
        <Tag tone="info" dot title="Read from the page as it is live. Draft changes show here after Publish.">
          Live
        </Tag>
      </div>
      {children}
    </section>
  )
}

export function HeadingStructureView({ headings, error }: { headings: Parameters<typeof analyzeHeadings>[0]; error?: string }) {
  if (error) {
    return (
      <HeadingCard>
        <p className={styles.muted}>{`Couldn't read the page. ${error}`}</p>
      </HeadingCard>
    )
  }
  if (headings.length === 0) {
    return (
      <HeadingCard>
        <p className={styles.muted}>No headings on this page.</p>
      </HeadingCard>
    )
  }
  const { rows, summary } = analyzeHeadings(headings)
  return (
    <HeadingCard>
      <ul className={styles.headingList}>
        {rows.map((row, index) => (
          <HeadingRow
            key={index}
            as="li"
            level={row.level}
            text={row.text || '(empty)'}
            status={row.issue ? 'warning' : 'ok'}
            note={row.note}
          />
        ))}
      </ul>
      <ul className={styles.headingSummary} aria-label="Heading checks">
        {summary.map((item) => (
          <li key={item.text} className={`${styles.summaryItem} ${item.ok ? styles.summaryOk : styles.summaryWarn}`}>
            <Icon name={item.ok ? 'check' : 'warning'} size={10} set={12} />
            <span>{item.text}</span>
          </li>
        ))}
      </ul>
    </HeadingCard>
  )
}

export async function PageHeadingStructure({ path }: { path: string }) {
  const result = await loadHeadings(path)
  return result.ok ? <HeadingStructureView headings={result.headings} /> : <HeadingStructureView headings={[]} error={result.error} />
}

export function HeadingStructureSkeleton() {
  return (
    <HeadingCard>
      <div className={styles.skeleton} aria-busy="true" aria-label="Reading the page">
        {[70, 55, 45, 45, 60, 50].map((width, i) => (
          <span key={i} className={styles.skeletonLine} style={{ width: `${width}%`, marginLeft: i === 0 ? 0 : 16 * Math.min(2, i % 3) }} />
        ))}
      </div>
    </HeadingCard>
  )
}
