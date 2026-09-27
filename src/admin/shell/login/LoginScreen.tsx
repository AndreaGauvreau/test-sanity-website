import { ROLE_LABEL, type AdminRole } from '@/admin/core/contracts/roles'
import { ButtonContent, Callout, Icon, Tag, buttonClassName } from '@/admin/ui'

import { providerButtonLabel, sortProviders, type LoginProvider } from './providers'
import styles from './LoginScreen.module.css'

export const ACCESS_NOTE = 'Access is managed in Sanity by the site owner.'
export const NO_PROVIDER_MESSAGE = 'No sign-in method is available right now. Ask the site owner.'

export type LoginScreenProps = {
  site: { name: string; domain: string }
  providers: readonly LoginProvider[]
  /** Message d'erreur (anglais) : fournisseur injoignable, Sanity indisponible… */
  error?: string | null
  /** Lien « Try again » (même page, même `next`) quand les fournisseurs n'ont pas pu être chargés. */
  retryHref?: string
  /** Connexion de développement disponible (ADMIN_DEV_AUTOLOGIN suspendu par Log out) : rôles proposés. */
  dev?: { roles: readonly AdminRole[]; next: string } | null
}

/**
 * A1 · Log in (Figma 359:674) : carte 400 px centrée sur bg/app — logo (globe) · « Conduit — Admin » ·
 * « conduit.com/admin · Sign in with your Sanity account » · un bouton par fournisseur Sanity · note d'accès.
 * Composant serveur, sans JavaScript : chaque bouton est un lien vers /admin/api/auth/login (redirection serveur).
 */
export function LoginScreen({ site, providers, error, retryHref, dev }: LoginScreenProps) {
  const sorted = sortProviders(providers)
  const titleId = 'kz-login-title'
  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby={titleId}>
        <span className={styles.logo} aria-hidden="true">
          <Icon name="globe" size={18} />
        </span>
        <div className={styles.titles}>
          <h1 id={titleId} className={styles.title}>
            {site.name} — Admin
          </h1>
          <p className={styles.subtitle}>{site.domain}/admin · Sign in with your Sanity account</p>
        </div>

        {error ? (
          <Callout
            tone="error"
            role="alert"
            className={styles.callout}
            action={
              retryHref && sorted.length === 0 ? (
                <a href={retryHref} className={buttonClassName({ variant: 'ghost', size: 'small' })}>
                  <ButtonContent size="small">Try again</ButtonContent>
                </a>
              ) : undefined
            }
          >
            {error}
          </Callout>
        ) : null}

        {sorted.length > 0 ? (
          <ul className={styles.providers} aria-label="Sign-in methods">
            {sorted.map((provider) => (
              <li key={provider.name}>
                <a href={provider.href} className={buttonClassName({ variant: 'secondary', size: 'medium', block: true })}>
                  <ButtonContent size="medium">{providerButtonLabel(provider)}</ButtonContent>
                </a>
              </li>
            ))}
          </ul>
        ) : !error ? (
          <Callout tone="warning" className={styles.callout}>
            {NO_PROVIDER_MESSAGE}
          </Callout>
        ) : null}

        <p className={styles.note}>{ACCESS_NOTE}</p>
      </section>

      {dev && dev.roles.length > 0 ? (
        <form method="post" action="/admin/api/auth/dev-role" className={styles.dev} aria-label="Development sign-in">
          <input type="hidden" name="next" value={dev.next} />
          <Tag tone="warning">DEV ONLY</Tag>
          <span className={styles.devLabel}>Sign in as</span>
          {dev.roles.map((role) => (
            <button key={role} type="submit" name="role" value={role} className={buttonClassName({ variant: 'ghost', size: 'small' })}>
              <ButtonContent size="small">{ROLE_LABEL[role]}</ButtonContent>
            </button>
          ))}
        </form>
      ) : null}
    </main>
  )
}
