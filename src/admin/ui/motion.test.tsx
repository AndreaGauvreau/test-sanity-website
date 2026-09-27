/** @vitest-environment jsdom */
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Préférence « mouvement réduit » pilotée par le test (serveur : null ; navigateur : au choix).
const reduced = vi.hoisted(() => ({ value: false as boolean | null }))
vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>()
  return { ...actual, useReducedMotion: () => reduced.value }
})

import type { Variants } from 'motion/react'
import { fade, list, listItem, motion, noTransition, popIn, reducedVariants, slideDown, slideUp, useMotionVariants } from './motion'

afterEach(() => {
  reduced.value = false
})

function Animated({ variants }: { variants: Variants }) {
  const v = useMotionVariants(variants)
  return <motion.div variants={v} initial="initial" animate="animate" exit="exit" />
}

function html(pref: boolean | null, variants: Variants) {
  reduced.value = pref
  return renderToString(<Animated variants={variants} />)
}

describe('useMotionVariants (FOLLOWUPS #38)', () => {
  it.each([
    ['slideUp', slideUp],
    ['slideDown', slideDown],
    ['popIn', popIn],
    ['fade', fade],
    ['listItem', listItem],
  ])('%s : même balisage initial avec ou sans mouvement réduit (pas d’écart d’hydratation)', (_, variants) => {
    const server = html(null, variants)
    expect(server).toContain('opacity:0')
    if (variants !== fade) expect(server).toContain('transform:')
    expect(html(true, variants)).toBe(server)
    expect(html(false, variants)).toBe(server)
  })
})

describe('reducedVariants', () => {
  it('garde chaque état (initial compris) et coupe toutes les transitions', () => {
    const out = reducedVariants(slideUp)
    expect(Object.keys(out)).toEqual(Object.keys(slideUp))
    expect(out.initial).toEqual({ opacity: 0, y: 8, transition: noTransition })
    expect(out.animate).toEqual({ opacity: 1, y: 0, transition: noTransition })
    expect(out.exit).toEqual({ opacity: 0, y: 4, transition: noTransition })
    // Échelonnement d'une liste coupé aussi.
    expect(reducedVariants(list).animate).toEqual({ transition: noTransition })
  })

  it('enveloppe les variantes calculées ; un libellé renvoyé reste tel quel', () => {
    const out = reducedVariants({
      animate: (i: number) => ({ opacity: 1, transition: { delay: i * 0.05 } }),
      alias: () => 'animate',
    })
    const animate = out.animate as (custom: unknown, current: object, velocity: object) => unknown
    const alias = out.alias as (custom: unknown, current: object, velocity: object) => unknown
    expect(animate(3, {}, {})).toEqual({ opacity: 1, transition: noTransition })
    expect(alias(0, {}, {})).toBe('animate')
  })

  it('ne modifie pas les préréglages d’origine', () => {
    reducedVariants(popIn)
    expect((popIn.animate as { transition?: unknown }).transition).not.toEqual(noTransition)
  })
})
