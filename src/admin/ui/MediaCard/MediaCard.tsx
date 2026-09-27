'use client'

import { useId, type HTMLAttributes, type ReactNode, type Ref } from 'react'
import { Checkbox } from '../Checkbox'
import { Icon, type IconName } from '../icons'
import { Tag } from '../Tag'
import { UsageTooltip, type UsagePlace } from '../UsageTooltip'
import { cx } from '../utils/cx'
import { useControllableState } from '../utils/useControllableState'
import styles from './MediaCard.module.css'

export type MediaType = 'image' | 'video' | 'file'

const TYPE_ICON: Record<MediaType, IconName> = { image: 'image', video: 'play', file: 'file' }
const TYPE_LABEL: Record<MediaType, string> = { image: 'IMG', video: 'VIDEO', file: 'FILE' }

export type MediaCardProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  /** Nom du fichier (Body Small, une ligne, « … »). */
  name: string
  /** Taille lisible : « 1.2 MB » (voir formatBytes). */
  size?: ReactNode
  /** Usage : « Used ×2 » ou « Unused ». */
  usage?: ReactNode
  /** Emplacements d'usage : « Used ×2 » ouvre l'Usage tooltip. */
  usagePlaces?: readonly UsagePlace[]
  /** Titre de l'Usage tooltip (défaut « <name> · used in N places »). */
  usageTitle?: ReactNode
  type?: MediaType
  /** Libellé du tag de type (défaut IMG / VIDEO / FILE ; « PDF »…). */
  typeLabel?: string
  /** Vignette (image ou poster). Absente : icône du type au centre. */
  src?: string
  selected?: boolean
  defaultSelected?: boolean
  onSelectedChange?: (selected: boolean) => void
  /** Case de sélection (visible au survol, au focus et une fois cochée). Défaut true. */
  selectable?: boolean
  /** Ouvre le détail (clic sur la vignette). Sans `onOpen`, le clic bascule la sélection. */
  onOpen?: () => void
  /** Pastille en haut à droite de la vignette (ex. `<LockBadge>` pendant une sélection). */
  badge?: ReactNode
  ref?: Ref<HTMLDivElement>
}

/**
 * Carte média 184 px (Figma « Media card » 337:1453) : vignette 124 (radius/md, bg/subtle), tag de type,
 * nom, taille + usage. États : hover (contour border/strong 1), selected (border/focus 2 + case cochée).
 */
export function MediaCard({
  name,
  size,
  usage,
  usagePlaces,
  usageTitle,
  type = 'image',
  typeLabel,
  src,
  selected: selectedProp,
  defaultSelected = false,
  onSelectedChange,
  selectable = true,
  onOpen,
  badge,
  className,
  ref,
  ...rest
}: MediaCardProps) {
  const nameId = useId()
  const [selected, setSelected] = useControllableState(selectedProp, defaultSelected, onSelectedChange)
  const usageNode =
    usage != null ? (
      <>
        <Icon name="locate" size={10} set={12} />
        <span>{usage}</span>
      </>
    ) : null

  return (
    <div
      ref={ref}
      data-selected={selected || undefined}
      data-type={type}
      className={cx(styles.card, className)}
      {...rest}
    >
      <div className={styles.thumbnail}>
        {src ? <img src={src} alt="" className={styles.image} /> : <Icon name={TYPE_ICON[type]} size={18} className={styles.typeIcon} />}
        {/* Sans onOpen, le clic sur la vignette bascule la sélection : doublon souris de la case, masqué au clavier. */}
        <button
          type="button"
          className={styles.open}
          aria-labelledby={onOpen ? nameId : undefined}
          aria-hidden={onOpen ? undefined : true}
          tabIndex={onOpen ? undefined : -1}
          onClick={() => {
            if (onOpen) onOpen()
            else if (selectable) setSelected(!selected)
          }}
        />
        {selectable ? (
          <span className={styles.checkbox}>
            <Checkbox aria-label={`Select ${name}`} checked={selected} onCheckedChange={setSelected} />
          </span>
        ) : null}
        <Tag tone="neutral" className={styles.typeTag}>
          {typeLabel ?? TYPE_LABEL[type]}
        </Tag>
        {badge ? <span className={styles.badge}>{badge}</span> : null}
      </div>
      <span id={nameId} className={styles.name} title={name}>
        {name}
      </span>
      {size != null || usageNode ? (
        <div className={styles.meta}>
          {size != null ? <span className={styles.size}>{size}</span> : null}
          {usageNode ? (
            usagePlaces && usagePlaces.length > 0 ? (
              <UsageTooltip
                title={usageTitle ?? `${name} · used in ${usagePlaces.length} place${usagePlaces.length > 1 ? 's' : ''}`}
                places={usagePlaces}
              >
                <button type="button" className={cx(styles.usage, styles.usageButton)}>
                  {usageNode}
                </button>
              </UsageTooltip>
            ) : (
              <span className={styles.usage}>{usageNode}</span>
            )
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
