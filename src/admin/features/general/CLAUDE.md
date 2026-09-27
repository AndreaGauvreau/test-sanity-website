# features/general (B2 · Site Settings › General) — LLM context

> Propriétaire : settings · Figma : B2 (docs/admin/figma/screens/B2.md, B2.ui.png) · Mis à jour : 2026-09-27

## Utilité

Réglages généraux du site dans le document unique `siteSettings` : titre (≤ 60), description (≤ 160), favicons clair et
sombre, image sociale (1200 × 630), indexation. Pour les trois rôles (kuartz, client, editor : tous ont `content.write`).
Route : `/admin/settings/general` (`src/app/admin/(shell)/settings/general/page.tsx` + `loading.tsx`).
Ne fait pas : les scripts (`siteSettings.scripts`, B3, feature code), le SEO d'une page (C2), la publication (E1).

## Fichiers

- `fields.ts` — FieldDef des champs de B2 (le manifeste ne déclare que le document), formats et taille max des envois, `acceptFor`, `formatsLabel`. Pur.
- `images.ts` — référence d'asset → URL du CDN (`imageUrlFromRef`, `toGeneralImage`), avertissements de ratio, reconnaissance du format par les octets (`sniffImageKind`), nom de fichier sûr. Pur.
- `view.ts` — `GeneralView` (modèle passé au client), `toGeneralView`, `publicUrl`, `truncateWords`. Pur.
- `debounce.ts` — `createDebouncer` (600 ms par champ, flush, cancel). Pur.
- `save.ts` — cœur des server actions (zod + règles), dépendances injectées (`GeneralDeps`). Sans Next.
- `errors.ts` — message affichable d'une erreur d'action (AdminAuthError / SanityWriteError), sinon message générique.
- `actions.ts` — `'use server'` : `saveGeneralValueAction`, `uploadGeneralImageAction`, `removeGeneralImageAction`.
- `load.ts` — `server-only` : `loadGeneralSettings()` (getDocumentState, jeton Viewer).
- `GeneralForm.tsx` — client : l'écran (formulaire, aperçus, autosave).
- `GeneralLoadError.tsx`, `GeneralSkeleton.tsx`, `skeleton.module.css` (partagé avec overview et team), `general.module.css`.
- Tests : `fields.test.ts`, `images.test.ts`, `save.test.ts`, `actions.test.ts`, `debounce.test.ts`, `GeneralForm.test.tsx`.

## Contrats

- Entrées : `adminConfig.settings` (`{ type: 'siteSettings', id: 'siteSettings' }`), `adminConfig.site` ; `getDocumentState`
  (core/sanity) ; `readSanityEnv` (projectId, dataset pour les URL du CDN).
- Sorties (server actions, toutes `{ ok: true, … } | { ok: false, error }`, messages en anglais) :
  - `saveGeneralValueAction({ field: 'title' | 'description', value: string } | { field: 'allowIndexing', value: boolean })`
  - `uploadGeneralImageAction(FormData { slot: 'faviconLight' | 'faviconDark' | 'socialImage', file })` → `{ ok, image: { ref, url, width, height } }`
  - `removeGeneralImageAction({ slot })`
- Dépend de : `core/auth/session` (requireCapability), `core/sanity` (saveDraftField, getWriteClient, validateFieldValue,
  toWriteError), `core/autosave` (saving / saved / failed), kit `@/admin/ui`. Utilisé par : la route B2 seulement.

## Comportement (LLM context B2)

- Titre et description : validation immédiate côté client (`validateFieldValue` avec le FieldDef) puis envoi 600 ms après
  la dernière frappe (ou à la sortie du champ, ou au départ de la page : `pagehide` + démontage). Seule la dernière valeur part.
- Compteur « 25 / 60 » ; au-delà de la limite : chiffre en `--k-interactive-warning` (pas d'orange dans le DS), saisie non
  bloquée (pas d'attribut `maxLength`), message « Too long: not saved until it fits. », et RIEN n'est envoyé. Titre vidé :
  « Title is required. », rien n'est envoyé. Retours à la ligne de la description aplatis à l'envoi.
- Interrupteur « Search engines » : envoi immédiat ; en cas de refus il revient à sa valeur et le message s'affiche.
  Désactivé : note « Search engines won't index any page, whatever each page's own setting. »
- Images : « Upload » (sélecteur) ou glisser-déposer sur l'aperçu social ; envoi immédiat (asset Sanity puis référence dans
  le brouillon) ; × retire la référence (l'asset reste dans la médiathèque) avec retour arrière si refus. Favicon sombre
  absent : l'aperçu sombre montre le clair + « No dark favicon: the light one is used everywhere. ». Ratio : favicon non
  carré ou image sociale ≠ 1,905 (±3 %) ou < 1200 px → avertissement, image acceptée.
- Chaque écriture passe par `autosave.saving()` puis `saved()` / `failed(message)` (Top bar « Draft saved automatically »).
- Aperçus Google et réseaux sociaux mis à jour pendant la frappe (titre vide → nom du site ; URL : `site.url` si https,
  sinon `https://<domaine>` ; description sociale coupée au mot à 45 caractères, comme le Figma).
- États : chargement (`loading.tsx`, squelette), erreur de lecture (`GeneralLoadError`), document absent (Callout), lecture
  seule sans `content.write` (Callout, champs désactivés, pas d'Upload ni de ×), envoi en cours (barre de progression).

## Forces

- Double validation : client (retour immédiat) et serveur (zod dans `save.ts` + FieldDef dans `saveDraftField`).
- Le format d'une image est vérifié sur ses OCTETS (PNG, JPEG, WebP, ICO, SVG), pas sur le type MIME annoncé.
- `fields.test.ts` exécute les vraies règles du schéma : un changement de limite dans Sanity casse le test.
- 50 tests (dont 10 jsdom) ; vérifié à la main : frappe → brouillon réel dans `development` (jeton robot de dev).

## Faiblesses et limites connues

- Envoi limité à 1 Mo : limite par défaut du corps d'une server action (voir Demandes de contrat).
- ICO : accepté par l'admin mais non vérifié contre le pipeline d'images de Sanity (un refus éventuel s'affiche proprement).
- Pas de choix « dans la médiathèque (C5) » (proposé par le Figma) : seulement un fichier local.
- Dernier écrit gagne (pas de `ifRevisionID`), comme le reste de core/sanity.
- Envoi d'image non testé contre le vrai Sanity (pour ne pas laisser d'assets de test dans `development`).

## Points sensibles

- Chaque action commence par `requireCapability('content.write', 'action')` ; n'écrit que `drafts.siteSettings`.
- Aucune donnée sensible vers le client : `GeneralView` ne contient que des textes et des URL publiques du CDN.
- Ne JAMAIS écrire `scripts` ici (B3, `settings.code`) : le schéma zod n'accepte que `title`, `description`, `allowIndexing`
  et les trois emplacements d'image.
- SVG accepté pour les favicons : servi par cdn.sanity.io (autre origine), jamais injecté dans l'admin.

## Pièges

- `Input`/`Textarea` du kit : `showCount` + `maxLength` bloquerait la frappe → compteur construit ici, sans `maxLength`.
- `Input` étale ses props APRÈS son `aria-invalid` : passer `aria-invalid` explicitement (sinon `undefined` l'écrase).
- Un Server Component ne peut pas rendre `<Button>` du kit (il porte un `onClick`) : `buttonClassName` + `ButtonContent`.
- `sniffImageKind` lit les octets en Latin-1 : le BOM UTF-8 d'un SVG y apparaît comme les trois caractères EF BB BF (`\u00EF\u00BB\u00BF` dans la regex), pas comme U+FEFF.

## Comment modifier

- Nouveau champ texte : FieldDef dans `fields.ts` (même limite que le schéma), branche zod dans `saveValueSchema`, champ dans
  `GeneralForm.tsx` + `view.ts` ; `fields.test.ts` vérifie la concordance.
- Nouveau format d'image : `ImageKind`, `IMAGE_MIME`, `SLOT_FORMATS`, détection dans `sniffImageKind` + test.
- Taille max : `UPLOAD_MAX_BYTES` (et `serverActions.bodySizeLimit` dans next.config.ts, hors de ce module).

## Tests

`npx vitest run src/admin/features/general` — FieldDef ↔ schéma, images (URL, ratio, octets, noms), cœur des actions (zod,
formats, taille, asset illisible), actions avec faux client Sanity (brouillon créé depuis le publié en une transaction,
validation serveur, refus de la garde, dev sans jeton d'écriture), debounce, formulaire jsdom (600 ms, dépassement, titre
vide, erreur serveur, interrupteur, envoi, 1 Mo, ×, lecture seule).
À la main : `/admin/settings/general` (session de dev, rôle au choix), taper dans Title → Top bar « Draft saved automatically ».

## Décisions et « À trancher »

- FieldDef de `siteSettings` locaux à la feature (le contrat `AdminConfig.settings` n'a pas de champs), testés contre le schéma.
- Dépassement de longueur : saisie libre, mais pas d'enregistrement tant que la valeur dépasse (le serveur refuserait).
- Couleur « orange » du Figma → `--k-interactive-warning` (le DS n'a pas d'orange).

## Demandes de contrat

- **orchestrateur (`next.config.ts`)** : `experimental.serverActions.bodySizeLimit: '5mb'` pour accepter des images sociales
  de plus de 1 Mo ; puis relever `UPLOAD_MAX_BYTES`.
- **auth-core (`core/sanity`)** : une aide `uploadImageAsset(session, bytes, { filename, contentType })` (jeton de
  l'utilisateur, erreurs traduites) partagée avec media / cms ; ce module appelle `getWriteClient(session).assets.upload`.
- **orchestrateur (contrat `manifest.ts`)** : facultatif, `AdminConfig.settings.fields?: FieldDef[]` pour sortir les
  FieldDef de `siteSettings` du code de la feature.
