/**
 * DONNÉES DE DÉMONSTRATION (dataset development seulement) : le blog de 12 articles que prévoit le
 * Figma de l'admin, en anglais, sur la logistique et la planification de quais. Contenu inventé pour
 * la démo : ni clients, ni chiffres réels. Écrit par scripts/migrate-admin.ts -- --demo.
 */
import type { CoverSpec } from '../../../scripts/lib/images'

type Category = 'Operations' | "Buyer's guide" | 'Analysis'

/** Bloc Portable Text : paragraphe (texte simple) ou intertitre « ## … ». */
type Block = string

export type DemoPost = {
  slug: string
  title: string
  category: Category
  author: string
  /** AAAA-MM-JJ, 08:00 UTC. */
  date: string
  excerpt: string
  cover: CoverSpec & { alt: string }
  body: Block[]
}

export const demoPosts: DemoPost[] = [
  {
    slug: 'carrier-portals-a-checklist',
    title: 'Carrier portals: a checklist',
    category: "Buyer's guide",
    author: 'Maya Chen',
    date: '2026-09-22',
    excerpt: 'Before you send carriers a booking link, check these eight points. A good portal gets used; a bad one sends everyone back to the phone.',
    cover: {
      photo: 'night',
      alt: 'Aerial view of a distribution center at night, trailers lined up at the dock doors',
    },
    body: [
      'A carrier portal only saves time if carriers actually use it. Most of the failures we see are not technical: the link is hard to find, the form asks for data nobody has at booking time, or the confirmation never arrives.',
      '## The checklist',
      'Can a dispatcher book without creating an account? Does the form ask only for what the dock needs — PO or load number, trailer type, expected pallet count? Are the open slots shown in the carrier’s time zone? Does every booking send a confirmation with the gate address and check-in instructions?',
      'Then look at changes. A carrier running late should be able to move an appointment in two clicks, within your rules, without calling anyone. If rescheduling means a phone call, your portal will be bypassed the first time a truck hits traffic.',
      'Finally, measure adoption. Track the share of appointments booked through the portal each week and follow up with the carriers who still call. The goal is not zero calls; it is calls only for the exceptions.',
    ],
  },
  {
    slug: 'how-to-cut-dock-wait-times',
    title: 'How to cut dock wait times without adding doors',
    category: 'Operations',
    author: 'Daniel Okafor',
    date: '2026-09-11',
    excerpt: 'Long queues at the gate are rarely a capacity problem. Most facilities can recover hours per day by spreading arrivals and preparing each unload.',
    cover: {
      photo: 'aisle',
      crop: { left: 350, top: 0, width: 800, height: 806 },
      alt: 'Yellow forklift parked in a warehouse aisle between tall shelves of cardboard boxes',
    },
    body: [
      'When trucks wait at the gate, the first reflex is to ask for more doors. Before you pour concrete, look at when the trucks arrive. Most sites see sharp peaks in the early morning and right after lunch, with idle doors in between.',
      'Appointment rules are the cheapest capacity you can buy. Cap the number of arrivals per hour per door group, reserve slots for live unloads, and let the schedule, not the queue, decide who goes first.',
      'Preparation matters as much as timing. When the shipment data arrives with the booking, the receiving team knows the pallet count and the door before the truck backs in. Unloads start on time instead of waiting for paperwork.',
      'Start with one week of data: arrivals per hour, time from gate to door, and unload duration. The pattern usually points to two or three rule changes that remove most of the waiting.',
    ],
  },
  {
    slug: 'detention-fees-what-they-really-cost',
    title: 'Detention fees: what they really cost your warehouse',
    category: 'Analysis',
    author: 'Priya Raman',
    date: '2026-08-31',
    excerpt: 'Detention invoices are only the visible part. Late unloads also cost you carrier goodwill, overtime and the next appointment on the same door.',
    cover: {
      photo: 'worker',
      crop: { left: 0, top: 0, width: 760, height: 809 },
      alt: 'Warehouse worker in a hard hat and high-visibility vest pointing at the racking, tablet in hand',
    },
    body: [
      'Most carriers bill detention after two hours of free time. On paper the fee looks small next to a freight invoice. In practice it is a signal that something upstream is broken, and the invoice is only one of its costs.',
      'A truck held past its window blocks the door for the next appointment, which then starts late too. The delay cascades through the afternoon and often ends in overtime for the receiving crew.',
      'Carriers keep score. Facilities with long dwell times get worse rates and fewer drivers willing to take the load. That cost never shows up on a single invoice, but it shows up in every tender.',
      'Track dwell time per appointment, not just the detention you pay. The appointments that come close to the limit tell you where the next invoices will come from.',
    ],
  },
  {
    slug: 'booking-rules-carriers-follow',
    title: 'Designing booking rules that carriers actually follow',
    category: 'Operations',
    author: 'Maya Chen',
    date: '2026-08-20',
    excerpt: 'Rules that are too strict push carriers back to the phone. Start simple, publish the reasons, and adjust with real arrival data.',
    cover: {
      photo: 'aisle',
      crop: { left: 1000, top: 0, width: 952, height: 806 },
      alt: 'Long warehouse aisle with steel shelving and stacked boxes on both sides',
    },
    body: [
      'Every rule you add to the booking form is a question a dispatcher has to answer. A handful of clear rules beats a long list of exceptions that nobody reads.',
      '## Start with three rules',
      'Limit arrivals per hour for each door group. Separate live unloads from drop trailers. Set a booking cut-off the day before, so the receiving team can plan labor.',
      'Explain the rules where carriers book. A short line such as “Live unloads are limited to 4 per hour to keep wait times under 30 minutes” turns a constraint into a promise.',
      'Review the rules every month. If a slot is always full while the next one is empty, move capacity. If a rule generates most of the phone calls, it is probably too strict.',
    ],
  },
  {
    slug: 'live-unload-vs-drop-trailer',
    title: 'Live unload vs. drop trailer: choosing per lane',
    category: 'Analysis',
    author: 'Daniel Okafor',
    date: '2026-08-09',
    excerpt: 'Neither model is always cheaper. The right choice depends on volume, trailer pool and how predictable each lane is.',
    cover: {
      photo: 'night',
      crop: { left: 700, top: 0, width: 972, height: 941 },
      alt: 'Row of trailers docked along the side of a lit warehouse at night',
    },
    body: [
      'Live unloads keep trailers moving but tie the driver to your dock. Drop trailers free the driver but need yard space, a trailer pool and someone to shuttle them.',
      'High-volume, regular lanes often suit drop trailers: the pool pays for itself and the dock team unloads when labor is available. Irregular or long-haul lanes usually stay live, because the carrier needs the equipment back.',
      'Look at each lane separately. Compare dwell time, detention paid and yard moves per trailer over a quarter. The answer is rarely the same for all your carriers.',
    ],
  },
  {
    slug: 'what-to-look-for-in-dock-scheduling-software',
    title: 'What to look for in dock scheduling software',
    category: "Buyer's guide",
    author: 'Priya Raman',
    date: '2026-07-29',
    excerpt: 'Beyond the calendar: rules, carrier experience, data capture and integrations decide whether a scheduling tool pays off.',
    cover: {
      photo: 'aisle',
      alt: 'Wide view of a warehouse with a forklift between two rows of full shelving',
    },
    body: [
      'Any tool can show a calendar of dock doors. The difference between a calendar and a scheduling system is what happens around each appointment.',
      '## Four questions to ask',
      'Can you express your own capacity rules, per door group and per time window? Can carriers book and reschedule without an account or a phone call? Does each booking capture the shipment data your team needs? Does the tool connect to your WMS and TMS, or will someone retype the data?',
      'Ask for a pilot on one site with real carriers. Two weeks of live bookings will tell you more than any demo.',
      'Finally, check the reporting. You should be able to see arrivals, dwell time and on-time performance per carrier without exporting to a spreadsheet.',
    ],
  },
  {
    slug: 'peak-season-playbook-for-receiving',
    title: 'Peak season playbook for receiving teams',
    category: 'Operations',
    author: 'Tom Becker',
    date: '2026-07-18',
    excerpt: 'Peak does not have to mean chaos at the gate. Plan capacity early, protect your best carriers and keep a buffer for the surprises.',
    cover: {
      photo: 'night',
      flop: true,
      tint: { r: 150, g: 180, b: 255 },
      alt: 'Distribution center seen from above at dusk, trucks waiting in the yard',
    },
    body: [
      'Volumes can double during peak while the number of doors stays the same. The sites that cope best decide their priorities before the first surge, not during it.',
      'Open the booking window earlier so carriers can secure slots. Reserve capacity for your most reliable carriers and for the lanes that feed promotions.',
      'Keep a buffer. Leave one door per shift unbooked for late trucks and urgent loads; it is cheaper than the overtime a single cascade of delays can cause.',
      'After each peak week, review what broke: which carriers missed their windows, which doors ran over, which rules were bypassed. Adjust before the next week starts.',
      'Communicate the plan. Carriers who know the rules in advance are far more likely to follow them.',
    ],
  },
  {
    slug: 'reading-your-dock-utilization-report',
    title: 'Reading your dock utilization report',
    category: 'Analysis',
    author: 'Priya Raman',
    date: '2026-07-07',
    excerpt: 'Utilization above 90% looks efficient but usually hides queues. Here is how to read the numbers and find the slack you really have.',
    cover: {
      photo: 'worker',
      crop: { left: 700, top: 0, width: 740, height: 809 },
      alt: 'Tall pallet racking loaded with wrapped goods in a dim warehouse',
    },
    body: [
      'Utilization is the share of time a door is occupied. It sounds like a number to maximize, but a door booked back to back has no room for a late truck.',
      'Read utilization by hour, not by day. A daily average of 70% can hide mornings at 100% with trucks waiting, and afternoons at 40%.',
      'Pair it with dwell time. Rising utilization with stable dwell time means you are using capacity better. Rising utilization with rising dwell time means you are building queues.',
      'Use the report to move bookings, not to add doors. Shifting a few appointments from the peak hour often buys more than a new door would.',
    ],
  },
  {
    slug: 'driver-check-in-self-service',
    title: 'Driver check-in: from paper logs to self-service',
    category: 'Operations',
    author: 'Tom Becker',
    date: '2026-06-26',
    excerpt: 'A clipboard at the guard shack costs minutes per truck. Self-service check-in timestamps arrivals and tells the yard team who is next.',
    cover: {
      photo: 'night',
      crop: { left: 0, top: 0, width: 1000, height: 560 },
      alt: 'Parking lot and truck yard of a logistics site at night, seen from above',
    },
    body: [
      'Paper check-in logs are slow and unreliable. Drivers queue at the window, times are written by hand, and nobody inside knows a truck has arrived until someone calls.',
      'With self-service check-in, drivers register on arrival from their phone or a kiosk. The appointment record picks up the timestamp and the yard team sees the truck immediately.',
      'The data pays off later: accurate arrival times make on-time performance and detention disputes a matter of fact, not memory.',
    ],
  },
  {
    slug: 'integrating-appointments-with-wms-and-tms',
    title: 'Integrating appointments with your WMS and TMS',
    category: "Buyer's guide",
    author: 'Maya Chen',
    date: '2026-06-15',
    excerpt: 'An appointment that knows the purchase order and the load saves retyping, errors and phone calls. Here is where to start.',
    cover: {
      photo: 'aisle',
      grayscale: true,
      crop: { left: 0, top: 0, width: 900, height: 806 },
      alt: 'Black and white photo of warehouse shelving and a forklift',
    },
    body: [
      'Scheduling in isolation creates a new silo. The dock knows when a truck is coming but not what is on it; the WMS knows what is expected but not when.',
      'Start with the purchase order or load number. When the booking carries it, the appointment can pull the expected lines from the WMS and the carrier details from the TMS.',
      'Next, send events back: arrival, door assigned, unload complete. Planners see progress without calling the dock, and receipts start as soon as the trailer is empty.',
      'Most integrations use EDI or an API. Ask your vendor which connectors already exist before you plan custom work.',
    ],
  },
  {
    slug: 'five-metrics-for-yard-managers',
    title: 'Five metrics every yard manager should track',
    category: 'Analysis',
    author: 'Daniel Okafor',
    date: '2026-06-04',
    excerpt: 'Dwell time, on-time arrivals, door turns, yard moves and detention paid: five numbers that tell you how your dock really runs.',
    cover: {
      photo: 'worker',
      alt: 'Warehouse worker pointing up at the racking in a dark warehouse aisle',
    },
    body: [
      'Yards generate plenty of data, but a few numbers explain most of what happens at the dock.',
      '## The five',
      'Dwell time from gate in to gate out. On-time arrival rate per carrier. Door turns per shift. Yard moves per trailer. Detention paid per week.',
      'Look at trends rather than single days. A carrier whose on-time rate slips over a month deserves a conversation before it becomes a detention dispute.',
      'Share the numbers with the carriers themselves. A monthly scorecard often improves punctuality more than any penalty.',
    ],
  },
  {
    slug: 'rolling-out-scheduling-across-a-network',
    title: 'Rolling out appointment scheduling across a network',
    category: 'Operations',
    author: 'Tom Becker',
    date: '2026-05-24',
    excerpt: 'Start with one site, prove the gains, then scale. A network rollout succeeds when each facility keeps its own rules.',
    cover: {
      photo: 'aisle',
      crop: { left: 500, top: 100, width: 1200, height: 700 },
      tint: { r: 255, g: 220, b: 170 },
      alt: 'Warehouse aisle in warm light, forklift waiting between shelves of boxes',
    },
    body: [
      'Rolling out scheduling to every site at once is tempting and risky. Carriers, doors and habits differ from one facility to the next.',
      'Pick a pilot site with visible pain: long queues or high detention. Measure a baseline for two weeks, go live, and measure again.',
      'Scale with a template, not a copy. Each site keeps its own capacity rules while the network shares carrier accounts and reporting.',
      'Plan carrier communication centrally. One message to each carrier, listing the sites that switch and the date, avoids a flood of calls.',
      'Review the network monthly. Comparing sites side by side shows which rules work and which ones to share.',
    ],
  },
]
