# ai-editor/canvas — aperçu de l'éditeur IA — LLM context

> Propriétaire : editor-canvas · Figma : D1, D2, D3 (docs/admin/figma/screens/), G1, G2 (curseurs, blocages), fiches
> CanvasSelection, EditorToolbar · Mis à jour : 2026-09-27

## Utilité
La partie droite de l'éditeur IA plein écran (`/admin/editor?page=<id>`, rôles kuartz / client / editor, droit
`ai.editor`) : l'iframe du site en brouillon (EditorState.preview), à 20 px des bords, en Desktop 1280 / Tablet 768 /
Mobile 375 réduit pour tenir ; la barre d'outils flottante (View / Select | Desktop / Tablet / Mobile) ; la barre
« Modified by Claude · to validate » (Cancel, ✓ Validate) ; le dialogue avec le pont (../../../editor-bridge).
Ne contient pas la conversation (sidebar, editor-sidebar) ni l'écran lui-même (../page).

## Fichiers
- `EditorCanvas.tsx` + `.module.css` — l'aperçu : adresse, mesure, iframe, états (chargement, erreur, pont muet), canal,
  barre de validation, barre d'outils, annonce `aria-live` de la sélection.
- `EditorToolbar.tsx` + `.module.css` — Figma « Editor toolbar » (2 SegmentedControl du kit + séparateur).
- `ReviewBar.tsx` + `.module.css` — Figma D3 « to-validate ».
- `channel.ts` — `connectPreview` : écoute (origine + source + validation) et envoi (`sync`, `refresh`) côté parent.
- `view.ts` — `bridgeViewFrom(state, scale)` : état envoyé au pont, dérivé du magasin.
- `scale.ts` — `computeFrame(available, viewport)`, `VIEWPORTS`, `PREVIEW_MARGIN`.
- `preview-url.ts` — `resolvePreview(url, origin, base)` : http(s) seulement, origine annoncée = origine de l'URL.
- `index.ts` — exports.
- `logic.test.ts`, `EditorCanvas.test.tsx` (jsdom), `harness.e2e.test.ts` (Playwright, sur demande).

## Contrats
- Entrées : magasin de l'éditeur (`../state`, propriété d'editor-sidebar) — lit `path`, `mode`, `viewport`, `selection`,
  `job`, `pending`, `bridgeReady`, `previewNonce`, `preview`, `decisions`, `deciding` ; props `pageLabel`, `labels`
  (`ZoneLabels`), `previewOverride` (dev).
- Écrit dans le magasin, seulement par ses actions : `select`, `clearSelection`, `setMode`, `setViewport`,
  `setBridgeReady`, `setPreview` (si la sidebar ne l'a pas encore), et en l'absence de sidebar `setPending(null)` +
  `refreshPreview()` après Cancel.
- Moteur : `engineClient.editor.state(path)` (si `preview` absent du magasin), `validate` / `cancel` (repli sans sidebar).
- Protocole du pont : `@/admin/editor-bridge/protocol` (voir son CLAUDE.md).
- Utilisé par : ../page/EditorScreen.tsx.

## Comportement
- Adresse : `previewOverride` (dev) > `preview` du magasin (lu par la sidebar dans GET /editor/state) > appel direct du
  canvas (qui range le résultat dans le magasin). URL refusée (schéma, identifiants, origine discordante) → erreur.
- Mise à l'échelle : iframe à la largeur CSS du format (le site applique ses points de rupture), réduite par
  `transform: scale()` si elle ne tient pas (jamais agrandie), centrée ; hauteur allongée pour remplir la hauteur.
  Desktop dans 1080 px utiles → 0,84375 (Figma : preview 1080 × 860).
- États : « Loading draft preview… » (role=status) jusqu'au `ready` du pont ; pont muet 15 s (`BRIDGE_TIMEOUT_MS`) →
  « The draft preview isn't responding » + « Try again » (recharge l'iframe) ; moteur injoignable → « Couldn't load the
  draft preview » + message du moteur + « Try again » (relit l'état). Fondu de sortie (preset `fade`).
- Canal : `hello` → `sync` complet ; chaque changement du magasin → `sync` (dédoublonné par sérialisation) ; `ready` →
  `bridgeReady` ; `select` → `toElementTarget` (libellé recalculé, zone inconnue ignorée) → `store.select(target, additive)`
  (refusé par le magasin pendant le travail) ; `escape` → `clearSelection`.
- `previewNonce` qui change : `refresh` au pont s'il répond (router.refresh, garde le défilement), sinon rechargement.
- Barre d'outils (G2) : View / Select grisés (opacité 0,4) pendant le travail ; Desktop / Tablet / Mobile toujours actifs.
  Infobulles « View », « Select », « Desktop », « Tablet », « Mobile » (Figma : icônes seules).
- Barre de validation (D3) : visible si `pending.status === 'to-validate'` et aucune demande active ; ✓ Validate / Cancel
  appellent les actions enregistrées par la sidebar (`decisions`, un seul chemin vers le moteur, erreur affichée dans la
  sidebar), `deciding` met le bouton concerné en chargement ; sans sidebar : appel direct et erreur sous la barre.
  Entrée `slideDown` (200 ms ease-out), sortie 160 ms ; mouvement réduit → instantané (`useMotionVariants`).
- Positions Figma : aperçu à 20 px ; barre de validation à 36 px du haut ; barre d'outils à 40 px du bas, centrées sur le
  canvas. Mesuré : barre d'outils 181 × 40 en (790, 820) comme la maquette ; étiquette de sélection 75 × 19 à l'écran.
- iframe : `sandbox="allow-scripts allow-same-origin allow-forms allow-popups"` (pas de navigation de la fenêtre de
  l'admin), `referrerPolicy="no-referrer"`, `allow="local-network-access"`, titre « Draft preview of <page> ».

## Forces
- Toute la logique hors React (échelle, URL, canal, état du pont) est pure et testée ; composant testé en jsdom.
- Une seule source de vérité (le magasin) ; le pont ne fait qu'afficher et proposer.
- Rendu comparé aux captures D1 / D2 / D3 (1440 × 900) : cadre, contours, étiquettes, barres aux positions Figma.

## Faiblesses et limites connues
- Pas d'animation au changement de format (iframe redimensionnée d'un coup : animer la largeur ferait recalculer la
  mise en page du site à chaque image).
- Le canvas et la sidebar peuvent tous deux appeler GET /editor/state au chargement (le canvas ne le fait que si la
  sidebar n'a pas encore rempli `preview`).
- Pas de garde « page différente » quand on navigue dans l'aperçu en mode View puis qu'on sélectionne (voir le pont).
- La console de Chrome signale « allow-scripts + allow-same-origin can escape its sandboxing » : attendu (l'aperçu doit
  garder son origine pour son cookie) ; le bac à sable sert à interdire la navigation de la fenêtre de l'admin.

## Points sensibles
- Ne jamais accepter un message sans `event.source === iframe.contentWindow` ET `event.origin === origine de l'aperçu`.
- Ne jamais afficher un libellé venu du pont : `toElementTarget` le recalcule depuis zones.json.
- L'URL d'aperçu peut porter `?kz_preview=<secret>` (cookie d'accès) : ne pas la journaliser ni l'afficher.

## Pièges
- Chrome, Local Network Access : `next dev` ne s'hydrate PAS dans une iframe tant que son WebSocket HMR vers 127.0.0.1
  est bloqué (erreur `ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS`) ; le pont ne démarre donc jamais. Il faut la
  permission « local network access » pour l'admin (Chrome la demande ; Playwright : `grantPermissions(['local-network-access'])`)
  et sa délégation à l'iframe (`allow="local-network-access"`). Concerne l'aperçu 4042 en local aussi.
- `overflow: hidden` reste défilable par `scrollIntoView` (fil de la sidebar) : l'écran entier montait. Conteneurs en
  `overflow: clip`.
- La sidebar a aussi une région « Change to validate » : la barre de l'aperçu s'appelle « Preview change to validate ».
- Le proxy (auth-core) pose `X-Frame-Options: DENY` sur tout /admin : la page d'essai ne s'affiche dans l'iframe qu'en
  retirant ces en-têtes (fait par le test Playwright ; demande de contrat pour le développement à la main).

## Comment modifier
- Nouveau format d'écran : contrat `Viewport` (orchestrateur) puis `VIEWPORTS` (scale.ts).
- Nouvel état de l'aperçu : `status` dans EditorCanvas.tsx + message dans `MESSAGES` (anglais) + test.
- Changer le délai du pont : `BRIDGE_TIMEOUT_MS`.

## Tests
- `npx vitest run src/admin/features/ai-editor/canvas` — échelle (Desktop / Tablet / Mobile, place nulle), URL d'aperçu,
  canal (origine, source, message mal formé, jamais « * »), état du pont (sélection, travail, à valider), verrouillage
  dans le magasin ; jsdom : chargement → ready, pont muet 15 s → erreur → Try again, moteur injoignable, URL imposée,
  refresh, clic / Maj + clic / Échap depuis le pont, messages d'une autre origine, verrouillage (sélection refusée, View /
  Select grisés, formats actifs), barre de validation (actions de la sidebar, repli moteur, erreur, masquée pendant le
  travail), barre d'outils.
- Playwright sur le serveur de dev (Chrome) : `EDITOR_E2E_URL=http://127.0.0.1:4040 npx vitest run
  src/admin/features/ai-editor/canvas/harness.e2e.test.ts` — survol (contour, main / flèche), clic (étiquette, lien
  neutralisé), Maj + clic (ajout / retrait), Échap dans l'aperçu et dans l'admin, View (lien actif), console sans erreur.
- À la main : http://127.0.0.1:4040/admin/editor?page=home (ENGINE_MOCK=1 → page d'essai ; voir « Pièges » pour l'iframe).

## Décisions et « À trancher »
- Validate / Cancel passent par la sidebar quand elle est là (un seul chemin, ajout additif d'editor-sidebar au magasin).
- En développement avec `ENGINE_MOCK=1` (ou `?harness=1`), l'aperçu pointe sur la page d'essai (décision de la route).

## Demandes de contrat
- Aucune sur les contrats partagés. Voir ../page/CLAUDE.md (proxy, lien « Open in AI editor »).
