import { stegaClean, toPlainText, type StegaBranded } from 'next-sanity'

import { PortableTextBody } from '@/components/PortableTextBody'
import { Button } from '@/components/ui/Button/Button'
import { Eyebrow } from '@/components/ui/Eyebrow/Eyebrow'
import type { FAQS_QUERY_RESULT, FaqSection } from '@/sanity/types'

import styles from './Faq.module.css'

type Props = {
  data: StegaBranded<FaqSection>
  items: StegaBranded<FAQS_QUERY_RESULT>
}

type FaqAnswer = FAQS_QUERY_RESULT[number]['answer']

// FAQ de la page Dock Scheduling (Figma 269:456). Ordre de lecture : titre, questions, puis
// la carte d'aide (placée sous le titre en deux colonnes). Textes : Sanity (onglet FAQ) ;
// questions et réponses : collection FAQ, dans l'ordre choisi.
// Accordéon natif : <details name> exclusif (une seule réponse ouverte), la première ouverte.
export function Faq({ data, items }: Props) {
  const { eyebrow, title, supportText, supportCta } = data
  const jsonLd = faqPageJsonLd(stegaClean(items))

  return (
    <section className={styles.faq} aria-labelledby="faq-title">
      <hgroup className={styles.heading}>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 id="faq-title" className={styles.title}>
          {title}
        </h2>
      </hgroup>
      {items.length > 0 && (
        // role="list" : Safari retire la sémantique de liste quand list-style vaut none.
        <ul className={styles.questions} role="list">
          {items.map((item, index) => (
            <li key={item._id}>
              <details name="faq" open={index === 0} className={styles.item}>
                <summary className={styles.question}>{item.question}</summary>
                {/* Pas de panneau vide pour une question encore sans réponse : même règle que
                    les données structurées plus bas. */}
                {answerText(stegaClean(item.answer)) !== '' && (
                  <div className={styles.answer}>
                    <PortableTextBody value={item.answer} />
                  </div>
                )}
              </details>
            </li>
          ))}
        </ul>
      )}
      <aside className={styles.support}>
        <p className={styles.supportText}>{supportText}</p>
        {supportCta && (
          <Button href={supportCta.href ?? '#'} tone="inverse">
            {supportCta.label}
          </Button>
        )}
      </aside>
      {jsonLd && (
        // Données structurées FAQPage pour les moteurs : textes nettoyés de l'encodage du
        // Draft Mode, « < » échappé (recommandation du guide JSON-LD de Next).
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      )}
    </section>
  )
}

// Texte brut d'une réponse, paragraphes séparés par une ligne vide ; chaîne vide si la
// réponse manque ou ne contient que des blocs vides.
function answerText(answer: FaqAnswer | null | undefined) {
  return answer?.length ? toPlainText(answer).trim() : ''
}

// Une entrée par question qui a une réponse. Rien si aucune question n'a de réponse.
function faqPageJsonLd(items: FAQS_QUERY_RESULT) {
  const mainEntity = items.flatMap(({ question, answer }) => {
    const text = answerText(answer)
    return text ? [{ '@type': 'Question', name: question, acceptedAnswer: { '@type': 'Answer', text } }] : []
  })
  if (mainEntity.length === 0) return null
  return JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity }).replace(
    /</g,
    '\\u003c',
  )
}
