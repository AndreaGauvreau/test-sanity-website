import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import { EDITOR_VIEWPORTS, MEASURED_VIEWPORTS } from '../../../src/admin/core/contracts/engine'
import { questionProblems, type HardcodedPolicy } from '../claude/questions'
import * as guards from './index'

/** L'API publique : ce qu'engine-core et engine-claude importent de `engine/src/guards`. */

describe('API publique des garde-fous', () => {
  it('expose les points d’entrée du cycle d’une demande', () => {
    for (const name of [
      'loadDesignSystem',
      'buildDesignSystem',
      'customPropertyValues',
      'validateDesignSystem',
      'checkToolUse',
      'lintChanges',
      'runStaticChecks',
      'runRenderChecks',
      'publicChecks',
      'retryProblems',
      'chromePreview',
      'startVisualSession',
      'describeMeasures',
      'lineSummary',
    ] as const) {
      assert.equal(typeof guards[name], 'function', name)
    }
  })

  it('HARDCODED_POLICY est la politique attendue par questionProblems d’engine-claude', () => {
    const policy: HardcodedPolicy = guards.HARDCODED_POLICY
    const ask = (property: string, value: string) =>
      questionProblems(
        [{ question: 'Which color?', options: [{ label: 'Exact', tone: 'discouraged', hardcoded: { property, value } }] }],
        policy,
      )
    assert.equal(ask('color', '#ff5100'), null)
    assert.equal(ask('padding', '1.25rem'), null)
    assert.match(ask('font', "500 1rem 'Arial'") ?? '', /cannot take a hard-coded value/)
    assert.match(ask('margin', '-1rem') ?? '', /No negative value/)
    assert.match(ask('background-color', 'url(x.png)') ?? '', /external resource/)
    assert.ok(Object.isFrozen(guards.HARDCODED_POLICY))
  })

  it('PREVIEW_VIEWPORTS : les formats de l’éditeur (contrat EDITOR_VIEWPORTS), croissants et gelés', () => {
    assert.deepEqual(guards.PREVIEW_VIEWPORTS, [...MEASURED_VIEWPORTS])
    assert.deepEqual(guards.PREVIEW_VIEWPORTS, [EDITOR_VIEWPORTS.mobile, EDITOR_VIEWPORTS.tablet, EDITOR_VIEWPORTS.desktop])
    // La vraie mise en page tablette est mesurée (point de rupture du site), plus l'ancien 768 du Figma.
    assert.ok(!guards.PREVIEW_VIEWPORTS.includes(768))
    assert.ok(Object.isFrozen(guards.PREVIEW_VIEWPORTS))
  })
})
