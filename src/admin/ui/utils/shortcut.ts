'use client'

import { useEffect, useRef, useState } from 'react'

/** Vrai sur macOS / iOS (⌘ au lieu de Ctrl). Côté serveur : false. */
export function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false
  const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform ?? ''
  return /mac|iphone|ipad|ipod/i.test(platform)
}

/** Vrai si la cible est un champ de saisie (on n'y intercepte pas les raccourcis à une touche). */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

export type Shortcut = {
  /** Touche (KeyboardEvent.key), comparée sans casse : « / », « k », « Enter »… */
  key: string
  /** ⌘ sur Mac, Ctrl ailleurs. */
  mod?: boolean
  shift?: boolean
  alt?: boolean
}

export function matchesShortcut(event: KeyboardEvent, shortcut: Shortcut): boolean {
  if (event.key.toLowerCase() !== shortcut.key.toLowerCase()) return false
  const mod = isApplePlatform() ? event.metaKey : event.ctrlKey
  if (!!shortcut.mod !== mod) return false
  if (!!shortcut.shift !== event.shiftKey) return false
  if (!!shortcut.alt !== event.altKey) return false
  return true
}

/**
 * Raccourci clavier global (document). Un raccourci sans modificateur est ignoré quand le focus
 * est dans un champ de saisie, pour ne pas voler la frappe.
 */
export function useShortcut(shortcut: Shortcut | undefined, handler: (event: KeyboardEvent) => void, enabled = true) {
  const handlerRef = useRef(handler)
  handlerRef.current = handler
  const key = shortcut?.key
  const mod = shortcut?.mod
  const shift = shortcut?.shift
  const alt = shortcut?.alt
  useEffect(() => {
    if (!enabled || !key) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return
      if (!matchesShortcut(event, { key, mod, shift, alt })) return
      if (!mod && !alt && isEditableTarget(event.target)) return
      event.preventDefault()
      handlerRef.current(event)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [enabled, key, mod, shift, alt])
}

/** Libellé d'un raccourci pour <Kbd> : « ⌘ K », « Ctrl K », « / ». */
export function shortcutLabel(shortcut: Shortcut, apple = isApplePlatform()): string {
  const parts: string[] = []
  if (shortcut.mod) parts.push(apple ? '⌘' : 'Ctrl')
  if (shortcut.alt) parts.push(apple ? '⌥' : 'Alt')
  if (shortcut.shift) parts.push(apple ? '⇧' : 'Shift')
  const k = shortcut.key
  parts.push(k === 'Enter' ? '↵' : k === 'Escape' ? 'Esc' : k.length === 1 ? k.toUpperCase() : k)
  return parts.join(' ')
}

/**
 * Libellé d'un raccourci sans écart d'hydratation : « ⌘ » au rendu serveur et au premier rendu
 * (comme le Figma), puis la vraie plateforme après montage.
 */
export function useShortcutLabel(shortcut: Shortcut | undefined): string | undefined {
  const [apple, setApple] = useState(true)
  useEffect(() => setApple(isApplePlatform()), [])
  return shortcut ? shortcutLabel(shortcut, apple) : undefined
}
