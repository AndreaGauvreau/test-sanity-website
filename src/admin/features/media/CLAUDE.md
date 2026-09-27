# features/media — Médiathèque (Assets › Media) — LLM context

> Propriétaire : cms-media · Figma : C5 (docs/admin/figma/screens/C5.md), G5 (states/G5.md), fiches MediaCard,
> UsageTooltip, LockBadge, SelectionBar, FilterPopover · Mis à jour : 2026-09-27

## Utilité

`/admin/media` pour les trois rôles (droit `content.write`) : tous les assets Sanity du site (`sanity.imageAsset`,
`sanity.fileAsset` : images, vidéos, PDF…) en grille de Media cards ; savoir où chaque fichier est utilisé (« Used ×N »,
Usage tooltip, fiche à droite) ; envoyer, remplacer, télécharger ; texte alternatif SUR L'ASSET (question 13) ;
supprimer seulement ce qui ne sert plus. Sert aussi le champ image des fiches CMS (route d'envoi, choix dans Media).
Ne fait pas : recadrage / point focal, dossiers ou étiquettes, miniatures du site dans l'Usage tooltip (voir limites).

## Fichiers

- `lib/assets.ts` — PUR : `MediaAsset` (vue), `mediaKind`, `typeLabel` (IMG/VIDEO/PDF/FILE), `usageLabel`, `assetMetaLine`
  (« JPG · 2400 × 1600 · 1.2 MB · added Sep 12 »), `librarySummary` (« 48 files · 312 MB »), tri / filtres / recherche
  (`applyMediaQuery`, `MEDIA_SORT_OPTIONS`, `MEDIA_FILTER_FIELDS`), garde (`isDeletable`, `partitionForDelete`, `lockReason`), `isAssetId`.
- `lib/usage.ts` — PUR : `findAssetPaths(doc, assetId)` (chemins `image`, `seo.ogImage`, `content[_key=="k"]`),
  `describeUsage` (libellés du manifeste : « Blog › Titre — Cover image », « Home › Hero — Background », « Site settings — … »),
  `usagesOf` (brouillon et publié d'un document comptés une fois).
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
- `components/MediaDetails.tsx` — fiche à droite (aperçu + cadenas, alt text, « Used in N places », Replace / Download / Delete
  en `ToolLinks` / `ToolLink` du kit).
- `components/upload.ts` — `uploadFile` (refus immédiat par `checkUpload`, puis XHR avec progression vers
  `/admin/media/upload`), `downloadUrl`, `downloadAll`.
- Tests : `lib/lib.test.ts`, `server/actions-core.test.ts`, `server/upload-route.test.ts`, `server/deps.test.ts`, `components/MediaDetails.test.tsx`,
  `components/upload.test.ts` ; `server/upload-route.live.test.ts` (contre le vrai serveur, désactivé sans `KZ_ADMIN_LIVE_URL`).
- Routes : `src/app/admin/(shell)/media/page.tsx` (C5), `src/app/admin/(shell)/media/upload/route.ts` (POST envoi,
  mince : branche `handleUploadRequest`).

## Contrats

- Entrées : Sanity (assets, `*[references($id)]` publiés + brouillons), `AdminConfig` (libellés des utilisations,
  `site.url` pour « View ↗ »).
- Sorties : actions ci-dessus (`{ ok, … } | { ok: false, error }`) ; `POST /admin/media/upload` multipart `{ file, replace? }`
  → `{ ok, asset: MediaAsset, updated }` (200) ou `{ ok: false, error }` (400) ; 400 « Invalid upload. » (multipart
  illisible), 401/403, 413 « This file is too large. » (corps > `UPLOAD_MAX_BODY`) au format `{ error: { code, message } }`.
- La route est HORS du matcher de `src/proxy.ts` (auth-core, QA-1) : aucun contrôle du proxy ne s'y applique.
- Dépend de : `core/auth` (`requireCapability`, `isSameOriginRequest`, `authErrorResponse`, `jsonError`), `core/sanity`
  (`getReadClient`, `getWriteClient`, `uploadImageAsset`, `setDraftFields`, `validateFieldValue`, `toWriteError` ; le
  repointage écrit des chemins `[_key==…]`, pas de tableau réécrit : pas besoin de `updateDraftArray`), `features/cms`
  (`ListTools`, `useFieldSaver`, `imageUrl`, `articlePathFor`), kit `@/admin/ui` (dont `ToolLinks`).
- Utilisé par : features/cms (champ image : `uploadFile`, `listImagesAction`).

## Comportement

- **Grille** : Media card du kit (184 px) : vignette CDN (`w=368&h=248&fit=crop`), tag IMG/VIDEO/PDF/FILE, nom, taille,
  « Used ×N » (ouvre l'Usage tooltip : une ligne par utilisation, « View ↗ » vers la page publique, miniature = zone
  vide) ou « Unused ». Clic sur la vignette : fiche à droite ; case (au survol) : sélection.
- **Fiche** : aperçu 288 × 170 ; cadenas en haut à gauche si utilisé (« Used in 2 places — remove it from the site
  before deleting. ») ; alt text (images seulement) enregistré pendant la frappe DIRECTEMENT sur l'asset ; « Used in N
  places » avec lignes vers l'écran de l'admin concerné ; Replace (même genre de fichier), Download (`?dl=`), Delete
  (rouge ; désactivé si utilisé, raison au survol et au focus).
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
- Testé : chemins d'usage, libellés, tri / filtres, garde, alt text, envoi, remplacement (repointage dans les brouillons),
  refus de type, route d'envoi avec de vrais `Request` (12 Mo et 100 Mo arrivent entiers, corps sans Content-Length
  coupé à la borne, droit avant lecture, autre origine) ; vérifié à la main (envoi, alt text, suppression d'un fichier
  inutilisé) puis remis en état ; test live 12 et 60 Mo contre le serveur 4040 (QA-1).
- Une seule source pour les limites : libellés « N MB max », `accept`, vérification navigateur et serveur, borne du corps.

## Faiblesses et limites connues

- Miniatures de l'Usage tooltip absentes (le Figma propose des captures du site générées côté serveur) : zone vide.
- Pas de vignette pour les vidéos et PDF (icône du type) ; pas de lecture vidéo.
- Le texte alternatif est EN LIGNE tout de suite (un asset n'a pas de brouillon) : il ne passe pas par Publish.
- `loadLibrary` lit jusqu'à 1 000 assets et tous les documents qui les référencent en une fois (pas de pagination).
- Téléchargement multiple : un lien par fichier (le navigateur peut demander d'autoriser les téléchargements multiples).
- Remplacement : si l'écriture d'un des brouillons échoue, les précédents restent repointés (pas de transaction globale).
- Envoi : les octets ne sont pas contrôlés (signature PNG/JPEG…) — seulement le type MIME déclaré, en liste blanche ici et
  dans `uploadImageAsset` ; le décodage de l'image est laissé à Sanity.
- Image envoyée : une requête de plus (relecture de l'asset complet, `uploadImageAsset` ne renvoie que `_id` et `url`) ;
  asset pas encore lisible → vue minimale (nom, type, taille), complétée au prochain chargement.

## Points sensibles

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

## Comment modifier

- **Nouveau type de fichier accepté / autre limite** : `UPLOAD_TYPES` / `UPLOAD_MAX_BYTES` dans `lib/upload-limits.ts`
  seulement (accept, libellés, borne du corps suivent) + message de `checkUpload` si besoin + tests
  (`actions-core.test.ts`, `upload-route.test.ts`). Au-delà de 100 Mo : vérifier la mémoire (voir Pièges).
- **Nouveau filtre ou tri** : `MEDIA_FILTER_FIELDS` / `filterValue` / `MEDIA_SORT_OPTIONS` (assets.ts) + test.
- **Libellé d'utilisation** : `describeUsage` (usage.ts) + test.

## Tests

`npx vitest run src/admin/features/media` — voir Forces. Live (serveur lancé, ADMIN_DEV_AUTOLOGIN, aucun asset créé :
type refusé) : `KZ_ADMIN_LIVE_URL=http://127.0.0.1:4040 npx vitest run src/admin/features/media/server/upload-route.live.test.ts`.
À la main : `/admin/media` (sélection partielle, Usage tooltip,
fiche, alt text, envoi par + et par glisser-déposer, Replace, Delete d'un fichier inutilisé). Supprimer les fichiers de test.

## Décisions et « À trancher »

- Question 13 : texte alternatif sur l'asset (orchestrateur) ; le site lit `coalesce(alt, asset->altText)`.
- Question 10 : médias des pages dans Sanity quand le schéma les porte (orchestrateur).
- Pas de cadenas sur les cartes (le Figma ne le montre que dans la fiche) ; la barre de sélection dit ce qui est verrouillé.
- QA-1 : limites gardées (20 / 100 / 50 Mo) ; la route sort du matcher du proxy (auth-core) plutôt que de régler
  `proxyClientMaxBodySize` (pas de mise en mémoire tampon inutile par le proxy) ; la route borne elle-même le corps.

## Demandes de contrat

- **site-adapter / moteur** : captures de sections pour l'Usage tooltip (proposé par le Figma), avec le cadre de l'élément.
