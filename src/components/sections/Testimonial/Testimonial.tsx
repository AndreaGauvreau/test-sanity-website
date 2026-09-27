import Image from 'next/image'
import type { StegaBranded } from 'next-sanity'

import { Button } from '@/components/ui/Button/Button'
import { editAttrs } from '@/lib/editor/preview'
import { HOME_DOCUMENT_ID } from '@/lib/site'
import type { PAGE_QUERY_RESULT } from '@/sanity/types'

import person from './person-motion-blur.png'
import styles from './Testimonial.module.css'
import warehouse from './warehouse.jpg'

type TestimonialData = NonNullable<NonNullable<PAGE_QUERY_RESULT>['testimonial']>

// Largeur rendue des deux calques (object-fit: cover, ratio 1681 / 694) : 1681 px quand la
// section fait 694 de haut, la fenêtre au-delà ; sur le mobile, le bandeau 4 / 3 (400 px de
// haut au plus) les montre à 1,82 fois la fenêtre, 969 px au plus.
const sceneSizes =
  '(min-width: 105.0625rem) 100vw, (min-width: 50.625rem) 1681px, (min-width: 33.3125rem) 969px, 182vw'

// Témoignage (Figma 269:333) : citation, auteur et bouton vers l'étude de cas, sur une photo
// d'entrepôt traversée par un passant flou. Mobile : la photo en bandeau, le texte dessous ;
// à partir de 810 px, le texte à droite, sur la photo. Citation, auteur et lien par défaut :
// collection Témoignages (le témoignage choisi, sinon le plus récent) ; bouton et titre
// invisible : onglet Témoignage de la page. Sans témoignage, pas de section.
export function Testimonial({ data }: { data: StegaBranded<TestimonialData> }) {
  const { item, cta, title } = data
  if (!item) return null

  const { quote, name, role, company, caseStudyUrl } = item

  return (
    <section
      className={styles.testimonial}
      aria-labelledby="testimonial-title"
      {...editAttrs('testimonial', { doc: HOME_DOCUMENT_ID })}
    >
      {/* Pas de titre visible dans le Figma : annoncé aux lecteurs d'écran seulement. */}
      <h2 id="testimonial-title" className="visually-hidden">
        {title}
      </h2>
      {/* Décor : la photo, puis le passant (flou de bougé du Figma déjà appliqué). Les deux
          fichiers ont la même boîte que la photo pour rester calés l'un sur l'autre. */}
      <div className={styles.scene}>
        <Image src={warehouse} alt="" fill sizes={sceneSizes} className={styles.photo} />
        <Image src={person} alt="" fill sizes={sceneSizes} className={styles.person} />
      </div>
      {/* Citation et auteur : document « testimonial » (data-edit-doc), pas la page. */}
      <figure className={styles.quote} {...editAttrs('testimonial.quote', { doc: item._id })}>
        {/* Les guillemets viennent du site : la collection les exclut de la citation. */}
        <blockquote className={styles.text} {...editAttrs('testimonial.quote.text', { doc: item._id })}>
          <p>“{quote}”</p>
        </blockquote>
        {/* Un élément par champ : chacun garde son propre repère d'édition dans Presentation
            (deux champs dans un même nœud texte, seul le premier serait cliquable). */}
        <figcaption className={styles.author} {...editAttrs('testimonial.quote.author', { doc: item._id })}>
          <span>{name},</span>
          <span>
            {role && (
              <>
                <span>{role}</span>,{' '}
              </>
            )}
            <span>{company}</span>
          </span>
        </figcaption>
      </figure>
      {/* Destination : celle du bouton, sinon le lien du témoignage, sinon `#` en attendant. */}
      {cta && (
        <Button
          href={cta.href ?? caseStudyUrl ?? '#'}
          variant="secondary"
          tone="inverse"
          className={styles.cta}
          edit={editAttrs('testimonial.cta', { doc: HOME_DOCUMENT_ID })}
        >
          {cta.label}
        </Button>
      )}
    </section>
  )
}
