import { defineEnableDraftMode } from 'next-sanity/draft-mode'

import { client } from '@/sanity/lib/client'
import { token } from '@/sanity/lib/token'

// Appelée par l'onglet « Aperçu live » de l'admin : vérifie la demande auprès de
// Sanity puis active le Draft Mode (le site affiche alors les brouillons).
export const { GET } = defineEnableDraftMode({
  client: client.withConfig({ token }),
})
