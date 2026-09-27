# ai-editor/page — écran plein écran de l'éditeur IA (+ routes) — LLM context

> Propriétaire : editor-canvas · Figma : D0 (parcours), D1-D3, G1 · Mis à jour : 2026-09-27 (vague 3b-2, FOLLOWUPS #41)
> Possède aussi : `src/app/admin/editor/page.tsx`, `src/app/admin/editor/harness/` (page d'essai de dev) et
> `src/app/admin/editor/mock-scenario/` (route de dev : scénario de l'éditeur simulé).

## Utilité
L'écran `/admin/editor?page=<id>` (D1-D3), HORS de la coque de l'admin (ni Sidebar ni Top bar ; le layout de /admin, à
shell, pose tokens, polices, toasts et la garde < 1 024 px) : sidebar Claude (editor-sidebar) à gauche, aperçu
(../canvas) sur le reste, un magasin par écran. Et la page d'essai de développement `/admin/editor/harness`.

## Fichiers
- `EditorScreen.tsx` + `.module.css` — `<EditorStoreProvider>` + `<EditorSidebar />` + `<EditorCanvas>` ; Échap =
  tout désélectionner (`EscapeDeselects`).
- `resolve.ts` — `resolveEditorPage(config, param)` : PageDef du manifeste avec `aiEditor: true`, sinon null.
- `EditorScreen.test.tsx` (jsdom) — câblage écran → magasin (`backHref`), sidebar et aperçu remplacés.
- `index.ts` — exports.
- `src/app/admin/editor/page.tsx` — route : `requireCapability('ai.editor')` EN PREMIER, `?page=` → PageDef sinon
  `notFound()`, `?back=` nettoyé (`sanitizeNextPath`) → `backHref` du magasin, libellés des zones (seule partie de
  zones.json envoyée au navigateur), URL d'aperçu imposée en dev. Titre « AI editor — <page> ».
- `src/app/admin/editor/harness/page.tsx` — page d'essai : `notFound()` hors `NODE_ENV=development`, puis
  `requireCapability('ai.editor')` ; réplique + `<Bridge parentOrigin="self">`.
- `src/app/admin/editor/harness/HarnessSite.tsx` + `harness.module.css` — réplique de l'accueil (nav, Hero, Features,
  FAQ, Get started ; textes du seed) marquée avec les VRAIES zones (data-edit, data-edit-doc, data-edit-key).
- `src/app/admin/editor/mock-scenario/route.ts` + `route.test.ts` — route de DÉVELOPPEMENT (FOLLOWUPS #41, modèle :
  /admin/publish/mock-scenario) : 404 JSON sauf `ENGINE_MOCK=1` ET `NODE_ENV=development` ; puis
  `requireCapability('ai.editor', 'route')`. `GET` → `{ scenario, scenarios }` (`editorMockScenario()`,
  `MOCK_EDITOR_SCENARIOS`) ; `POST { scenario }` (JSON ou formulaire, même origine sinon 403, inconnu → 400) →
  `setEditorMockScenario()` (mock/editor.ts, editor-sidebar) → `{ ok, scenario }`. Tout le processus ; fil et
  modifications gardés. `cache-control: no-store`.

## Contrats
- Entrées : `adminConfig.pages` (manifeste), `src/editor/zones.json` (libellés), session (droit `ai.editor`).
- Sorties : `EditorScreen` (props : `pageId`, `path`, `pageLabel`, `labels`, `backHref?`, `previewOverride?`).
- Dépend de : `../state` (EditorStoreProvider, editor-sidebar), `../sidebar` (`<EditorSidebar />` sans props),
  `../canvas`, `@/admin/editor-bridge`, `core/auth`.

## Comportement
- Page absente, inconnue ou sans `aiEditor` (ex. `blog`) → 404. Rôle sans `ai.editor` → 404 (garde de auth-core).
- « ‹ Admin » (G1, même page même onglet) : `?back=/admin/pages/home/seo` → `backHref` → `EditorStoreProvider` →
  magasin `backHref` (FOLLOWUPS #29), lu par l'en-tête de la sidebar ; absent → la sidebar revient à `/admin/pages/<id>`.
- URL d'aperçu en développement : `/admin/editor/harness` si `ENGINE_MOCK=1` ou `?harness=1` (jamais en production) ;
  sinon EditorState.preview du moteur.
- Échap dans l'admin : `clearSelection()` sauf si une couche l'a déjà pris (`defaultPrevented` : infobulle, menu) ou
  qu'une fenêtre modale est ouverte ; Échap dans l'aperçu : relayé par le pont.
- Page d'essai : la garde « écran d'ordinateur » de l'admin est neutralisée pour elle seule (`:has(.site)`), sinon les
  formats Tablet et Mobile de l'aperçu l'auraient masquée.

## Forces
- Route mince, contrôles serveur (droit, page, `back`) avant tout rendu ; aucune donnée sensible en props.
- Page d'essai fidèle aux vraies zones : le pont y est testé de bout en bout sans le moteur ni l'aperçu 4042.

## Faiblesses et limites connues
- La page d'essai n'est pas le vrai site (mise en page simplifiée, CSS recopié) : l'aperçu réel 4042 est à tester en vague 3.
- `/admin/editor/harness` s'affiche dans l'iframe en développement : le proxy y pose `X-Frame-Options: SAMEORIGIN` +
  `frame-ancestors 'self'` (`HARNESS_FRAME_HEADERS`) au lieu de `DENY` ; hors développement, la page n'existe pas.

## Points sensibles
- Garder `requireCapability('ai.editor')` en première ligne des deux pages ; `notFound()` de la page d'essai hors dev ;
  la route mock-scenario teste `ENGINE_MOCK=1` + développement AVANT la session (404 en production, rien de révélé).
- `back` : toujours passé par `sanitizeNextPath` (anti-redirection ouverte) ; la sidebar le renettoie.

## Pièges
- Next 16 : `searchParams` est une Promise (`await props.searchParams`).
- `backHref` n'est lu qu'à la création du magasin (`useState` dans EditorStoreProvider) : changer `?back=` sans
  remonter l'écran ne le met pas à jour (sans effet en pratique : on arrive toujours par un lien).
- Le layout de /admin (shell) fournit déjà `data-kz-admin`, les tokens et `ToastProvider` : pas de layout propre à
  l'éditeur (un second niveau doublerait le fournisseur de toasts).

## Comment modifier
- Autoriser l'éditeur sur une autre page : `aiEditor: true` dans src/admin.config.ts (site-adapter) + zones de la page.
- Ajouter une section à la page d'essai : `HarnessSite.tsx`, avec des zones EXISTANTES de zones.json.

## Tests
`npx vitest run src/admin/features/ai-editor/canvas src/admin/features/ai-editor/page` : `resolveEditorPage` (page
connue, sans éditeur, absente, tableau, valeur hostile), l'aperçu (../canvas) et `EditorScreen` (`backHref` transmis au
magasin, null sans `back`). Playwright : voir ../canvas/CLAUDE.md.
`npx vitest run src/app/admin/editor` : route mock-scenario (#41) — 404 hors dev / sans ENGINE_MOCK (session non lue),
GET (scénario + liste, droit `ai.editor`), POST JSON puis formulaire (scénario du processus changé), 400 inconnu ou
corps illisible, 403 autre origine, 401 / 403 de la session relayés.
À la main : `/admin/editor?page=home` (200), `?page=blog` (404), rôle client via `POST /admin/api/auth/dev-role` ;
scénario (ENGINE_MOCK=1) : `curl -X POST -H 'content-type: application/json' -d '{"scenario":"no-claude"}'
http://127.0.0.1:4040/admin/editor/mock-scenario` avec le cookie de session (ids : ready, no-claude, preview-starting,
no-sanity-token, restore-pending).

## Décisions et « À trancher »
- Question 9 (ouvrir depuis le site public) : non, l'éditeur ne s'ouvre que depuis l'admin.
- Pas de layout dédié : celui de /admin suffit (garde < 1 024 px comprise, conforme au Figma).

## Demandes de contrat
Toutes faites (vérifiées le 2026-09-27) :
- ~~auth-core (`proxy-rules.ts`) : en-têtes d'iframe de `/admin/editor/harness` en développement~~ — `HARNESS_PATH` +
  `HARNESS_FRAME_HEADERS` si `NODE_ENV=development`.
- ~~pages (C1, C2, C6) : lien « Open in AI editor » avec `back`~~ — `pages/lib/manifest.ts > editorHref(pageId, back)`.
- ~~orchestrateur (FOLLOWUPS) : piège Chrome « Local Network Access »~~ — noté (FOLLOWUPS #35).
