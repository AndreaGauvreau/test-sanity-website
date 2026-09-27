'use client'

import { useEffect, useState } from 'react'
import type { PublishState } from '@/admin/core/contracts'
import {
  Button,
  Callout,
  EmptyState,
  IconButton,
  Kbd,
  ProgressBar,
  PublishButton,
  Tag,
  Toast,
  Tooltip,
  useToast,
  type TagTone,
} from '@/admin/ui'
import { Cell, Family, Item, styles } from './ui'

const TONES: TagTone[] = ['neutral', 'error', 'success', 'warning', 'info', 'inverse']
const PUBLISH_STATES: PublishState[] = ['idle', 'pending', 'publishing', 'published', 'failed']

export function Feedback() {
  const toast = useToast()
  const [publish, setPublish] = useState<PublishState>('pending')
  const [progress, setProgress] = useState(25)

  useEffect(() => {
    if (publish === 'publishing') {
      const t = setTimeout(() => setPublish(Math.random() > 0.3 ? 'published' : 'failed'), 1800)
      return () => clearTimeout(t)
    }
    if (publish === 'published') {
      const t = setTimeout(() => setPublish('idle'), 3000)
      return () => clearTimeout(t)
    }
  }, [publish])

  return (
    <Family id="feedback" title="Feedback">
      <Item id="tag" title="Tag" figma="142:38">
        <div className={styles.stack}>
          <div className={styles.row}>
            {TONES.map((tone) => (
              <Cell key={tone} label={tone}>
                <Tag tone={tone}>TAG</Tag>
              </Cell>
            ))}
          </div>
          <div className={styles.row}>
            <Tag tone="info">KUARTZ</Tag>
            <Tag tone="success">CLIENT</Tag>
            <Tag tone="warning" dot>
              Draft
            </Tag>
            <Tag tone="error" icon="close">
              Failed
            </Tag>
            <Tag tone="inverse">Live</Tag>
            <Tag tone="neutral" icon="image">
              IMG
            </Tag>
          </div>
        </div>
      </Item>

      <Item id="kbd" title="Kbd" figma="323:181">
        <div className={styles.row}>
          <Kbd>⌘ ↵</Kbd>
          <Kbd>/</Kbd>
          <Kbd>Esc</Kbd>
          <Kbd>⌘ K</Kbd>
        </div>
      </Item>

      <Item id="tooltip" title="Tooltip" figma="323:189" note="On the shared Popover: 500 ms open delay on hover, instant on keyboard focus and for the next tooltips; Escape closes.">
        <div className={styles.row} style={{ padding: '36px 0 36px' }}>
          <Tooltip label="Sort" open>
            <Button variant="secondary" size="small">
              Always open
            </Button>
          </Tooltip>
          <span style={{ width: 40 }} />
          <Tooltip label="Publish" shortcut="⌘ ↵" open placement="bottom">
            <Button variant="secondary" size="small">
              With shortcut
            </Button>
          </Tooltip>
          <span style={{ width: 40 }} />
          <Tooltip label="Hover me or focus me">
            <Button variant="ghost" size="small">
              Hover
            </Button>
          </Tooltip>
          <IconButton icon="history" label="Versions" />
          <IconButton icon="settings" label="Settings" shortcut="⌘ ," />
        </div>
      </Item>

      <Item id="progress-bar" title="Progress bar" figma="323:235">
        <div className={styles.stack}>
          <div className={styles.row}>
            {[0, 25, 50, 75, 100].map((v) => (
              <Cell key={v} label={`primary · ${v}`}>
                <ProgressBar value={v} label={`Progress ${v}%`} />
              </Cell>
            ))}
          </div>
          <div className={styles.row}>
            {[25, 50, 100].map((v) => (
              <Cell key={v} label={`danger · ${v}`}>
                <ProgressBar value={v} tone="danger" label={`Failed at ${v}%`} />
              </Cell>
            ))}
            <Cell label="indeterminate">
              <ProgressBar label="Loading" />
            </Cell>
          </div>
          <div className={styles.row}>
            <ProgressBar value={progress} label="Interactive progress" />
            <Button variant="secondary" size="small" onClick={() => setProgress((p) => (p >= 100 ? 0 : p + 25))}>
              Step
            </Button>
          </div>
        </div>
      </Item>

      <Item id="callout" title="Callout" figma="323:316">
        <div className={styles.grid}>
          {(['neutral', 'info', 'success', 'warning', 'error'] as const).map((tone) => (
            <Callout key={tone} tone={tone} style={{ width: 400, maxWidth: '100%' }}>
              Need another field? Ask Kuartz — the page structure is set in code.
            </Callout>
          ))}
          <Callout
            style={{ width: 400, maxWidth: '100%' }}
            action={
              <Button variant="ghost" size="small">
                Contact Kuartz
              </Button>
            }
          >
            Need another field? Ask Kuartz — the page structure is set in code.
          </Callout>
        </div>
      </Item>

      <Item id="toast" title="Toast" figma="323:412" note="Static rendering below; the buttons push live toasts (bottom center, stack of 3, 5 s — 6 s for errors — paused on hover or focus).">
        <div className={styles.stack} style={{ alignItems: 'flex-start' }}>
          <Toast type="success" action={{ label: 'View', href: '#', external: true }} onDismiss={() => {}}>
            Published — the site is up to date.
          </Toast>
          <Toast type="error" action={{ label: 'View', href: '#', external: true }} onDismiss={() => {}}>
            Couldn&apos;t publish. Nothing was changed.
          </Toast>
          <Toast type="info" action={{ label: 'View', href: '#', external: true }} onDismiss={() => {}}>
            Draft saved automatically.
          </Toast>
          <Toast type="loading" action={{ label: 'View', href: '#', external: true }} onDismiss={() => {}}>
            Publishing… code changes take about a minute.
          </Toast>
          <div className={styles.row}>
            <Button variant="secondary" size="small" onClick={() => toast.show({ type: 'success', message: 'Published — the site is up to date.', action: { label: 'View', href: '#', external: true } })}>
              Success
            </Button>
            <Button variant="secondary" size="small" onClick={() => toast.show({ type: 'error', message: "Couldn't publish. Nothing was changed." })}>
              Error
            </Button>
            <Button variant="secondary" size="small" onClick={() => toast.show({ type: 'info', message: 'Draft saved automatically.' })}>
              Info
            </Button>
            <Button
              variant="secondary"
              size="small"
              onClick={() => {
                const id = toast.show({ id: 'publish', type: 'loading', message: 'Publishing… code changes take about a minute.' })
                setTimeout(() => toast.update(id, { type: 'success', message: 'Published — the site is up to date.' }), 2500)
              }}
            >
              Loading → success
            </Button>
          </div>
        </div>
      </Item>

      <Item id="empty-state" title="Empty state" figma="323:432">
        <div className={styles.row}>
          <EmptyState
            title="Everything is published"
            description="New changes to content or code will appear here before you publish them."
            action={
              <Button variant="secondary" size="small">
                View versions
              </Button>
            }
          />
          <EmptyState icon="image" title="No media yet" description="Upload images to use them on your pages." />
        </div>
      </Item>

      <Item id="publish-button" title="Publish button" figma="323:503" note="Visual states only; publish-ui wires the logic. The last one is interactive (pending → publishing → published / failed → idle).">
        <div className={styles.row}>
          {PUBLISH_STATES.map((state) => (
            <Cell key={state} label={state}>
              <PublishButton state={state} />
            </Cell>
          ))}
          <Cell label={`interactive · ${publish}`}>
            <PublishButton
              state={publish}
              pendingCount={3}
              onPublish={() => setPublish('publishing')}
              onRetry={() => setPublish('publishing')}
            />
          </Cell>
          <Button variant="ghost" size="small" onClick={() => setPublish('pending')}>
            Reset to pending
          </Button>
        </div>
      </Item>
    </Family>
  )
}
