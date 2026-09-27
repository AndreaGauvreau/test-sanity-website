'use client'

import Link from 'next/link'

import { Tabs } from '@/admin/ui'

export type PageTab = { value: 'content' | 'seo'; label: string; href: string }

/**
 * Onglets Content | SEO (liens de route, `<nav>` + aria-current). Composant client : le kit reçoit `Link` en
 * `linkAs`, qui ne peut pas traverser la frontière serveur → client comme prop.
 */
export function PageTabs({ items, value }: { items: PageTab[]; value: PageTab['value'] }) {
  return <Tabs aria-label="Page sections" items={items} value={value} linkAs={Link} />
}
