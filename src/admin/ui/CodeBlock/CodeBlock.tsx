'use client'

import { useId, useRef, type ReactNode, type Ref, type TextareaHTMLAttributes } from 'react'
import { Icon } from '../icons'
import { cx } from '../utils/cx'
import { useControllableState } from '../utils/useControllableState'
import { tokenizeCode } from './highlight'
import styles from './CodeBlock.module.css'

export type CodeBlockProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'defaultValue' | 'onChange' | 'children'> & {
  /** Libellé au-dessus du bloc (Body Small, text/secondary). */
  label?: ReactNode
  hideLabel?: boolean
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  /** Lecture seule (JSON-LD écrit par Kuartz) : fond bg/subtle, texte text/tertiary, cadenas + note. */
  readOnly?: boolean
  /** Note de l'état lecture seule (défaut « Written in code by Kuartz »). */
  readOnlyNote?: ReactNode
  /** Coloration code/* (défaut true). */
  highlight?: boolean
  /** Numéros de ligne (défaut true). */
  lineNumbers?: boolean
  /** Hauteur minimale de l'éditeur, en lignes (défaut 5). */
  minLines?: number
  error?: ReactNode
  className?: string
  ref?: Ref<HTMLTextAreaElement>
}

/**
 * Bloc de code (Figma « Code block » 330:520), Geist Mono 12 / 160 % : editable (textarea superposé au rendu
 * coloré), focused (border/focus), read-only (cadenas « Written in code by Kuartz », non modifiable).
 * Tab reste la touche de navigation (pas de piège au clavier) ; le code n'est jamais exécuté.
 */
export function CodeBlock({
  label = 'Code',
  hideLabel,
  value: valueProp,
  defaultValue = '',
  onValueChange,
  readOnly,
  readOnlyNote = 'Written in code by Kuartz',
  highlight = true,
  lineNumbers = true,
  minLines = 5,
  error,
  className,
  id: idProp,
  ref,
  'aria-describedby': describedByProp,
  ...rest
}: CodeBlockProps) {
  const autoId = useId()
  const id = idProp ?? autoId
  const [value, setValue] = useControllableState(valueProp, defaultValue, onValueChange)
  const preRef = useRef<HTMLPreElement | null>(null)
  const gutterRef = useRef<HTMLDivElement | null>(null)
  const lines = Math.max(value.split('\n').length, readOnly ? 1 : minLines)
  const noteId = `${id}-note`
  const errorId = `${id}-error`
  const describedBy = [describedByProp, readOnly ? noteId : undefined, error ? errorId : undefined].filter(Boolean).join(' ') || undefined

  const rendered = highlight
    ? tokenizeCode(value).map((t, i) =>
        t.kind === 'text' ? t.text : (
          <span key={i} className={styles[t.kind]}>
            {t.text}
          </span>
        ),
      )
    : value

  return (
    <div className={cx(styles.block, readOnly && styles.readOnly, className)} data-state={readOnly ? 'read-only' : 'editable'}>
      <div className={cx(styles.header, hideLabel && 'kz-visually-hidden')}>
        <label htmlFor={readOnly ? undefined : id} id={`${id}-label`} className={styles.label}>
          {label}
        </label>
        {readOnly ? (
          <span id={noteId} className={styles.note}>
            <Icon name="lock" size={12} />
            {readOnlyNote}
          </span>
        ) : null}
      </div>
      <div className={cx(styles.editor, !!error && styles.invalid)} style={{ minHeight: `calc(${lines} * 12px * 1.6 + 22px)` }}>
        {lineNumbers ? (
          <div ref={gutterRef} className={styles.gutter} aria-hidden="true">
            {Array.from({ length: lines }, (_, i) => (
              <span key={i}>{i + 1}</span>
            ))}
          </div>
        ) : null}
        <div className={styles.code}>
          {readOnly ? (
            <pre
              className={styles.pre}
              tabIndex={0}
              role="region"
              aria-labelledby={`${id}-label`}
              aria-describedby={describedBy}
            >
              <code>{rendered}</code>
            </pre>
          ) : (
            <>
              <pre ref={preRef} className={cx(styles.pre, styles.mirror)} aria-hidden="true">
                <code>
                  {rendered}
                  {/* Dernière ligne vide : garde la même hauteur que la zone de saisie. */}
                  {'\n'}
                </code>
              </pre>
              <textarea
                ref={ref}
                id={id}
                className={styles.textarea}
                value={value}
                spellCheck={false}
                autoCapitalize="off"
                autoComplete="off"
                autoCorrect="off"
                wrap="off"
                aria-invalid={error ? true : undefined}
                aria-describedby={describedBy}
                onChange={(event) => setValue(event.target.value)}
                onScroll={(event) => {
                  const { scrollLeft, scrollTop } = event.currentTarget
                  if (preRef.current) {
                    preRef.current.scrollLeft = scrollLeft
                    preRef.current.scrollTop = scrollTop
                  }
                  if (gutterRef.current) gutterRef.current.scrollTop = scrollTop
                }}
                {...rest}
              />
            </>
          )}
        </div>
      </div>
      {error ? (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      ) : null}
    </div>
  )
}
