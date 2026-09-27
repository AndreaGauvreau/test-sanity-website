/** @vitest-environment jsdom */
import { useState } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ElementTarget, Scope } from '@/admin/core/contracts'
import { canApply, composerState, toggleScope } from '../machine'
import { Composer } from './Composer'

afterEach(cleanup)

const TITLE: ElementTarget = { zone: 'hero.title', index: 0, label: 'Hero · Title' }
const LEDE: ElementTarget = { zone: 'hero.lede', index: 0, label: 'Hero · Subtitle' }

/** Composer câblé comme dans la sidebar (état dérivé de la machine). */
function Harness({
  initialTargets = [TITLE],
  onSubmit = () => {},
  pending = false,
  answering = false,
}: {
  initialTargets?: ElementTarget[]
  onSubmit?: (v: { note: string; scope: Scope[]; targets: ElementTarget[] }) => void
  pending?: boolean
  answering?: boolean
}) {
  const [targets, setTargets] = useState(initialTargets)
  const [scope, setScope] = useState<Scope[]>([])
  const [note, setNote] = useState('')
  const [other, setOther] = useState(answering)
  const state = composerState({
    job: answering ? { status: 'waiting' } : null,
    pending: pending ? { status: 'to-validate' } : null,
    selectionCount: targets.length,
    answeringOther: other,
  })
  return (
    <Composer
      state={state}
      targets={targets}
      onRemoveTarget={(t) => setTargets((all) => all.filter((x) => x !== t))}
      scope={scope}
      onScopeChange={(s, on) => setScope((cur) => toggleScope(cur, s, on))}
      value={note}
      onValueChange={setNote}
      onSubmit={() => onSubmit({ note, scope, targets })}
      canApply={canApply({ state, scope, targetCount: targets.length, note })}
      onEscape={state === 'answer' ? () => setOther(false) : undefined}
    />
  )
}

describe('Composer', () => {
  it('empty : champ inactif, consigne du Figma, Apply grisé', () => {
    render(<Harness initialTargets={[]} />)
    const field = screen.getByRole('textbox')
    expect(field).toHaveProperty('disabled', true)
    expect(field.getAttribute('placeholder')).toBe('Select an element in the page (Shift + click for several)')
    expect(screen.getByRole('button', { name: 'Apply' })).toHaveProperty('disabled', true)
    expect(screen.queryByRole('button', { name: 'Style' })).toBeNull()
  })

  it('ready : rien de coché par défaut ; Apply exige une portée et un texte ; ⌘ ↵ envoie', async () => {
    const onSubmit = vi.fn()
    render(<Harness onSubmit={onSubmit} />)
    expect(screen.getByRole('button', { name: 'Style' }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('button', { name: 'Text' }).getAttribute('aria-pressed')).toBe('false')
    const field = screen.getByRole('textbox', { name: 'Describe the change' })
    await userEvent.type(field, 'Make the title bigger')
    expect(screen.getByRole('button', { name: 'Apply' })).toHaveProperty('disabled', true)
    await userEvent.keyboard('{Meta>}{Enter}{/Meta}')
    expect(onSubmit).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Style' }))
    expect(screen.getByRole('button', { name: 'Apply' })).toHaveProperty('disabled', false)
    await userEvent.click(field)
    await userEvent.keyboard('{Meta>}{Enter}{/Meta}')
    expect(onSubmit).toHaveBeenCalledWith({ note: 'Make the title bigger', scope: ['style'], targets: [TITLE] })
    await userEvent.keyboard('{Control>}{Enter}{/Control}')
    expect(onSubmit).toHaveBeenCalledTimes(2)
  })

  it('multi : une puce par élément, ✕ retire l’élément (retour à empty au dernier)', async () => {
    render(<Harness initialTargets={[TITLE, LEDE]} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    await userEvent.click(screen.getByRole('button', { name: 'Remove Hero · Subtitle' }))
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: 'Remove Hero · Title' }))
    expect(screen.getByRole('textbox')).toHaveProperty('disabled', true)
  })

  it('600 caractères : compteur au-delà de 80 %, Apply grisé au-delà de 600', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Text' }))
    const field = screen.getByRole('textbox')
    await userEvent.click(field)
    await userEvent.paste('x'.repeat(601))
    expect(screen.getByText('601/600')).toBeTruthy()
    expect(field.getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByRole('button', { name: 'Apply' })).toHaveProperty('disabled', true)
  })

  it('adjust : « Adjust this change… », puce sans ✕, pas de portée, texte seul suffit', async () => {
    const onSubmit = vi.fn()
    render(<Harness pending onSubmit={onSubmit} />)
    const field = screen.getByRole('textbox', { name: 'Adjust this change' })
    expect(field.getAttribute('placeholder')).toBe('Adjust this change…')
    expect(screen.queryByRole('button', { name: /Remove/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Style' })).toBeNull()
    await userEvent.type(field, 'A bit smaller')
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(onSubmit).toHaveBeenCalled()
  })

  it('answer (« Other answer… ») : 300 caractères, Échap revient aux options', async () => {
    render(<Harness answering />)
    const field = screen.getByRole('textbox', { name: 'Your answer to Claude' })
    expect(field.getAttribute('placeholder')).toBe('Other answer…')
    await userEvent.click(field)
    await userEvent.paste('y'.repeat(301))
    expect(screen.getByRole('button', { name: 'Apply' })).toHaveProperty('disabled', true)
    await userEvent.keyboard('{Escape}')
    expect(screen.getByRole('textbox')).toHaveProperty('disabled', true)
    expect(screen.getByRole('textbox').getAttribute('placeholder')).toBe('Waiting for your answer above…')
  })

  it('erreur annoncée (role=alert) et reliée au champ', () => {
    render(
      <Composer
        state="ready"
        targets={[TITLE]}
        scope={['style']}
        onScopeChange={() => {}}
        value="x"
        onValueChange={() => {}}
        onSubmit={() => {}}
        canApply
        error="Claude is already working on a request."
      />,
    )
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toBe('Claude is already working on a request.')
    expect(screen.getByRole('textbox').getAttribute('aria-describedby')).toContain(alert.id)
  })
})
