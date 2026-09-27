/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Radio, RadioGroup } from '../Radio'
import { Checkbox } from './Checkbox'

afterEach(cleanup)

describe('Checkbox', () => {
  it('case native nommée par son libellé, clic et Espace', async () => {
    const onCheckedChange = vi.fn()
    render(<Checkbox label="Publish on save" onCheckedChange={onCheckedChange} />)
    const box = screen.getByRole('checkbox', { name: 'Publish on save' }) as HTMLInputElement
    await userEvent.click(screen.getByText('Publish on save'))
    expect(box.checked).toBe(true)
    await userEvent.keyboard(' ')
    expect(box.checked).toBe(false)
    expect(onCheckedChange).toHaveBeenCalledTimes(2)
  })

  it('indéterminé : propriété native indeterminate', () => {
    render(<Checkbox label="All" indeterminate />)
    expect((screen.getByRole('checkbox') as HTMLInputElement).indeterminate).toBe(true)
  })

  it('désactivé', async () => {
    render(<Checkbox label="Off" disabled />)
    const box = screen.getByRole('checkbox') as HTMLInputElement
    await userEvent.click(box)
    expect(box.checked).toBe(false)
  })
})

describe('RadioGroup', () => {
  it('radiogroup nommé, sélection et onValueChange, flèches natives du navigateur', async () => {
    const onValueChange = vi.fn()
    render(
      <RadioGroup label="Run" defaultValue="once" onValueChange={onValueChange}>
        <Radio value="once" label="Once" />
        <Radio value="every" label="On every page visit" />
      </RadioGroup>,
    )
    expect(screen.getByRole('radiogroup', { name: 'Run' })).toBeTruthy()
    const once = screen.getByRole('radio', { name: 'Once' }) as HTMLInputElement
    const every = screen.getByRole('radio', { name: 'On every page visit' }) as HTMLInputElement
    expect(once.checked).toBe(true)
    expect(once.name).toBe(every.name)
    await userEvent.click(screen.getByText('On every page visit'))
    expect(every.checked).toBe(true)
    expect(onValueChange).toHaveBeenCalledWith('every')
  })

  it('groupe désactivé', () => {
    render(
      <RadioGroup aria-label="Disabled" disabled>
        <Radio value="a" label="A" />
      </RadioGroup>,
    )
    expect((screen.getByRole('radio') as HTMLInputElement).disabled).toBe(true)
  })
})
