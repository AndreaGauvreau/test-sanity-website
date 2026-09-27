import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import type { SanityTextBinding } from '../../../src/admin/core/contracts'
import { ZONES } from './fixtures'
import {
  accentsOf,
  clientMessage,
  createTextTool,
  editableFields,
  resolveTextFields,
  validateText,
  type TextTarget,
  type TextWrite,
} from './text'

const binding = (zone: string) => ZONES.zones[zone].text as SanityTextBinding
const resolved = (zone: string, element = {}, options = {}): TextTarget => {
  const result = resolveTextFields(binding(zone), element, options)
  assert.ok(result.ok, result.ok ? '' : result.error)
  return result.target
}

describe('resolveTextFields — chemins Sanity de la zone', () => {
  it('singleton : id = document:chemin', () => {
    const target = resolved('hero.title')
    assert.deepEqual(target.fields, [
      { id: 'dockSchedulingPage:hero.title', document: 'dockSchedulingPage', type: 'dockSchedulingPage', path: 'hero.title', declared: 'hero.title', name: 'title', max: 80 },
    ])
    assert.deepEqual(target.closed, [])
  })

  it('$key remplacé par la _key lue sur data-edit-key, lignes et champs fermés', () => {
    const target = resolved('performance.benefit', { key: 'b2' })
    assert.deepEqual(
      target.fields.map((f) => [f.id, f.max, f.lines]),
      [
        ['dockSchedulingPage:performance.benefits[_key=="b2"].title', 60, 2],
        ['dockSchedulingPage:performance.benefits[_key=="b2"].text', 160, undefined],
      ],
    )
    assert.deepEqual(target.closed, ['dockSchedulingPage:performance.benefits[_key=="b2"].icon'])
  })

  it('document lu sur data-edit-doc pour un élément de collection', () => {
    const target = resolved('insights.card', { doc: 'post-carrier-portals' })
    assert.deepEqual(target.fields.map((f) => f.id), ['post-carrier-portals:title'])
    assert.deepEqual(target.closed, ['post-carrier-portals:category'])
  })

  it('refuse une clé ou un document absents ou suspects (jamais d’injection dans le chemin)', () => {
    assert.equal(resolveTextFields(binding('features.card'), {}).ok, false)
    assert.equal(resolveTextFields(binding('features.card'), { key: 'k"] | *[' }).ok, false)
    assert.equal(resolveTextFields(binding('insights.card'), {}).ok, false)
    assert.equal(resolveTextFields(binding('insights.card'), { doc: 'drafts.post-1' }).ok, false)
    assert.equal(resolveTextFields(binding('insights.card'), { doc: 'aiUsage.x' }).ok, false)
    const bad: SanityTextBinding = { source: 'sanity', document: { type: 'x', id: 'x' }, fields: { 'a[0].b': 10 } }
    assert.equal(resolveTextFields(bad, {}).ok, false)
  })

  it('mise en avant *…* désactivée par défaut, activable par champ déclaré', () => {
    assert.equal(resolved('hero.title').fields[0].accent, undefined)
    assert.equal(resolved('hero.title', {}, { emphasis: ['hero.title'] }).fields[0].accent, true)
  })

  it('editableFields : tout en T, les champs à mise en avant seulement en 🖌 seul', () => {
    const target = resolved('getStarted.title', {}, { emphasis: ['getStarted.title'] })
    assert.equal(editableFields(target, { style: false, text: true }).length, 2)
    assert.deepEqual(editableFields(target, { style: true, text: false }).map((f) => f.name), ['title'])
    assert.equal(editableFields(resolved('getStarted.title'), { style: true, text: false }).length, 0)
  })
})

describe('validateText', () => {
  const hero = resolved('hero.title')
  const id = 'dockSchedulingPage:hero.title'

  it('nettoie les blancs et accepte un texte valable', () => {
    assert.deepEqual(validateText(hero, id, '  Automate   dock\nscheduling '), { value: 'Automate dock scheduling' })
  })

  it('refuse champ inconnu, texte vide, balises, invisibles, trop long', () => {
    assert.match((validateText(hero, 'dockSchedulingPage:hero.lede', 'x') as { error: string }).error, /Field not editable/)
    assert.equal((validateText(hero, id, '   ') as { error: string }).error, 'The text is empty.')
    assert.match((validateText(hero, id, 'Hi <b>there</b>') as { error: string }).error, /No HTML/)
    assert.match((validateText(hero, id, 'Hi\u202ethere') as { error: string }).error, /Invisible/)
    assert.match((validateText(hero, id, 'x'.repeat(81)) as { error: string }).error, /81 characters for 80/)
  })

  it('refuse un champ fermé avec un message clair', () => {
    const benefit = resolved('performance.benefit', { key: 'b1' })
    const error = (validateText(benefit, 'dockSchedulingPage:performance.benefits[_key=="b1"].icon', 'speedometer') as { error: string }).error
    assert.match(error, /fixed list/)
  })

  it('champ à lignes : garde les retours, borne le nombre de lignes', () => {
    const benefit = resolved('performance.benefit', { key: 'b1' })
    const title = 'dockSchedulingPage:performance.benefits[_key=="b1"].title'
    assert.deepEqual(validateText(benefit, title, 'Fewer idle\r\n\n  docks  '), { value: 'Fewer idle\ndocks' })
    assert.match((validateText(benefit, title, 'a\nb\nc') as { error: string }).error, /3 for 2/)
  })

  it('pas d’astérisque sans mise en avant (Conduit par défaut)', () => {
    assert.match((validateText(hero, id, 'Automate *everything*') as { error: string }).error, /emphasis is not available/)
  })

  it('mise en avant activée : bien formée, 2 groupes au plus, règles du périmètre', () => {
    const accent = resolved('hero.title', {}, { emphasis: ['hero.title'] })
    assert.deepEqual(validateText(accent, id, 'Automate *dock* scheduling'), { value: 'Automate *dock* scheduling' })
    assert.match((validateText(accent, id, 'Automate *dock scheduling') as { error: string }).error, /Malformed/)
    assert.match((validateText(accent, id, '*a* *b* *c*') as { error: string }).error, /Two/)
    const before = 'Automate dock scheduling'
    // Sans T : les mots ne changent pas, seulement les astérisques.
    assert.ok('value' in validateText(accent, id, 'Automate *dock* scheduling', { scope: { style: true, text: false }, before }))
    assert.match(
      (validateText(accent, id, 'Automate *all* scheduling', { scope: { style: true, text: false }, before }) as { error: string }).error,
      /cannot change the words/,
    )
    // Sans 🖌 : aucune mise en avant nouvelle.
    assert.match(
      (validateText(accent, id, 'Automate *dock* scheduling', { scope: { style: false, text: true }, before }) as { error: string }).error,
      /cannot add emphasis/,
    )
    assert.deepEqual(accentsOf('a *b c* d *e*'), ['b c', 'e'])
  })
})

describe('createTextTool — gestionnaire injecté', () => {
  const target = resolved('hero.title')
  const id = 'dockSchedulingPage:hero.title'

  it('valide, écrit aussitôt, ne réécrit pas une valeur identique', async () => {
    const writes: TextWrite[] = []
    const tool = createTextTool({
      target,
      fields: target.fields,
      scope: { style: false, text: true },
      before: { [id]: 'Old title' },
      write: async (change) => void writes.push(change),
    })
    assert.equal(await tool.onSet(id, 'New title'), null)
    assert.equal(await tool.onSet(id, ' New   title '), null)
    assert.equal(writes.length, 1)
    assert.equal(writes[0].field.path, 'hero.title')
    assert.equal(writes[0].value, 'New title')
    assert.deepEqual(tool.proposed, { [id]: 'New title' })
    assert.deepEqual(tool.written, { [id]: 'New title' })
  })

  it('refus renvoyé à Claude sans écrire ; échec d’écriture renvoyé aussi', async () => {
    let calls = 0
    const tool = createTextTool({
      target,
      fields: target.fields,
      scope: { style: false, text: true },
      before: {},
      write: async () => {
        calls++
        throw new Error('network')
      },
    })
    assert.match(String(await tool.onSet(id, '<b>x</b>')), /No HTML/)
    assert.equal(calls, 0)
    assert.match(String(await tool.onSet(id, 'Fine')), /could not be saved/)
    assert.deepEqual(tool.proposed, {})
  })
})

describe('clientMessage', () => {
  it('retire gras et puces Markdown', () => {
    assert.equal(clientMessage('**Done.**\n- Title shortened\n* Kept 2 lines'), 'Done.\nTitle shortened\nKept 2 lines')
  })

  it('retire les adresses hors liste blanche : URL complète, domaine nu, IDN (SEC-08)', () => {
    assert.equal(
      clientMessage('Done. Your session expired: sign in again at https://conduit-login.help/a or conduit-billing.help.'),
      'Done. Your session expired: sign in again at [link removed] or [link removed].',
    )
    assert.equal(clientMessage('See bücher-conduit.de'), 'See [link removed]')
    assert.equal(clientMessage('Same as on conduit.com.', ['conduit.com']), 'Same as on conduit.com.')
    assert.equal(clientMessage('Contrast is now 4.79:1 (was 3.07:1).'), 'Contrast is now 4.79:1 (was 3.07:1).')
  })
})
