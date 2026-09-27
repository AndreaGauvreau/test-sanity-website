# ai-editor/canvas — aperçu de l'éditeur IA — LLM context

> Propriétaire : editor-canvas · Figma : D1, D2, D3 (docs/admin/figma/screens/), G1, G2 (curseurs, blocages), fiches
> CanvasSelection, EditorToolbar · Mis à jour : 2026-09-27 (vague 3, corrections)

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
- `ReviewBar.tsx` + `.module.css` — Figma D3 « to-validate » (sans message d'erreur propre : la sidebar l'affiche).
- `channel.ts` — `connectPreview` : écoute (origine + source + validation) et envoi (`sync`, `refresh`) côté parent.
- `view.ts` — `bridgeViewFrom(state, scale)` : état envoyé au pont, dérivé du magasin.
- `scale.ts` — `computeFrame(available, viewport)`, `VIEWPORTS`, `PREVIEW_MARGIN`, `floatingMaxWidth(frameWidth)`
  (cadre − 2 × `FLOATING_INSET` 12 px : largeur max de la barre de validation).
- `preview-url.ts` — `resolvePreview(url, origin, base)` : http(s) seulement, origine annoncée = origine de l'URL ;
  `previewKey(url)` (URL sans `kz_preview`), `previewTokenExpiry(url)` / `previewTokenExpired(url, now)` (échéance
  lue dans le jeton court `v1.<exp>.<uid>.<sig>`, marge 30 s ; sans jeton daté : jamais expiré).
- `index.ts` — exports.
- `logic.test.ts`, `EditorCanvas.test.tsx` (jsdom), `harness.e2e.test.ts` (Playwright, sur demande).

## Contrats
- Entrées : magasin de l'éditeur (`../state`, propriété d'editor-sidebar) — lit `path`, `mode`, `viewport`, `selection`,
  `job`, `pending`, `bridgeReady`, `previewNonce`, `preview`, `decisions`, `deciding` ; props `pageLabel`, `labels`
  (`ZoneLabels`), `previewOverride` (dev).
- Écrit dans le magasin, seulement par ses actions : `select`, `clearSelection`, `setMode`, `setViewport`,
  `setBridgeReady`, `setPreview` (si la sidebar ne l'a pas encore, ou jeton expiré au moment de recharger).
- Moteur : `engineClient.editor.state(path)` seulement (adresse de l'aperçu). Jamais `validate` / `cancel` : ✓ Validate
  / Cancel appellent `store.get().decisions` (enregistrées par la sidebar).
- `EditorState.preview.url` porte le jeton COURT d'accès à l'aperçu (`?kz_preview=v1.<exp>.<uid>.<sig>`, 15 min,
  `src/admin/core/engine/preview-token.ts`, SEC-09), renouvelé par le moteur à chaque GET /editor/state ; le proxy de
  l'aperçu le vérifie, pose le cookie `kz_preview` et redirige vers l'URL sans jeton.
- Protocole du pont : `@/admin/editor-bridge/protocol` (voir son CLAUDE.md).
- Utilisé par : ../page/EditorScreen.tsx.

## Comportement
- Adresse : `previewOverride` (dev) > `preview` du magasin (lu par la sidebar dans GET /editor/state) > appel direct du
  canvas (qui range le résultat dans le magasin). URL refusée (schéma, identifiants, origine discordante) → erreur.
- Jeton renouvelé : une nouvelle URL de même `previewKey` (même page, autre jeton) ne recharge PAS l'iframe (le cookie
  posé au chargement vaut encore) ; elle est gardée (`latestRef`) pour le prochain rechargement. Autre page → nouvelle
  adresse. Tout rechargement complet (« Try again », `previewNonce` sans pont) prend la plus récente ; si son jeton a
  expiré, le canvas relit d'abord GET /editor/state (et range le résultat dans le magasin).
- Mise à l'échelle : iframe à la largeur CSS du format (le site applique ses points de rupture), réduite par
  `transform: scale()` si elle ne tient pas (jamais agrandie), centrée ; hauteur allongée pour remplir la hauteur.
  Desktop dans 1080 px utiles → 0,84375 (Figma : preview 1080 × 860).
- États : « Loading draft preview… » (role=status) jusqu'au `ready` du pont ; pont muet 15 s (`BRIDGE_TIMEOUT_MS`) →
  « The draft preview isn't responding » + « Try again » (recharge l'iframe) ; moteur injoignable → « Couldn't load the
  draft preview » + message du moteur + « Try again » (relit l'état). Fondu de sortie (preset `fade`).
- Canal : `hello` → `sync` complet ; chaque changement du magasin → `sync` (dédoublonné par sérialisation) ; `ready` →
  `bridgeReady` ; `select` → `toElementTarget` (libellé recalculé, zone inconnue ignorée) → `store.select(target, additive)`
  (refusé par le magasin pendant le travail) ; `escape` → `clearSelection`.
- `previewNonce` qui change : `refresh` au pont s'il répond ET que le jeton chargé dans l'iframe (donc le cookie) n'a pas
  expiré (router.refresh, garde le défilement) ; sinon rechargement complet avec un jeton valide.
- Barre d'outils (G2) : View / Select grisés (opacité 0,4) pendant le travail ; Desktop / Tablet / Mobile toujours actifs.
  Infobulles « View », « Select », « Desktop », « Tablet », « Mobile » (Figma : icônes seules).
- Barre de validation (D3) : visible si `pending.status === 'to-validate'`, aucune demande active et des `decisions`
  enregistrées ; ✓ Validate / Cancel appellent ces actions de la sidebar (un seul chemin vers le moteur, fil mis à jour,
  erreur affichée dans la sidebar) ; `deciding` (magasin) met le bouton concerné en chargement et bloque l'autre, un
  second choix est ignoré. Sans sidebar : pas de barre. Entrée `slideDown` (200 ms ease-out), sortie 160 ms ; mouvement
  réduit → instantané (`useMotionVariants`).
- Largeur de la barre (QA-5) : au plus `floatingMaxWidth(largeur du cadre)` ; en Mobile (cadre 375) elle fait 351 px, le
  libellé passe sur deux lignes (`text-wrap: balance`), les boutons gardent leur taille. Desktop / Tablet : 386 px.
- Positions Figma : aperçu à 20 px ; barre de validation à 36 px du haut ; barre d'outils à 40 px du bas, centrées sur le
  canvas. Mesuré : barre d'outils 181 × 40 en (790, 820) comme la maquette ; étiquette de sélection 75 × 19 à l'écran ;
  barre de validation en Mobile de x = 705 à 1056 dans un cadre de 693 à 1068 (1440 × 900).
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
- Cookie de l'aperçu de 15 min, renouvelé à chaque requête acceptée (glissant, FOLLOWUPS #39) : seule une iframe restée
  inactive plus de 15 min peut voir une navigation refusée (403) ; le canvas ne le détecte pas (pas de `hello` d'un
  document refusé) tant qu'aucun rechargement n'a lieu. `previewNonce` et « Try again » repartent d'un jeton valide.
- La console de Chrome signale « allow-scripts + allow-same-origin can escape its sandboxing » : attendu (l'aperçu doit
  garder son origine pour son cookie) ; le bac à sable sert à interdire la navigation de la fenêtre de l'admin.

## Points sensibles
- Ne jamais accepter un message sans `event.source === iframe.contentWindow` ET `event.origin === origine de l'aperçu`.
- Ne jamais afficher un libellé venu du pont : `toElementTarget` le recalcule depuis zones.json.
- L'URL d'aperçu porte `?kz_preview=<jeton court>` (accès à l'aperçu pendant 15 min) : ne pas la journaliser ni
  l'afficher. Le secret racine ENGINE_PREVIEW_SECRET n'atteint jamais le navigateur (SEC-09).
- Ne jamais rappeler le moteur pour décider (Validate / Cancel) depuis le canvas : deux chemins divergeraient (fil de
  la sidebar non mis à jour, erreur invisible).

## Pièges
- Chrome, Local Network Access : `next dev` ne s'hydrate PAS dans une iframe tant que son WebSocket HMR vers 127.0.0.1
  est bloqué (erreur `ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS`) ; le pont ne démarre donc jamais. Il faut la
  permission « local network access » pour l'admin (Chrome la demande ; Playwright : `grantPermissions(['local-network-access'])`)
  et sa délégation à l'iframe (`allow="local-network-access"`). Concerne l'aperçu 4042 en local aussi.
- `overflow: hidden` reste défilable par `scrollIntoView` (fil de la sidebar) : l'écran entier montait. Conteneurs en
  `overflow: clip`.
- La sidebar a aussi une région « Change to validate » : la barre de l'aperçu s'appelle « Preview change to validate ».
- Comparer les adresses d'aperçu avec `previewKey`, jamais l'URL entière : le jeton change à chaque GET /editor/state
  (fin de demande, décision) et chaque changement de `src` rechargerait l'iframe (défilement perdu, pont relancé).
- Le canal (`connectPreview`) dépend de l'ORIGINE de l'aperçu, pas de l'objet adresse : un rechargement avec un
  nouveau jeton ne le recrée pas.
- La barre de validation est centrée sur le canvas, pas sur le cadre : c'est la largeur max (`floatingMaxWidth`) qui la
  garde dans le cadre (le cadre est centré dans la même bande, donc les centres coïncident).
- Le proxy (auth-core) pose `X-Frame-Options: DENY` sur tout /admin : la page d'essai ne s'affiche dans l'iframe qu'en
  retirant ces en-têtes (fait par le test Playwright ; demande de contrat pour le développement à la main).

## Comment modifier
- Nouveau format d'écran : contrat `Viewport` (orchestrateur) puis `VIEWPORTS` (scale.ts).
- Nouvel état de l'aperçu : `status` dans EditorCanvas.tsx + message dans `MESSAGES` (anglais) + test.
- Changer le délai du pont : `BRIDGE_TIMEOUT_MS`.
- Format du jeton d'aperçu modifié (preview-token.ts, auth-core) : ajuster `previewTokenExpiry` (preview-url.ts) et ses
  tests ; un format inconnu est traité comme « sans échéance » (pas de relecture anticipée, rien ne casse).
- Nouvelle barre flottante sur l'aperçu : la borner par `floatingMaxWidth(layout.width)` comme la barre de validation.

## Tests
- `npx vitest run src/admin/features/ai-editor/canvas` — échelle (Desktop / Tablet / Mobile, place nulle), URL d'aperçu,
  canal (origine, source, message mal formé, jamais « * »), état du pont (sélection, travail, à valider), verrouillage
  dans le magasin ; jsdom : chargement → ready, pont muet 15 s → erreur → Try again, moteur injoignable, URL imposée,
  refresh, clic / Maj + clic / Échap depuis le pont, messages d'une autre origine, verrouillage (sélection refusée, View /
  Select grisés, formats actifs), barre de validation (actions de la sidebar, masquée pendant le
  travail), barre d'outils ; FOLLOWUPS #29 (pas de barre ni d'appel moteur sans `decisions`, `deciding` bloque),
  QA-5 (largeur max en Mobile = 351 px, `floatingMaxWidth`), jeton court (URL acceptée, jeton renouvelé sans
  rechargement, « Try again » avec le plus récent, `previewNonce` avec jeton expiré → relecture puis rechargement).
- `npx vitest run src/admin/features/ai-editor/page` — `backHref` transmis au magasin par EditorScreen (#29).
- Playwright sur le serveur de dev (Chrome) : `EDITOR_E2E_URL=http://127.0.0.1:4040 npx vitest run
  src/admin/features/ai-editor/canvas/harness.e2e.test.ts` — survol (contour, main / flèche), clic (étiquette, lien
  neutralisé), Maj + clic (ajout / retrait), Échap dans l'aperçu et dans l'admin, View (lien actif), console sans erreur.
- À la main : http://127.0.0.1:4040/admin/editor?page=home (ENGINE_MOCK=1 → page d'essai ; voir « Pièges » pour l'iframe).

## Décisions et « À trancher »
- Validate / Cancel passent UNIQUEMENT par la sidebar (FOLLOWUPS #29, vague 3) : le repli « appel direct du moteur
  sans sidebar » est retiré (deux chemins, erreur affichée à deux endroits) ; sans `decisions`, pas de barre.
- Jeton court : l'iframe garde son adresse tant que la page ne change pas (pas de rechargement à chaque relecture de
  l'état) ; échéance lue dans le jeton (non vérifiée : le proxy de l'aperçu vérifie) pour choisir refresh / rechargement.
- QA-5 : barre bornée au cadre et libellé sur deux lignes en Mobile, plutôt qu'un libellé raccourci (même texte partout).
- En développement avec `ENGINE_MOCK=1` (ou `?harness=1`), l'aperçu pointe sur la page d'essai (décision de la route).

## Demandes de contrat
- Aucune sur les contrats partagés. Voir ../page/CLAUDE.md (proxy, lien « Open in AI editor »).
- ~~auth-core (proxy de l'aperçu, `proxy-rules.ts`) : renouvellement glissant du cookie `kz_preview`~~ — **fait**
  (vérifié le 2026-09-27, FOLLOWUPS #39) : jeton re-signé à chaque requête acceptée (`renewPreviewToken`).
