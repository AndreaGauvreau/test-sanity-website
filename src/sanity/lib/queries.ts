import { defineQuery } from 'next-sanity'

// Requêtes GROQ. `defineQuery` permet à `npm run typegen` de générer le type
// exact de chaque résultat (src/sanity/types.ts).

// Page Dock Scheduling (/) : tous ses textes, section par section. Le témoignage affiché
// est déréférencé ; sans choix dans l'admin, c'est le premier de la collection dans l'ordre
// manuel (orderRank), puis le plus récent (dataset pas encore migré).
export const PAGE_QUERY = defineQuery(`*[_type == "dockSchedulingPage" && _id == "dockSchedulingPage"][0]{
  ...,
  testimonial{
    ...,
    "item": coalesce(item->, *[_type == "testimonial"] | order(coalesce(orderRank, "~") asc, _createdAt desc)[0]){
      _id,
      quote,
      name,
      role,
      company,
      caseStudyUrl
    }
  }
}`)

// Questions de la FAQ, dans l'ordre manuel (orderRank, glissé dans l'admin). Une question sans
// réponse (brouillon en cours) n'est pas affichée, même dans l'aperçu. Repli : l'ancien champ
// `order` (entier), pour un dataset pas encore migré (scripts/migrate-admin.ts) ; « ~ » range
// après toutes les clés une question sans orderRank.
export const FAQS_QUERY = defineQuery(`*[_type == "faq" && defined(answer)] | order(coalesce(orderRank, "~") asc, order asc){
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
    "alt": coalesce(alt, asset->altText),
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
    "alt": coalesce(alt, asset->altText),
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
  author,
  "readingTime": round(length(pt::text(content)) / 5 / 180),
  image{
    "alt": coalesce(alt, asset->altText),
    crop,
    hotspot,
    asset->{ _id, metadata{ lqip, dimensions{ width, height } } }
  },
  content[]{
    ...,
    _type == "image" => {
      ...,
      "alt": coalesce(alt, asset->altText),
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

// Réglages du site (B2, B3) : document unique « siteSettings ». Scripts actifs seulement.
export const SITE_SETTINGS_QUERY = defineQuery(`*[_type == "siteSettings" && _id == "siteSettings"][0]{
  title,
  description,
  allowIndexing,
  "faviconLight": faviconLight.asset->url,
  "faviconDark": faviconDark.asset->url,
  socialImage,
  "scripts": scripts[enabled != false]{ _key, name, placement, page, run, code }
}`)

// Page /blog : textes et SEO (document unique « blogPage »).
export const BLOG_PAGE_QUERY = defineQuery(`*[_type == "blogPage" && _id == "blogPage"][0]{
  _id,
  content,
  seo
}`)

// Modèle SEO des pages article d'une collection (C6), id fixe (« articleSeo-post »).
export const ARTICLE_SEO_QUERY = defineQuery(`*[_type == "articleSeoTemplate" && _id == $id][0]{
  metaTitle,
  metaDescription,
  ogImageField,
  ogImage,
  allowIndexing
}`)
