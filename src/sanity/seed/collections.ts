// Contenu de départ des collections Témoignages et FAQ : les textes du Figma, tels quels.
// Utilisé par `npm run seed` et par les aperçus /preview/testimonial et /preview/faq.

let keyCounter = 0
const key = () => `k${(keyCounter++).toString(36).padStart(4, '0')}`

export const paragraph = (text: string) => ({
  _type: 'block' as const,
  _key: key(),
  style: 'normal' as const,
  markDefs: [],
  children: [{ _type: 'span' as const, _key: key(), text, marks: [] }],
})

export const testimonialDoc = {
  _id: 'testimonial-produce-services',
  _type: 'testimonial' as const,
  quote:
    "We were so congested we couldn't get trucks into doors to get working on them, because there was just so much traffic out there. Using Conduit as an appointment system has solved the traffic issue.",
  name: 'Teresa Nelson',
  role: 'General Manager',
  company: 'Produce Services & Logistics, Inc.',
}

export const faqQuestions = [
  'What do customers think about Conduit Dock Scheduling?',
  'Who uses Conduit Dock Scheduling?',
  'Does Conduit Dock Scheduling work for enterprise facilities?',
  'How does Dock Scheduling scale with my business?',
  'How does Conduit Dock Scheduling save time?',
  'How does Dock Scheduling connect to other Conduit modules?',
  'Does Conduit work with existing WMS and TMS systems?',
  'What reporting and analytics do I get with Dock Scheduling?',
  'What is the implementation process like?',
]

// Seule la première question a sa réponse dans le Figma.
export const firstFaqAnswer = [
  paragraph(
    'Conduit Dock Scheduling holds a 4.7 on G2 and 4.8 on Capterra. These are the highest verified ratings in the product category.',
  ),
  paragraph(
    'Customer success stories consistently show that Conduit’s self-service booking portal, automated notifications, and capacity optimization eliminate coordination overhead and allow staff to focus on efficient productivity and growth activities.',
  ),
]
