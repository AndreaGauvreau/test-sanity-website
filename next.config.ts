import type { NextConfig } from "next";

// Pas de serverActions.bodySizeLimit élevé (constat SEC-02) : les envois de fichiers de l'admin passent par des route
// handlers (/admin/media/upload, /admin/pages/<id>/image, /admin/settings/general/image), qui vérifient eux-mêmes le
// droit, l'origine et la taille. Les server actions, y compris celles du site public, gardent la limite par défaut (1 Mo).
const nextConfig: NextConfig = {};

export default nextConfig;
