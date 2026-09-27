'use client'

import {
  defineAnnotation,
  defineBlockObject,
  defineDecorator,
  defineSchema,
  defineTextBlock,
  EditorProvider,
  PortableTextEditable,
  useEditor,
  useEditorSelector,
  type PortableTextBlock,
} from '@portabletext/editor'
import { EventListenerPlugin, NodePlugin } from '@portabletext/editor/plugins'
import {
  getActiveAnnotations,
  isActiveAnnotation,
  isActiveDecorator,
  isActiveListItem,
  isActiveStyle,
  isSelectionExpanded,
} from '@portabletext/editor/selectors'
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

import { isSafeHref } from '@/admin/core/sanity/validate'
import { Button, Icon, Input, Popover, Tooltip, cx, useShortcutLabel, type IconName } from '@/admin/ui'

import { randomKey, type RichTextConfig } from '../../lib/portable-text'
import styles from './RichTextField.module.css'

/**
 * Champ de texte riche (Figma « Rich text field » 330:490, écran C4 « Body ») construit sur
 * @portabletext/editor : la valeur est du Portable Text compatible avec le schéma Sanity (`post.content`,
 * `faq.answer`). Outils du Figma : H2, H3, gras, italique | puces, numéros, lien — seulement ceux que
 * `config` permet. Barre d'outils APG (flèches gauche / droite, Home, End ; boutons bascule aria-pressed).
 * Non contrôlé : la valeur de départ est lue une fois (remonter le composant avec une autre `key` pour
 * repartir d'une autre valeur) ; chaque modification remonte par `onChange`.
 */

export type RichTextFieldProps = {
  label: ReactNode
  /** Valeur de départ (Portable Text). */
  initialValue: readonly unknown[]
  config: RichTextConfig
  onChange: (value: PortableTextBlock[]) => void
  /** Perte du focus : l'appelant enregistre sans attendre. */
  onBlur?: () => void
  /**
   * Reçoit une fonction qui remonte TOUT DE SUITE la valeur courante (l'éditeur regroupe ses modifications
   * par paquets d'une seconde) : à appeler avant de fermer le panneau.
   */
  registerFlush?: (flush: (() => void) | null) => void
  error?: ReactNode
  helper?: ReactNode
  id?: string
  placeholder?: string
  readOnly?: boolean
}

function schemaFor(config: RichTextConfig) {
  return defineSchema({
    styles: config.styles.map((name) => ({ name })),
    lists: config.lists.map((name) => ({ name })),
    decorators: config.decorators.map((name) => ({ name })),
    annotations: config.annotations.includes('link') ? [{ name: 'link', fields: [{ name: 'href', type: 'string' }] }] : [],
    blockObjects: config.blockObjects.map((name) => ({
      name,
      fields: [
        { name: 'asset', type: 'object' },
        { name: 'alt', type: 'string' },
        { name: 'caption', type: 'string' },
        { name: 'hotspot', type: 'object' },
        { name: 'crop', type: 'object' },
      ],
    })),
    inlineObjects: [],
  })
}

// Rendus déclarés au niveau du module : NodePlugin se réenregistrerait à chaque frappe sinon.
const NODES = [
  defineTextBlock({
    type: 'block',
    render: ({ attributes, children, node }) => {
      const list = node.listItem
      if (list) {
        return (
          <div {...attributes} className={styles.listItem} data-list={list} data-level={node.level ?? 1}>
            {children}
          </div>
        )
      }
      switch (node.style) {
        case 'h2':
          return (
            <h2 {...attributes} className={styles.h2}>
              {children}
            </h2>
          )
        case 'h3':
          return (
            <h3 {...attributes} className={styles.h3}>
              {children}
            </h3>
          )
        case 'blockquote':
          return (
            <blockquote {...attributes} className={styles.quote}>
              {children}
            </blockquote>
          )
        default:
          return (
            <p {...attributes} className={styles.paragraph}>
              {children}
            </p>
          )
      }
    },
  }),
  defineDecorator({ type: 'strong', render: ({ children }) => <strong>{children}</strong> }),
  defineDecorator({ type: 'em', render: ({ children }) => <em>{children}</em> }),
  defineAnnotation({
    type: 'link',
    render: ({ children, annotation }) => (
      <span className={styles.link} title={typeof annotation.href === 'string' ? annotation.href : undefined}>
        {children}
      </span>
    ),
  }),
  defineBlockObject({
    type: 'image',
    render: ({ attributes, children, selected }) => (
      <div {...attributes} className={cx(styles.object, selected && styles.objectSelected)}>
        {children}
        <span className={styles.objectLabel} contentEditable={false}>
          <Icon name="image" size={16} set={18} />
          Image
        </span>
      </div>
    ),
  }),
]

export function RichTextField({
  label,
  initialValue,
  config,
  onChange,
  onBlur,
  error,
  helper,
  id: idProp,
  placeholder = 'Write something…',
  readOnly,
  registerFlush,
}: RichTextFieldProps) {
  const autoId = useId()
  const id = idProp ?? autoId
  const labelId = `${id}-label`
  const messageId = `${id}-message`
  const schemaDefinition = useMemo(() => schemaFor(config), [config])
  // Valeur de départ figée au montage (éditeur non contrôlé).
  const [initial] = useState(() => (Array.isArray(initialValue) ? (initialValue as PortableTextBlock[]) : []))
  const onChangeRef = useRef(onChange)
  const onBlurRef = useRef(onBlur)
  useEffect(() => {
    onChangeRef.current = onChange
    onBlurRef.current = onBlur
  })

  return (
    <div className={styles.field}>
      <span id={labelId} className={styles.label}>
        {label}
      </span>
      <div className={cx(styles.editor, error ? styles.invalid : null)} data-readonly={readOnly || undefined}>
        <EditorProvider initialConfig={{ schemaDefinition, initialValue: initial, keyGenerator: randomKey, readOnly }}>
          <ValueSync onChange={(value) => onChangeRef.current(value)} onBlur={() => onBlurRef.current?.()} registerFlush={registerFlush} />
          <NodePlugin nodes={NODES} />
          {readOnly ? null : <Toolbar config={config} editorId={id} />}
          <PortableTextEditable
            id={id}
            className={styles.content}
            aria-labelledby={labelId}
            aria-describedby={error || helper ? messageId : undefined}
            aria-invalid={error ? true : undefined}
            aria-multiline
            spellCheck
            hotkeys={{ marks: { 'mod+b': 'strong', 'mod+i': 'em' } }}
            renderPlaceholder={() => <span className={styles.placeholder}>{placeholder}</span>}
          />
        </EditorProvider>
      </div>
      {error ? (
        <p id={messageId} className={styles.error} role="alert">
          {error}
        </p>
      ) : helper ? (
        <p id={messageId} className={styles.helper}>
          {helper}
        </p>
      ) : null}
    </div>
  )
}

// ─── Remontée de la valeur ───────────────────────────────────────────────────

/**
 * Remonte chaque modification (événements « mutation », regroupés par l'éditeur) et, à la perte du focus ou
 * sur demande (`registerFlush`), la valeur courante lue dans l'état de l'éditeur si elle n'a pas encore été
 * remontée : une frappe juste avant la fermeture du panneau n'est pas perdue.
 */
function ValueSync({
  onChange,
  onBlur,
  registerFlush,
}: {
  onChange: (value: PortableTextBlock[]) => void
  onBlur: () => void
  registerFlush?: (flush: (() => void) | null) => void
}) {
  const editor = useEditor()
  const last = useRef<string | null>(null)
  // Vrai dès qu'une modification locale n'a pas encore été remontée (événement « patch », immédiat).
  const dirty = useRef(false)
  const emit = (value: PortableTextBlock[]) => {
    dirty.current = false
    const json = JSON.stringify(value)
    if (json === last.current) return
    last.current = json
    onChange(value)
  }
  // Sans modification locale, rien à remonter (la normalisation de la valeur de départ n'est pas une modification).
  const flushPending = () => {
    if (dirty.current) emitRef.current(editor.getSnapshot().context.value ?? [])
  }
  const emitRef = useRef(emit)
  const registerRef = useRef(registerFlush)
  const flushRef = useRef(flushPending)
  useEffect(() => {
    emitRef.current = emit
    registerRef.current = registerFlush
    flushRef.current = flushPending
  })
  useEffect(() => {
    last.current = JSON.stringify(editor.getSnapshot().context.value ?? [])
    const register = registerRef.current
    register?.(() => flushRef.current())
    return () => register?.(null)
  }, [editor])

  return (
    <EventListenerPlugin
      on={(event) => {
        if (event.type === 'patch') dirty.current = true
        if (event.type === 'mutation') emitRef.current((event.value ?? []) as PortableTextBlock[])
        if (event.type === 'blurred') {
          flushRef.current()
          onBlur()
        }
      }}
    />
  )
}

// ─── Barre d'outils ──────────────────────────────────────────────────────────

type Tool = { id: string; label: string; shortcut?: string } & ({ glyph: string } | { icon: IconName })

function Toolbar({ config, editorId }: { config: RichTextConfig; editorId: string }) {
  const editor = useEditor()
  const boldKey = useShortcutLabel({ key: 'b', mod: true })
  const italicKey = useShortcutLabel({ key: 'i', mod: true })
  const barRef = useRef<HTMLDivElement | null>(null)
  const [focusIndex, setFocusIndex] = useState(0)

  const h2 = useEditorSelector(editor, isActiveStyle('h2'))
  const h3 = useEditorSelector(editor, isActiveStyle('h3'))
  const strong = useEditorSelector(editor, isActiveDecorator('strong'))
  const em = useEditorSelector(editor, isActiveDecorator('em'))
  const bullet = useEditorSelector(editor, isActiveListItem('bullet'))
  const number = useEditorSelector(editor, isActiveListItem('number'))
  const linkActive = useEditorSelector(editor, isActiveAnnotation('link'))
  const expanded = useEditorSelector(editor, isSelectionExpanded)

  const formatTools: Tool[] = [
    ...(config.styles.includes('h2') ? [{ id: 'h2', label: 'Heading 2', glyph: 'H2' }] : []),
    ...(config.styles.includes('h3') ? [{ id: 'h3', label: 'Heading 3', glyph: 'H3' }] : []),
    ...(config.decorators.includes('strong') ? [{ id: 'strong', label: 'Bold', glyph: 'B', shortcut: boldKey }] : []),
    ...(config.decorators.includes('em') ? [{ id: 'em', label: 'Italic', glyph: 'I', shortcut: italicKey }] : []),
  ]
  const blockTools: Tool[] = [
    ...(config.lists.includes('bullet') ? [{ id: 'bullet', label: 'Bulleted list', icon: 'list-bullets' as IconName }] : []),
    ...(config.lists.includes('number') ? [{ id: 'number', label: 'Numbered list', icon: 'list-numbers' as IconName }] : []),
    ...(config.annotations.includes('link') ? [{ id: 'link', label: 'Link', icon: 'link' as IconName }] : []),
  ]
  const all = [...formatTools, ...blockTools]
  const pressed: Record<string, boolean> = { h2, h3, strong, em, bullet, number, link: linkActive }
  const disabled: Record<string, boolean> = { link: !linkActive && !expanded }

  const [linkOpen, setLinkOpen] = useState(false)
  const linkRef = useRef<HTMLButtonElement | null>(null)

  const run = (toolId: string) => {
    switch (toolId) {
      case 'h2':
      case 'h3':
        editor.send({ type: 'style.toggle', style: toolId })
        break
      case 'strong':
      case 'em':
        editor.send({ type: 'decorator.toggle', decorator: toolId })
        break
      case 'bullet':
      case 'number':
        editor.send({ type: 'list item.toggle', listItem: toolId })
        break
      case 'link':
        setLinkOpen(true)
        return
    }
    editor.send({ type: 'focus' })
  }

  // Barre d'outils APG : un seul arrêt de tabulation, flèches pour se déplacer.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const buttons = Array.from(barRef.current?.querySelectorAll<HTMLButtonElement>('button[data-tool]') ?? [])
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
    if (current === -1) return
    let next = current
    if (event.key === 'ArrowRight') next = (current + 1) % buttons.length
    else if (event.key === 'ArrowLeft') next = (current - 1 + buttons.length) % buttons.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = buttons.length - 1
    else return
    event.preventDefault()
    setFocusIndex(next)
    buttons[next]?.focus()
  }

  const renderTool = (tool: Tool, index: number) => {
    const isPressed = !!pressed[tool.id]
    const isDisabled = !!disabled[tool.id]
    return (
      <Tooltip key={tool.id} label={isDisabled ? 'Select text to add a link' : tool.label} shortcut={tool.shortcut}>
        <button
          ref={tool.id === 'link' ? linkRef : undefined}
          type="button"
          data-tool={tool.id}
          className={cx(styles.tool, 'glyph' in tool ? styles.glyph : null, tool.id === 'em' && styles.italic, tool.id === 'strong' && styles.bold)}
          aria-label={tool.label}
          aria-pressed={tool.id === 'link' ? undefined : isPressed}
          aria-haspopup={tool.id === 'link' ? 'dialog' : undefined}
          aria-expanded={tool.id === 'link' ? linkOpen : undefined}
          data-pressed={isPressed || undefined}
          aria-disabled={isDisabled || undefined}
          tabIndex={index === focusIndex ? 0 : -1}
          // Garder la sélection de l'éditeur : pas de vol de focus au clic.
          onMouseDown={(event) => event.preventDefault()}
          onFocus={() => setFocusIndex(index)}
          onClick={() => {
            if (!isDisabled) run(tool.id)
          }}
        >
          {'glyph' in tool ? tool.glyph : <Icon name={tool.icon} size={16} set={18} />}
        </button>
      </Tooltip>
    )
  }

  return (
    <div ref={barRef} role="toolbar" aria-label="Formatting" aria-controls={editorId} className={styles.toolbar} onKeyDown={onKeyDown}>
      {formatTools.map((tool, i) => renderTool(tool, i))}
      {formatTools.length && blockTools.length ? <span className={styles.divider} aria-hidden="true" /> : null}
      {blockTools.map((tool, i) => renderTool(tool, formatTools.length + i))}
      {all.some((t) => t.id === 'link') ? (
        <LinkPopover open={linkOpen} anchorRef={linkRef} active={linkActive} onClose={() => setLinkOpen(false)} />
      ) : null}
    </div>
  )
}

function LinkPopover({
  open,
  anchorRef,
  active,
  onClose,
}: {
  open: boolean
  anchorRef: React.RefObject<HTMLButtonElement | null>
  active: boolean
  onClose: () => void
}) {
  const editor = useEditor()
  const annotations = useEditorSelector(editor, getActiveAnnotations)
  const current = annotations.find((a) => a._type === 'link')
  const initialHref = typeof current?.href === 'string' ? current.href : ''
  const [href, setHref] = useState(initialHref)
  const [error, setError] = useState<string | null>(null)
  const [openedWith, setOpenedWith] = useState<boolean>(false)

  // Réinitialise le champ à chaque ouverture (sans effet : comparaison pendant le rendu).
  if (open !== openedWith) {
    setOpenedWith(open)
    if (open) {
      setHref(initialHref)
      setError(null)
    }
  }

  const close = () => {
    onClose()
    editor.send({ type: 'focus' })
  }

  const apply = () => {
    const value = href.trim()
    if (!isSafeHref(value)) {
      setError('Enter a full URL (https://…), a site path (/blog) or mailto:.')
      return
    }
    if (active) editor.send({ type: 'annotation.remove', annotation: { name: 'link' } })
    editor.send({ type: 'annotation.add', annotation: { name: 'link', value: { href: value } } })
    close()
  }

  return (
    <Popover open={open} anchorRef={anchorRef} onClose={close} placement="bottom-start" initialFocus="first" returnFocus={false} surface className={styles.linkPopover} role="dialog" aria-label="Link">
      <form
        className={styles.linkForm}
        onSubmit={(event) => {
          event.preventDefault()
          apply()
        }}
      >
        <Input
          label="Link"
          value={href}
          placeholder="https://… or /page"
          onChange={(event) => {
            setHref(event.target.value)
            setError(null)
          }}
          error={error ?? undefined}
          autoComplete="off"
          spellCheck={false}
        />
        <div className={styles.linkActions}>
          {active ? (
            <Button
              variant="ghost"
              size="small"
              type="button"
              onClick={() => {
                editor.send({ type: 'annotation.remove', annotation: { name: 'link' } })
                close()
              }}
            >
              Remove link
            </Button>
          ) : null}
          <span className={styles.spacer} />
          <Button variant="primary" size="small" type="submit">
            {active ? 'Update' : 'Add link'}
          </Button>
        </div>
      </form>
    </Popover>
  )
}
