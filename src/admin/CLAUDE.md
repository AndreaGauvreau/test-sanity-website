# Admin du site — carte des modules (LLM context racine)

> Propriétaire : orchestrateur · Mis à jour : 2026-09-27 · Architecture : `docs/admin/ARCHITECTURE.md`
> Spécification : `docs/admin/figma/` (écrans A1…E2, états G1…G6, Design System). Plan des agents : `docs/admin/AGENTS-PLAN.md`.

## Utilité

L'admin livré avec le site (`/admin`) : réglages, pages, CMS, médias, éditeur IA, Ask AI, publication. Interface en
anglais, desktop, thème sombre. Tout le code vit ici, isolé du site, pour devenir un paquet commun installé dans chaque
site Kuartz. Le site n'est connu que par `src/admin.config.ts` (type `AdminConfig`) et `src/editor/zones.json`.

## Modules

| Dossier | Rôle | Écrans |
|---|---|---|
| `core/contracts/` | Contrats partagés (types + fonctions pures) : rôles, session, manifeste, zones, API du moteur, formats | — |
| `core/auth/` | Connexion Sanity, session chiffrée, rôles, `requireSession` / `requireCapability` | A1 |
| `core/sanity/` | Clients Sanity serveur (lecture, écriture au nom de l'utilisateur) | — |
| `core/engine/` | Client du moteur IA, relais signé, moteur simulé (`ENGINE_MOCK`) | — |
| `core/usage/` | Journal `aiUsage` : lecture et agrégats | B5, G4 |
| `core/autosave.ts` | État « Draft saved automatically » partagé (fichier seul, pas de CLAUDE.md propre : contrat de l'orchestrateur, commenté en tête) | Top bar |
| `core/site-logo.ts` + `core/site-logo-src.ts` | Logo de la sidebar = favicon du site (dark d'abord) : adresse CDN 56 px (pur) et mise à jour sans rechargement depuis B2 (fichiers seuls, contrat de l'orchestrateur, commentés en tête) | Sidebar, B2 |
| `ui/` | Kit du Design System (tokens `--k-*`, icônes, composants) | tous |
| `shell/` | Coque : Sidebar, Top bar, garde < 1024 px | tous |
| `features/overview`, `general`, `team` | Réglages | B1, B2, B4 |
| `features/code`, `usage` | Scripts du site, consommation IA | B3 + G6, B5 |
| `features/pages` | Contenu et SEO des pages, modèle SEO d'article | C1, C2, C6 |
| `features/cms`, `media` | Collections (liste, fiche), médiathèque | C3, C4, G5, C5 |
| `features/publish` | Publication, versions, états de la Top bar | E1, E2, G3 |
| `features/ai-editor/page` | Écran plein écran `/admin/editor` : assemble le magasin, la sidebar et l'aperçu | D1-D3, G1 |
| `features/ai-editor/state` | Magasin partagé sidebar ⇄ aperçu (sélection, mode, taille, demande, modification en attente) | D1-D3 |
| `features/ai-editor/sidebar` | Conversation avec Claude (9 états) | D1-D3, G2 |
| `features/ai-editor/canvas` | Aperçu, sélection, barre d'outils | D1-D3, G1 |
| `features/ask-ai` | Assistant en lecture seule | G4 |
| `editor-bridge/` | Pont monté DANS le site en mode aperçu (`KZ_EDITOR_PREVIEW`) | D1-D3 |
| `live-edit/` | Bouton « Edit with AI » monté DANS le site en ligne (hors aperçu et Draft Mode), question 9 | D0, G1 |

Le moteur IA est hors de ce dossier : `engine/` (voir `engine/CLAUDE.md`).

## Invariants

- Chaque page serveur, server action et route handler commence par `requireSession()` ou `requireCapability()`
  (exceptions publiques d'auth-core : `/admin/api/auth/*` — connexion, et `editor-access` qui ne répond que
  `{ canEdit }` au bouton du site).
- Le jeton Sanity de l'utilisateur ne quitte jamais le serveur ; l'accès à Claude n'existe que dans le moteur.
- Structure figée : l'admin modifie des valeurs et des éléments de collection, jamais le schéma.
- Rien n'est en ligne sans Publish ; l'éditeur IA n'écrit que dans des brouillons (Sanity) et sur `draft` (git).
- Les contrats de `core/contracts/` ne changent que par l'orchestrateur (« Demandes de contrat » des modules).
- CSS Modules + tokens `--k-*` ; le CSS de l'admin ne s'importe que sous `src/app/admin/`. Seule exception :
  `live-edit/` (CSS Module local aux valeurs recopiées + `Icon` du kit), chargé à la demande sur le site.

## Chaque module

Chaque dossier du tableau (sauf le fichier `core/autosave.ts`) a son `CLAUDE.md` (modèle :
`docs/admin/CONTEXT-TEMPLATE.md`) : utilité, fichiers, contrats, comportement, forces, faiblesses, points sensibles,
pièges, recettes de modification, tests, décisions, demandes de contrat. Claude Code le charge dès qu'il lit un fichier
du dossier. Demandes croisées en cours : `docs/admin/FOLLOWUPS.md`.
