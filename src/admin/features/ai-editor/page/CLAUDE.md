# ai-editor/page — écran plein écran de l'éditeur IA (+ routes) — LLM context

> Propriétaire : editor-canvas · Figma : D0 (parcours), D1-D3, G1 · Mis à jour : 2026-09-27
> Possède aussi : `src/app/admin/editor/page.tsx` et `src/app/admin/editor/harness/` (page d'essai de dev).

## Utilité
L'écran `/admin/editor?page=<id>` (D1-D3), HORS de la coque de l'admin (ni Sidebar ni Top bar ; le layout de /admin, à
shell, pose tokens, polices, toasts et la garde < 1 024 px) : sidebar Claude (editor-sidebar) à gauche, aperçu
(../canvas) sur le reste, un magasin par écran. Et la page d'essai de développement `/admin/editor/harness`.

## Fichiers
- `EditorScreen.tsx` + `.module.css` — `<EditorStoreProvider>` + `<EditorSidebar />` + `<EditorCanvas>` ; Échap =
  tout désélectionner (`EscapeDeselects`).
- `resolve.ts` — `resolveEditorPage(config, param)` : PageDef du manifeste avec `aiEditor: true`, sinon null.
- `index.ts` — exports.
- `src/app/admin/editor/page.tsx` — route : `requireCapability('ai.editor')` EN PREMIER, `?page=` → PageDef sinon
  `notFound()`, `?back=` nettoyé (`sanitizeNextPath`) → `backHref` du magasin, libellés des zones (seule partie de
  zones.json envoyée au navigateur), URL d'aperçu imposée en dev. Titre « AI editor — <page> ».
- `src/app/admin/editor/harness/page.tsx` — page d'essai : `notFound()` hors `NODE_ENV=development`, puis
  `requireCapability('ai.editor')` ; réplique + `<Bridge parentOrigin="self">`.
- `src/app/admin/editor/harness/HarnessSite.tsx` + `harness.module.css` — réplique de l'accueil (nav, Hero, Features,
  FAQ, Get started ; textes du seed) marquée avec les VRAIES zones (data-edit, data-edit-doc, data-edit-key).

## Contrats
- Entrées : `adminConfig.pages` (manifeste), `src/editor/zones.json` (libellés), session (droit `ai.editor`).
- Sorties : `EditorScreen` (props : `pageId`, `path`, `pageLabel`, `labels`, `backHref?`, `previewOverride?`).
- Dépend de : `../state` (EditorStoreProvider, editor-sidebar), `../sidebar` (`<EditorSidebar />` sans props),
  `../canvas`, `@/admin/editor-bridge`, `core/auth`.

## Comportement
- Page absente, inconnue ou sans `aiEditor` (ex. `blog`) → 404. Rôle sans `ai.editor` → 404 (garde de auth-core).
- « ‹ Admin » (G1, même page même onglet) : `?back=/admin/pages/home/seo` → `backHref` ; absent → la sidebar revient à
  `/admin/pages/<id>`.
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
- `/admin/editor/harness` ne s'affiche pas dans l'iframe à la main tant que le proxy pose `X-Frame-Options: DENY` sur
  tout /admin (voir Demandes de contrat) ; le test Playwright contourne en retirant ces en-têtes.

## Points sensibles
- Garder `requireCapability('ai.editor')` en première ligne des deux pages ; `notFound()` de la page d'essai hors dev.
- `back` : toujours passé par `sanitizeNextPath` (anti-redirection ouverte) ; la sidebar le renettoie.

## Pièges
- Next 16 : `searchParams` est une Promise (`await props.searchParams`).
- Le layout de /admin (shell) fournit déjà `data-kz-admin`, les tokens et `ToastProvider` : pas de layout propre à
  l'éditeur (un second niveau doublerait le fournisseur de toasts).

## Comment modifier
- Autoriser l'éditeur sur une autre page : `aiEditor: true` dans src/admin.config.ts (site-adapter) + zones de la page.
- Ajouter une section à la page d'essai : `HarnessSite.tsx`, avec des zones EXISTANTES de zones.json.

## Tests
`npx vitest run src/admin/features/ai-editor/canvas` couvre `resolveEditorPage` (page connue, sans éditeur, absente,
tableau, valeur hostile) et l'écran via le canvas ; Playwright : voir ../canvas/CLAUDE.md.
À la main : `/admin/editor?page=home` (200), `?page=blog` (404), rôle client via `POST /admin/api/auth/dev-role`.

## Décisions et « À trancher »
- Question 9 (ouvrir depuis le site public) : non, l'éditeur ne s'ouvre que depuis l'admin.
- Pas de layout dédié : celui de /admin suffit (garde < 1 024 px comprise, conforme au Figma).

## Demandes de contrat
- **auth-core (`proxy-rules.ts`)** : en développement seulement (`NODE_ENV=development`), pour `/admin/editor/harness`,
  poser `X-Frame-Options: SAMEORIGIN` + `Content-Security-Policy: frame-ancestors 'self'` au lieu de `DENY` / `'none'`,
  pour que la page d'essai s'affiche dans l'iframe de l'éditeur sans outil.
- **pages (C1, C2, C6)** : le lien « Open in AI editor » vers `/admin/editor?page=<id>&back=<chemin courant>` (G1 :
  « ‹ Admin » ramène au même onglet).
- **orchestrateur (FOLLOWUPS)** : noter le piège Chrome « Local Network Access » (aperçu next dev dans une iframe) pour
  la vague 3 et pour l'utilisateur.
