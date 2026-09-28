# features/general (B2 · Site Settings › General) — LLM context

> Propriétaire : settings · Figma : B2 (docs/admin/figma/screens/B2.md, B2.ui.png) · Mis à jour : 2026-09-27 (FOLLOWUPS #40)

## Utilité

Réglages généraux du site dans le document unique `siteSettings` : titre (≤ 60), description (≤ 160), favicons clair et
sombre, image sociale (1200 × 630), indexation. Pour les trois rôles (kuartz, client, editor : tous ont `content.write`).
Routes : `/admin/settings/general` (`src/app/admin/(shell)/settings/general/page.tsx` + `loading.tsx`) ; envoi d'image
`POST /admin/settings/general/image` (`src/app/admin/(shell)/settings/general/image/route.ts`).
Ne fait pas : les scripts (`siteSettings.scripts`, B3, feature code), le SEO d'une page (C2), la publication (E1).

## Fichiers

- `fields.ts` — FieldDef des champs de B2 (le manifeste ne déclare que le document), formats et taille max des envois
  (`UPLOAD_MAX_BYTES` 5 Mo, `UPLOAD_MAX_BODY` = 5 Mo + 64 Kio d'enveloppe, `UPLOAD_MAX_LABEL`, `UPLOAD_TOO_LARGE`),
  `acceptFor`, `formatsLabel`. Pur.
- `images.ts` — référence d'asset → URL du CDN (`imageUrlFromRef`, `toGeneralImage`), avertissements de ratio, reconnaissance du format par les octets (`sniffImageKind`), nom de fichier sûr. Pur.
- `view.ts` — `GeneralView` (modèle passé au client), `toGeneralView`, `publicUrl`, `truncateWords`. Pur.
- `debounce.ts` — `createDebouncer` (600 ms par champ, flush, cancel). Pur.
- `save.ts` — cœur des écritures (zod + règles), dépendances injectées (`GeneralDeps`). Sans Next.
- `deps.ts` — `server-only` : `generalDeps(session)` → vraies dépendances (`saveDraftField`, `uploadImageAsset` de core/sanity).
- `errors.ts` — message affichable d'une erreur (AdminAuthError / SanityWriteError), sinon message générique.
- `actions.ts` — `'use server'` : `saveGeneralValueAction`, `removeGeneralImageAction` (petits JSON seulement).
- `upload-route.ts` — logique de la route d'envoi sans Next : `handleGeneralImageUpload(request, deps)`, `readBodyCapped`.
- `upload-client.ts` — navigateur : `uploadGeneralImageRequest(form)` (fetch de la route, résultat normalisé), `GENERAL_IMAGE_ROUTE`.
- `load.ts` — `server-only` : `loadGeneralSettings()` (getDocumentState, jeton Viewer).
- `GeneralForm.tsx` — client : l'écran (formulaire, aperçus, autosave).
- `GeneralLoadError.tsx`, `GeneralSkeleton.tsx`, `skeleton.module.css` (partagé avec overview et team), `general.module.css`.
- Tests : `fields.test.ts`, `images.test.ts`, `save.test.ts`, `actions.test.ts` (actions + vrai `route.ts`),
  `upload-route.test.ts`, `upload-client.test.ts`, `debounce.test.ts`, `GeneralForm.test.tsx`, `layout.test.ts`
  (règles CSS de la mise en page étroite).

## Contrats

- Entrées : `adminConfig.settings` (`{ type: 'siteSettings', id: 'siteSettings' }`), `adminConfig.site` ; `getDocumentState`
  (core/sanity) ; `readSanityEnv` (projectId, dataset pour les URL du CDN).
- Sorties (toutes `{ ok: true, … } | { ok: false, error }`, messages en anglais) :
  - server action `saveGeneralValueAction({ field: 'title' | 'description', value: string } | { field: 'allowIndexing', value: boolean })`
  - server action `removeGeneralImageAction({ slot })`
  - route `POST /admin/settings/general/image`, multipart `{ slot: 'faviconLight' | 'faviconDark' | 'socialImage', file }`
    → 200 `{ ok, image: { ref, url, width, height } }` ; refus métier `{ ok: false, error }` (400 / 403 / 503 / 500) ;
    refus de la garde (401/403), d'origine (403), de taille (413) ou corps illisible (400) : `{ error: { code, message } }`.
    Côté client, `uploadGeneralImageRequest` ramène tout à `{ ok: false, error }`.
- Dépend de : `core/auth/session` (requireCapability, jsonError, authErrorResponse), `core/auth/request`
  (isSameOriginRequest), `core/sanity` (saveDraftField, uploadImageAsset, validateFieldValue), `core/autosave`
  (saving / saved / failed), kit `@/admin/ui`. Utilisé par : les routes B2 seulement.

## Comportement (LLM context B2)

- Favicon → logo de la sidebar : après un envoi ou un retrait réussi (ou annulé), `siteLogo.set(dark ?? light)`
  (`core/site-logo.ts`) met à jour le logo en haut de la sidebar sans recharger la coque ; rien au montage (le serveur
  l'a déjà lu).
- Titre et description : validation immédiate côté client (`validateFieldValue` avec le FieldDef) puis envoi 600 ms après
  la dernière frappe (ou à la sortie du champ, ou au départ de la page : `pagehide` + démontage). Seule la dernière valeur part.
- Compteur « 25 / 60 » ; au-delà de la limite : chiffre en `--k-interactive-warning` (pas d'orange dans le DS), saisie non
  bloquée (pas d'attribut `maxLength`), message « Too long: not saved until it fits. », et RIEN n'est envoyé. Titre vidé :
  « Title is required. », rien n'est envoyé. Retours à la ligne de la description aplatis à l'envoi.
- Interrupteur « Search engines » : envoi immédiat ; en cas de refus il revient à sa valeur et le message s'affiche.
  Désactivé : note « Search engines won't index any page, whatever each page's own setting. »
- Images : « Upload » (sélecteur) ou glisser-déposer sur l'aperçu social ; envoi immédiat par la route d'envoi (asset
  Sanity puis référence dans le brouillon) ; × retire la référence (l'asset reste dans la médiathèque) avec retour arrière si refus. Favicon sombre
  absent : l'aperçu sombre montre le clair + « No dark favicon: the light one is used everywhere. ». Ratio : favicon non
  carré ou image sociale ≠ 1,905 (±3 %) ou < 1200 px → avertissement, image acceptée.
- Chaque écriture passe par `autosave.saving()` puis `saved()` / `failed(message)` (Top bar « Draft saved automatically »).
- Aperçus Google et réseaux sociaux mis à jour pendant la frappe (titre vide → nom du site ; URL : `site.url` si https,
  sinon `https://<domaine>` ; description sociale coupée au mot à 45 caractères, comme le Figma).
- Mise en page : aperçus à droite (colonne 440) quand la zone a la place (écran ≳ 1 272 px) ; en dessous, ils passent SOUS
  le formulaire (`flex-wrap`, sans media query) ; dans une rangée d'images, les favicons / l'image sociale passent sous les
  libellés quand la colonne manque de place (FOLLOWUPS #26 : à 1 024 px, « Favicon » s'écrivait en colonne d'une lettre).
- Taille max d'un envoi : 5 Mo (« … · 5 MB max » sous chaque emplacement ; « This image is larger than 5 MB. Use a smaller
  file. » côté navigateur ET serveur, même constante) ; la route coupe tout corps au-delà de `UPLOAD_MAX_BODY` (annoncé
  ou réel) avant de le décoder.
- États : chargement (`loading.tsx`, squelette), erreur de lecture (`GeneralLoadError`), document absent (Callout), lecture
  seule sans `content.write` (Callout, champs désactivés, pas d'Upload ni de ×), envoi en cours (barre de progression).

## Forces

- Double validation : client (retour immédiat) et serveur (zod dans `save.ts` + FieldDef dans `saveDraftField`).
- Le format d'une image est vérifié sur ses OCTETS (PNG, JPEG, WebP, ICO, SVG), pas sur le type MIME annoncé ; puis
  `uploadImageAsset` (core/sanity) revérifie droit et type en liste blanche.
- Envoi hors server action (FOLLOWUPS #40) : `serverActions.bodySizeLimit` n'a plus à être relevé pour B2 (SEC-02).
- `fields.test.ts` exécute les vraies règles du schéma : un changement de limite dans Sanity casse le test.
- 71 tests (dont les jsdom de `GeneralForm.test.tsx`) ; vérifié à la main : frappe → brouillon réel dans `development`
  (jeton robot de dev) ; mise en page vue à 1 024, 1 280 et 1 440 px (aucun débordement horizontal).

## Faiblesses et limites connues

- La mise en page étroite n'est vérifiée qu'en arithmétique (`layout.test.ts`) et à l'œil : jsdom ne calcule pas le rendu.
- ICO : accepté par l'admin mais non vérifié contre le pipeline d'images de Sanity (un refus éventuel s'affiche proprement).
- Pas de choix « dans la médiathèque (C5) » (proposé par le Figma) : seulement un fichier local.
- Dernier écrit gagne (pas de `ifRevisionID`), comme le reste de core/sanity.
- Envoi d'image non testé contre le vrai Sanity (pour ne pas laisser d'assets de test dans `development`).

## Points sensibles

- Chaque action commence par `requireCapability('content.write', 'action')`, la route d'envoi par
  `requireCapability('content.write', 'route')` AVANT de lire le corps, puis contrôle l'origine (CSRF) ; n'écrit que
  `drafts.siteSettings`.
- Aucune donnée sensible vers le client : `GeneralView` ne contient que des textes et des URL publiques du CDN.
- Ne JAMAIS écrire `scripts` ici (B3, `settings.code`) : le schéma zod n'accepte que `title`, `description`, `allowIndexing`
  et les trois emplacements d'image.
- SVG accepté pour les favicons : servi par cdn.sanity.io (autre origine), jamais injecté dans l'admin.

## Pièges

- `Input`/`Textarea` du kit : `showCount` + `maxLength` bloquerait la frappe → compteur construit ici, sans `maxLength`.
- `Input` étale ses props APRÈS son `aria-invalid` : passer `aria-invalid` explicitement (sinon `undefined` l'écrase).
- Un Server Component ne peut pas rendre `<Button>` du kit (il porte un `onClick`) : `buttonClassName` + `ButtonContent`.
- NE PAS remettre l'envoi d'image dans une server action : il faudrait relever `serverActions.bodySizeLimit` pour toute
  l'admin (SEC-02). Les actions de B2 ne portent que de petits JSON.
- La route est SOUS le matcher du proxy (contrairement à /admin/media/upload) : Next y met le corps en mémoire tampon
  jusqu'à 10 Mo (`proxyClientMaxBodySize`). `UPLOAD_MAX_BODY` (≈ 5,06 Mo) doit rester en dessous.
- `route.ts` ne peut pas vivre dans le dossier de `page.tsx` (conflit Next) : d'où le sous-dossier `image/`.
- Largeurs de la mise en page : `.form` (base 480), `.meta` (base 160), `.previews` (440), favicons (2 × 180 + 16) ; en
  changer une déplace les seuils de passage à la ligne → relancer `layout.test.ts` et regarder à 1 024 px.
- `sniffImageKind` lit les octets en Latin-1 : le BOM UTF-8 d'un SVG y apparaît comme les trois caractères EF BB BF (`\u00EF\u00BB\u00BF` dans la regex), pas comme U+FEFF.

## Comment modifier

- Nouveau champ texte : FieldDef dans `fields.ts` (même limite que le schéma), branche zod dans `saveValueSchema`, champ dans
  `GeneralForm.tsx` + `view.ts` ; `fields.test.ts` vérifie la concordance.
- Nouveau format d'image : `ImageKind`, `IMAGE_MIME`, `SLOT_FORMATS`, détection dans `sniffImageKind` + test.
- Taille max : `UPLOAD_MAX_BYTES` (libellé, message et `UPLOAD_MAX_BODY` suivent) ; rester sous les 10 Mo du proxy ;
  tests : `save.test.ts`, `images.test.ts`, `upload-route.test.ts`, `GeneralForm.test.tsx`.
- Seuils de mise en page : bases flex dans `general.module.css` + constantes de `layout.test.ts`.

## Tests

`npx vitest run src/admin/features/general` — FieldDef ↔ schéma, images (URL, ratio, octets, noms), cœur des écritures (zod,
formats, taille, asset illisible), actions avec faux client Sanity (brouillon créé depuis le publié en une transaction,
validation serveur, refus de la garde, dev sans jeton d'écriture), vrai `route.ts` d'envoi (garde en contexte `route`
en premier, corps non lu si refus, origine, `uploadImageAsset`, référence écrite, refus de Sanity traduit, plus
d'action d'envoi exportée), logique de la route (ordre, 413 annoncé / réel, multipart, erreurs), client de la route
(fetch, normalisation, redirection, réseau), debounce, formulaire jsdom (600 ms, dépassement, titre
vide, erreur serveur, interrupteur, envoi, 5 Mo, ×, lecture seule), mise en page étroite (`layout.test.ts`).
Non couvert : rendu réel de la mise en page (à l'œil à 1 024 / 1 280 / 1 440 px).
À la main : `/admin/settings/general` (session de dev, rôle au choix), taper dans Title → Top bar « Draft saved automatically ».

## Décisions et « À trancher »

- FieldDef de `siteSettings` locaux à la feature (le contrat `AdminConfig.settings` n'a pas de champs), testés contre le schéma.
- Dépassement de longueur : saisie libre, mais pas d'enregistrement tant que la valeur dépasse (le serveur refuserait).
- Couleur « orange » du Figma → `--k-interactive-warning` (le DS n'a pas d'orange).
- Taille max 5 Mo (constat DOC-20) : alignée sur `ImageUpload` et `pages/server/upload.ts`.
- FOLLOWUPS #40 (2026-09-27) : envoi par route handler plutôt que server action, pour rendre `bodySizeLimit` au défaut.
- Écran étroit : aperçus sous le formulaire plutôt que colonne réduite (le Figma ne dessine que 1 440 px).

## Demandes de contrat

- ~~orchestrateur (`next.config.ts`) : retirer `serverActions.bodySizeLimit: '6mb'`~~ — **fait** (vérifié le 2026-09-27,
  SEC-02).
- **orchestrateur (contrat `manifest.ts`)** : facultatif, `AdminConfig.settings.fields?: FieldDef[]` pour sortir les
  FieldDef de `siteSettings` du code de la feature.
