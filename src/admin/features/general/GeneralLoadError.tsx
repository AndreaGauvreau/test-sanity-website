import { ContentArea, EmptyState, PageHeader, buttonClassName, ButtonContent } from '@/admin/ui'

/** B2 · état d'erreur : Sanity injoignable ou jeton de lecture manquant au chargement de l'écran. Server Component. */
export function GeneralLoadError() {
  return (
    <ContentArea gap={20}>
      <PageHeader title="General" meta="Site settings" />
      <EmptyState
        icon="warning"
        title="Couldn't load the site settings"
        description="Sanity isn't responding. Your saved changes are safe; reload the page to try again."
        action={
          <a href="/admin/settings/general" className={buttonClassName({ variant: 'secondary', size: 'small' })}>
            <ButtonContent size="small">Reload</ButtonContent>
          </a>
        }
      />
    </ContentArea>
  )
}
