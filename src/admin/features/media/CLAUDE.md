# features/media — Médiathèque (Assets › Media) — LLM context

> Propriétaire : cms-media · Figma : C5 (docs/admin/figma/screens/C5.md), G5 (states/G5.md), fiches MediaCard,
> UsageTooltip, LockBadge, SelectionBar, FilterPopover · Mis à jour : 2026-09-28 (miniatures de l'Usage tooltip —
> copie nettoyée de la page en `srcdoc` —, aperçu de la fiche dans son ratio + grand aperçu, FOLLOWUPS #48)

## Utilité

`/admin/media` pour les trois rôles (droit `content.write`) : tous les assets Sanity du site (`sanity.imageAsset`,
`sanity.fileAsset` : images, vidéos, PDF…) en grille de Media cards ; savoir où chaque fichier est utilisé (« Used ×N »,
Usage tooltip avec une miniature du site par emplacement, fiche à droite) ; voir un fichier en grand ; envoyer, remplacer,
télécharger ; texte alternatif SUR L'ASSET (question 13) ; supprimer seulement ce qui ne sert plus. Sert aussi le champ
image des fiches CMS (route d'envoi, choix dans Media).
Ne fait pas : recadrage / point focal, dossiers ou étiquettes, vignettes des vidéos et PDF.

## Fichiers

- `lib/assets.ts` — PUR : `MediaAsset` (vue ; `preview` 576 px et `full` 2 400 px NON recadrés, `fit=max`), `mediaKind`,
  `typeLabel` (IMG/VIDEO/PDF/FILE), `usageLabel`, `assetMetaLine` (« JPG · 2400 × 1600 · 1.2 MB · added Sep 12 »),
  `librarySummary` (« 48 files · 312 MB »), tri / filtres / recherche (`applyMediaQuery`, `MEDIA_SORT_OPTIONS`,
  `MEDIA_FILTER_FIELDS`), garde (`isDeletable`, `partitionForDelete`, `lockReason`), `isAssetId`.
- `lib/usage.ts` — PUR : `findAssetPaths(doc, assetId)` (chemins `image`, `seo.ogImage`, `content[_key=="k"]`),
  `describeUsage` (libellés du manifeste : « Blog › Titre — Cover image », « Home › Hero — Background », « Site settings — … »
  + `preview`, voir `UsagePreview`), `usagesOf` (brouillon et publié d'un document comptés une fois).
- `lib/usage-preview.ts` — PUR (DOMParser du navigateur pour le nettoyage) : miniatures de l'Usage tooltip. Constantes
  (`MINIATURE` 278 × 124, `LIVE_PAGE_WIDTH` 1280, `LIVE_SCALE` 278/1280, `LIVE_PAGE_HEIGHT` 571, `MAX_LIVE_MINIATURES` 3,
  `LIVE_TIMEOUT_MS` 20 s), `miniatureModes`, `livePagePath`, `cleanPageHtml(html, baseHref)` (copie nettoyée),
  `assetHash`, `findAssetElements(doc, hash)`, `pickTarget`, `centerScroll`, `frameBox`, `containBox`, `fallbackArea`,
  `faviconLayout` / `FAVICON_STAGE`, `socialLayout` / `SOCIAL_STAGE`.
- `lib/preview.ts` — PUR : `previewRatio` (fiche), grand aperçu : `LIGHTBOX`, `lightboxBounds`, `lightboxImageSize`,
  `lightboxVideoWidth`, `lightboxModalWidth`, `originFrom` (origine de l'animation), `lightboxCaption`.
- `lib/upload-limits.ts` — PUR, partagé client / serveur : SEULE source des types et limites d'envoi : `UPLOAD_TYPES`,
  `UPLOAD_MAX_BYTES` (image 20 Mo, vidéo 100 Mo, fichier 50 Mo), `UPLOAD_MAX_BODY` (plus gros fichier + 1 Mo),
  `UPLOAD_ACCEPT`, `IMAGE_ACCEPT`, `uploadLimitLabel`, `IMAGE_FORMATS_LABEL`, `checkUpload`.
- `server/actions-core.ts` — logique (droit, zod, garde) avec dépendances injectées : `updateAltTextCore`,
  `deleteAssetsCore`, `uploadCore` (+ remplacement), `listImagesCore`, `safeFilename`, `toMediaAsset` ; réexporte les
  constantes de `lib/upload-limits.ts`.
- `server/upload-route.ts` — logique de `POST /admin/media/upload` sans Next : `handleUploadRequest(request, deps)`
  (droit → même origine → Content-Length → lecture BORNÉE `readBodyCapped` → multipart → uploadCore).
- `server/actions.ts` — `'use server'` : `updateAltTextAction`, `deleteAssetsAction`, `listImagesAction`.
- `server/deps.ts` — SERVEUR : dépendances réelles (lecture Viewer, écritures et relecture de garde avec le jeton de l'utilisateur) ;
  `uploadAsset` : image → `uploadImageAsset` de core/sanity puis relecture de l'asset complet ; autre fichier → client Sanity.
- `server/data.ts` — SERVEUR : `loadLibrary()` (assets + documents qui les référencent).
- `components/MediaLibrary.tsx` (+ `.module.css`) — C5 : en-tête + G5, barre de sélection, grille, glisser-déposer de fichiers, confirmations.
- `components/MediaDetails.tsx` — fiche à droite (aperçu dans son ratio + cadenas, bouton « Preview <fichier> », alt text,
  « Used in N places », Replace / Download / Delete en `ToolLinks` / `ToolLink` du kit).
- `components/MediaLightbox.tsx` (+ `.module.css`) — grand aperçu : Modal du kit, image ou lecteur vidéo, légende.
- `components/UsageMiniature.tsx` (+ `.module.css`) — `usagePlacesFor(asset)` (emplacements du kit avec leur miniature),
  `UsageMiniature` (page vivante, favicon, carte sociale, repli), `MINIATURE_NOTES`.
- `components/live-page.ts` — client : `loadPageSnapshot(path)` (fetch de même origine → `cleanPageHtml` → cache par
  chemin, `clearPageSnapshots`), `measureLivePage` (feuilles de style, polices, recherche, défilement, image entourée),
  `inspectLivePage`, `whenStylesheetsLoaded`, `whenFontsLoaded`, `whenImageLoaded`, `WAIT_MS`.
- `components/upload.ts` — `uploadFile` (refus immédiat par `checkUpload`, puis XHR avec progression vers
  `/admin/media/upload`), `downloadUrl`, `downloadAll`.
- Tests : `lib/lib.test.ts`, `lib/usage-preview.test.ts`, `server/actions-core.test.ts`, `server/upload-route.test.ts`,
  `server/deps.test.ts`, `components/MediaDetails.test.tsx`, `components/UsageMiniature.test.tsx`, `components/live-page.test.ts`,
  `components/upload.test.ts` ;
  `server/upload-route.live.test.ts` (contre le vrai serveur, désactivé sans `KZ_ADMIN_LIVE_URL`).
- Routes : `src/app/admin/(shell)/media/page.tsx` (C5), `src/app/admin/(shell)/media/upload/route.ts` (POST envoi,
  mince : branche `handleUploadRequest`).

## Contrats

- Entrées : Sanity (assets, `*[references($id)]` publiés + brouillons), `AdminConfig` (libellés des utilisations,
  `site.url` pour « View ↗ », `site.domain` pour la carte sociale).
- Sorties : actions ci-dessus (`{ ok, … } | { ok: false, error }`) ; `POST /admin/media/upload` multipart `{ file, replace? }`
  → `{ ok, asset: MediaAsset, updated }` (200) ou `{ ok: false, error }` (400) ; 400 « Invalid upload. » (multipart
  illisible), 401/403, 413 « This file is too large. » (corps > `UPLOAD_MAX_BODY`) au format `{ error: { code, message } }`.
- `UsagePlaceView.preview` (`UsagePreview`, calculé par `describeUsage`, sérialisé du serveur vers le client) :
  `{ kind: 'page', path }` (chemin RELATIF de la page publique : article de collection, section d'une page),
  `{ kind: 'favicon', theme }` (`faviconLight` / `faviconDark` des réglages), `{ kind: 'social', domain, title, description? }`
  (`seo.ogImage` d'une page : meta title / description SEO ; `socialImage` des réglages : titre / description du site ;
  `ogImage` du modèle SEO d'article : modèle aux `{{variables}}` remplacées par leurs libellés) ; absent → repli.
- Kit : `UsagePlace.preview` (UsageTooltip, ajout FOLLOWUPS #48) reçoit le nœud de la miniature ; MediaCard le transmet.
- La route est HORS du matcher de `src/proxy.ts` (auth-core, QA-1) : aucun contrôle du proxy ne s'y applique.
- Dépend de : `core/auth` (`requireCapability`, `isSameOriginRequest`, `authErrorResponse`, `jsonError`), `core/sanity`
  (`getReadClient`, `getWriteClient`, `uploadImageAsset`, `setDraftFields`, `validateFieldValue`, `toWriteError` ; le
  repointage écrit des chemins `[_key==…]`, pas de tableau réécrit : pas besoin de `updateDraftArray`), `features/cms`
  (`ListTools`, `useFieldSaver`, `imageUrl`, `articlePathFor`), kit `@/admin/ui` (dont `ToolLinks`, `Modal`,
  `FaviconPreview`, `SocialPreview`, `UsageTooltip` via `MediaCard`).
- Page vivante : lecture `GET` de MÊME origine du chemin relatif (`fetch(path, { mode: 'same-origin', credentials:
  'same-origin', cache: 'default' })`, pas `siteHref`, qui vise `site.url`, peut-être une autre origine) ; la copie est
  rendue en `srcdoc`, donc les en-têtes d'iframe du site (X-Frame-Options, CSP `frame-ancestors`) ne s'appliquent plus.
  Pour mémoire : aucun n'est posé hors `/admin` (vérifié le 2026-09-28 sur `/`, `/blog`, `/blog/<slug>`, `/faq`,
  `/testimonials`). La copie hérite en revanche de la CSP de l'admin (aujourd'hui `frame-ancestors 'none'` seulement :
  sans effet, vérifié en Chrome) : une future CSP de l'admin (`img-src`, `style-src`, `font-src`, `frame-src`) devra
  autoriser `'self'`, le CDN Sanity et `about:srcdoc` / les iframes `srcdoc`, sinon les miniatures se vident.
- Utilisé par : features/cms (champ image : `uploadFile`, `listImagesAction`).

## Comportement

- **Grille** : Media card du kit (184 px) : vignette CDN (`w=368&h=248&fit=crop`), tag IMG/VIDEO/PDF/FILE, nom, taille,
  « Used ×N » (ouvre l'Usage tooltip « <fichier> · used in N places » : une miniature par emplacement, son libellé et
  « View ↗ » vers la page publique, inchangé) ou « Unused ». Clic sur la vignette : fiche à droite ; case (au survol) : sélection.
- **Miniatures de l'Usage tooltip** (278 × 124, cadre rouge = Figma `highlight` : 2 px interactive/danger, rayon 2),
  créées seulement à l'ouverture de l'info-bulle (le Popover du kit ne rend son contenu qu'ouvert) :
  - *Page vivante* (`preview.kind === 'page'`) : COPIE NETTOYÉE de la vraie page publique. (1) `loadPageSnapshot` lit le
    HTML par un `fetch` de même origine (chemin relatif) ; (2) `cleanPageHtml` retire tous les `script` (JS, JSON-LD, SVG),
    `noscript`, `iframe`, `frame`, `object`, `embed`, `audio`, `<link>` de préchargement de JS / pages / connexions
    (`preload as=script`, `modulepreload`, `prefetch`, `preconnect`…), `<meta http-equiv>`, l'ancienne `<base>`, les
    attributs `on*` et les URL `javascript:` ; garde feuilles de style, polices, images (`img`, `picture`, `source`) et
    l'affiche des vidéos (`video[poster]` sans `src`, `source` ni lecture) ; pose `<base href="<origine><chemin>">` en tête du
    `<head>` ; (3) la copie est gardée par chemin pour la vie de la page de l'admin (24 pages au plus ; une lecture en
    cours est partagée ; un échec n'est pas gardé) ; (4) rendue dans une iframe `srcdoc` 1280 × 571 px CSS réduite par
    `transform: scale(278 / 1280)` → 124 px visibles, `sandbox="allow-same-origin"` SANS `allow-scripts`, `tabIndex={-1}`,
    `aria-hidden`, `inert`, `pointer-events: none`, `loading="lazy"`. Squelette (blocs d'une page, pulsation d'opacité)
    pendant la lecture et le rendu. Au `load` de l'iframe, `measureLivePage` attend les feuilles de style (3 s au plus)
    puis les polices (`document.fonts.ready`, 3 s), cherche les éléments qui affichent l'asset (hash de
    `image-<hash>-<w>x<h>-<ext>` dans l'URL CDN, y compris encodée dans `/_next/image?url=…`) parmi `img` (src, srcset,
    currentSrc), `source` (srcset, src → l'img du picture), `video` (poster, src), `background-image` en style ; prend le
    premier VISIBLE (le n-ième pour le n-ième emplacement de la même page) ; fait défiler la copie pour le centrer (borné
    au document, barre de défilement masquée) ; si l'image entourée n'est pas encore chargée, l'attend (5 s) puis remesure ;
    cadre rouge aux coordonnées × 278/1280, borné à la miniature (8 px au moins). Copie et cadre paraissent par un fondu
    de 200 ms ease-out.
  - *Repli* : l'image elle-même en `contain` (aperçu 576 px), entourée, avec une mention (Tag neutre en bas à gauche) :
    « Not on the live site yet » (page en 404 / 410 — utilisée dans un brouillon seulement — ou copie sans l'image) ou
    « Live page unavailable » (autre statut, réponse non HTML, redirection vers une autre origine, erreur réseau, rien au
    bout de 20 s). Sans mention : emplacement sans page publique (autre réglage, autre document) et au-delà de 3 pages
    vivantes par info-bulle. Vidéo ou fichier : icône du type encadrée.
  - *Favicon* (`faviconLight` / `faviconDark`) : FaviconPreview du kit à sa taille (fond Figma + onglet, thème du champ),
    centré, pied rogné ; cadre rouge autour du favicon (x 72, y 35, 16 px + 4 px d'air).
  - *Image de partage* (`seo.ogImage`, `socialImage`, modèle SEO d'article) : SocialPreview du kit (400 px) réduite à 0,38,
    centrée ; cadre rouge autour de son image 1200 / 630.
- **Fiche** : aperçu dans le ratio de l'asset (`aspect-ratio` = dimensions, `object-fit: contain`, fond bg/subtle ; hauteur
  plafonnée à 288 px, plancher 96 px ; sans dimensions : cadre Figma 288 × 170) ; cadenas en haut à gauche si utilisé
  (« Used in 2 places — remove it from the site before deleting. ») ; image ou vidéo : l'aperçu est un bouton « Preview
  <fichier> » (clic, Entrée, Espace ; survol : contour border/strong, curseur loupe) qui ouvre le grand aperçu ; PDF / autre
  fichier : pas de bouton. Alt text (images seulement) enregistré pendant la frappe DIRECTEMENT sur l'asset ; « Used in N
  places » avec lignes vers l'écran de l'admin concerné ; Replace (même genre de fichier), Download (`?dl=`), Delete
  (rouge ; désactivé si utilisé, raison au survol et au focus).
- **Grand aperçu** (Modal du kit, centrée, voile) : titre = nom du fichier ; image dans son ratio (au plus ~90vw × 85vh et
  dans la fenêtre, jamais agrandie sauf une petite image portée à 320 px de côté) sur l'aperçu déjà chargé puis en pleine
  définition (`full`, fondu) ; `alt` = texte alternatif ; légende « 2400 × 1600 · JPG · 1.2 MB ». Vidéo : lecteur
  (`controls`, focalisé à l'ouverture), légende « MP4 · 14.3 MB ». Fermeture : Échap, clic sur le voile, ✕ (« Close ») ;
  focus piégé puis rendu au bouton d'aperçu. Entrée : échelle 0.96 → 1 + fondu (200 ms ease-out, Modal du kit) depuis le
  centre de la miniature (`transform-origin`) ; mouvement réduit : apparition immédiate.
- **Sélection** : Selection bar du kit : « 3 selected », Download, « Delete 1 unused » + « 2 used files are locked »
  (ou « Selected files are in use »). Confirmation, puis suppression des seuls fichiers inutilisés (revérifié côté serveur).
- **Envoi** (+ ou déposer des fichiers sur la grille) : toast de progression, carte ajoutée en tête et ouverte.
  Types : PNG, JPEG, WebP, GIF, AVIF, SVG (20 Mo), MP4, WebM, MOV (100 Mo), PDF, TXT, CSV, ZIP (50 Mo) — valeurs de
  `lib/upload-limits.ts`. Un fichier hors limite ou d'un type refusé est refusé dans le navigateur, sans envoi
  (« big.mov: This file is too large (100 MB max). ») ; le serveur revérifie tout.
- **Remplacement** : nouvel asset (Sanity n'écrase pas un asset), alt text repris, puis CHAQUE utilisation est repointée
  dans le brouillon de son document → en ligne au prochain Publish ; l'ancien fichier reste (supprimable quand plus
  aucun document, publié compris, ne le référence).
- **G5** : tri Date added / Name / Size, filtres Type (image, video, file) et Usage (used, unused), recherche (nom,
  alt text, extension) ; gardés dans `sessionStorage` (`kz-admin:media`).
- États : médiathèque vide (« No files yet » + Upload files), « No results » + Clear, aucune fiche ouverte (texte d'aide),
  erreurs en toast (envoi, suppression) ou sous le champ (alt text) ; chargement / erreur de page : états de la coque.

## Forces

- Garde de suppression à deux niveaux : l'interface (cadenas, bouton désactivé, sélection partielle) et le serveur qui
  relit les références (publiés ET brouillons) avec le jeton de l'utilisateur juste avant d'effacer ; Sanity refuse aussi.
- Libellés d'usage calculés depuis le manifeste (aucune connaissance du site en dur) ; chemins par `_key`, jamais d'index.
- Miniatures fidèles sans serveur de captures : c'est la page publiée elle-même (HTML servi, styles, polices, images
  réelles) rendue par le navigateur de la personne, à jour à chaque rechargement de l'admin ; aucun Draft Mode activé.
- Copie nettoyée : AUCUN script (deux barrières : plus un seul `<script>` dans la copie, et le bac à sable sans
  `allow-scripts`), AUCUN fichier JS téléchargé (avant : ≈ 1,3 Mo par page en dev), AUCUNE requête tierce hors images du
  CDN Sanity (le `<noscript>` de GTM d'Analytics.tsx, rendu faute de scripts, ne part plus ; le site n'a pas changé).
  Mesuré en Chrome, cache vide : info-bulle d'un article (article + page 404 + carte sociale) = 19 Ko de HTML, 12 Ko de CSS,
  52 Ko de polices, 36 Ko d'images, 0 script ; accueil = 25 Ko + 17 Ko + 52 Ko + 329 Ko d'images (29), 0 script.
- Une seule lecture par page tant que l'admin est ouverte (plusieurs info-bulles, même page) ; lecture seule du DOM de la
  copie (seule écriture : `scrollbar-width: none` sur sa racine).
- Vérifié dans un vrai Chrome (banc d'essai hors dépôt, sans serveur lancé, GET de pages publiques seulement, 2026-09-28),
  page du banc servie avec les en-têtes de l'admin (`X-Frame-Options: DENY`, `frame-ancestors 'none'`) et GTM de
  production simulé dans le HTML lu (script + `<noscript><iframe ns.html>`) : copie rendue, couverture d'article et carte
  d'article de l'accueil (`loading="lazy"`, tout en bas de la page) trouvées, centrées, encadrées, image chargée ; 404 →
  « Not on the live site yet » ; 0 requête vers googletagmanager / google-analytics, 0 fichier `/_next/static/chunks/*.js`,
  hôtes contactés : le site et cdn.sanity.io ; réouverture sans nouvelle lecture ; carte sociale et favicon encadrés,
  aperçu 760 × 809 plafonné, Modal (origine, légende, Échap → focus rendu), mouvement réduit.
- Testé : chemins d'usage, libellés et `preview`, tri / filtres, garde, alt text, envoi, remplacement (repointage dans les
  brouillons), refus de type, route d'envoi avec de vrais `Request` (12 Mo et 100 Mo arrivent entiers, corps sans
  Content-Length coupé à la borne, droit avant lecture, autre origine) ; nettoyage de la copie (scripts, `<noscript>` GTM,
  iframes, préchargements de JS, `on*`, `javascript:` retirés ; styles, images, `<base>` ; jsdom), lecture de la page
  (404 / 410, 500, non HTML, autre origine, réseau, délai, cache), attente des feuilles de style et de l'image entourée,
  recherche par hash (jsdom), défilement et cadre (calculs purs), choix du mode, rendu des miniatures (`srcdoc`, bac à
  sable, squelette, replis, favicon, carte sociale, plafond de 3), fiche (ratio, bouton, Modal, vidéo, PDF) ; vérifié à
  la main (envoi, alt text, suppression d'un fichier inutilisé) puis remis en état ; test live 12 et 60 Mo contre le
  serveur 4040 (QA-1).
- Une seule source pour les limites : libellés « N MB max », `accept`, vérification navigateur et serveur, borne du corps.

## Faiblesses et limites connues

- Miniature vivante = le rendu d'une page entière par emplacement (au plus 3 par info-bulle) : TOUTES ses images sont
  chargées (sans scripts, le navigateur ignore `loading="lazy"` : 29 images, 329 Ko pour l'accueil en dev), à chaque
  ouverture de l'info-bulle (l'iframe est recréée ; seul le HTML est gardé, le reste vient du cache HTTP).
- Copie gardée pour la vie de la page de l'admin : une publication faite entre-temps n'apparaît qu'après un
  rechargement de l'admin (ou pour une page pas encore lue).
- La copie est le HTML SERVI, sans exécution : ce que le site ajoute côté client (composants montés par JS, contenu
  diffusé en différé par Suspense — `<div hidden id="S:…">` que React déplace par script) n'y figure pas, le repli de
  chargement si. Aucune page publique actuelle n'en dépend (vérifié sur l'accueil et un article), mais une image
  affichée ainsi ne serait pas trouvée (« Not on the live site yet » à tort).
- En local, next dev compile une page à sa première visite : squelette pendant plusieurs secondes ; au-delà de 20 s, repli.
- Rendu desktop seulement (1280 px) ; si l'image apparaît plusieurs fois sur la page, rang de l'emplacement parmi ceux
  de la même page = rang d'apparition (heuristique : ordre des champs du document ≠ ordre de la page possible).
- Élément trouvé seulement par son URL (attributs listés, `background-image` en style EN LIGNE) : une image posée par une
  classe CSS, dans un `<canvas>` ou un lien vers un PDF n'est pas trouvée (repli). Un autre fichier (PDF…) : toujours en repli.
- Console de l'admin : « Failed to load resource: 404 » pour une page absente (utilisation dans un brouillon seulement).
- Favicon et carte sociale : géométrie du kit recopiée en constantes (`FAVICON_STAGE` : 180 × 110, favicon x 72 / y 35 ;
  `SOCIAL_STAGE` : 400 px, image 1200 / 630) ; carte sociale à titre et description du document (pas l'og:title
  exact calculé par le site).
- Pas de vignette pour les vidéos et PDF (icône du type) ; la fiche ne lit pas la vidéo (le grand aperçu, si).
- Le texte alternatif est EN LIGNE tout de suite (un asset n'a pas de brouillon) : il ne passe pas par Publish.
- `loadLibrary` lit jusqu'à 1 000 assets et tous les documents qui les référencent en une fois (pas de pagination).
- Téléchargement multiple : un lien par fichier (le navigateur peut demander d'autoriser les téléchargements multiples).
- Remplacement : si l'écriture d'un des brouillons échoue, les précédents restent repointés (pas de transaction globale).
- Envoi : les octets ne sont pas contrôlés (signature PNG/JPEG…) — seulement le type MIME déclaré, en liste blanche ici et
  dans `uploadImageAsset` ; le décodage de l'image est laissé à Sanity.
- Image envoyée : une requête de plus (relecture de l'asset complet, `uploadImageAsset` ne renvoie que `_id` et `url`) ;
  asset pas encore lisible → vue minimale (nom, type, taille), complétée au prochain chargement.

## Points sensibles

- Iframe des miniatures : JAMAIS `allow-scripts` (avec `allow-same-origin`, la copie de même origine pourrait retirer son
  propre bac à sable et agir avec la session de l'admin) ; jamais d'autre origine (`livePagePath` n'accepte qu'un chemin
  « /… », sans « // » ; `fetch` en `mode: 'same-origin'` : une redirection ailleurs échoue) ; ne jamais activer le Draft
  Mode depuis l'admin (cookie pour tout le site). Le parent ne fait que lire le DOM de la copie, mesurer et défiler.
- `cleanPageHtml` : ne jamais relâcher la liste de ce qu'il retire (`script`, `noscript`, iframes, plugins, préchargements
  de JS, `on*`, `javascript:`) ni rendre la copie autrement qu'en `srcdoc` sous bac à sable sans scripts (deux barrières).
  Un `<noscript>` gardé ferait repartir l'iframe GTM `ns.html` d'Analytics.tsx en production (vérifié en Chrome : sans
  scripts, le navigateur rend le contenu des `<noscript>`).
- Draft Mode déjà actif dans le navigateur (cookie posé par le Studio) : le `fetch` l'envoie, la copie montre alors le
  BROUILLON.
- La copie hérite de la CSP de l'admin (iframe `srcdoc`) : voir Contrats avant d'en durcir une.
- Suppression : JAMAIS sans relire les références juste avant (course avec une autre personne qui utilise le fichier).
- La route d'envoi : droit d'abord, même origine (CSRF), Content-Length refusé au-delà de la borne AVANT lecture, puis
  lecture en flux coupée à `UPLOAD_MAX_BODY` (corps sans Content-Length ou qui ment), type en liste blanche, nom de
  fichier nettoyé. Hors proxy : ces contrôles sont les SEULS — ne jamais les retirer. Pas de server action pour l'envoi :
  fichiers jusqu'à 100 Mo, au-delà de la limite des actions (6 Mo, `serverActions.bodySizeLimit` de next.config.ts).
- SVG accepté : servi par cdn.sanity.io (autre origine) et affiché en `<img>` ; ne jamais l'insérer en ligne dans le DOM.
- Écritures avec le jeton de l'utilisateur (`getWriteClient`) ; jeton robot seulement en session de dev.

## Pièges

- `references()` renvoie les documents, pas les chemins : `findAssetPaths` parcourt le document (objets `{ asset: { _ref } }`).
- Un brouillon et son publié référencent le même asset : compter par id publié (`usagesOf`), libellé du brouillon.
- Un asset n'a pas de `drafts.` : `setDraftFields` ne s'applique pas à lui ; l'alt text se patche sur l'asset.
- `formatBytes` du kit : 1 024 octets = 1 KB (`uploadLimitLabel` suit la même convention).
- Next 16 : une route couverte par le matcher du proxy voit son corps mis en mémoire tampon jusqu'à
  `proxyClientMaxBodySize` (10 Mo par défaut) puis TRONQUÉ → `request.formData()` échoue (« Invalid upload. »). D'où la
  sortie de la route du matcher ; si on la remet dans le proxy, régler `experimental.proxyClientMaxBodySize` ≥
  `UPLOAD_MAX_BODY` (next.config.ts) et relancer le test live.
- `readBodyCapped` garde jusqu'à `UPLOAD_MAX_BODY` (101 Mo) en mémoire, puis le multipart en fait une copie : prévoir
  ~2 × la taille du fichier par envoi en cours.
- Miniature vivante : l'iframe se mesure dans SA fenêtre (1280 × 571) ; mesurer l'élément APRÈS `scrollTo` (le cadre suit
  la boîte relue) et après les feuilles de style et les polices. Avant le rendu de la copie, `contentDocument` est un
  document vide `about:blank` : `inspectLivePage` renvoie null (on attend) ; la copie rendue est `about:srcdoc`. Les
  éléments viennent d'un autre document : `tagName`, jamais `instanceof HTMLImageElement`. Sans la `<base>` posée par
  `cleanPageHtml`, les URL relatives (CSS, `/_next/image`, polices) se résoudraient contre `about:srcdoc` (page sans style).
- jsdom n'a ni mise en page ni navigation d'iframe et ne charge pas les images (`complete` à false dès qu'il y a un `src`) :
  les tests simulent `contentDocument` / `contentWindow` (sur le prototype : l'iframe n'existe qu'après la lecture),
  `getBoundingClientRect` et `complete` ; `fetch` est remplacé (`vi.stubGlobal`) et le cache vidé (`clearPageSnapshots`).
- `preview` / `full` sont en `fit=max` (ratio gardé) : ne pas revenir à `fit=crop` (un favicon carré serait recadré).

## Comment modifier

- **Nouveau type de fichier accepté / autre limite** : `UPLOAD_TYPES` / `UPLOAD_MAX_BYTES` dans `lib/upload-limits.ts`
  seulement (accept, libellés, borne du corps suivent) + message de `checkUpload` si besoin + tests
  (`actions-core.test.ts`, `upload-route.test.ts`). Au-delà de 100 Mo : vérifier la mémoire (voir Pièges).
- **Nouveau filtre ou tri** : `MEDIA_FILTER_FIELDS` / `filterValue` / `MEDIA_SORT_OPTIONS` (assets.ts) + test.
- **Libellé d'utilisation** : `describeUsage` (usage.ts) + test.
- **Miniature d'un nouveau genre d'emplacement** : `UsagePreview` + `describeUsage` (usage.ts), `miniatureModes`
  (usage-preview.ts), un composant dans `UsageMiniature.tsx` + tests. Plafond / délai : `MAX_LIVE_MINIATURES`,
  `LIVE_TIMEOUT_MS`, `WAIT_MS` (live-page.ts). Autre porteur d'URL à chercher : `URL_ATTRIBUTES` + test `findAssetElements`.
  Autre chose à retirer de la copie : `REMOVED_ELEMENTS` / `REMOVED_LINK_RELS` (usage-preview.ts) + test `cleanPageHtml`.
- **Taille du grand aperçu** : `LIGHTBOX` (preview.ts) + tests.

## Tests

`npx vitest run src/admin/features/media` (85 + 2 ignorés au 2026-09-28) — voir Forces. Live (serveur lancé,
ADMIN_DEV_AUTOLOGIN, aucun asset créé : type refusé) :
`KZ_ADMIN_LIVE_URL=http://127.0.0.1:4040 npx vitest run src/admin/features/media/server/upload-route.live.test.ts`.
À la main : `/admin/media` (sélection partielle, Usage tooltip : miniature d'un article publié, d'un brouillon seul, d'un
favicon et de l'image de partage ; fiche d'un favicon carré et d'une image très haute, grand aperçu à la souris et au
clavier, vidéo ; alt text, envoi par + et par glisser-déposer, Replace, Delete d'un fichier inutilisé ; mouvement réduit).
Supprimer les fichiers de test.

## Décisions et « À trancher »

- Question 13 : texte alternatif sur l'asset (orchestrateur) ; le site lit `coalesce(alt, asset->altText)`.
- Question 10 : médias des pages dans Sanity quand le schéma les porte (orchestrateur).
- Pas de cadenas sur les cartes (le Figma ne le montre que dans la fiche) ; la barre de sélection dit ce qui est verrouillé.
- QA-1 : limites gardées (20 / 100 / 50 Mo) ; la route sort du matcher du proxy (auth-core) plutôt que de régler
  `proxyClientMaxBodySize` (pas de mise en mémoire tampon inutile par le proxy) ; la route borne elle-même le corps.
- FOLLOWUPS #48 (2026-09-28, demande de l'utilisatrice « tu recrées au format tout petit la UI avec l'image entourée en
  rouge ») : miniatures = la vraie page publique rendue en petit dans le navigateur de la personne, plutôt que des
  captures générées côté serveur par un navigateur sans interface (proposition du Figma : moteur, cache, régénération à
  la publication) ; montre la version PUBLIÉE (pas de Draft Mode) : une utilisation en brouillon seulement passe au repli.
  Puis (même jour, orchestrateur) : la page n'est plus chargée telle quelle dans l'iframe (`src`) mais lue par `fetch` et
  NETTOYÉE avant d'être rendue en `srcdoc` : plus d'iframe GTM `ns.html` (`<noscript>`) en production ni de JS
  téléchargé ; le site n'est pas modifié. Grand aperçu : Modal du kit (pas de visionneuse maison) ; animation = celle de
  la Modal, origine au centre de la miniature.

## Demandes de contrat

- Aucune en cours.
- Abandonnée : captures de sections pour l'Usage tooltip par le moteur / site-adapter (voir Décisions).
- Levée côté admin (FOLLOWUPS #48) : le `<noscript>` de GTM d'`Analytics.tsx` ne part plus depuis les miniatures (la
  copie nettoyée n'en contient pas) ; rien à changer sur le site.
