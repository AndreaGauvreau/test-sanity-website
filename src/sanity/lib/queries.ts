import { defineQuery } from 'next-sanity'

// Requêtes GROQ. `defineQuery` permet à `npm run typegen` de générer le type
// exact de chaque résultat (src/sanity/types.ts).

export const HOME_QUERY = defineQuery(`*[_type == "home" && _id == "home"][0]{
  title,
  subtitle,
  buttonLabel
}`)

export const POSTS_QUERY = defineQuery(`*[_type == "post" && defined(slug.current)] | order(publishedAt desc){
  _id,
  title,
  subtitle,
  "slug": slug.current,
  publishedAt,
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
  subtitle,
  "slug": slug.current,
  publishedAt,
  _updatedAt,
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
  subtitle,
  "slug": slug.current,
  "imageUrl": image.asset->url,
  "imageSize": image.asset->size
}`)
