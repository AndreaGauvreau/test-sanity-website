# editor-bridge — pont de l'aperçu (dans le site) — LLM context

> Propriétaire : editor-canvas · Figma : D1-D3 (docs/admin/figma/screens/D1.md), G2 (curseurs), fiche Canvas selection
> · Contrats : core/contracts/zones.ts (data-edit*), core/contracts/engine.ts (ElementTarget) · Mis à jour : 2026-09-27

## Utilité
Le petit programme qui tourne DANS le site, en mode aperçu de l'éditeur IA (`KZ_EDITOR_PREVIEW=1`, serveur 4042 du
moteur), et dans la page d'essai `/admin/editor/harness` (dev). Il dialogue par postMessage avec l'écran de l'éditeur
(`/admin/editor`, parent) : survol, clic de sélection, Maj + clic, Échap, contours et étiquettes (« Hero · Title »),
reflet pendant le travail, cadre « … — modified by Claude », rechargement des données (`router.refresh`).
Il ne fait RIEN sur le site public : `<EditorBridge />` n'est rendu par le layout du site qu'en mode aperçu, et reste
inerte hors d'une iframe ou sans `ADMIN_ORIGIN` valide.

## Fichiers
- `index.tsx` — Server Component `<EditorBridge />` (sans props, monté par src/app/(site)/layout.tsx) : lit `ADMIN_ORIGIN`,
  calcule les libellés depuis src/editor/zones.json et rend `<Bridge>`.
- `Bridge.tsx` — composant client : crée/démarre/arrête le runtime, lui passe `router.refresh`. `parentOrigin="self"` =
  même origine que la page (page d'essai).
- `runtime.ts` — `BridgeRuntime` (classe sans React, testée en jsdom) : écoute, curseurs, sélection, dessin.
- `overlay.ts` — `Overlay` : contours et étiquettes dans un Shadow DOM, `pointer-events: none`.
- `dom.ts` — repérage : `selectableFrom`, `targetFromElement`, `findTargetElement` (clé → rang → doc).
- `protocol.ts` — PUR, importé des deux côtés : types des messages, `parseEditorMessage` / `parseBridgeMessage`,
  `normalizeOrigin`, `sameTargetRef`.
- `zones.ts` — PUR : `zoneLabels(zonesFile)`, `toElementTarget(ref, labels)`, `toTargetRef(target)`.
- `protocol.test.ts`, `runtime.test.ts` — tests.

## Contrats
- Montage (site-adapter) : `<EditorBridge />` sans props ; signature inchangée (ex-stub). C'est maintenant un Server
  Component (il lit `process.env.ADMIN_ORIGIN`) : ne pas l'importer depuis un composant client.
- Protocole v1 (`protocol.ts`), enveloppe `{ source, v: 1, type }` :
  - parent → pont (`source: 'kz-editor'`) : `sync { view: BridgeView }` (idempotent : mode, locked, scale, selection,
    working, review — références `{ zone, index, doc?, key? }`, 8 au plus par liste) ; `refresh`.
  - pont → parent (`source: 'kz-bridge'`) : `hello` (au démarrage) ; `ready { path }` (au premier `sync`) ;
    `select { target, additive }` ; `escape`.
- Poignée de main : pont `hello` → parent `sync` → pont `ready` → parent `bridgeReady = true`. Le parent renvoie aussi
  `sync` sur `load` de l'iframe (au cas où `hello` serait parti avant son écoute).
- Marquage lu : `data-edit` (zone connue de zones.json seulement), `data-edit-doc` (ancêtre), `data-edit-key`.
- Utilisé par : features/ai-editor/canvas (protocole, libellés), src/app/admin/editor (libellés, page d'essai).

## Comportement
- Origines vérifiées des deux côtés : le pont n'accepte que `event.origin === ADMIN_ORIGIN` ET
  `event.source === window.parent`, ne poste que vers `ADMIN_ORIGIN` (jamais « * »). Messages validés champ par champ
  (zone `^[A-Za-z][A-Za-z0-9]*(\.…)*$`, ids et clés `[A-Za-z0-9._-]{1,128}`, rang entier 0-999, échelle 0-1).
- Avant le premier `sync` : mode View implicite, rien n'est intercepté.
- View : aucun clic intercepté, curseurs du site, pas de survol ; sélection / cadre / reflet restent dessinés.
- Select (G2) : `html[data-kz-editor="select"]` → flèche partout, main (`data-kz-editor-hover`) seulement au survol d'un
  élément sélectionnable ; `user-select: none`. pointerdown / mousedown / click / auxclick / dblclick / submit neutralisés
  en capture ; clic → `select` de la zone connue la plus proche (une zone inconnue est traversée vers son parent) ;
  Maj + clic → `additive: true`. Clavier : Entrée / Espace sur un élément focalisé dans une zone = sélection ; le focus
  (Tab) montre le contour de survol.
- Travail en cours (`locked`) : `data-kz-editor="locked"` (flèche partout), aucun survol, clics neutralisés, rien n'est
  envoyé ; seul le reflet est dessiné (la sélection est masquée).
- Échap (tous modes) → `escape` au parent (le focus est dans l'iframe : l'admin ne voit pas la touche).
- Dessin (Figma Canvas selection) : survol = trait 1 px sans étiquette ; sélection = 1,5 px + étiquette interactive/primary
  au-dessus (Body Small, radius/sm) ; travail = + fond bg/tint/info 14 %, loader dans l'étiquette, reflet balayant
  (transform seulement, 2,4 s ease-in-out, pause) ; à valider = sélection + « — modified by Claude ». Marge de 6 px autour
  de l'élément (Figma 572 × 58 autour de 560 × 46). Étiquette passée à l'intérieur si l'élément touche le haut.
- Échelle : `--k = 1 / scale` grossit traits, marges et étiquettes pour garder la taille Figma à l'écran une fois
  l'iframe réduite par l'admin (Desktop 1280 → ~1080).
- Redessin : scroll (capture), resize, transitionend / animationend, ResizeObserver (document + éléments dessinés),
  MutationObserver (body) → UNE image demandée au plus ; aucune boucle rAF permanente (dette du POC réglée).
- Nouvelle cible `working` / `review` hors de la vue : l'iframe défile jusqu'à elle (smooth, instantané en mouvement réduit),
  par `window.scrollTo` de l'iframe (voir Pièges).
- `refresh` → `router.refresh()` (un brouillon Sanity ne passe pas par le HMR).

## Forces
- Protocole pur et strict, partagé par les deux côtés, testé (messages mal formés, origines, sources).
- Runtime sans React, entièrement testé en jsdom (27 tests avec le protocole) ; `stop()` rend le document intact.
- Aucun port en dur : l'origine vient de `ADMIN_ORIGIN` (ou de la page elle-même pour la page d'essai).
- zones.json n'est jamais envoyé au navigateur : seuls les libellés le sont.

## Faiblesses et limites connues
- Un élément qui bouge par une animation CSS continue (sans fin de transition ni mutation) peut laisser son contour en
  retard jusqu'au prochain événement.
- Le rang (`index`) est celui de l'occurrence dans le DOM ; la clé passe avant, mais une zone répétée SANS clé et
  réordonnée désignerait un autre élément (aucune n'existe aujourd'hui sur Conduit).
- Navigation client dans l'aperçu (mode View) vers une autre page : le pont suit (layout commun), mais la demande part
  avec le `page` de l'éditeur ; le canvas ne bloque pas la sélection sur une autre page (à trancher).
- Couleurs du calque recopiées des tokens de l'admin (le site ne les a pas) : à mettre à jour avec tokens.css.

## Points sensibles
- JAMAIS `postMessage(…, '*')`, jamais d'acceptation sans double contrôle origine + source.
- JAMAIS de texte du site dans un message : seulement des références ; le parent recalcule les libellés.
- JAMAIS `innerHTML` dans le calque (textes des étiquettes par nœuds texte).
- `ADMIN_ORIGIN` doit être l'origine exacte de l'admin (même valeur que `frame-ancestors` du proxy d'aperçu) ; absente ou
  invalide → pont inerte + un `console.warn`.

## Pièges
- `scrollIntoView` dans une iframe de même origine (page d'essai) fait aussi défiler le document de l'admin : on
  utilise `window.scrollTo` de l'iframe.
- Les libellés reçus en props changent d'identité à chaque `router.refresh` : ils sont figés dans une ref, sinon le pont
  redémarrerait (et referait la poignée de main) à chaque rafraîchissement.
- MutationObserver : nos propres ajouts (hôte du calque, style) sont filtrés ; les changements dans le Shadow DOM ne sont
  pas observés depuis le document (voulu).
- jsdom n'a ni `CSS.escape` utile ni mise en page : le repérage filtre par `getAttribute` (aucun sélecteur construit) et
  les tests simulent `getBoundingClientRect`.

## Comment modifier
- Nouveau message : type dans `protocol.ts` + branche dans `parseEditorMessage` / `parseBridgeMessage` + test ; côté parent
  `canvas/channel.ts`. Changer `PROTOCOL_VERSION` si l'ancien parent ne comprendrait pas.
- Nouveau style de contour : CSS dans `overlay.ts` (`BoxKind`) + choix dans `runtime.ts > render`.
- Curseurs : `CURSOR_CSS` dans `runtime.ts`.

## Tests
`npx vitest run src/admin/editor-bridge` — protocole (messages valides / mal formés / mauvaise version / sens inverse,
origines), libellés, poignée de main (hello vers ADMIN_ORIGIN, ready unique), origines et sources refusées, refresh, mode
View, Select (clic, zone traversée, lien et formulaire neutralisés, Entrée), Maj + clic (clé, rang, doc), verrouillage
(pas de sélection ni de survol, curseur locked), calque (étiquettes, suffixe, survol, Shadow DOM inerte), absence de
boucle d'images, `stop()`, repérage par clé après réordonnancement.
De bout en bout : `canvas/harness.e2e.test.ts` (voir ../features/ai-editor/canvas/CLAUDE.md).

## Décisions et « À trancher »
- Parent source de vérité de la sélection : le pont ENVOIE un clic, le parent décide (magasin, verrou) et renvoie l'état.
- Échap relayé par le pont (sinon perdu quand le focus est dans l'iframe).
- Cadre « à valider » bleu comme la sélection (Figma D3), pas l'anneau vert du POC.

## Demandes de contrat
- engine-core : lancer l'aperçu 4042 avec `ADMIN_ORIGIN=<origine de l'admin>` (le pont et le proxy d'aperçu en ont
  besoin) ; sinon le pont reste inerte et l'éditeur affiche « The draft preview isn't responding » au bout de 15 s.
