import { describe, expect, it } from 'vitest'
import { devPlan, parseDotenv, portOf, prefixLine, type DevPlanInput } from './plan'

const READY: DevPlanInput = { sitePort: 4040, sitePortBusy: false, mock: false, engineEnvFile: true, enginePort: 4043, enginePortBusy: false }

describe('npm run dev · décisions', () => {
  it('tout est prêt : site + mise en place du clone + moteur', () => {
    expect(devPlan(READY)).toEqual({ abort: false, startEngine: true, notes: [] })
  })

  it('port du site pris : rien ne démarre, message clair', () => {
    const plan = devPlan({ ...READY, sitePortBusy: true })
    expect(plan.abort).toBe(true)
    expect(plan.startEngine).toBe(false)
    expect(plan.notes[0]).toMatch(/Port 4040 is already in use/)
  })

  it('site seul : moteur simulé, engine/.env.local absent, port invalide, port pris par un autre programme', () => {
    for (const input of [
      { ...READY, mock: true },
      { ...READY, engineEnvFile: false },
      { ...READY, enginePort: null },
      { ...READY, enginePortBusy: true, enginePortOwner: { kind: 'other' as const } },
      { ...READY, enginePortBusy: true },
    ]) {
      const plan = devPlan(input)
      expect(plan.abort).toBe(false)
      expect(plan.startEngine).toBe(false)
      expect(plan.replaceEngine).toBeUndefined()
      expect(plan.notes).toHaveLength(1)
    }
    expect(devPlan({ ...READY, enginePortBusy: true, enginePortOwner: { kind: 'other' } }).notes[0]).toMatch(
      /Port 4043 is used by another program/,
    )
  })

  it('moteur précédent de ce projet encore lancé : jamais réutilisé, remplacé par le code actuel', () => {
    const plan = devPlan({ ...READY, enginePortBusy: true, enginePortOwner: { kind: 'engine', pid: 4242 } })
    expect(plan).toMatchObject({ abort: false, startEngine: true, replaceEngine: 4242 })
    expect(plan.notes[0]).toMatch(/previous AI engine \(pid 4242\) is still running/)
  })
})

describe('parseDotenv', () => {
  it('clés, commentaires, export, guillemets, commentaire en fin de ligne', () => {
    const env = parseDotenv(
      ['# commentaire', '', 'ENGINE_MOCK=0', 'export ENGINE_PORT=4043', 'A="x y"', "B='z'", 'C=v # note', '  D = 1  ', 'pas une ligne'].join('\n'),
    )
    expect(env).toEqual({ ENGINE_MOCK: '0', ENGINE_PORT: '4043', A: 'x y', B: 'z', C: 'v', D: '1' })
  })
})

describe('portOf', () => {
  it('entier de 1 024 à 65 535, sinon null', () => {
    expect(portOf('4043')).toBe(4043)
    expect(portOf(' 4043 ')).toBe(4043)
    expect(portOf('80')).toBeNull()
    expect(portOf('70000')).toBeNull()
    expect(portOf('abc')).toBeNull()
    expect(portOf(undefined)).toBeNull()
  })
})

describe('prefixLine', () => {
  it('préfixe chaque ligne, avec ou sans couleur', () => {
    expect(prefixLine('site', 'Ready in 1.2s')).toBe('[site] Ready in 1.2s')
    expect(prefixLine('ai', 'Engine ready', (text) => `<${text}>`)).toBe('<[ai]> Engine ready')
  })
})
