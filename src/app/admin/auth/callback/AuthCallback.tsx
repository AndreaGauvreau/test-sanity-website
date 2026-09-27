'use client'

import { useEffect, useRef, useState } from 'react'

import styles from './callback.module.css'

/**
 * Le sid est lu et retiré de l'URL DÈS le chargement du module (comme le Studio, `consumeSessionId`) : le routeur de
 * Next peut réécrire le fragment à l'hydratation, et le sid ne doit rester ni dans l'historique ni dans un Referer.
 * Il est à usage unique : un seul POST, même sous React StrictMode (effet joué deux fois en dev).
 */
const SID_PATTERN = /sid=([^&]{20,})&?/

function consumeSid(): string | null {
  if (typeof window === 'undefined') return null
  const match = window.location.hash.match(SID_PATTERN)
  if (!match) return null
  const url = new URL(window.location.href)
  const rest = window.location.hash.replace(SID_PATTERN, '')
  url.hash = rest.length > 1 ? rest : ''
  window.history.replaceState(window.history.state, '', url)
  return match[1]
}

let pendingSid: string | null = consumeSid()

type State = { kind: 'working' } | { kind: 'error'; message: string }

export function AuthCallback() {
  const [state, setState] = useState<State>({ kind: 'working' })
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const sid = pendingSid ?? consumeSid()
    pendingSid = null
    const next = new URLSearchParams(window.location.search).get('next') ?? undefined
    if (!sid) {
      setState({ kind: 'error', message: 'Missing sign-in code. Please sign in again.' })
      return
    }
    void (async () => {
      try {
        const res = await fetch('/admin/api/auth/session', {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ sid, next }),
          credentials: 'same-origin',
        })
        const body = (await res.json().catch(() => null)) as
          | { ok: true; redirect: string }
          | { error?: { message?: string } }
          | null
        if (res.ok && body && 'ok' in body) {
          // Rechargement complet : le cookie de session s'applique à toute la coque.
          window.location.replace(body.redirect)
          return
        }
        const message = body && 'error' in body ? body.error?.message : undefined
        setState({ kind: 'error', message: message ?? 'Sign-in failed or expired. Please try again.' })
      } catch {
        setState({ kind: 'error', message: "Sanity isn't responding. Please try again in a moment." })
      }
    })()
  }, [])

  const next = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('next')
  const back = next ? `/admin/login?next=${encodeURIComponent(next)}` : '/admin/login'

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-live="polite" aria-busy={state.kind === 'working'}>
        {state.kind === 'working' ? (
          <>
            <span className={styles.spinner} aria-hidden="true" />
            <h1 className={styles.title}>Signing you in…</h1>
            <p className={styles.subtitle}>Checking your access in Sanity.</p>
          </>
        ) : (
          <>
            <h1 className={styles.title}>Couldn&apos;t sign you in</h1>
            <p className={styles.error} role="alert">
              {state.message}
            </p>
            <a className={styles.button} href={back}>
              Back to sign in
            </a>
          </>
        )}
      </section>
    </main>
  )
}
