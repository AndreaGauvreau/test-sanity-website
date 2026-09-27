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
- `server/actions-core.ts` — logique (droit, zod, garde) avec dépendances injectées : `updateAltTextCore`,
  `deleteAssetsCore`, `uploadCore` (+ remplacement), `listImagesCore`, `checkUpload`, `safeFilename`, `toMediaAsset`, `UPLOAD_TYPES`.
- `server/actions.ts` — `'use server'` : `updateAltTextAction`, `deleteAssetsAction`, `listImagesAction`.
- `server/deps.ts` — SERVEUR : dépendances réelles (lecture Viewer, écritures et relecture de garde avec le jeton de l'utilisateur).
- `server/data.ts` — SERVEUR : `loadLibrary()` (assets + documents qui les référencent).
- `components/MediaLibrary.tsx` (+ `.module.css`) — C5 : en-tête + G5, barre de sélection, grille, glisser-déposer de fichiers, confirmations.
- `components/MediaDetails.tsx` — fiche à droite (aperçu + cadenas, alt text, « Used in N places », Replace / Download / Delete) ; `ToolLink` composé ici.
- `components/upload.ts` — `uploadFile` (XHR avec progression vers `/admin/media/upload`), `downloadUrl`, `downloadAll`.
- Tests : `lib/lib.test.ts`, `server/actions-core.test.ts`, `components/MediaDetails.test.tsx`.
- Routes : `src/app/admin/(shell)/media/page.tsx` (C5), `src/app/admin/(shell)/media/upload/route.ts` (POST envoi).

## Contrats

- Entrées : Sanity (assets, `*[references($id)]` publiés + brouillons), `AdminConfig` (libellés des utilisations,
  `site.url` pour « View ↗ »).
- Sorties : actions ci-dessus (`{ ok, … } | { ok: false, error }`) ; `POST /admin/media/upload` multipart `{ file, replace? }`
  → `{ ok, asset: MediaAsset, updated }` (200) ou `{ ok: false, error }` (400) ; 401/403 au format `{ error: { code, message } }`.
- Dépend de : `core/auth` (`requireCapability`, `isSameOriginRequest`, `authErrorResponse`, `jsonError`), `core/sanity`
  (`getReadClient`, `getWriteClient`, `setDraftFields`, `validateFieldValue`, `toWriteError`), `features/cms`
  (`ListTools`, `useFieldSaver`, `imageUrl`, `articlePathFor`), kit `@/admin/ui`.
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
  Types : PNG, JPEG, WebP, GIF, AVIF, SVG (20 Mo), MP4, WebM, MOV (100 Mo), PDF, TXT, CSV, ZIP (50 Mo).
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
  refus de type ; vérifié à la main (envoi, alt text, suppression d'un fichier inutilisé) puis remis en état.

## Faiblesses et limites connues

- Miniatures de l'Usage tooltip absentes (le Figma propose des captures du site générées côté serveur) : zone vide.
- Pas de vignette pour les vidéos et PDF (icône du type) ; pas de lecture vidéo.
- Le texte alternatif est EN LIGNE tout de suite (un asset n'a pas de brouillon) : il ne passe pas par Publish.
- `loadLibrary` lit jusqu'à 1 000 assets et tous les documents qui les référencent en une fois (pas de pagination).
- Téléchargement multiple : un lien par fichier (le navigateur peut demander d'autoriser les téléchargements multiples).
- Remplacement : si l'écriture d'un des brouillons échoue, les précédents restent repointés (pas de transaction globale).

## Points sensibles

- Suppression : JAMAIS sans relire les références juste avant (course avec une autre personne qui utilise le fichier).
- La route d'envoi : droit d'abord, même origine (CSRF), taille bornée AVANT lecture du corps, type en liste blanche,
  nom de fichier nettoyé. Pas de server action pour l'envoi (limite de 1 Mo des actions).
- SVG accepté : servi par cdn.sanity.io (autre origine) et affiché en `<img>` ; ne jamais l'insérer en ligne dans le DOM.
- Écritures avec le jeton de l'utilisateur (`getWriteClient`) ; jeton robot seulement en session de dev.

## Pièges

- `references()` renvoie les documents, pas les chemins : `findAssetPaths` parcourt le document (objets `{ asset: { _ref } }`).
- Un brouillon et son publié référencent le même asset : compter par id publié (`usagesOf`), libellé du brouillon.
- Un asset n'a pas de `drafts.` : `setDraftFields` ne s'applique pas à lui ; l'alt text se patche sur l'asset.
- `formatBytes` du kit : 1 024 octets = 1 KB.

## Comment modifier

- **Nouveau type de fichier accepté** : `UPLOAD_TYPES` / `UPLOAD_MAX_BYTES` (actions-core.ts) + `UPLOAD_ACCEPT`
  (MediaLibrary.tsx) + test `checkUpload`.
- **Nouveau filtre ou tri** : `MEDIA_FILTER_FIELDS` / `filterValue` / `MEDIA_SORT_OPTIONS` (assets.ts) + test.
- **Libellé d'utilisation** : `describeUsage` (usage.ts) + test.

## Tests

`npx vitest run src/admin/features/media` — voir Forces. À la main : `/admin/media` (sélection partielle, Usage tooltip,
fiche, alt text, envoi par + et par glisser-déposer, Replace, Delete d'un fichier inutilisé). Supprimer les fichiers de test.

## Décisions et « À trancher »

- Question 13 : texte alternatif sur l'asset (orchestrateur) ; le site lit `coalesce(alt, asset->altText)`.
- Question 10 : médias des pages dans Sanity quand le schéma les porte (orchestrateur).
- Pas de cadenas sur les cartes (le Figma ne le montre que dans la fiche) ; la barre de sélection dit ce qui est verrouillé.

## Demandes de contrat

- **site-adapter / moteur** : captures de sections pour l'Usage tooltip (proposé par le Figma), avec le cadre de l'élément.
- **ui-composites** : composant « Tool link » (actions icônes collées 36 × 36, C5), composé ici en attendant.
