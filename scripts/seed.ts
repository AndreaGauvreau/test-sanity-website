/**
 * Contenu de démo : la page d'accueil + 6 articles illustrés (site LyonDrive,
 * même textes de départ que payload-car-test).
 *
 *   npm run seed   (= sanity exec scripts/seed.ts --with-user-token)
 *
 * Relançable : ids fixes (createOrReplace) et images identiques d'un lancement
 * à l'autre, que Sanity dédoublonne. Attention, relancer remet le contenu de
 * démo à zéro : tes modifications sur ces documents sont écrasées et leurs
 * brouillons non publiés supprimés.
 */
import { getCliClient } from 'sanity/cli'
import sharp from 'sharp'

const client = getCliClient({ apiVersion: '2026-09-01' })

// --- Portable Text --------------------------------------------------------

let keyCounter = 0
const key = () => `k${(keyCounter++).toString(36).padStart(4, '0')}`

type Span = string | { text: string; marks?: string[] }
type MarkDef = { _key: string; _type: 'link'; href: string }

const block = (style: 'normal' | 'h2' | 'h3' | 'blockquote', children: Span[], markDefs: MarkDef[] = []) => ({
  _type: 'block',
  _key: key(),
  style,
  markDefs,
  children: children.map((child) => ({
    _type: 'span',
    _key: key(),
    text: typeof child === 'string' ? child : child.text,
    marks: typeof child === 'string' ? [] : (child.marks ?? []),
  })),
})
const p = (...children: Span[]) => block('normal', children)
const h2 = (text: string) => block('h2', [text])
const quote = (text: string) => block('blockquote', [text])
const bullet = (text: string) => ({ ...block('normal', [text]), listItem: 'bullet', level: 1 })

// --- Images -----------------------------------------------------------------
// Visuels générés (dégradé, formes floues, grain) à 2400×1600 (3:2, comme une photo)
// en JPEG : un poids proche d'une vraie photo pour les mesures du CDN, et un format
// différent du 1200×630 affiché, pour que le point focal (hotspot) change le cadrage.

const W = 2400
const H = 1600

const escapeXml = (value: string) =>
  value.replace(/[<>&'"]/g, (char) => `&#${char.charCodeAt(0)};`)

// Grain déterministe (même graine → même image → pas de doublon au re-seed).
function grain(seed: number) {
  let state = seed >>> 0
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const pixels = Buffer.alloc(W * H)
  for (let i = 0; i < pixels.length; i++) pixels[i] = 128 + Math.round((random() - 0.5) * 70)
  return sharp(pixels, { raw: { width: W, height: H, channels: 1 } }).toColourspace('srgb').png().toBuffer()
}

async function artwork(label: string, [from, to]: [string, string], seed: number) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${from}"/>
        <stop offset="1" stop-color="${to}"/>
      </linearGradient>
      <filter id="blur"><feGaussianBlur stdDeviation="120"/></filter>
    </defs>
    <rect width="100%" height="100%" fill="url(#bg)"/>
    <g filter="url(#blur)">
      <circle cx="${W * 0.78}" cy="${H * 0.3}" r="${H * 0.34}" fill="${to}" opacity="0.9"/>
      <circle cx="${W * 0.22}" cy="${H * 0.95}" r="${H * 0.45}" fill="#ffffff" opacity="0.18"/>
    </g>
    <text x="120" y="${H - 400}" font-family="Helvetica, Arial, sans-serif" font-size="132" font-weight="700" fill="#ffffff">${escapeXml(label)}</text>
  </svg>`

  const base = await sharp(Buffer.from(svg)).png().toBuffer()
  return sharp(base)
    .composite([{ input: await grain(seed), blend: 'soft-light' }])
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer()
}

async function uploadImage(label: string, colors: [string, string], seed: number, filename: string) {
  const buffer = await artwork(label, colors, seed)
  const asset = await client.assets.upload('image', buffer, { filename, contentType: 'image/jpeg' })
  console.log(`  image ${filename} → ${asset._id} (${Math.round(buffer.length / 1024)} Ko)`)
  return asset._id
}

const imageRef = (assetId: string, alt: string) => ({
  _type: 'image',
  asset: { _type: 'reference', _ref: assetId },
  alt,
})

// --- Contenu ----------------------------------------------------------------

const home = {
  _id: 'home',
  _type: 'home',
  title: 'Louez votre voiture à Lyon en 2 minutes',
  subtitle:
    'Citadines, SUV et utilitaires disponibles à Part-Dieu, Perrache et Saint-Exupéry. Sans frais cachés.',
  buttonLabel: 'Voir le blog',
}

type SeedPost = {
  slug: string
  title: string
  subtitle: string
  publishedAt: string
  label: string
  colors: [string, string]
  alt: string
  content: (images: { map: string }) => unknown[]
}

const posts: SeedPost[] = [
  {
    slug: 'road-trips-depuis-lyon',
    title: '5 road trips au départ de Lyon',
    subtitle: 'Beaujolais, Annecy, Vercors : nos itinéraires préférés pour un week-end.',
    publishedAt: '2026-09-18T08:00:00.000Z',
    label: 'Road trips',
    colors: ['#0f172a', '#e11d48'],
    alt: 'Visuel « Road trips » sur un dégradé bleu nuit et rouge',
    content: ({ map }) => [
      h2('Partir sans réfléchir'),
      p(
        'Lyon est idéalement placée pour rayonner : en moins de deux heures, vous êtes au bord d’un lac, au cœur des vignes ou en pleine montagne.',
      ),
      p('Nos agences Part-Dieu et Perrache ouvrent dès 7h pour que vous puissiez prendre la route avant les bouchons.'),
      h2('Nos cinq itinéraires'),
      bullet('Les Pierres Dorées du Beaujolais, à 45 minutes'),
      bullet('Annecy et son lac, à 1 h 40'),
      bullet('Le Vercors par les routes du Royans, à 1 h 30'),
      bullet('Pérouges et les étangs de la Dombes, à 45 minutes'),
      bullet('Le massif du Pilat, à 1 heure'),
      {
        ...imageRef(map, 'Visuel « Itinéraires » sur un dégradé ardoise et orange'),
        _key: key(),
        caption: 'Cinq destinations à moins de deux heures de route.',
      },
      quote('Le meilleur moment pour partir ? Le vendredi à 7 h, avant que la ville se réveille.'),
      block(
        'normal',
        [
          'Réservez en ligne, ',
          { text: 'sans frais cachés', marks: ['strong'] },
          ', puis ',
          { text: 'choisissez le bon véhicule', marks: ['link-choisir'] },
          ' pour votre trajet.',
        ],
        [{ _key: 'link-choisir', _type: 'link', href: '/blog/choisir-sa-voiture' }],
      ),
    ],
  },
  {
    slug: 'choisir-sa-voiture',
    title: 'Bien choisir sa voiture de location',
    subtitle: 'Citadine, SUV ou utilitaire : le guide pour ne pas se tromper.',
    publishedAt: '2026-09-10T08:00:00.000Z',
    label: 'Choisir sa voiture',
    colors: ['#1e1b4b', '#e11d48'],
    alt: 'Visuel « Choisir sa voiture » sur un dégradé indigo et rouge',
    content: () => [
      h2('Le bon véhicule pour le bon trajet'),
      p('Pour circuler dans la Presqu’île, une citadine reste imbattable. Pour la montagne, privilégiez un SUV équipé.'),
      p('Pensez aussi au kilométrage inclus et aux options d’assurance avant de valider votre réservation.'),
    ],
  },
  {
    slug: 'demenager-avec-un-utilitaire',
    title: 'Déménager à Lyon avec un utilitaire',
    subtitle: 'Volume, permis B, stationnement : tout prévoir pour un déménagement sans stress.',
    publishedAt: '2026-09-02T08:00:00.000Z',
    label: 'Déménager',
    colors: ['#172554', '#0ea5e9'],
    alt: 'Visuel « Déménager » sur un dégradé bleu marine et ciel',
    content: () => [
      h2('Quel volume choisir ?'),
      p('Comptez environ 10 m³ pour un studio et 20 m³ pour un trois-pièces. Tous nos utilitaires se conduisent avec le permis B.'),
      p('Réservez en début de semaine : les samedis de fin de mois partent vite.'),
      h2('Le jour J'),
      p('Pensez à réserver une place devant chez vous auprès de votre mairie d’arrondissement : un camion bien garé fait gagner une heure.'),
    ],
  },
  {
    slug: 'crit-air-et-zfe',
    title: 'Crit’Air : louer l’esprit tranquille',
    subtitle: 'Vignette, zone à faibles émissions : ce qu’il faut savoir avant de prendre le volant.',
    publishedAt: '2026-08-26T08:00:00.000Z',
    label: 'Crit’Air',
    colors: ['#052e16', '#22c55e'],
    alt: 'Visuel « Crit’Air » sur un dégradé vert sapin et vert vif',
    content: () => [
      h2('Une flotte prête pour la ZFE'),
      p('Tous nos véhicules ont leur vignette Crit’Air et peuvent circuler dans la zone à faibles émissions de la Métropole.'),
      p('Vous partez de l’aéroport ? Rien à faire de votre côté : la vignette est déjà collée sur le pare-brise.'),
    ],
  },
  {
    slug: 'week-end-ski',
    title: 'Week-end au ski : la checklist',
    subtitle: 'Pneus hiver, coffre de toit, chaînes : partez équipé vers les Alpes.',
    publishedAt: '2026-08-14T08:00:00.000Z',
    label: 'Week-end ski',
    colors: ['#0c4a6e', '#7dd3fc'],
    alt: 'Visuel « Week-end ski » sur un dégradé bleu glacier',
    content: () => [
      h2('Avant de partir'),
      bullet('Vérifiez que le véhicule est équipé de pneus hiver'),
      bullet('Ajoutez un coffre de toit pour les skis'),
      bullet('Gardez des chaînes dans le coffre'),
      p('Toutes nos options hiver se réservent en ligne, jusqu’à la veille du départ.'),
    ],
  },
  {
    slug: 'aeroport-saint-exupery',
    title: 'Saint-Exupéry : vos clés en 5 minutes',
    subtitle: 'Notre comptoir à l’aéroport, nos horaires et nos conseils pour partir vite.',
    publishedAt: '2026-07-30T08:00:00.000Z',
    label: 'Saint-Exupéry',
    colors: ['#18181b', '#a855f7'],
    alt: 'Visuel « Saint-Exupéry » sur un dégradé anthracite et violet',
    content: () => [
      h2('Un comptoir au terminal 1'),
      p('Notre agence se trouve dans le hall des arrivées du terminal 1, face aux tapis à bagages.'),
      p('Enregistrez votre permis dans l’appli avant d’atterrir : il ne reste plus qu’à signer et récupérer les clés.'),
    ],
  },
]

async function seed() {
  const { projectId, dataset } = client.config()
  console.log(`Seed → projet ${projectId}, dataset ${dataset}`)

  console.log('Images :')
  const map = await uploadImage('Itinéraires', ['#1e293b', '#f97316'], 99, 'itineraires.jpg')

  const transaction = client.transaction().createOrReplace(home).delete('drafts.home')

  for (const [index, post] of posts.entries()) {
    const assetId = await uploadImage(post.label, post.colors, index + 1, `${post.slug}.jpg`)
    const id = `post-${post.slug}`
    transaction.delete(`drafts.${id}`).createOrReplace({
      _id: id,
      _type: 'post',
      title: post.title,
      subtitle: post.subtitle,
      slug: { _type: 'slug', current: post.slug },
      publishedAt: post.publishedAt,
      image: imageRef(assetId, post.alt),
      content: post.content({ map }),
    })
  }

  await transaction.commit()
  console.log(`Publié : page d'accueil + ${posts.length} articles.`)
}

seed().catch((error) => {
  console.error(error)
  process.exit(1)
})
