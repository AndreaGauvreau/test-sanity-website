import styles from './harness.module.css'

/**
 * Réplique de développement de quelques sections de l'accueil de Conduit (textes du seed, mise en page simplifiée),
 * marquée avec les VRAIES zones de src/editor/zones.json (data-edit, data-edit-doc, data-edit-key comme
 * src/lib/editor/preview.ts les rend en mode aperçu). Sert à développer le pont sans l'aperçu du moteur (4042).
 * En-tête et pied : sans zone, comme sur le site. Les liens de navigation sont des ancres (le mode View les suit).
 */
const DOC = 'dockSchedulingPage'

const FEATURES = [
  {
    key: 'custom-rules',
    title: 'Control bookings with custom rules',
    text: 'Set scheduling rules to match and manage your capacity. Send out your booking link once and Dock Scheduling does the rest, suggesting times, collecting shipment data, and sending notifications to everyone.',
  },
  {
    key: 'appointments',
    title: 'Turn appointments into action',
    text: 'Skip the drain of ongoing coordination. Dock Scheduling captures the data your organization needs for real-time tactical clarity.',
  },
  {
    key: 'scheduling-data',
    title: 'Do more with scheduling data',
    text: 'Connect appointments with shipment records automatically. Big-picture visibility lets staff solve exceptions and optimize network capacity.',
  },
]

const FAQ = [
  { id: 'faq-1', question: 'What do customers think about Conduit Dock Scheduling?' },
  { id: 'faq-2', question: 'Who uses Conduit Dock Scheduling?' },
  { id: 'faq-3', question: 'Does Conduit Dock Scheduling work for enterprise facilities?' },
]

export function HarnessSite() {
  return (
    <div className={styles.site}>
      <header className={styles.header}>
        <a href="#top" className={styles.logo}>
          Conduit
        </a>
        <nav aria-label="Main" className={styles.nav}>
          <a href="#features">Product</a>
          <a href="#get-started">Pricing</a>
          <a href="#faq">Customers</a>
          <a href="#faq">Blog</a>
          <a href="#get-started" className={styles.navCta}>
            Book a demo
          </a>
        </nav>
      </header>

      <main id="top">
        <section className={styles.hero} aria-labelledby="hero-title" data-edit="hero" data-edit-doc={DOC}>
          <div className={styles.copy}>
            <h1 id="hero-title" className={styles.title} data-edit="hero.title">
              Automate scheduling for maximum capacity control
            </h1>
            <p className={styles.lede} data-edit="hero.lede">
              Dock Scheduling extends booking power to carriers and customers based on your rules. Offload phone calls and
              emails and gain actionable insights into volume, shipment data, and performance.
            </p>
            <div className={styles.actions}>
              <a href="#get-started" className={styles.primary} data-edit="hero.primaryCta">
                Talk to sales
              </a>
              <a href="#features" className={styles.secondary} data-edit="hero.secondaryCta">
                Take a tour
              </a>
            </div>
            <ul className={styles.ratings} role="list">
              <li>
                <a href="#faq" data-edit="hero.rating" data-edit-key="g2">
                  4.7 stars on G2
                </a>
              </li>
              <li>
                <a href="#faq" data-edit="hero.rating" data-edit-key="capterra">
                  4.7 stars on Capterra
                </a>
              </li>
            </ul>
          </div>
          <div className={styles.visual} data-edit="hero.visual" />
        </section>

        <section id="features" className={styles.features} aria-label="Dock Scheduling features" data-edit="features" data-edit-doc={DOC}>
          <ul className={styles.cards}>
            {FEATURES.map((f) => (
              <li key={f.key} className={styles.card} data-edit="features.card" data-edit-key={f.key}>
                <h3 className={styles.cardTitle} data-edit="features.card.title" data-edit-key={f.key}>
                  {f.title}
                </h3>
                <p className={styles.cardText} data-edit="features.card.text" data-edit-key={f.key}>
                  {f.text}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section id="faq" className={styles.faq} aria-labelledby="faq-title" data-edit="faq" data-edit-doc={DOC}>
          <p className={styles.eyebrow} data-edit="faq.eyebrow">
            Frequently asked question
          </p>
          <h2 id="faq-title" className={styles.sectionTitle} data-edit="faq.title">
            Conduit Dock Scheduling FAQs
          </h2>
          <div className={styles.questions}>
            {FAQ.map((item) => (
              <details key={item.id} className={styles.item} data-edit="faq.item" data-edit-doc={item.id}>
                <summary className={styles.question} data-edit="faq.item.question" data-edit-doc={item.id}>
                  {item.question}
                </summary>
                <div className={styles.answer} data-edit="faq.item.answer" data-edit-doc={item.id}>
                  <p>Conduit Dock Scheduling holds a 4.7 on G2 and 4.8 on Capterra.</p>
                </div>
              </details>
            ))}
          </div>
        </section>

        <section id="get-started" className={styles.getStarted} aria-labelledby="gs-title" data-edit="getStarted" data-edit-doc={DOC}>
          <p className={styles.eyebrow} data-edit="getStarted.eyebrow">
            Get started
          </p>
          <h2 id="gs-title" className={styles.sectionTitle} data-edit="getStarted.title">
            Put your dock schedule on rules,{' '}
            <span className={styles.muted} data-edit="getStarted.title.muted">
              not phone calls
            </span>
          </h2>
          <p className={styles.lede} data-edit="getStarted.text">
            Talk to our team about Dock Scheduling, or take the self-serve tour and see the appointment record in action.
          </p>
          <div className={styles.actions}>
            <a href="#top" className={styles.primary} data-edit="getStarted.primaryCta">
              Talk to sales
            </a>
            <a href="#features" className={styles.secondary} data-edit="getStarted.secondaryCta">
              Take a tour
            </a>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>© Conduit — development harness of the AI editor preview</footer>
    </div>
  )
}
