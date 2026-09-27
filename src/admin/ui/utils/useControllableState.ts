'use client'

import { useCallback, useRef, useState } from 'react'

/**
 * État contrôlé ou non contrôlé : si `value` est défini, le parent décide ; sinon l'état interne
 * part de `defaultValue`. `onChange` est appelé dans les deux cas.
 */
export function useControllableState<T>(
  value: T | undefined,
  defaultValue: T,
  onChange?: (next: T) => void,
): [T, (next: T) => void] {
  const [inner, setInner] = useState(defaultValue)
  const controlled = value !== undefined
  const current = controlled ? (value as T) : inner
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const set = useCallback(
    (next: T) => {
      if (!controlled) setInner(next)
      onChangeRef.current?.(next)
    },
    [controlled],
  )
  return [current, set]
}
