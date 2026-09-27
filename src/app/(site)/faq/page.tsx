import type { Metadata } from 'next'
import Link from 'next/link'
import { stegaClean } from 'next-sanity'

import { PortableTextBody } from '@/components/PortableTextBody'
import { RenderStamp } from '@/components/RenderStamp'
import { answerText, faqPageJsonLd } from '@/components/sections/Faq/Faq'
import faqStyles from '@/components/sections/Faq/Faq.module.css'
import { SiteScripts } from '@/components/site-scripts/SiteScripts'
import { PageHeading } from '@/components/ui/PageHeading/PageHeading'
import { editAttrs } from '@/lib/editor/preview'
import { FAQ_PAGE_DEFAULTS as DEFAULTS } from '@/lib/page-defaults'
import { pageMetadata } from '@/lib/seo'
import { sanityFetch } from '@/sanity/lib/live'
import { FAQ_LIST_QUERY, FAQ_PAGE_QUERY, SITE_SETTINGS_QUERY } from '@/sanity/lib/queries'

import styles from './faq.module.css'

// SEO de /faq (C2) : document unique faqPage, repli sur son titre puis sur les réglages du site.
export async function generateMetadata(): Promise<Metadata> {
  const [{ data: page }, { data: settings }] = await Promise.all([
    sanityFetch({ query: FAQ_PAGE_QUERY, stega: false }),
    sanityFetch({ query: SITE_SETTINGS_QUERY, stega: false }),
  ])
  return pageMetadata({ settings, seo: page?.seo, defaultTitle: page?.content?.title || DEFAULTS.title })
}

// Liste de la FAQ (id 'faq' dans src/admin.config.ts) : les questions de la section FAQ de l'accueil, dans le
// même ordre et avec la même mise en page (styles de components/sections/Faq : titre à gauche, accordéon à
// droite), sans la carte d'aide. Chaque réponse mène à la page de sa question (/faq/:slug). Données
// structurées FAQPage, comme sur l'accueil.
export default async function FaqPage() {
  const [{ data: items }, { data: page }, { data: settings }] = await Promise.all([
    sanityFetch({ query: FAQ_LIST_QUERY }),
    sanityFetch({ query: FAQ_PAGE_QUERY }),
    sanityFetch({ query: SITE_SETTINGS_QUERY, stega: false }),
  ])
  const content = page?.content
  const jsonLd = faqPageJsonLd(stegaClean(items))

  return (
    <section
      className={[faqStyles.faq, styles.page].join(' ')}
      aria-labelledby="faq-page-title"
      {...editAttrs(null, { doc: 'faqPage' })}
    >
      <SiteScripts scripts={settings?.scripts} page="faq" placements={['headEnd', 'bodyStart']} />
      <PageHeading
        id="faq-page-title"
        className={faqStyles.heading}
        eyebrow={content?.eyebrow || DEFAULTS.eyebrow}
        title={content?.title || DEFAULTS.title}
        lede={content?.lede || DEFAULTS.lede}
      />
      {items.length === 0 ? (
        <p className={faqStyles.questions}>{content?.emptyText || DEFAULTS.emptyText}</p>
      ) : (
        // role="list" : Safari retire la sémantique de liste quand list-style vaut none.
        <ul className={faqStyles.questions} role="list">
          {items.map((item, index) => {
            const slug = stegaClean(item.slug)
            return (
              <li key={item._id} {...editAttrs(null, { doc: item._id })}>
                {/* Accordéon natif exclusif, la première réponse ouverte (comme sur l'accueil). */}
                <details name="faq" open={index === 0} className={faqStyles.item}>
                  <summary className={faqStyles.question}>{item.question}</summary>
                  {answerText(stegaClean(item.answer)) !== '' && (
                    <div className={faqStyles.answer}>
                      <PortableTextBody value={item.answer} />
                      {slug && (
                        <p className={styles.permalink}>
                          <Link href={`/faq/${slug}`}>
                            Link to this answer<span className="visually-hidden">: {item.question}</span>
                          </Link>
                        </p>
                      )}
                    </div>
                  )}
                </details>
              </li>
            )
          })}
        </ul>
      )}
      <div className={styles.stamp}>
        <RenderStamp />
      </div>
      {jsonLd && (
        // Mêmes données structurées que la section FAQ de l'accueil (textes nettoyés du stega, « < » échappé).
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      )}
      <SiteScripts scripts={settings?.scripts} page="faq" placements={['bodyEnd']} />
    </section>
  )
}
