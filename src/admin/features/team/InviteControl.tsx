'use client'

import { useEffect, useId, useRef, useState, useTransition } from 'react'

import { Button, Input, Modal, Select } from '@/admin/ui'

import styles from './team.module.css'

import { inviteMemberAction } from './actions'
import type { InviteResult } from './invite'
import { INVITE_ROLES, type InviteRole } from './members'

export type InviteControlProps = {
  /** Injection pour les tests (par défaut : la server action). */
  invite?: (input: { email: string; role: InviteRole }) => Promise<InviteResult>
}

/**
 * Bouton « Invite » + fenêtre d'invitation (B4, décision 6 de l'architecture : inviter par l'API Sanity quand
 * l'utilisateur est Administrator). Le résultat est annoncé dans une zone live ; la liste se rafraîchit côté serveur.
 */
export function InviteControl({ invite = inviteMemberAction }: InviteControlProps) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<InviteRole>('editor')
  const [error, setError] = useState<{ message: string; field?: 'email' | 'role' } | null>(null)
  const [announce, setAnnounce] = useState('')
  const [pending, startTransition] = useTransition()
  const emailRef = useRef<HTMLInputElement | null>(null)
  const formId = useId()

  // Après un refus, le focus revient sur l'e-mail (une fois le champ réactivé, hors transition).
  useEffect(() => {
    if (error && !pending && error.field !== 'role') emailRef.current?.focus()
  }, [error, pending])

  const close = () => {
    if (pending) return
    setOpen(false)
    setError(null)
  }

  const submit = () => {
    if (pending) return
    setError(null)
    startTransition(async () => {
      let result: InviteResult
      try {
        result = await invite({ email, role })
      } catch {
        result = { ok: false, error: "Couldn't reach the server. Check your connection and try again." }
      }
      if (result.ok) {
        setAnnounce(result.message)
        setOpen(false)
        setEmail('')
        setRole('editor')
      } else {
        setError({ message: result.error, field: result.field })
      }
    })
  }

  return (
    <>
      <Button variant="secondary" size="small" iconLeft="plus" onClick={() => setOpen(true)}>
        Invite
      </Button>
      <p className="kz-visually-hidden" role="status" aria-live="polite">
        {announce}
      </p>
      <Modal
        open={open}
        onClose={close}
        title="Invite to the Sanity project"
        description="They get an email from Sanity and join the project once they accept."
        confirmLabel="Send invitation"
        onConfirm={submit}
        confirmLoading={pending}
        confirmDisabled={email.trim() === ''}
        closeOnScrimClick={!pending}
        initialFocusRef={emailRef}
      >
        <form
          id={formId}
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <Input
            ref={emailRef}
            label="Email"
            type="email"
            name="email"
            autoComplete="off"
            placeholder="name@company.com"
            value={email}
            disabled={pending}
            onChange={(event) => setEmail(event.target.value)}
            error={error?.field === 'email' ? error.message : undefined}
          />
        </form>
        <Select<InviteRole>
          label="Role"
          name="role"
          options={INVITE_ROLES.map((r) => ({ value: r.value, label: r.label }))}
          value={role}
          disabled={pending}
          onValueChange={setRole}
          helper="Your editors are Editors. Kuartz adds its own team members."
          error={error?.field === 'role' ? error.message : undefined}
        />
        {error && !error.field ? (
          <p role="alert" className={styles.formError}>
            {error.message}
          </p>
        ) : null}
      </Modal>
    </>
  )
}
