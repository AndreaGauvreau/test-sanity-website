'use client'

import Link from 'next/link'
import type { ComponentPropsWithoutRef, Ref } from 'react'

import { isExternalHref } from './nav'

type ShellLinkProps = Omit<ComponentPropsWithoutRef<'a'>, 'href'> & { href: string; ref?: Ref<HTMLAnchorElement> }

/**
 * Composant de lien passé au kit (`linkAs` de Sidebar / TopBar, `as` de NavItem) : next/link pour les routes de
 * l'admin ; lien externe (hub Kuartz) → nouvel onglet, `rel="noopener noreferrer"` et « (opens in a new tab) » lu
 * par les lecteurs d'écran (convention du kit pour les liens externes).
 */
export function ShellLink({ href, children, ref, ...rest }: ShellLinkProps) {
  if (isExternalHref(href)) {
    return (
      <a ref={ref} href={href} target="_blank" rel="noopener noreferrer" {...rest}>
        {children}
        <span className="kz-visually-hidden"> (opens in a new tab)</span>
      </a>
    )
  }
  return (
    <Link ref={ref} href={href} {...rest}>
      {children}
    </Link>
  )
}
