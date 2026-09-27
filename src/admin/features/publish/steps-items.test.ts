import { describe, expect, it } from 'vitest'

import type { PublishStatus } from '@/admin/core/contracts/engine'

import { contentItemIcon, viewUrl } from './items'
import { afterPublishSteps } from './steps'

const kinds = { collectionTypes: ['post', 'testimonial', 'faq'], settingsType: 'siteSettings' }

describe('carte « After “Publish” »', () => {
  it('au repos : les 4 étapes du Figma, à faire', () => {
    const steps = afterPublishSteps(null, 'conduit.com')
    expect(steps.map((s) => s.title)).toEqual([
      'Content goes live in Sanity',
      'Only if code changed: draft → main',
      'Vercel builds and deploys',
      'Live on conduit.com',
    ])
    expect(steps.map((s) => s.description)).toEqual([
      'In seconds, no build.',
      'Merged by the admin, never by hand.',
      'About 1 minute.',
      'If the build fails, the previous version stays live and the error shows here.',
    ])
    expect(steps.every((s) => s.state === 'todo')).toBe(true)
  })

  it('pendant une publication / après un échec : états du moteur, raison des étapes sautées, message d’erreur', () => {
    const status: PublishStatus = {
      state: 'failed',
      pending: { content: [], design: [], total: 1 },
      deploy: { mode: 'vercel-hook' },
      run: {
        id: 'r',
        startedAt: '',
        startedBy: 'M',
        step: 3,
        steps: [
          { step: 1, label: '', status: 'done' },
          { step: 2, label: '', status: 'skipped', detail: 'No code changed.' },
          { step: 3, label: '', status: 'failed' },
          { step: 4, label: '', status: 'waiting' },
        ],
        error: { message: 'Vercel build failed.' },
      },
    }
    const steps = afterPublishSteps(status, 'conduit.com')
    expect(steps.map((s) => s.state)).toEqual(['done', 'skipped', 'failed', 'todo'])
    expect(steps[1].description).toBe('No code changed.')
    expect(steps[2].description).toBe('Vercel build failed.')
  })

  it('une publication terminée ne colore plus la carte', () => {
    const status = { state: 'published', pending: { content: [], design: [], total: 0 }, deploy: { mode: 'local' }, run: { id: 'r', startedAt: '', startedBy: '', step: 4, steps: [{ step: 1, label: '', status: 'done' }] } } as PublishStatus
    expect(afterPublishSteps(status, 'x').every((s) => s.state === 'todo')).toBe(true)
  })
})

describe('lignes de E1', () => {
  it('icône d’après le manifeste', () => {
    expect(contentItemIcon({ type: 'post' }, kinds)).toBe('database')
    expect(contentItemIcon({ type: 'siteSettings' }, kinds)).toBe('sliders')
    expect(contentItemIcon({ type: 'dockSchedulingPage' }, kinds)).toBe('page')
  })

  it('View ↗ : seulement un chemin relatif du site', () => {
    expect(viewUrl('https://conduit.com', '/blog/a')).toBe('https://conduit.com/blog/a')
    expect(viewUrl('http://127.0.0.1:4040/', '/')).toBe('http://127.0.0.1:4040/')
    expect(viewUrl('https://conduit.com', 'https://evil.test/')).toBeNull()
    expect(viewUrl('https://conduit.com', '//evil.test/')).toBeNull()
    expect(viewUrl('https://conduit.com', 'javascript:alert(1)')).toBeNull()
    expect(viewUrl('https://conduit.com', undefined)).toBeNull()
  })
})
