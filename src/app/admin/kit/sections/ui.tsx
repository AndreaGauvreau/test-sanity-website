import type { ReactNode } from 'react'
import styles from '../kit.module.css'

// Petits gabarits de la galerie (pas des composants du kit).
export function Family({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className={styles.family} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className={styles.familyTitle}>
        {title}
      </h2>
      {children}
    </section>
  )
}

export function Item({ id, title, figma, note, children }: { id: string; title: string; figma?: string; note?: ReactNode; children: ReactNode }) {
  return (
    <article id={id} className={styles.item} aria-labelledby={`${id}-title`}>
      <div className={styles.itemHead}>
        <h3 id={`${id}-title`} className={styles.itemTitle}>
          {title}
        </h3>
        {figma ? <span className={styles.itemMeta}>Figma {figma}</span> : null}
      </div>
      {note ? <p className={styles.itemNote}>{note}</p> : null}
      {children}
    </article>
  )
}

export function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.cell}>
      {children}
      <span className={styles.caption}>{label}</span>
    </div>
  )
}

export { styles }

// Images d'exemple « Conduit » (le Figma les pose en remplissage IMAGE) : SVG inline, aucun fichier externe.
const favicon = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#0a0a0a'/><text x='32' y='44' font-family='Inter,Arial,sans-serif' font-size='36' font-weight='700' fill='#fff' text-anchor='middle'>C</text></svg>`
const og = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 630'><defs><radialGradient id='g' cx='0.85' cy='0.9' r='0.6'><stop offset='0' stop-color='#1f1f1f'/><stop offset='1' stop-color='#0b0b0b'/></radialGradient></defs><rect width='1200' height='630' fill='url(#g)'/><circle cx='1030' cy='560' r='300' fill='none' stroke='#1a1a1a' stroke-width='120'/><text x='64' y='120' font-family='Inter,Arial,sans-serif' font-size='64' font-weight='700' fill='#fff'>Dock scheduling, solved.</text><text x='64' y='180' font-family='Inter,Arial,sans-serif' font-size='28' fill='#aaa'>Book, confirm and track every truck.</text><rect x='64' y='500' width='48' height='48' rx='8' fill='#fff'/><text x='88' y='534' font-family='Inter,Arial,sans-serif' font-size='30' font-weight='700' text-anchor='middle'>C</text><text x='128' y='536' font-family='Inter,Arial,sans-serif' font-size='36' font-weight='600' fill='#fff'>Conduit</text></svg>`

export const SAMPLE_FAVICON = `data:image/svg+xml;utf8,${encodeURIComponent(favicon)}`
export const SAMPLE_OG = `data:image/svg+xml;utf8,${encodeURIComponent(og)}`
