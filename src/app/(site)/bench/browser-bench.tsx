'use client'

import { useState } from 'react'

import { apiVersion, dataset, projectId } from '@/sanity/env'
import { BENCH_QUERY } from '@/sanity/lib/queries'

import { formatMs, median, RUNS } from './stats'

type Row = { label: string; detail: string; samples: number[] }

const modes = [
  { label: 'API CDN', host: 'apicdn' },
  { label: 'API directe', host: 'api' },
]

const queryUrl = (host: string) =>
  `https://${projectId}.${host}.sanity.io/v${apiVersion}/data/query/${dataset}` +
  `?query=${encodeURIComponent(BENCH_QUERY)}&perspective=published&returnQuery=false`

// Les mêmes requêtes, lancées par le navigateur : la latence que verrait un
// composant client, ou un site sans serveur (export statique, SPA).
// `fetch` direct avec cache: 'no-store' : aucun appel ne sort du cache HTTP du navigateur.
export function BrowserBench() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setRunning(true)
    setError(null)
    try {
      const results: Row[] = []
      for (const mode of modes) {
        const url = queryUrl(mode.host)
        const samples: number[] = []
        for (let i = 0; i < RUNS; i++) {
          const start = performance.now()
          const res = await fetch(url, { cache: 'no-store' })
          if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
          await res.json()
          samples.push(performance.now() - start)
        }
        results.push({ label: mode.label, detail: `${mode.host}.sanity.io`, samples })
      }
      setRows(results)
    } catch (err) {
      const origin = window.location.origin
      // Une origine non autorisée échoue en erreur réseau (TypeError), sans détail.
      setError(
        err instanceof TypeError
          ? `Requête bloquée : ${origin} est-il autorisé par le projet Sanity ? npx sanity cors add ${origin}`
          : String(err),
      )
    } finally {
      setRunning(false)
    }
  }

  return (
    <>
      <p className="note">
        {RUNS} appels par mode, depuis cet onglet. Utile pour comparer avec la mesure serveur : ici
        s’ajoutent ta connexion et la distance jusqu’au point de présence du CDN.
      </p>
      <button type="button" className="button" onClick={run} disabled={running}>
        {running ? 'Mesure en cours…' : 'Mesurer depuis le navigateur'}
      </button>
      {error && <p className="error">{error}</p>}
      {rows && (
        <table style={{ marginTop: 24 }}>
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
            {rows.map((row) => (
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
      )}
    </>
  )
}
