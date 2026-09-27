import type { Ref, RefCallback } from 'react'

/** Assigne une même valeur à plusieurs refs (objet ou fonction). React 19 : ref est une prop ordinaire. */
export function assignRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (!ref) return
  if (typeof ref === 'function') ref(value)
  else (ref as { current: T | null }).current = value
}

export function mergeRefs<T>(...refs: Array<Ref<T> | undefined>): RefCallback<T> {
  return (value) => {
    for (const ref of refs) assignRef(ref, value)
  }
}
