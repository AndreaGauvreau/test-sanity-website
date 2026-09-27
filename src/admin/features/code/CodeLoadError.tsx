import { ContentArea, EmptyState, PageHeader } from '@/admin/ui'

/** B3 : Sanity illisible (réseau, jeton) — l'écran le dit au lieu d'une page d'erreur. Composant pur (serveur). */
export function CodeLoadError() {
  return (
    <ContentArea gap={24}>
      <PageHeader title="Code" description="Custom code added to every page, or to a selection of pages, of the published site." />
      <EmptyState
        icon="warning"
        title="Couldn't load the scripts"
        description="Sanity isn't responding. Reload the page in a moment."
        role="alert"
      />
    </ContentArea>
  )
}
