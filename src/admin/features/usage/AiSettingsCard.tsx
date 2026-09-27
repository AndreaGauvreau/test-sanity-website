'use client'

import { useCallback, useEffect, useId, useMemo, useState } from 'react'

import { AI_EFFORTS, AI_MODELS, isAiModelId, type AiEffort, type AiSettingsInEffect, type AiSettingsState } from '@/admin/core/contracts/engine'
import { modelLabel } from '@/admin/core/contracts/format'
import { priceOf } from '@/admin/core/contracts/pricing'
import { EngineClientError, engineClient } from '@/admin/core/engine/client'
import {
  AnimatePresence,
  Button,
  Callout,
  Field,
  Icon,
  SegmentedControl,
  Select,
  Tag,
  fade,
  motion,
  slideDown,
  useMotionVariants,
  type ListOption,
} from '@/admin/ui'

import styles from './AiSettings.module.css'

export type AiSettingsCardProps = {
  /** Tests : client du moteur. */
  client?: { claude: Pick<(typeof engineClient)['claude'], 'settings' | 'saveSettings'> }
}

export const AI_SETTINGS_TEXT = {
  title: 'AI settings',
  model: 'Model',
  effort: 'Thinking effort',
  modelHelp: 'Price per million tokens, input / output (Anthropic API pricing).',
  nextRequest: 'Changes apply to the next AI editor request. A request already running keeps its settings.',
  unreachable: 'Couldn’t read the AI settings from the AI engine.',
  chooseModel: 'Choose a model from the list to save.',
} as const

/** Ce que fait chaque niveau, en une phrase (anglais, interface). */
export const EFFORT_HELP: Record<AiEffort, string> = {
  low: 'Fastest and cheapest. Fine for small text or color tweaks.',
  medium: 'Balanced speed and quality. Recommended for most changes.',
  high: 'Thinks longer on tricky changes. Slower, uses more tokens.',
  xhigh: 'Deeper reasoning for complex layout work. Slower and costlier.',
  max: 'Maximum thinking. Slowest and most expensive — rarely needed.',
}

const errorText = (error: unknown) => (error instanceof EngineClientError ? error.message : 'Something went wrong. Try again.')

/** « $4 / $20 » : entrée / sortie par million de jetons, depuis la table unique `PRICES_PER_MTOK` du contrat. */
export function priceHint(model: string): string | null {
  const price = priceOf(model)
  if (!price) return null
  const usd = (value: number) => `$${Number.isInteger(value) ? value : value.toFixed(2)}`
  return `${usd(price.input)} / ${usd(price.output)}`
}

const effortLabel = (effort: AiEffort) => AI_EFFORTS.find((item) => item.id === effort)?.label ?? effort
const sameSettings = (a: AiSettingsInEffect, b: AiSettingsInEffect) => a.model === b.model && a.effort === b.effort

/**
 * B5 · carte « AI settings » (Kuartz et client, droit ai.access ; pas de maquette : composants du kit, même carte que
 * « Claude connection ») : MODÈLE et NIVEAU DE RÉFLEXION de l'éditeur IA, enregistrés par le moteur
 * (`data/ai-settings.json`) et pris par la PROCHAINE demande, sans redémarrage. Ask AI n'est pas concerné (ASK_MODEL).
 * Save désactivé tant que rien n'a changé ; erreur lisible ; aucune donnée secrète.
 */
export function AiSettingsCard({ client = engineClient }: AiSettingsCardProps) {
  const [state, setState] = useState<AiSettingsState | null>(null)
  const [draft, setDraft] = useState<AiSettingsInEffect | null>(null)
  const [busy, setBusy] = useState<null | 'load' | 'save'>('load')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)
  const titleId = useId()
  const noticeVariants = useMotionVariants(slideDown)
  const bodyVariants = useMotionVariants(fade)

  const load = useCallback(async () => {
    setBusy('load')
    setLoadError(null)
    try {
      const next = await client.claude.settings()
      setState(next)
      setDraft(next.current)
    } catch (error) {
      setLoadError(errorText(error))
    } finally {
      setBusy(null)
    }
  }, [client])

  useEffect(() => {
    void load()
  }, [load])

  // Un modèle hors liste (EDITOR_MODEL de l'environnement du moteur) reste visible, sans pouvoir être choisi à nouveau.
  const modelOptions = useMemo<ListOption<string>[]>(() => {
    const listed: ListOption<string>[] = AI_MODELS.map((model) => ({ value: model.id, label: model.label, meta: priceHint(model.id) ?? undefined }))
    const current = draft?.model
    if (current && !isAiModelId(current)) listed.push({ value: current, label: `${modelLabel(current)} (engine default)`, meta: priceHint(current) ?? undefined, disabled: true })
    return listed
  }, [draft?.model])

  const dirty = !!state && !!draft && !sameSettings(draft, state.current)
  const savable = dirty && !!draft && isAiModelId(draft.model)

  const change = (patch: Partial<AiSettingsInEffect>) => {
    setDraft((previous) => (previous ? { ...previous, ...patch } : previous))
    setJustSaved(false)
    setSaveError(null)
  }

  const save = async () => {
    if (!draft || !isAiModelId(draft.model) || busy) return
    setBusy('save')
    setSaveError(null)
    try {
      const next = await client.claude.saveSettings({ model: draft.model, effort: draft.effort })
      setState(next)
      setDraft(next.current)
      setJustSaved(true)
    } catch (error) {
      setSaveError(errorText(error))
    } finally {
      setBusy(null)
    }
  }

  const status = state ? (state.source === 'saved' ? { tone: 'info' as const, label: 'Saved' } : { tone: 'neutral' as const, label: 'Default' }) : null

  return (
    <section className={styles.card} aria-labelledby={titleId} aria-busy={busy !== null}>
      <div className={styles.header}>
        <Icon name="sliders" size={16} set={18} className={styles.icon} />
        <h2 id={titleId} className={styles.title}>
          {AI_SETTINGS_TEXT.title}
        </h2>
        <span className={styles.scope}>AI editor</span>
        {status ? (
          <Tag tone={status.tone} dot>
            {status.label}
          </Tag>
        ) : null}
      </div>

      {loadError ? (
        <Callout tone="error" role="alert" action={<Button variant="ghost" size="small" onClick={() => void load()}>Retry</Button>}>
          {AI_SETTINGS_TEXT.unreachable} {loadError}
        </Callout>
      ) : null}

      {state && draft ? (
        <motion.form
          className={styles.body}
          variants={bodyVariants}
          initial="initial"
          animate="animate"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          <Select<string>
            label={AI_SETTINGS_TEXT.model}
            options={modelOptions}
            value={draft.model}
            onValueChange={(model) => change({ model })}
            disabled={busy === 'save'}
            renderValue={(value, label) => {
              const price = priceHint(value)
              return price ? `${label} · ${price} per M tokens` : label
            }}
            helper={isAiModelId(draft.model) ? AI_SETTINGS_TEXT.modelHelp : AI_SETTINGS_TEXT.chooseModel}
          />

          <Field label={AI_SETTINGS_TEXT.effort} labelId={`${titleId}-effort`} helper={EFFORT_HELP[draft.effort]} helperId={`${titleId}-effort-help`}>
            <SegmentedControl<AiEffort>
              aria-labelledby={`${titleId}-effort`}
              aria-describedby={`${titleId}-effort-help`}
              items={AI_EFFORTS.map((effort) => ({ value: effort.id, label: effort.label }))}
              value={draft.effort}
              onValueChange={(effort) => change({ effort })}
              disabled={busy === 'save'}
              className={styles.segments}
            />
          </Field>

          <p className={styles.note}>
            Ask AI isn’t affected: it always uses {modelLabel(state.askModel)}.
            {state.source === 'default' ? ` Engine default: ${modelLabel(state.defaults.model)} · ${effortLabel(state.defaults.effort)}.` : null}
          </p>

          <AnimatePresence initial={false}>
            {saveError ? (
              <motion.div key="error" variants={noticeVariants} initial="initial" animate="animate" exit="exit">
                <Callout tone="error" role="alert">
                  Couldn’t save the AI settings. {saveError}
                </Callout>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <div className={styles.footer}>
            <AnimatePresence initial={false} mode="wait">
              <motion.span
                key={justSaved ? 'saved' : 'hint'}
                className={styles.hint}
                role="status"
                variants={noticeVariants}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                {justSaved
                  ? `Saved. The next AI editor request uses ${modelLabel(state.current.model)} · ${effortLabel(state.current.effort)}.`
                  : AI_SETTINGS_TEXT.nextRequest}
              </motion.span>
            </AnimatePresence>
            <Button type="submit" variant="primary" size="small" loading={busy === 'save'} disabled={!savable || busy !== null}>
              Save
            </Button>
          </div>
        </motion.form>
      ) : busy === 'load' ? (
        <p className={styles.loading}>Loading the AI settings…</p>
      ) : null}
    </section>
  )
}
