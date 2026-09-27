'use client'

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'

import {
  AnimatePresence,
  Button,
  Callout,
  CodeBlock,
  Icon,
  Input,
  Menu,
  MenuGroup,
  MenuItem,
  Portal,
  Scrim,
  Select,
  duration,
  ease,
  motion,
  useModalDialog,
  useReducedMotion,
  type IconName,
  type ListOption,
} from '@/admin/ui'

import {
  checkScript,
  isScriptValid,
  NAME_MAX,
  PLACEMENT_OPTIONS,
  RUN_OPTIONS,
  type PageOption,
  type ScriptCheck,
  type ScriptPlacement,
  type ScriptRun,
  type ScriptValues,
} from './scripts'
import styles from './ScriptDialog.module.css'

export type ScriptDialogProps = {
  open: boolean
  /** « New Script » (ajout) ou « Edit Script ». */
  mode: 'new' | 'edit'
  initial: ScriptValues
  pages: readonly PageOption[]
  /** Enregistre ; renvoie les erreurs du serveur (message général et par champ) ou rien si c'est bon. */
  onSave: (values: ScriptValues) => Promise<{ error: string; fieldErrors?: Record<string, string> } | void>
  onClose: () => void
}

/** Icône du menu « Insert field » selon le champ (Figma G6). */
const FIELD_ICONS: Readonly<Record<string, IconName>> = {
  title: 'text',
  slug: 'link',
  date: 'calendar',
  excerpt: 'text',
  cover: 'image',
  image: 'image',
  author: 'user',
  category: 'tag',
}

/**
 * Script dialog (Figma « Script dialog » 445:1957, G6) : fenêtre de 800 px sur bg/input, en-tête Label + trait
 * border/strong, champs Name / Placement / Page / Run sur bg/input-hover, éditeur de code (Geist Mono), pied avec
 * astuce et Cancel / Save. Page = page article (« slug: ») : bouton « Insert field » et saisie de « {{ » ouvrent la
 * liste des champs de la collection. Comportement de fenêtre du kit (useModalDialog : focus, Échap, piège de Tab).
 *
 * Composée ici (et non dans le kit) : le kit réserve le Script dialog à code-usage (ui/CLAUDE.md).
 */
export function ScriptDialog({ open, ...rest }: ScriptDialogProps) {
  const reduced = useReducedMotion()
  const enter = reduced ? { duration: 0 } : { duration: duration.base, ease: ease.out }
  const exit = reduced ? { duration: 0 } : { duration: duration.base * 0.8, ease: ease.out }
  return (
    <Portal>
      <AnimatePresence>
        {open ? (
          <div key="script-dialog" className={styles.layer}>
            {/* Saisie longue : le clic sur le voile ne ferme pas (Échap ou Cancel). */}
            <Scrim />
            <motion.div
              className={styles.motion}
              // `transform` en chaîne (WAAPI, skill motion), jamais depuis scale(0) ; apparié au voile (200 ms ease-out).
              initial={reduced ? { opacity: 0 } : { opacity: 0, transform: 'scale(0.96)' }}
              animate={reduced ? { opacity: 1, transition: enter } : { opacity: 1, transform: 'scale(1)', transition: enter }}
              exit={reduced ? { opacity: 0, transition: exit } : { opacity: 0, transform: 'scale(0.98)', transition: exit }}
            >
              <DialogBody {...rest} />
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
    </Portal>
  )
}

function DialogBody({ mode, initial, pages, onSave, onClose }: Omit<ScriptDialogProps, 'open'>) {
  const id = useId()
  const titleId = `${id}-title`
  const codeId = `${id}-code`
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const codeRef = useRef<HTMLTextAreaElement | null>(null)
  const [values, setValues] = useState<ScriptValues>(initial)
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [serverFieldErrors, setServerFieldErrors] = useState<Record<string, string>>({})
  const [menuOpen, setMenuOpen] = useState(false)
  /** Où insérer le champ choisi : sélection du code à l'ouverture, et « {{ » tapé à remplacer. */
  const insertAt = useRef<{ start: number; end: number }>({ start: 0, end: 0 })

  const onKeyDown = useModalDialog({ id, open: true, dialogRef, onEscape: () => (saving ? undefined : onClose()) })

  const check: ScriptCheck = useMemo(() => checkScript(values, pages), [values, pages])
  const page = pages.find((p) => p.value === values.page)
  const article = page?.article
  const errorOf = (field: keyof ScriptCheck['errors']) => serverFieldErrors[field] ?? (submitted ? check.errors[field] : undefined)

  const update = <K extends keyof ScriptValues>(field: K, value: ScriptValues[K]) => {
    setValues((v) => ({ ...v, [field]: value }))
    setServerFieldErrors(({ [field]: _drop, ...others }) => others)
    setServerError(null)
  }

  const pageItems: ListOption[] = useMemo(
    () =>
      pages.map((p) => ({
        value: p.value,
        label: p.label,
        ...(p.icon ? { icon: p.icon } : {}),
        ...(p.depth ? { depth: p.depth } : {}),
        ...(p.count !== undefined ? { meta: String(p.count) } : {}),
      })),
    [pages],
  )

  const rememberSelection = (replaceBraces: boolean) => {
    const el = codeRef.current
    const end = el?.selectionEnd ?? values.code.length
    const start = replaceBraces ? Math.max(0, end - 2) : (el?.selectionStart ?? end)
    insertAt.current = { start, end }
  }

  const focusCode = (caret: number) => {
    // Après le retour du focus au déclencheur du menu : on rend la main à l'éditeur, curseur après le champ.
    requestAnimationFrame(() => {
      const el = codeRef.current
      if (!el) return
      el.focus({ preventScroll: true })
      el.setSelectionRange(caret, caret)
    })
  }

  const insertField = (token: string) => {
    const { start, end } = insertAt.current
    const text = `{{${token}}}`
    const code = values.code.slice(0, start) + text + values.code.slice(end)
    update('code', code)
    focusCode(start + text.length)
  }

  const onCodeChange = (next: string) => {
    const prev = values.code
    update('code', next)
    // Page article : taper « {{ » ouvre la liste des champs (G6).
    const el = codeRef.current
    if (article && el && next.length === prev.length + 1) {
      const caret = el.selectionEnd
      if (next.slice(caret - 2, caret) === '{{' && next.slice(caret, caret + 1) !== '{') {
        rememberSelection(true)
        setMenuOpen(true)
      }
    }
  }

  const save = async () => {
    setSubmitted(true)
    setServerError(null)
    if (!isScriptValid(check)) {
      // Focus sur le premier champ en erreur.
      const first = (['name', 'placement', 'page', 'run', 'code'] as const).find((f) => check.errors[f])
      dialogRef.current?.querySelector<HTMLElement>(`[data-field="${first}"] input, [data-field="${first}"] button, [data-field="${first}"] textarea`)?.focus()
      return
    }
    setSaving(true)
    try {
      const result = await onSave({ ...values, name: values.name.trim() })
      if (result) {
        setServerError(result.error)
        setServerFieldErrors(result.fieldErrors ?? {})
      }
    } finally {
      setSaving(false)
    }
  }

  // Liste des champs ouverte (bouton ou « {{ ») : focus sur le premier champ dès qu'elle est visible. Le Popover du kit
  // est masqué (visibility: hidden) tant qu'il n'est pas positionné, ce qui fait échouer le focus initial du Menu.
  const menuLabel = article ? `${article.collectionLabel} fields` : ''
  useEffect(() => {
    if (!menuOpen || !menuLabel) return
    let frame = 0
    let tries = 0
    const tick = () => {
      const menu = document.querySelector<HTMLElement>(`[role="menu"][aria-label="${CSS.escape(menuLabel)}"]`)
      const item = menu?.querySelector<HTMLElement>('[role^="menuitem"]:not([aria-disabled="true"])')
      if (menu?.contains(document.activeElement)) return
      if (item && getComputedStyle(item).visibility !== 'hidden') item.focus({ preventScroll: true })
      else if (tries++ < 20) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [menuOpen, menuLabel])

  // Le texte d'erreur du serveur est annoncé ; on garde la fenêtre ouverte.
  useEffect(() => {
    if (serverError) dialogRef.current?.querySelector<HTMLElement>('[data-server-error]')?.focus()
  }, [serverError])

  const hint: ReactNode = article ? (
    <>
      {article.collectionLabel} article page: type <code className={styles.code}>{'{{'}</code> or use “Insert field” to add a field of the post.
    </>
  ) : (
    <>
      Place <code className={styles.code}>{'<script>'}</code> tags in “End of &lt;body&gt;” for faster page loading.
    </>
  )

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      className={styles.dialog}
      onKeyDown={onKeyDown}
    >
      <div className={styles.header}>
        <h2 id={titleId} className={styles.title}>
          {mode === 'new' ? 'New Script' : 'Edit Script'}
        </h2>
      </div>

      <form
        className={styles.body}
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
        id={`${id}-form`}
      >
        <div className={styles.row}>
          <div data-field="name" className={styles.cell}>
            <Input
              label="Name"
              value={values.name}
              onChange={(event) => update('name', event.target.value)}
              maxLength={NAME_MAX * 2}
              autoComplete="off"
              spellCheck={false}
              error={errorOf('name')}
              required
              data-autofocus=""
            />
          </div>
          <div data-field="placement" className={styles.cell}>
            <Select<ScriptPlacement>
              label="Placement"
              options={PLACEMENT_OPTIONS}
              value={values.placement}
              onValueChange={(v) => update('placement', v)}
              error={errorOf('placement')}
            />
          </div>
        </div>
        <div className={styles.row}>
          <div data-field="page" className={styles.cell}>
            <Select
              label="Page"
              options={pageItems}
              value={page ? values.page : null}
              placeholder="Choose a page"
              onValueChange={(v) => update('page', v)}
              error={errorOf('page')}
              renderValue={(value, label) => {
                const option = pages.find((p) => p.value === value)
                if (!option?.article) return <span className={value === 'all' ? styles.muted : undefined}>{label}</span>
                // L'icône de l'option est déjà posée par le Select : « slug: » + chemin en text/tertiary (G6).
                return (
                  <span className={styles.pageValue}>
                    <span>{option.label}</span>
                    <span className={styles.muted}>{option.path}</span>
                  </span>
                )
              }}
            />
          </div>
          <div data-field="run" className={styles.cell}>
            <Select<ScriptRun> label="Run" options={RUN_OPTIONS} value={values.run} onValueChange={(v) => update('run', v)} error={errorOf('run')} />
          </div>
        </div>

        <div data-field="code" className={styles.codeField}>
          <div className={styles.codeHeader}>
            <label htmlFor={codeId} className={styles.codeLabel}>
              Code
            </label>
            {article ? (
              <Menu
                open={menuOpen}
                onOpenChange={(next, reason) => {
                  if (next) rememberSelection(false)
                  setMenuOpen(next)
                  // Échap : retour dans l'éditeur plutôt que sur le bouton.
                  if (!next && reason === 'escape') focusCode(codeRef.current?.selectionEnd ?? 0)
                }}
                placement="bottom-end"
                width={250}
                aria-label={menuLabel}
                trigger={
                  <Button type="button" variant="subtle" size="small" iconLeft="database">
                    Insert field
                  </Button>
                }
              >
                <MenuGroup label={`${article.collectionLabel} fields`}>
                  {article.fields.map((field) => (
                    <MenuItem
                      key={field.token}
                      icon={FIELD_ICONS[field.token] ?? 'text'}
                      shortcut={`{{${field.token}}}`}
                      selected={check.fields.includes(field.token)}
                      multiple
                      onSelect={() => insertField(field.token)}
                    >
                      {field.label}
                    </MenuItem>
                  ))}
                </MenuGroup>
              </Menu>
            ) : null}
          </div>
          <CodeBlock
            id={codeId}
            ref={codeRef}
            label="Code"
            hideLabel
            value={values.code}
            onValueChange={onCodeChange}
            lineNumbers={false}
            minLines={14}
            error={errorOf('code')}
            aria-describedby={check.warnings.length ? `${id}-warnings` : undefined}
            className={styles.editor}
            placeholder={'<script>\n  …\n</script>'}
          />
          {check.warnings.length > 0 ? (
            <ul id={`${id}-warnings`} className={styles.warnings} aria-live="polite">
              {check.warnings.map((w) => (
                <li key={w}>
                  <Icon name="warning" size={12} />
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {serverError ? (
          <Callout tone="error" role="alert" tabIndex={-1} data-server-error="" className={styles.serverError}>
            {serverError}
          </Callout>
        ) : null}
      </form>

      <div className={styles.footer}>
        <p className={styles.hint}>
          <Icon name="info" size={12} className={styles.hintIcon} />
          <span>{hint}</span>
        </p>
        <div className={styles.actions}>
          <Button type="button" variant="subtle" size="small" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form={`${id}-form`} variant="primary" size="small" loading={saving}>
            Save
          </Button>
        </div>
      </div>
    </div>
  )
}
