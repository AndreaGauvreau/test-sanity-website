'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Conteneur des portails. Par défaut : le premier élément [data-kz-admin] du document (les tokens
 * --k-* et les polices y sont définis) ; à défaut, <body>. Une zone de l'admin peut en imposer un
 * autre via <PortalContainerProvider> (ex. un panneau qui doit rester au-dessus d'une iframe).
 */
const PortalContainerContext = createContext<HTMLElement | null>(null)

export function PortalContainerProvider({ container, children }: { container: HTMLElement | null; children: ReactNode }) {
  return <PortalContainerContext.Provider value={container}>{children}</PortalContainerContext.Provider>
}

export type PortalProps = {
  children: ReactNode
  /** Conteneur explicite (prioritaire sur le contexte et la recherche de [data-kz-admin]). */
  container?: HTMLElement | null
}

export function Portal({ children, container }: PortalProps) {
  const fromContext = useContext(PortalContainerContext)
  const [target, setTarget] = useState<HTMLElement | null>(null)

  useEffect(() => {
    setTarget(container ?? fromContext ?? document.querySelector<HTMLElement>('[data-kz-admin]') ?? document.body)
  }, [container, fromContext])

  if (!target) return null
  return createPortal(children, target)
}
