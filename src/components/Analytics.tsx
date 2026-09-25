import { GoogleTagManager } from '@next/third-parties/google'
import { draftMode } from 'next/headers'

// GTM charge GA4 (G-DE4VPDJ8CS) via un Google Tag « Initialization - All Pages ».
// Ne pas ajouter gtag.js en plus : chaque page_view serait compté deux fois.
// Les navigations internes de Next (pushState) sont comptées par la mesure améliorée
// de GA4 (« changements d'historique ») : pas de page_view manuel non plus.
const GTM_ID = 'GTM-KK83GHRF'

// Actif sur le déploiement de production Vercel uniquement (ni en dev, ni sur les
// previews), ou en local avec ENABLE_ANALYTICS=true pour tester.
const enabled = process.env.VERCEL_ENV === 'production' || process.env.ENABLE_ANALYTICS === 'true'

// RGPD : pas encore de bandeau cookies ni de Consent Mode v2. À ajouter avant d'utiliser
// ce setup sur un vrai site : le consentement par défaut doit être posé ici, AVANT GTM.
export async function Analytics() {
  if (!enabled) return null

  // Pas de mesure dans l'aperçu live de l'admin (Draft Mode) : ce ne sont pas des visiteurs.
  const { isEnabled: isDraftMode } = await draftMode()
  if (isDraftMode) return null

  return (
    <>
      <GoogleTagManager gtmId={GTM_ID} />
      <noscript>
        <iframe
          src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
          height="0"
          width="0"
          style={{ display: 'none', visibility: 'hidden' }}
        />
      </noscript>
    </>
  )
}
