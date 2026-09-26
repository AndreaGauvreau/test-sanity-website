import { defineQuery } from 'next-sanity'

// Requêtes GROQ. `defineQuery` permet à `npm run typegen` de générer le type
// exact de chaque résultat (src/sanity/types.ts).

// Page Dock Scheduling (/) : tous ses textes, section par section. Le témoignage affiché
// est déréférencé ; sans choix dans l'admin, c'est le plus récent de la collection.
export const PAGE_QUERY = defineQuery(`*[_type == "dockSchedulingPage" && _id == "dockSchedulingPage"][0]{
  ...,
  testimonial{
    ...,
    "item": coalesce(item->, *[_type == "testimonial"] | order(_createdAt desc)[0]){
      _id,
      quote,
      name,
      role,
      company,
      caseStudyUrl
    }
  }
}`)

// Questions de la FAQ, dans l'ordre choisi. Une question sans réponse (brouillon en cours)
// n'est pas affichée, même dans l'aperçu.
export const FAQS_QUERY = defineQuery(`*[_type == "faq" && defined(answer)] | order(order asc){
  _id,
  question,
  answer
}`)

// Section « Learn and grow » : les quatre articles les plus récents, en cartes.
export const LATEST_POSTS_QUERY = defineQuery(`*[_type == "post" && defined(slug.current)] | order(publishedAt desc)[0...4]{
  _id,
  title,
  "slug": slug.current,
  category,
  publishedAt,
  "readingTime": round(length(pt::text(content)) / 5 / 180),
  image{
    alt,
    crop,
    hotspot,
    asset->{ _id, metadata{ lqip, dimensions{ width, height } } }
  }
}`)

// Temps de lecture en minutes : nombre de caractères du texte / 5 (≈ un mot) / 180 mots
// par minute. 0 pour un texte très court : le site affiche au moins 1.
export const POSTS_QUERY = defineQuery(`*[_type == "post" && defined(slug.current)] | order(publishedAt desc){
  _id,
  title,
  "slug": slug.current,
  category,
  publishedAt,
  "readingTime": round(length(pt::text(content)) / 5 / 180),
  image{
    alt,
    crop,
    hotspot,
    asset->{ _id, metadata{ lqip, dimensions{ width, height } } }
  }
}`)

export const POST_QUERY = defineQuery(`*[_type == "post" && slug.current == $slug][0]{
  _id,
  title,
  "slug": slug.current,
  category,
  publishedAt,
  excerpt,
  "readingTime": round(length(pt::text(content)) / 5 / 180),
  image{
    alt,
    crop,
    hotspot,
    asset->{ _id, metadata{ lqip, dimensions{ width, height } } }
  },
  content[]{
    ...,
    _type == "image" => {
      ...,
      asset->{ _id, metadata{ lqip, dimensions{ width, height } } }
    }
  }
}`)

export const POST_SLUGS_QUERY = defineQuery(`*[_type == "post" && defined(slug.current)]{
  "slug": slug.current
}`)

// Page /bench : la liste d'articles telle que le blog la lit, plus l'URL brute
// de chaque image pour mesurer le CDN d'images.
export const BENCH_QUERY = defineQuery(`*[_type == "post" && defined(slug.current)] | order(publishedAt desc){
  _id,
  title,
  category,
  "slug": slug.current,
  "imageUrl": image.asset->url,
  "imageSize": image.asset->size
}`)
