import zonesFile from '@/editor/zones.json'

import type { ZonesFile } from '../core/contracts/zones'
import { Bridge } from './Bridge'
import { normalizeOrigin } from './protocol'
import { zoneLabels } from './zones'

/**
 * Pont de l'aperçu de l'éditeur IA (iframe ⇄ admin, postMessage à origines vérifiées). Propriétaire : editor-canvas.
 *
 * Contrat de montage (site-adapter) : le layout du site (src/app/(site)/layout.tsx) rend `<EditorBridge />` sans
 * props, en fin de <body>, SEULEMENT en mode aperçu (KZ_EDITOR_PREVIEW=1). Les éléments portent data-edit /
 * data-edit-doc / data-edit-key (src/lib/editor/preview.ts, zones de src/editor/zones.json).
 *
 * Composant SERVEUR : il lit ADMIN_ORIGIN (jamais exposé en NEXT_PUBLIC_*) et ne passe au client que l'origine et
 * les libellés des zones (« Hero · Title »), pas le fichier zones.json entier.
 */
const LABELS = zoneLabels(zonesFile as unknown as ZonesFile)

export function EditorBridge() {
  return <Bridge parentOrigin={normalizeOrigin(process.env.ADMIN_ORIGIN)} labels={LABELS} />
}

export default EditorBridge
