'use client'

import { useState, useTransition } from 'react'

import { autosave } from '@/admin/core/autosave'
import {
  Button,
  Callout,
  ContentArea,
  EmptyState,
  IconButton,
  Menu,
  MenuItem,
  MenuSeparator,
  Modal,
  SectionHeader,
  Table,
  TableCell,
  TableHeaderCell,
  TableRow,
  Tag,
  useToast,
} from '@/admin/ui'

import { deleteScriptAction, moveScriptAction, resignScriptAction, saveScriptAction, setScriptEnabledAction, type ScriptActionResult } from './actions'
import styles from './Code.module.css'
import { ScriptDialog } from './ScriptDialog'
import { DEFAULT_SCRIPT, pageLabel, placementLabel, scriptType, type PageOption, type ScriptItem, type ScriptValues } from './scripts'

export type CodeScreenProps = {
  scripts: readonly ScriptItem[]
  pages: readonly PageOption[]
  /** SEC-04 : le serveur a un SCRIPTS_SIGNING_SECRET valide (sinon aucun script ne tourne et rien ne s'enregistre). */
  signingReady: boolean
}

/** Données gardées pendant l'animation de sortie (la fenêtre se ferme avec son contenu). */
type DialogState = { open: boolean; mode: 'new' | 'edit'; key?: string }

const DESCRIPTION = 'Custom code added to every page, or to a selection of pages, of the published site.'

/** SEC-04 : statut d'un script dont la signature est invalide (modifié dans le Studio ou par l'API). */
export const MODIFIED_STATUS = 'Modified outside the admin — not running on the site'
const SIGNING_MISSING_NOTE =
  'Script signing isn’t set up on the server (SCRIPTS_SIGNING_SECRET): no script runs on the site, and scripts can’t be saved.'
const EDIT_NOTICE =
  'This script was modified outside the admin and doesn’t run on the site. Check its code: Saving signs it, and it runs when you publish.'

/**
 * B3 · Site Settings › Code (Kuartz seulement) : tableau des scripts (Name · Placement · Type · Page · Status · ⋯),
 * ajout / modification dans le Script dialog (G6), activation, déplacement, suppression avec confirmation.
 * Chaque écriture passe par une server action qui revérifie `settings.code` ; le brouillon est relu par `refresh()`.
 * SEC-04 : un script à la signature invalide est affiché « Modified outside the admin — not running on the site »,
 * avec l'action « Re-sign » (confirmée) ; Enable lui est fermé, Edit prévient que Save le signe.
 */
export function CodeScreen({ scripts, pages, signingReady }: CodeScreenProps) {
  const toast = useToast()
  const [dialog, setDialog] = useState<DialogState>({ open: false, mode: 'new' })
  const [confirm, setConfirm] = useState<{ open: boolean; key?: string }>({ open: false })
  const [resign, setResign] = useState<{ open: boolean; key?: string }>({ open: false })
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const editing = dialog.mode === 'edit' ? scripts.find((s) => s.key === dialog.key) : undefined
  const confirming = confirm.key ? scripts.find((s) => s.key === confirm.key) : undefined
  const resigning = resign.key ? scripts.find((s) => s.key === resign.key) : undefined
  const unsigned = scripts.filter((s) => !s.signed).length
  const openNew = () => setDialog({ open: true, mode: 'new' })
  const openEdit = (key: string) => setDialog({ open: true, mode: 'edit', key })
  const closeDialog = () => setDialog((d) => ({ ...d, open: false }))

  /** Écriture d'un brouillon : état « Draft saved automatically » de la Top bar, toast en cas d'échec. */
  const write = async (key: string | null, action: () => Promise<ScriptActionResult>, done?: string): Promise<ScriptActionResult> => {
    setBusyKey(key)
    autosave.saving()
    try {
      const result = await action()
      if (result.ok) {
        autosave.saved()
        if (done) toast.show({ type: 'success', message: done })
      } else autosave.failed(result.error)
      return result
    } catch {
      const error = "Couldn't reach the server. Please try again."
      autosave.failed(error)
      return { ok: false, error }
    } finally {
      setBusyKey(null)
    }
  }

  const rowAction = (key: string, action: () => Promise<ScriptActionResult>, done?: string) => {
    startTransition(async () => {
      const result = await write(key, action, done)
      if (!result.ok) toast.show({ type: 'error', message: result.error })
    })
  }

  const onSave = async (values: ScriptValues) => {
    const key = dialog.mode === 'edit' ? dialog.key : undefined
    const result = await write(key ?? null, () => saveScriptAction({ key, values }))
    if (!result.ok) return { error: result.error, fieldErrors: result.fieldErrors }
    closeDialog()
    toast.show({ type: 'success', message: key ? 'Script saved. It goes live when you publish.' : 'Script added. It goes live when you publish.' })
  }

  const addButton = (
    <Button variant="secondary" size="small" iconLeft="plus" onClick={openNew}>
      Add
    </Button>
  )

  return (
    <ContentArea gap={24}>
      {/* Figma B3 : « Section header » en tête d'écran (pas de Page header) → titre h1 au rendu Heading 4. */}
      <SectionHeader headingLevel={1} title="Code" description={DESCRIPTION} action={addButton} />

      {!signingReady ? <Callout tone="error">{SIGNING_MISSING_NOTE}</Callout> : null}
      {signingReady && unsigned > 0 ? (
        <Callout tone="warning">
          {unsigned === 1 ? '1 script was' : `${unsigned} scripts were`} modified outside the admin and {unsigned === 1 ? 'doesn’t' : 'don’t'} run on
          the site. Check the code with Edit, then choose Re-sign in the ⋯ menu.
        </Callout>
      ) : null}

      {scripts.length === 0 ? (
        <EmptyState
          icon="code"
          title="No scripts yet"
          description="Add tracking tools, styles or structured data to the published site."
          action={
            <Button variant="primary" size="small" iconLeft="plus" onClick={openNew}>
              Add script
            </Button>
          }
        />
      ) : (
        <Table aria-label="Scripts" className={styles.table}>
          <thead>
            <tr>
              <TableHeaderCell>Name</TableHeaderCell>
              <TableHeaderCell width={200}>Placement</TableHeaderCell>
              <TableHeaderCell width={160}>Type</TableHeaderCell>
              <TableHeaderCell width={160}>Page</TableHeaderCell>
              <TableHeaderCell width={140}>Status</TableHeaderCell>
              <TableHeaderCell width={48}>
                <span className="kz-visually-hidden">Actions</span>
              </TableHeaderCell>
            </tr>
          </thead>
          <tbody>
            {scripts.map((script, index) => {
              const busy = busyKey === script.key
              return (
                <TableRow
                  key={script.key}
                  aria-busy={busy || undefined}
                  className={styles.row}
                  // Clic sur une ligne = Edit (B3) ; le nom est aussi un bouton pour le clavier.
                  onClick={(event) => {
                    if ((event.target as HTMLElement).closest('button, a, [role="menu"]')) return
                    openEdit(script.key)
                  }}
                >
                  <TableCell type="title" icon="code">
                    <button type="button" className={styles.nameButton} onClick={() => openEdit(script.key)}>
                      {script.name || 'Untitled script'}
                    </button>
                  </TableCell>
                  <TableCell>{placementLabel(script.placement)}</TableCell>
                  <TableCell>{scriptType(script.code)}</TableCell>
                  <TableCell>{pageLabel(pages, script.page)}</TableCell>
                  <TableCell type="tag">
                    {!script.signed ? (
                      <Tag tone="warning" dot title={MODIFIED_STATUS}>
                        Modified outside<span className="kz-visually-hidden">{MODIFIED_STATUS.slice('Modified outside'.length)}</span>
                      </Tag>
                    ) : script.enabled ? (
                      <Tag tone="success" dot>
                        Active
                      </Tag>
                    ) : (
                      <Tag tone="neutral" dot>
                        Disabled
                      </Tag>
                    )}
                  </TableCell>
                  <TableCell type="actions">
                    <Menu
                      placement="bottom-end"
                      trigger={<IconButton icon="more" label={`Actions for ${script.name || 'script'}`} size="small" loading={busy} disabled={busy} />}
                    >
                      <MenuItem icon="edit" onSelect={() => openEdit(script.key)}>
                        Edit
                      </MenuItem>
                      {!script.signed ? (
                        <MenuItem icon="check" disabled={!signingReady} onSelect={() => setResign({ open: true, key: script.key })}>
                          Re-sign
                        </MenuItem>
                      ) : null}
                      <MenuItem
                        icon={script.enabled ? 'eye-off' : 'eye'}
                        // Enable d'un script non signé : refusé par le serveur (revoir puis Re-sign) ; fermé ici aussi.
                        disabled={!script.enabled && (!script.signed || !signingReady)}
                        onSelect={() =>
                          rowAction(
                            script.key,
                            () => setScriptEnabledAction({ key: script.key, enabled: !script.enabled }),
                            script.enabled ? 'Script disabled. It stops running when you publish.' : 'Script enabled. It runs when you publish.',
                          )
                        }
                      >
                        {script.enabled ? 'Disable' : 'Enable'}
                      </MenuItem>
                      <MenuItem icon="chevron-up" disabled={index === 0} onSelect={() => rowAction(script.key, () => moveScriptAction({ key: script.key, direction: 'up' }))}>
                        Move up
                      </MenuItem>
                      <MenuItem
                        icon="chevron-down"
                        disabled={index === scripts.length - 1}
                        onSelect={() => rowAction(script.key, () => moveScriptAction({ key: script.key, direction: 'down' }))}
                      >
                        Move down
                      </MenuItem>
                      <MenuSeparator />
                      <MenuItem icon="trash" danger onSelect={() => setConfirm({ open: true, key: script.key })}>
                        Delete
                      </MenuItem>
                    </Menu>
                  </TableCell>
                </TableRow>
              )
            })}
          </tbody>
        </Table>
      )}

      <ScriptDialog
        open={dialog.open && (dialog.mode === 'new' || !!editing)}
        mode={dialog.mode}
        initial={editing ? { name: editing.name, placement: editing.placement, page: editing.page, run: editing.run, code: editing.code } : DEFAULT_SCRIPT}
        pages={pages}
        onSave={onSave}
        onClose={closeDialog}
        notice={editing && !editing.signed ? EDIT_NOTICE : undefined}
      />

      <Modal
        open={resign.open && !!resigning}
        onClose={() => setResign((r) => ({ ...r, open: false }))}
        title="Re-sign this script?"
        description={
          resigning
            ? `“${resigning.name}” was modified outside the admin. Re-signing approves its current code: ${
                resigning.enabled ? 'it runs on the site when you publish' : 'it can run again once you enable it'
              }. Check the code with Edit first.`
            : undefined
        }
        confirmLabel="Re-sign"
        confirmDisabled={!signingReady}
        confirmLoading={!!resigning && busyKey === resigning.key}
        onConfirm={() => {
          if (!resigning) return
          const { key, placement, page, run, code, enabled } = resigning
          startTransition(async () => {
            const result = await write(
              key,
              () => resignScriptAction({ key, expected: { placement, page, run, code, enabled } }),
              enabled ? 'Script re-signed. It runs on the site when you publish.' : 'Script re-signed.',
            )
            if (result.ok) setResign((r) => ({ ...r, open: false }))
            else toast.show({ type: 'error', message: result.error })
          })
        }}
      />

      <Modal
        open={confirm.open && !!confirming}
        onClose={() => setConfirm((c) => ({ ...c, open: false }))}
        tone="destructive"
        title="Delete this script?"
        description={confirming ? `“${confirming.name}” will be removed from the site when you publish.` : undefined}
        confirmLabel="Delete"
        confirmLoading={!!confirming && busyKey === confirming.key}
        onConfirm={() => {
          if (!confirming) return
          const key = confirming.key
          startTransition(async () => {
            const result = await write(key, () => deleteScriptAction({ key }), 'Script deleted. It is removed from the site when you publish.')
            if (result.ok) setConfirm((c) => ({ ...c, open: false }))
            else toast.show({ type: 'error', message: result.error })
          })
        }}
      />
    </ContentArea>
  )
}
