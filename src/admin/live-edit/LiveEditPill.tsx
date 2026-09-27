import { Icon } from '@/admin/ui/icons/Icon'

import styles from './LiveEditPill.module.css'

/**
 * Pilule flottante « Edit with AI » (en bas à droite). Chargée à la demande par LiveEditButton, seulement quand la
 * personne peut modifier la page. Lien simple (navigation complète) : l'éditeur est une autre racine (/admin).
 * Style : Design System de l'admin, valeurs recopiées dans le CSS Module (le site n'importe pas tokens.css).
 */
export function LiveEditPill({ href }: { href: string }) {
  return (
    <div className={styles.root} data-kz-live-edit="">
      <a className={styles.pill} href={href} title="Open this page in the AI editor">
        <Icon name="ai" size={16} />
        <span>Edit with AI</span>
      </a>
    </div>
  )
}
