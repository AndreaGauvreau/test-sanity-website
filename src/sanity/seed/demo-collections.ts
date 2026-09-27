/**
 * DONNÉES DE DÉMONSTRATION (dataset development seulement) : témoignages de plus et réponses des
 * questions de la FAQ restées en brouillon dans le seed, pour remplir les listes du CMS (C3).
 * Personnes et entreprises inventées. Écrit par scripts/migrate-admin.ts -- --demo.
 */

export const demoTestimonials = [
  {
    _id: 'testimonial-demo-northline',
    quote:
      'Our carriers book their own slots now. The gate line that used to reach the road in the morning is gone, and the receiving team knows what is coming before the truck backs in.',
    name: 'Marcus Hale',
    role: 'Director of Operations',
    company: 'Northline Cold Storage',
  },
  {
    _id: 'testimonial-demo-bayside',
    quote:
      'We rolled Dock Scheduling out to four sites in six weeks. Each facility kept its own rules, and for the first time we can compare dwell time across the network.',
    name: 'Elena Duarte',
    role: 'VP Supply Chain',
    company: 'Bayside Distribution',
  },
]

/** Réponses des questions faq-2 à faq-9 du seed (la première a déjà la sienne, tirée du Figma). */
export const demoFaqAnswers: Record<string, string[]> = {
  'faq-2': [
    'Shippers, third-party logistics providers and distributors use Conduit Dock Scheduling at warehouses, cross-docks and manufacturing plants of every size.',
  ],
  'faq-3': [
    'Yes. Enterprise facilities run hundreds of appointments a day with per-door rules, carrier accounts and single sign-on for their teams.',
  ],
  'faq-4': [
    'Add doors, sites and carriers as you grow. Each facility keeps its own rules while reporting rolls up across the network.',
  ],
  'faq-5': [
    'Carriers book and reschedule themselves within your rules, so your team spends less time on calls and emails and more time moving freight.',
  ],
  'faq-6': [
    'Appointments feed Driver Check-in, Dock Operations and Yard Management, so a truck is tracked from booking to departure in one record.',
  ],
  'faq-7': [
    'Yes. Conduit connects to leading WMS and TMS platforms through standard integrations, EDI and an open API.',
  ],
  'faq-8': [
    'Dashboards show arrivals, dwell time, on-time performance and door utilization, per facility and per carrier, with exports for your own analysis.',
  ],
  'faq-9': [
    'Most facilities go live within days. Configuration takes a few hours, and the Conduit team guides you through carrier onboarding.',
  ],
}

/**
 * Script d'exemple (B3, G6) : JSON-LD BlogPosting sur les pages article, avec des variables {{…}}.
 * Données structurées seulement (pas de JavaScript exécuté) : rien ne change à l'écran.
 */
export const demoScripts = [
  {
    _key: 'demo-blogposting-jsonld',
    _type: 'siteScript',
    name: 'Blog article structured data',
    placement: 'bodyEnd',
    page: 'blog/slug',
    run: 'once',
    enabled: true,
    code: `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "BlogPosting",
  "headline": "{{title}}",
  "description": "{{excerpt}}",
  "image": "{{cover}}",
  "datePublished": "{{date}}",
  "author": { "@type": "Person", "name": "{{author}}" },
  "articleSection": "{{category}}"
}
</script>`,
  },
]
