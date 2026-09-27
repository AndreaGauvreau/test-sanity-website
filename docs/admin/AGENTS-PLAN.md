# Organisation des agents

> 2026-09-27 · orchestrateur : la session principale. Architecture : `docs/admin/ARCHITECTURE.md`.

## Principes

- **Un agent = un type de tâche** (extraire, construire un kit, porter un moteur, construire une feature, relire). Pas
  d'agent par composant : un agent possède un domaine cohérent (une famille de composants, un sous-système, une feature
  de 1 à 5 écrans) et le mène jusqu'au bout, `CLAUDE.md` compris.
- **Propriété exclusive des fichiers** : chaque agent n'écrit que dans ses chemins. Les contrats partagés
  (`src/admin/core/contracts/`) sont figés ; un besoin de changement va dans « Demandes de contrat » de son `CLAUDE.md`.
- **Vagues** lancées une par une par l'orchestrateur, qui relit, intègre et fait un commit de jalon entre deux vagues.
- **Contrôle adverse** à la fin : intégration, sécurité, IA + documentation ; leurs constats repartent chez le propriétaire.
- **Aucun appel réel à Claude** pendant la construction (faux Claude dans les tests). Aucun serveur lancé ou arrêté par
  un agent : l'orchestrateur tient le serveur 4040 ; les agents s'en servent en lecture (captures Playwright).
- Chaque agent livre : code + tests + `CLAUDE.md` du module (modèle `docs/admin/CONTEXT-TEMPLATE.md`) + un compte rendu
  structuré (fichiers, tests, écarts au Figma, limites, demandes de contrat).

## Vague 0 — Lecture (faite)

| Agent | Tâche | Sortie |
|---|---|---|
| lecteur-site | Carte du site Conduit | `docs/admin/research/site-conduit.md` |
| lecteur-poc | Leçons du POC éditeur IA | `docs/admin/research/poc-editeur-ia.md` |
| extracteur-écrans | Écrans, états, LLM context, captures | `docs/admin/figma/screens`, `states`, `README.md` |
| extracteur-DS | Variables, composants, icônes | `docs/admin/figma/design-system/` |

Puis l'orchestrateur : dépendances, secrets locaux, dataset `development`, Vitest, contrats, ce plan.

## Vague 1 — Fondations (en parallèle)

| # | Rôle | Possède | Livre |
|---|---|---|---|
| 1 | **ui-foundations** | `src/admin/ui/` (tokens, polices, icônes, primitives), `src/app/admin/kit/` | Tokens `--k-*` depuis Figma, 76 icônes React, familles Actions / Feedback / Forms, presets d'animation, galerie de dev |
| 2 | **ui-composites** (après 1) | `src/admin/ui/` (composites) | Data display, Navigation (Sidebar, Top bar, Page header, Tabs, Menu…), Overlays (Modal, Drawer, Popover, Toast…), Model usage |
| 3 | **site-adapter** | `src/sanity/`, `src/app/(site)/`, `src/components/`, `src/app/studio/`, `src/app/api/revalidate/`, `src/admin.config.ts`, `src/editor/`, `src/styles/tokens.json`, `scripts/` | Schéma et migration, Studio sur `/studio`, mode aperçu de l'éditeur + `data-edit*`, manifeste, zones, rendu identique prouvé |
| 4 | **auth-core** | `src/admin/core/{auth,sanity,engine}/`, `src/proxy.ts`, `src/app/admin/api/{auth,engine}/`, `src/app/admin/auth/` | Connexion Sanity, session chiffrée, rôles, gardes, relais signé vers le moteur, moteur simulé (`ENGINE_MOCK`) |
| 5 | **engine-guards** | `engine/src/guards/` | Garde-fous du POC portés avec leurs tests, adaptés aux tokens, points de rupture et zones de Conduit |
| 6 | **engine-claude** | `engine/src/claude/`, `src/editor/RULES.md` | Pilotage de Claude (Agent SDK), outils MCP fixes, prompts en anglais, questions, `quoteData`, métrage du coût, faux Claude |
| 7 | **engine-core** (après 5 et 6) | `engine/src/{server,store,jobs,git,workspace,preview,content}/`, `engine/package scripts` | Serveur HTTP, file, cycle d'une demande, clone de travail, aperçu 4042, magasin Sanity des textes |
| 8 | **engine-publish** (après 7) | `engine/src/{publish,versions,usage}/` | Publication en 4 étapes, versions, abandon, diff, revalidation, journal `aiUsage` |

## Vague 2 — Features (en parallèle, après 2, 3 et 4 ; le moteur peut encore tourner)

| # | Rôle | Écrans | Possède |
|---|---|---|---|
| 9 | **shell** | A1, coque, garde < 1024 px | `src/admin/shell/`, `src/app/admin/layout.tsx`, `src/app/admin/(shell)/layout.tsx`, `src/app/admin/login/` |
| 10 | **settings** | B1 Overview, B2 General, B4 Team | `src/admin/features/{overview,general,team}/` + routes |
| 11 | **code-usage** | B3 Code + G6 scripts, B5 Usage | `src/admin/features/{code,usage}/`, `src/admin/core/usage/` + routes |
| 12 | **pages** | C1 Content, C2 SEO, C6 page article | `src/admin/features/pages/` + routes |
| 13 | **cms-media** | C3, C4 (drawer), G5, C5 Media | `src/admin/features/{cms,media}/` + routes |
| 14 | **publish-ui** | E1, E2, G3 (Top bar) | `src/admin/features/publish/` + routes, `core/engine/mock/publish.ts` |
| 15 | **editor-sidebar** | D1-D3 sidebar, G2 (9 états) | `src/admin/features/ai-editor/sidebar/`, `core/engine/mock/editor.ts` |
| 16 | **editor-canvas** | D1-D3 aperçu, G1, barre d'outils | `src/admin/features/ai-editor/{canvas,page}/`, `src/admin/editor-bridge/`, route `/admin/editor` |
| 17 | **ask-ai** | G4 | `src/admin/features/ask-ai/`, `engine/src/ask/`, `core/engine/mock/ask.ts` |

## Vague 3 — Contrôle adverse, puis corrections

| # | Rôle | Regard |
|---|---|---|
| 18 | **qa-integration** | Typecheck, tests, build ; chaque écran dans les deux rôles contre les captures Figma ; parcours bout en bout avec le moteur simulé puis le vrai moteur (faux Claude) |
| 19 | **security-review** | Session et droits, jetons, relais du moteur, pont iframe, isolation de Claude, injection par le contenu, scripts du site (XSS), chemins, CSRF |
| 20 | **ai-docs-critic** | Invariants du moteur (§ 6 de l'architecture, 26 corrections et 19 pièges du POC) et complétude des `CLAUDE.md` |

Les constats vérifiés repartent chez l'agent propriétaire (même rôle, nouvel appel avec la liste), puis qa-integration
revérifie. Au plus deux tours ; ce qui reste devient une limite documentée dans le `CLAUDE.md` concerné.

## Règles communes données à chaque agent

1. Lire : `docs/admin/ARCHITECTURE.md`, ce plan (sa ligne), `src/admin/core/contracts/`, les fichiers Figma de ses écrans
   (`docs/admin/figma/…`, captures comprises), et `node_modules/next/dist/docs/` pour toute API Next.
2. Écrire seulement dans ses chemins. Ne jamais lancer ni arrêter de serveur, ne jamais committer, ne jamais afficher un
   secret, ne jamais appeler Claude pour de vrai.
3. Vérifier : `npx tsc --noEmit` (filtrer sur ses fichiers), `npx vitest run <ses dossiers>`, et pour l'UI, captures
   Playwright de ses routes sur http://127.0.0.1:4040 (session de dev) comparées aux captures Figma.
4. Finir par le `CLAUDE.md` de chaque module et le compte rendu structuré.
