import type { Metadata } from 'next'
import { connection } from 'next/server'

import { LiveStatus } from '@/components/LiveStatus'
import { RenderStamp } from '@/components/RenderStamp'
import { client } from '@/sanity/lib/client'
import { sanityFetch } from '@/sanity/lib/live'
import { purgeSiteCache } from '@/sanity/lib/live-action'
import { BENCH_QUERY } from '@/sanity/lib/queries'

import { BrowserBench } from './browser-bench'
import { formatBytes, formatMs, median, RUNS } from './stats'

import './bench.css'

// Outil de mesure : hors des moteurs de recherche.
export const metadata: Metadata = { title: 'Bench lecture', robots: { index: false, follow: false } }

type QueryRow = { label: string; detail: string; samples: number[] }
type ImageVariant = { label: string; detail: string; url: string; accept: string }
type ImageRow = ImageVariant & { first: number; second: number; bytes: number; type: string; cache: string }

async function series(fn: (run: number) => Promise<unknown>) {
  const samples: number[] = []
  for (let run = 0; run < RUNS; run++) {
    const start = performance.now()
    await fn(run)
    samples.push(performance.now() - start)
  }
  return samples
}

// Pendant un rendu, Next renvoie la réponse déjà reçue pour une requête GET identique
// (memoization), même en `no-store`. Un signal par appel force une vraie requête.
const fresh = () => new AbortController().signal

async function loadImage(url: string, accept: string) {
  const start = performance.now()
  const res = await fetch(url, { headers: { accept }, cache: 'no-store', signal: fresh() })
  const body = await res.arrayBuffer()
  // cdn.sanity.io n'envoie ni x-cache ni cf-cache-status : `age` (même « 0 ») signale une copie en cache.
  const age = res.headers.get('age')
  return {
    ms: performance.now() - start,
    bytes: body.byteLength,
    type: res.headers.get('content-type') ?? '?',
    cache: age !== null ? `HIT (${age} s)` : 'MISS',
  }
}

// Deux appels : le premier peut déclencher la transformation, le second sort du cache du CDN.
async function measureImage(variant: ImageVariant): Promise<ImageRow> {
  const first = await loadImage(variant.url, variant.accept)
  const second = await loadImage(variant.url, variant.accept)
  return {
    ...variant,
    first: first.ms,
    second: second.ms,
    bytes: second.bytes,
    type: second.type,
    cache: `${first.cache} → ${second.cache}`,
  }
}

export default async function BenchPage() {
  // Mesures refaites à chaque visite : cette page n'est jamais mise en cache.
  await connection()

  const cdn = client.withConfig({ useCdn: true, stega: false })
  const api = client.withConfig({ useCdn: false, stega: false })

  const reference = await api.fetch(BENCH_QUERY, {}, { filterResponse: false, cache: 'no-store', signal: fresh() })
  const posts = reference.result
  const responseBytes = Buffer.byteLength(JSON.stringify(posts))

  const queries: QueryRow[] = [
    {
      label: 'API CDN',
      detail: 'apicdn.sanity.io, ce que lit le site (useCdn: true)',
      samples: await series(() => cdn.fetch(BENCH_QUERY, {}, { cache: 'no-store', signal: fresh() })),
    },
    {
      label: 'API directe',
      detail: 'api.sanity.io, toujours à jour, sans cache',
      samples: await series(() => api.fetch(BENCH_QUERY, {}, { cache: 'no-store', signal: fresh() })),
    },
    {
      label: 'Cache de données Next',
      detail: 'fetch mis en cache par Next : réseau au 1er appel, ensuite local',
      samples: await series(() =>
        cdn.fetch(BENCH_QUERY, {}, { next: { revalidate: 3600, tags: ['bench'] }, signal: fresh() }),
      ),
    },
    {
      label: 'sanityFetch',
      detail: 'ce qu’appellent les pages : lecture des sync tags (sans cache) + fetch en cache',
      // sanityFetch n'accepte pas de signal : un requestTag différent par appel évite la memoization.
      samples: await series((run) =>
        sanityFetch({ query: BENCH_QUERY, stega: false, requestTag: `bench.sanityFetch.${run}` }),
      ),
    },
  ]

  const source = posts.find((post) => post.imageUrl)
  const modern = 'image/avif,image/webp,*/*'
  const images: ImageRow[] = []
  if (source?.imageUrl) {
    const variants: ImageVariant[] = [
      { label: 'Original', detail: 'le fichier uploadé, sans transformation', url: source.imageUrl, accept: '*/*' },
      { label: 'JPEG 800 px', detail: '?w=800&fm=jpg&q=75', url: `${source.imageUrl}?w=800&fm=jpg&q=75`, accept: '*/*' },
      { label: 'WebP 800 px', detail: '?w=800&fm=webp', url: `${source.imageUrl}?w=800&fm=webp`, accept: '*/*' },
      { label: 'Auto 800 px', detail: '?w=800&auto=format, navigateur récent', url: `${source.imageUrl}?w=800&auto=format`, accept: modern },
      { label: 'Auto 1600 px', detail: '?w=1600&auto=format, écran retina', url: `${source.imageUrl}?w=1600&auto=format`, accept: modern },
    ]
    for (const variant of variants) images.push(await measureImage(variant))
  }

  return (
    <section className="bench">
      <h1>Bench lecture</h1>
      <p className="lead">
        Mesures prises par le serveur Next à chaque chargement de la page (
        {process.env.NODE_ENV === 'production' ? 'build de production' : 'mode dev'}). Requête testée :
        la liste du blog, {posts.length} articles, {formatBytes(responseBytes)} de JSON. Sanity l’exécute
        en {reference.ms} ms : le reste du temps, c’est le réseau jusqu’à l’API.
      </p>

      <h2>Requêtes GROQ</h2>
      <p className="note">
        {RUNS} appels d’affilée par mode. Les pages du site passent par <code>sanityFetch</code> ; en
        production, leur HTML est en plus mis en cache par Next, donc un visiteur n’attend aucune de
        ces requêtes.
      </p>
      <table>
        <thead>
          <tr>
            <th>Mode</th>
            <th className="num">1er appel</th>
            <th className="num">Médiane</th>
            <th className="num">Min</th>
            <th className="num">Max</th>
          </tr>
        </thead>
        <tbody>
          {queries.map((row) => (
            <tr key={row.label}>
              <td>
                <span className="strong">{row.label}</span>
                <small>{row.detail}</small>
              </td>
              <td className="num">{formatMs(row.samples[0])}</td>
              <td className="num strong">{formatMs(median(row.samples))}</td>
              <td className="num">{formatMs(Math.min(...row.samples))}</td>
              <td className="num">{formatMs(Math.max(...row.samples))}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Images</h2>
      {source ? (
        <>
          <p className="note">
            Même image source (« {source.title} », {formatBytes(source.imageSize ?? 0)} à l’upload),
            transformée à la volée par le CDN Sanity selon l’URL. Aucun traitement côté Next.
          </p>
          <table>
            <thead>
              <tr>
                <th>Variante</th>
                <th>Format reçu</th>
                <th className="num">Poids</th>
                <th className="num">1er appel</th>
                <th className="num">2e appel</th>
                <th>Cache CDN</th>
              </tr>
            </thead>
            <tbody>
              {images.map((row) => (
                <tr key={row.label}>
                  <td>
                    <span className="strong">{row.label}</span>
                    <small>{row.detail}</small>
                  </td>
                  <td>{row.type}</td>
                  <td className="num strong">{formatBytes(row.bytes)}</td>
                  <td className="num">{formatMs(row.first)}</td>
                  <td className="num">{formatMs(row.second)}</td>
                  <td>{row.cache}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <p className="note">Aucune image publiée pour l’instant : publie un article du blog dans l’admin.</p>
      )}

      <h2>Depuis ton navigateur</h2>
      <BrowserBench />

      <h2>Cache des pages</h2>
      <p className="note">
        Les pages gardent leurs données en cache jusqu’à ce qu’une publication les invalide. Ça marche
        tout seul quand un onglet du site ou l’admin embarqué est ouvert au moment de la publication.
        Si le contenu a changé sans aucun onglet ouvert (admin hébergé, seed, API), vide le cache ici.
      </p>
      <p className="note">
        Connexion au Live Content API : <LiveStatus />
      </p>
      <form action={purgeSiteCache}>
        <button type="submit" className="button">
          Vider le cache du site
        </button>
      </form>

      <RenderStamp />
    </section>
  )
}
