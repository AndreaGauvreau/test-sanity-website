# features/cms — Collections du CMS (liste, fiche, barre d'outils) — LLM context

> Propriétaire : cms-media · Figma : C3, C4 (docs/admin/figma/screens/C3.md, C4.md), G5 (states/G5.md), fiches CMSCell,
> RowOpen, StatusSelect, SelectionBar, FilterPopover, Drawer, RichTextField, ImageUpload · Mis à jour : 2026-09-27

## Utilité

Gérer les éléments des collections déclarées dans `src/admin.config.ts` (`collections[]` : Blog/post, Testimonials,
FAQ) pour les trois rôles (droit `content.write`) :
- **C3** `/admin/cms/<collection>` : tableau façon tableur (colonnes du manifeste), statut calculé Live / Draft / Changed,
  édition sur place des textes courts, ordre manuel par glisser-déposer (clavier compris), sélection multiple ;
- **G5** : barre d'outils en 4 icônes (+ nouvel élément, ⇅ tri, ≡ filtres, ⌕ recherche) — partagée avec Media ;
- **C4** `/admin/cms/<collection>/<id>` : fiche dans un panneau de 810 px par-dessus la liste (URL partageable),
  champs du manifeste avec sauvegarde automatique dans le BROUILLON, texte riche Portable Text, menu ⋯.
Ne fait pas : la publication (E1 seulement, question 3), la dépublication ou la suppression d'un élément EN LIGNE
(voir Demandes de contrat), le schéma (colonnes et champs viennent du code).

## Fichiers

- `lib/status.ts` — PUR : `computeStatus(published, draft)` (Live / Draft / Changed, champs système ignorés), `deepEqual`, `STATUS_LABELS`.
- `lib/order.ts` — PUR : ordre manuel `orderRank` (fractional-indexing) : `planMove`, `keyBetween`, `rankAfterLast`, `rebalance`, `sortByRank`, `targetIndexFromNeighbours`, `isValidRank`.
- `lib/list-query.ts` — PUR : tri (Manual order, Last updated, Title, Date), filtres is / is not, recherche, `canReorder`, `parseStoredQuery`.
- `lib/rows.ts` — PUR : `buildRows` (publiés + brouillons → lignes `CmsRow`), cellules (date « Sep 12, 2026 » UTC, slug, vignette, édition sur place), `countLabel`, `pluralize`.
- `lib/portable-text.ts` — PUR : `RichTextConfig` par champ, `sanitizePortableText` (validation serveur), `toPlainText`, `isEmptyRichText`.
- `lib/slug.ts` — PUR : `slugify`, `uniqueSlug`, `articlePathFor`. `lib/image-url.ts` — PUR : URL CDN d'une image / d'un fichier Sanity.
- `server/actions-core.ts` — logique des actions (droit, zod, manifeste, brouillon) avec dépendances injectées ; testée.
- `server/actions.ts` — `'use server'` minces : `saveFieldAction`, `createItemAction`, `reorderAction`, `statusAction`, `deleteItemsAction`.
- `server/deps.ts` — SERVEUR : dépendances réelles (session, core/sanity) + `readCollectionDocs(type)`.
- `server/data.ts` — SERVEUR : `loadCollectionRows`, `loadItem` (`ItemView`), `shownOnFor`.
- `components/CollectionScreen.tsx` (+ `.module.css`) — C3 + G5 + sélection ; fournit `CollectionContext` au panneau.
- `components/ListTools.tsx` (+ css) — les 4 icônes G5 (réutilisé par features/media).
- `components/useReorder.ts` — glisser-déposer accessible (pointeur + clavier) ; `moveIndex`, `targetFromOffset`, `neighbourOffset`.
- `components/ItemDrawer.tsx` (+ css) — C4 : champs, sauvegarde automatique, ⋯, confirmations. `ItemDrawerState.tsx` — introuvable / erreur.
- `components/RichTextField/` — champ texte riche sur `@portabletext/editor` (outils du Figma, barre APG, lien).
- `components/fields/ImageField.tsx`, `MediaPicker.tsx`, `fields.module.css` — image d'une fiche (envoi, Media, retrait).
- `components/useFieldSaver.ts` — `createFieldSaver` / `useFieldSaver` : attente de fin de frappe, dernière valeur, un envoi à la fois, `autosave`.
- `components/useDrawerFocus.ts` — filet du focus initial d'un Drawer ouvert au montage.
- `components/CollectionContext.tsx` — `updateRow` / `removeRow` du panneau vers la liste.
- Tests : `lib/lib.test.ts`, `lib/portable-text.test.ts`, `server/actions-core.test.ts`, `components/components.test.tsx`.
- Routes (minces) : `src/app/admin/(shell)/cms/page.tsx` (→ première collection), `cms/not-found.tsx`,
  `cms/[collectionId]/layout.tsx` (LA LISTE), `cms/[collectionId]/page.tsx` (vide), `cms/[collectionId]/[id]/{page,not-found,error}.tsx` (le panneau).

## Contrats

- Entrées : `AdminConfig.collections` (`CollectionDef` : `columns`, `fields`, `filters`, `searchFields`, `orderable`,
  `defaultSort`, `titleField`, `slugField`, `articlePath`), `AdminConfig.pages` (où la collection apparaît), `site`.
  Sanity : documents du type (publiés + `drafts.<id>`, perspective raw, jeton Viewer) ; assets image (nom, taille, altText).
- Sorties : server actions ci-dessus (résultat `{ ok: true, … } | { ok: false, error, field? }`, jamais d'exception) ;
  composants `ListTools`, `RichTextField`, `useFieldSaver` réutilisables par d'autres features (media les utilise).
- Dépend de : `core/auth` (`requireCapability('content.write')`), `core/sanity` (`getReadClient`, `getDocumentState`,
  `setDraftFields`, `createDraft`, `deleteDraft`, `validateFieldValue`, `isSafeHref`), `core/autosave`, kit `@/admin/ui`,
  `features/media` (route d'envoi, `listImagesAction`). Utilisé par : la coque (liens de la sidebar), Media (liens d'usage).

## Comportement

- **Statut** (C3) : Live = publié sans brouillon ou brouillon identique ; Draft = jamais publié ; Changed = brouillon
  différent. Menu : Changed → « Discard changes » (confirmation, supprime le brouillon) ; Draft → « Delete draft »
  (confirmation, supprime l'élément) ; Live → « Unpublish » affiché mais DÉSACTIVÉ (pas encore relié à Publish).
- **Édition sur place** : textes courts (`string`, `slug`, `url`, `text` sans retour à la ligne) : clic / Entrée / F2,
  Entrée ou clic ailleurs valide, Échap annule ; affichage optimiste annulé si le serveur refuse (toast + contour rouge).
  Image, texte riche, liste fermée, date : clic = ouvrir le panneau sur ce champ (`?field=<nom>`).
- **Ordre manuel** (collections `orderable`) : seulement en tri « Manual order », sans filtre ni recherche (sinon poignée
  désactivée, infobulle). Pointeur : la ligne suit, les voisines glissent (150 ms ease-in-out). Clavier : Espace/Entrée
  soulève, ↑ ↓ Home End, Espace/Entrée dépose, Échap annule, annonces en zone live. Le serveur recalcule la clé entre
  les voisins envoyés : UNE écriture (`orderRank` dans le brouillon → l'élément passe Changed). Clés cassées → renumérotation.
- **Nouvel élément** (+) : brouillon `drafts.<uuid>` « Untitled post », slug unique, dates obligatoires = aujourd'hui,
  `orderRank` en fin de liste ; le panneau s'ouvre. Slug suit le titre tant que l'élément n'a jamais été publié et que
  le slug vaut `slugify(ancien titre)`.
- **Panneau** : champs en layout inline (libellé 120 px), image et texte riche empilés. Validation immédiate côté client
  (mêmes règles `validateFieldValue`) : une valeur invalide n'est pas envoyée. Sauvegarde 600 ms après la dernière
  frappe (liste fermée : tout de suite), au blur, et à la fermeture (y compris la dernière frappe du texte riche).
  En-tête : titre vivant, Tag de statut (Live info, Changed warning, Draft neutral). ⋯ : Preview ↗ (page publique,
  seulement si publié), Discard changes (si Changed), Delete (si Draft). Pied : « Shown on /blog/<slug>, /blog. Need
  another field? Ask Kuartz — fields are defined in code. ». Fermeture : ✕, Échap, voile → retour à la liste (animation
  de sortie, puis navigation).
- **Sélection** : case « tout » (lignes visibles), barre « N selected » ; Delete ne supprime que les brouillons jamais
  publiés (« Delete 2 drafts » + « 3 live posts can't be deleted here »).
- **G5** : tri gardé par collection dans `sessionStorage` (`kz-admin:cms:<id>`) avec les filtres et la recherche ;
  « / » ouvre la recherche ; point sur ≡ quand un filtre est actif.
- États : collection vide (« No posts yet » + « New post »), « No results » + Clear, élément introuvable / erreur dans
  le panneau, erreurs d'écriture en toast ou sous le champ.

## Forces

- Toute la logique métier est pure et testée (statut, ordre, filtres, conversion Portable Text, actions avec faux Sanity
  en mémoire qui applique réellement les mutations).
- Les actions n'acceptent qu'un NOM de champ du manifeste (jamais un chemin), revérifient que le document est du type de
  la collection, et valident avec le FieldDef (l'API Sanity n'applique pas le schéma).
- La liste vit dans le layout : ouvrir / fermer le panneau ne la recharge pas ; le panneau la met à jour par contexte.
- Vérifié en vrai sur le dataset development (écriture, statut, discard, delete, ordre, texte riche) puis remis en état.

## Faiblesses et limites connues

- Unpublish et suppression d'un élément EN LIGNE : non disponibles (menu désactivé) — il faut un mécanisme « au
  prochain Publish » côté moteur (Demandes de contrat).
- Preview ↗ ouvre la page PUBLIQUE (version en ligne), pas le brouillon : pas de route d'aperçu de brouillon pour l'admin.
- Date : `<input type="date">` natif (format de la langue du navigateur) au lieu de « Sep 8, 2026 » du Figma ; l'heure
  déjà enregistrée est gardée (sinon 00:00 UTC).
- Pas de concurrence optimiste (dernier écrit gagne) ; pas de pagination (1 000 documents par collection au plus).
- Pas de squelette de chargement du panneau (un `loading.tsx` faisait glisser le panneau deux fois) : la liste reste
  affichée pendant le chargement de la fiche.
- Champs `reference`, `array`, `object`, `cta` : pas d'éditeur dans le panneau (message « Ask Kuartz ») — aucune
  collection actuelle n'en a.
- Texte riche : les images du corps sont conservées et affichées en bloc « Image », mais on ne peut ni en ajouter ni en
  modifier depuis l'admin.
- Dev (`next dev`) : la première sauvegarde compile l'action, plusieurs secondes ; normal en production.

## Points sensibles

- JAMAIS publier ni muter l'id publié ici : toutes les écritures passent par `setDraftFields` / `createDraft` / `deleteDraft`.
- `requireCapability('content.write', 'action')` EN PREMIER dans chaque action (dans `actions-core.ts`) ; chaque page et
  le layout appellent `requireCapability('content.write')`.
- Ne jamais accepter un chemin de champ venant du navigateur : seulement `field` (nom) retrouvé dans `collection.fields`.
- `sanitizePortableText` refuse les liens dangereux (`javascript:`…) et les objets inconnus : le site rend ce texte.
- Les props client ne contiennent que du contenu (aucun jeton) ; `readCollectionDocs` est `server-only`.

## Pièges

- Next 16 : la liste est dans `[collectionId]/layout.tsx` ; `useSelectedLayoutSegment()` y donne l'id ouvert.
- `@portabletext/editor` regroupe ses événements `mutation` par paquets d'une seconde : `RichTextField` suit les
  `patch` (immédiats) et relit `editor.getSnapshot()` au blur et à la fermeture (`registerFlush`), sinon la dernière
  frappe avant Échap est perdue. Rendus (`NODES`) déclarés au niveau du module (sinon réenregistrés à chaque frappe).
- Kit Drawer ouvert AU MONTAGE : son focus initial peut rater (portail monté une frame plus tard) → `useDrawerFocus`.
- Les server actions sont exécutées une à une par le client : les sauvegardes s'enchaînent, d'où l'enregistreur par champ.
- `CMSRow` pose `RowOpen` après les cellules : une cellule vide extensible (`.filler`) le pousse au bord droit quand les
  colonnes sont plus étroites que le tableau (FAQ).
- jsdom : pas de jest-dom (comparer `document.activeElement`, `getAttribute`) ; l'éditeur rend la valeur de départ en asynchrone (`findByText`).

## Comment modifier

- **Nouvelle colonne / nouveau champ** : `src/admin.config.ts` (site-adapter) ; rien ici tant que le genre existe
  (`buildCell`, `FieldControl` dans `ItemDrawer.tsx`, `normalizeFieldValue` dans `actions-core.ts`).
- **Nouveau genre de champ dans le panneau** : un `case` dans `FieldControl` + normalisation serveur dans
  `normalizeFieldValue` + test dans `actions-core.test.ts`.
- **Outils du texte riche d'un champ** : `OVERRIDES` de `lib/portable-text.ts` (en attendant la demande de contrat).
- **Nouvelle action de statut** : `STATUS_ACTIONS` (CollectionScreen) + `statusActionCore` + test.
- **Nouveau critère de tri** : `sortOptions` / `sortRows` / `directionOptions` (list-query.ts) + test.

## Tests

`npx vitest run src/admin/features/cms` — statut, ordre (clé entre voisins, renumérotation), lignes, tri / filtres /
recherche, stockage de session, slug, Portable Text (conversion, liens, clés, FAQ), actions avec faux Sanity (droit
d'abord, FieldDef, champ hors manifeste, autre collection, slug unique, date, image, discard, delete, création, ordre),
enregistreur (attente, dernière valeur, file, erreurs), glisser-déposer au clavier, ListTools, RichTextField.
Non couvert en automatique : glisser au pointeur, panneau complet (vérifiés à la main dans Chrome).
À la main : `/admin/cms/blog`, `/admin/cms/faq` (ordre manuel), `/admin/cms/blog/post-demo-carrier-portals-a-checklist`,
rôles kuartz et client (`POST /admin/api/auth/dev-role`). Remettre en état les brouillons de test (Discard changes).

## Décisions et « À trancher »

- Question 3 : pas de publication élément par élément (orchestrateur) — le statut n'offre pas « Publish ».
- « Unpublish » Live désactivé (et Delete d'un élément en ligne) tant que Publish ne sait pas dépublier.
- Tri « Manual order » ajouté au menu G5 (le Figma ne le montre pas) pour les collections ordonnables ; défaut = manifeste.
- « Choose from Media » : bouton sous l'Image upload (le kit n'a pas de menu sur Replace).
- La case de la ligne ouverte est cochée pendant que le panneau est ouvert (C4), sans changer la sélection.

## Demandes de contrat

- **orchestrateur / manifest.ts** : options du texte riche dans `FieldDef` (ex. `richText?: { styles; lists; decorators;
  annotations; blockObjects }`) pour supprimer `OVERRIDES` de `lib/portable-text.ts` (connaissance du schéma côté admin).
- **engine-publish / publish-ui (contrat engine.ts)** : dépublier / supprimer un élément en ligne « au prochain Publish »
  (ex. `PendingContentItem` avec `action: 'unpublish' | 'delete'` + route pour le marquer) ; C3 et C4 l'attendent.
- **ui-composites** : (1) `CMSCell type="handle"` avec une poignée focalisable (`gripProps`), composée ici en attendant ;
  (2) `Drawer`/`useModalDialog` : focus initial raté quand la fenêtre est ouverte au montage (portail pas encore monté) ;
  (3) `RowOpen` au bord droit quand la grille est plus étroite que le tableau ; (4) `ImageUpload` : slot d'actions
  (« Choose from Media ») ; (5) `SearchField` 28 px pour les barres d'outils.
- **site-adapter** : route d'aperçu du brouillon utilisable depuis l'admin (Preview ↗ de C4).
