import type { ElementTarget } from '@/admin/core/contracts'
import { ElementChip } from './ElementChip'
import styles from './Message.module.css'

/**
 * Message de l'utilisateur dans le fil (Figma « Message ») : request = puces des éléments + texte ;
 * adjustment = texte seul. Pur. Le texte est rendu en nœud texte (jamais de HTML).
 */
export function Message({ type, targets = [], text }: { type: 'request' | 'adjustment'; targets?: readonly ElementTarget[]; text: string }) {
  return (
    <div className={styles.message} data-type={type}>
      <span className="kz-visually-hidden">{type === 'request' ? 'Your request' : 'Your adjustment'}: </span>
      {type === 'request' && targets.length ? (
        <ul className={styles.targets} aria-label="Elements">
          {targets.map((t) => (
            <li key={`${t.zone}#${t.index}#${t.key ?? ''}#${t.doc ?? ''}`}>
              <ElementChip label={t.label} />
            </li>
          ))}
        </ul>
      ) : null}
      <p className={styles.text}>{text}</p>
    </div>
  )
}
