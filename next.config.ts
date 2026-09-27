import type { NextConfig } from "next";

// Pas de serverActions.bodySizeLimit élevé (constat SEC-02) : les envois de fichiers de l'admin passent par des route
// handlers (/admin/media/upload, /admin/pages/<id>/image, /admin/settings/general/image), qui vérifient eux-mêmes le
// droit, l'origine et la taille. Les server actions, y compris celles du site public, gardent la limite par défaut (1 Mo).
//
// Pas d'indicateur de développement (bouton « N » de Next) : en bas à gauche, il couvrait l'avatar de la sidebar, l'aide
// « ⌘↵ to apply » de l'éditeur IA, et s'affichait DANS l'aperçu du brouillon (next dev du moteur, port 4042) que
// l'utilisateur juge et que le moteur capture. Les erreurs de compilation et d'exécution restent affichées par Next.
const nextConfig: NextConfig = {
  devIndicators: false,
};

export default nextConfig;
