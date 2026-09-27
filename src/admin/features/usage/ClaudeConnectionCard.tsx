'use client'

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react'

import { claudeApiKeyProblem, cleanClaudeApiKey, type ClaudeAccessState } from '@/admin/core/contracts/engine'
import { EngineClientError, engineClient } from '@/admin/core/engine/client'
import { Button, Callout, Icon, Input, SettingRow, Tag, type TagTone } from '@/admin/ui'

import { formatWhen } from './format'
import styles from './ClaudeConnection.module.css'

export type ClaudeConnectionCardProps = {
  /** Admin ouvert sur 127.0.0.1 / localhost (calculé par la page serveur d'après l'hôte de la requête). */
  adminLocal: boolean
  /** Tests : client du moteur et horloge. */
  client?: { claude: Pick<(typeof engineClient)['claude'], 'access' | 'save' | 'test' | 'clear'> }
  now?: () => Date
}

type Busy = null | 'load' | 'save' | 'subscription' | 'test' | 'clear'

export const CLAUDE_CONNECTION_TEXT = {
  title: 'Claude connection',
  subscriptionTitle: 'Use my Claude subscription',
  subscriptionHelp: 'Uses the Claude account signed in on this computer (Claude Code). No key to paste — local engine only.',
  notSignedIn: 'This computer isn’t signed in to Claude yet. Open a terminal, run claude, then type /login and follow the steps. Then come back here.',
  envKey: 'ANTHROPIC_API_KEY is set in the AI engine environment (engine/.env.local): it takes priority over what you save here.',
  keyHelp: 'Create a key in the Claude Console (Settings › API keys). It is stored encrypted on the AI engine and never shown again.',
  unreachable: 'Couldn’t read the Claude connection from the AI engine.',
} as const

const errorText = (error: unknown) =>
  error instanceof EngineClientError ? error.message : 'Something went wrong. Try again.'

function statusOf(state: ClaudeAccessState | null, busy: Busy): { tone: TagTone; label: string } {
  if (busy === 'test') return { tone: 'neutral', label: 'Testing…' }
  if (!state) return { tone: 'neutral', label: 'Checking…' }
  if (state.access === 'none') return { tone: 'warning', label: 'Not connected' }
  if (state.lastTest && !state.lastTest.ok) return { tone: 'error', label: 'Connection error' }
  if (state.lastTest?.ok) return { tone: 'success', label: 'Connected' }
  return { tone: 'neutral', label: 'Not tested' }
}

/** Ce qui est utilisé, en une ligne (jamais plus que les 4 derniers caractères d'une clé). */
function currentLine(state: ClaudeAccessState): string {
  if (state.access === 'api-key') {
    const hint = state.keyHint ?? 'sk-ant-…'
    return state.source === 'env' ? `API key from the engine environment · ${hint}` : `Connected · ${hint}`
  }
  if (state.source === 'machine') return 'Claude subscription of this computer'
  if (state.access === 'subscription') return 'Claude subscription token from the engine environment (CLAUDE_CODE_OAUTH_TOKEN)'
  // Rien d'enregistré ni dans l'environnement : phrase courte, les choix sont juste en dessous.
  if (state.saved === null && !state.envApiKey) return 'Claude isn’t connected yet: the AI editor and Ask AI are unavailable.'
  return state.problem ?? 'Claude isn’t connected yet.'
}

/** Rangée de la clé enregistrée : « Connected · sk-ant-…XXXX », sauf si le dernier test a échoué ou si elle est illisible. */
function storedKeyTitle(state: ClaudeAccessState): string {
  if (!state.keyHint) return 'Saved API key'
  return state.lastTest && !state.lastTest.ok ? `API key · ${state.keyHint}` : `Connected · ${state.keyHint}`
}

/**
 * B5 · carte « Claude connection » (Kuartz et client, droit ai.access) : l'accès du moteur à Claude se règle ici au
 * lieu d'éditer engine/.env.local.
 * - LOCAL (moteur ENGINE_MODE=local ET admin sur localhost) : « Use my Claude subscription » — la connexion Claude Code
 *   de la machine, sans clé à coller ; une clé API reste possible.
 * - PRODUCTION : champ de clé API (password, jamais pré-rempli, vidé dès l'envoi). La clé part une fois au moteur par le
 *   relais signé et ne revient jamais : seulement « Connected · sk-ant-…XXXX », Replace et Disconnect.
 * Test de connexion après chaque enregistrement et à la demande (« Test connection »).
 */
export function ClaudeConnectionCard({ adminLocal, client = engineClient, now = () => new Date() }: ClaudeConnectionCardProps) {
  const [state, setState] = useState<ClaudeAccessState | null>(null)
  const [busy, setBusy] = useState<Busy>('load')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [keyValue, setKeyValue] = useState('')
  const [keyError, setKeyError] = useState<string | null>(null)
  const [keyFormOpen, setKeyFormOpen] = useState(false)
  const titleId = useId()
  const keyInput = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setBusy('load')
    setLoadError(null)
    try {
      setState(await client.claude.access())
    } catch (error) {
      setLoadError(errorText(error))
    } finally {
      setBusy(null)
    }
  }, [client])

  useEffect(() => {
    void load()
  }, [load])

  const run = async (kind: Exclude<Busy, null | 'load'>, action: () => Promise<ClaudeAccessState>, thenTest = false) => {
    setBusy(kind)
    setActionError(null)
    try {
      const next = await action()
      setState(next)
      if (thenTest && next.access !== 'none') {
        setBusy('test')
        setState(await client.claude.test())
      }
      return true
    } catch (error) {
      setActionError(errorText(error))
      return false
    } finally {
      setBusy(null)
    }
  }

  const submitKey = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    // La clé ne reste pas dans l'état de la page : on la lit, on vide le champ, puis on l'envoie.
    const apiKey = cleanClaudeApiKey(keyValue)
    const problem = claudeApiKeyProblem(apiKey)
    if (problem) {
      setKeyError(problem)
      keyInput.current?.focus()
      return
    }
    setKeyValue('')
    setKeyError(null)
    const saved = await run('save', () => client.claude.save({ kind: 'api-key', apiKey }), true)
    if (saved) setKeyFormOpen(false)
  }

  const status = statusOf(state, busy)
  const local = adminLocal && !!state?.subscriptionAllowed
  const working = busy !== null
  const storedKey = state?.saved === 'api-key' && state.source !== 'env'
  const showKeyForm = !!state && (keyFormOpen || (!local && !storedKey))

  return (
    <section className={styles.card} aria-labelledby={titleId} aria-busy={busy === 'load' || busy === 'test'}>
      <div className={styles.header}>
        <Icon name="claude" size={16} set={18} className={styles.icon} />
        <h2 id={titleId} className={styles.title}>
          {CLAUDE_CONNECTION_TEXT.title}
        </h2>
        <span className={styles.mode}>{state ? (local ? 'Local engine' : 'Production') : null}</span>
        <Tag tone={status.tone} dot>
          {status.label}
        </Tag>
      </div>

      {loadError ? (
        <Callout tone="error" role="alert" action={<Button variant="ghost" size="small" onClick={() => void load()}>Retry</Button>}>
          {CLAUDE_CONNECTION_TEXT.unreachable} {loadError}
        </Callout>
      ) : null}

      {state ? (
        <div className={styles.body}>
          {/* Accès en cours : une ligne, ou la rangée de l'accès enregistré (avec ses actions). */}
          {state.source === 'machine' ? (
            <SettingRow
              title="Using your Claude subscription"
              description="The AI editor and Ask AI run on the Claude account signed in on this computer."
              control={
                <Button variant="ghost" size="small" iconLeft="close" loading={busy === 'clear'} disabled={working && busy !== 'clear'} onClick={() => void run('clear', () => client.claude.clear())}>
                  Disconnect
                </Button>
              }
            />
          ) : storedKey && !keyFormOpen ? (
            <SettingRow
              title={storedKeyTitle(state)}
              description={state.problem ?? 'Anthropic API key saved on the AI engine (encrypted).'}
              control={
                <span className={styles.actions}>
                  <Button variant="secondary" size="small" iconLeft="replace" disabled={working} onClick={() => setKeyFormOpen(true)}>
                    Replace
                  </Button>
                  <Button variant="ghost" size="small" iconLeft="close" loading={busy === 'clear'} disabled={working && busy !== 'clear'} onClick={() => void run('clear', () => client.claude.clear())}>
                    Disconnect
                  </Button>
                </span>
              }
            />
          ) : (
            <p className={styles.current} data-testid="claude-current">
              {currentLine(state)}
            </p>
          )}

          {state.envApiKey ? <Callout tone="info">{CLAUDE_CONNECTION_TEXT.envKey}</Callout> : null}

          {local && state.source !== 'machine' ? (
            <>
              <SettingRow
                title={CLAUDE_CONNECTION_TEXT.subscriptionTitle}
                description={CLAUDE_CONNECTION_TEXT.subscriptionHelp}
                control={
                  <Button
                    variant={state.access === 'none' ? 'primary' : 'secondary'}
                    size="small"
                    loading={busy === 'subscription'}
                    disabled={working && busy !== 'subscription'}
                    onClick={() => void run('subscription', () => client.claude.save({ kind: 'subscription' }), true)}
                  >
                    {CLAUDE_CONNECTION_TEXT.subscriptionTitle}
                  </Button>
                }
              />
              {/* Avant le choix seulement : une fois l'abonnement choisi, la ligne d'état dit déjà quoi faire. */}
              {state.machine && !state.machine.loggedIn && state.saved !== 'subscription' ? (
                <Callout tone="warning">{CLAUDE_CONNECTION_TEXT.notSignedIn}</Callout>
              ) : null}
            </>
          ) : null}

          {showKeyForm ? (
            <form className={styles.keyForm} onSubmit={(event) => void submitKey(event)} noValidate>
              <Input
                ref={keyInput}
                type="password"
                name="anthropic-api-key"
                label="Anthropic API key"
                placeholder="sk-ant-api03-…"
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                icon="lock"
                value={keyValue}
                onChange={(event) => {
                  setKeyValue(event.target.value)
                  if (keyError) setKeyError(null)
                }}
                helper={CLAUDE_CONNECTION_TEXT.keyHelp}
                error={keyError ?? undefined}
              />
              <span className={styles.actions}>
                <Button type="submit" variant="primary" size="small" loading={busy === 'save'} disabled={working && busy !== 'save'}>
                  Save and test
                </Button>
                {keyFormOpen ? (
                  <Button
                    type="button"
                    variant="subtle"
                    size="small"
                    disabled={working}
                    onClick={() => {
                      setKeyFormOpen(false)
                      setKeyValue('')
                      setKeyError(null)
                    }}
                  >
                    Cancel
                  </Button>
                ) : null}
              </span>
            </form>
          ) : local && !storedKey && state.source !== 'env' ? (
            <button type="button" className={styles.link} onClick={() => setKeyFormOpen(true)} disabled={working}>
              Use an API key instead
            </button>
          ) : null}

          {actionError ? (
            <Callout tone="error" role="alert">
              {actionError}
            </Callout>
          ) : null}

          {/* Échec du dernier test ; sans accès du tout, la ligne d'état l'explique déjà (pas de doublon). */}
          {state.lastTest && !state.lastTest.ok && state.access !== 'none' && busy !== 'test' ? (
            <Callout tone="error" role="alert">
              {state.lastTest.message}
            </Callout>
          ) : null}

          <div className={styles.footer}>
            <span className={styles.lastTest} role="status">
              {busy === 'test'
                ? 'Testing the connection…'
                : state.lastTest
                  ? `Last test: ${formatWhen(state.lastTest.at, now())} — ${state.lastTest.ok ? state.lastTest.message : 'failed'}`
                  : 'Not tested yet.'}
            </span>
            <Button
              variant="secondary"
              size="small"
              iconLeft="success"
              loading={busy === 'test'}
              disabled={(state.access === 'none' && state.saved === null) || (working && busy !== 'test')}
              onClick={() => void run('test', () => client.claude.test())}
            >
              Test connection
            </Button>
          </div>
        </div>
      ) : busy === 'load' ? (
        <p className={styles.current}>Checking the connection…</p>
      ) : null}
    </section>
  )
}
