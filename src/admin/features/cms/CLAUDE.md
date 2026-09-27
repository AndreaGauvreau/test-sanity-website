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
- **Dépublier / supprimer un élément EN LIGNE** : programmé pour le prochain Publish par le moteur (`publish.stage`),
  annulable (`publish.unstage`) ; rien n'est écrit sur l'id publié ici.
Ne fait pas : la publication (E1 seulement, question 3), le schéma (colonnes, champs et options du texte riche viennent
du code : `src/admin.config.ts`).

## Fichiers

- `lib/status.ts` — PUR : `computeStatus(published, draft)` (Live / Draft / Changed, champs système ignorés), `deepEqual`, `STATUS_LABELS`.
- `lib/order.ts` — PUR : ordre manuel `orderRank` (fractional-indexing) : `planMove`, `keyBetween`, `rankAfterLast`, `rebalance`, `sortByRank`, `targetIndexFromNeighbours`, `isValidRank`.
- `lib/list-query.ts` — PUR : tri (Manual order, Last updated, Title, Date), filtres is / is not, recherche, `canReorder`, `parseStoredQuery`.
- `lib/rows.ts` — PUR : `buildRows` (publiés + brouillons → lignes `CmsRow`), cellules (date « Sep 12, 2026 » UTC, slug, vignette, édition sur place), `countLabel`, `pluralize`.
- `lib/portable-text.ts` — PUR : `richTextConfigFor(field)` (options lues dans `FieldDef.richText`), `DEFAULT_RICH_TEXT`, `sanitizePortableText` (validation serveur), `toPlainText`, `isEmptyRichText`.
- `lib/staging.ts` — PUR : dépublier / supprimer au prochain Publish : `stagedFrom(status, ids)`, `statusMenu(status, staged)` (menu du statut, C3 et C4), `stagedLabel`, `partitionForDelete`, `runStage(client, ids, id, kind)`, `stagedToast`.
- `lib/slug.ts` — PUR : `slugify`, `uniqueSlug`, `articlePathFor`. `lib/image-url.ts` — PUR : URL CDN d'une image / d'un fichier Sanity.
- `server/actions-core.ts` — logique des actions (droit, zod, manifeste, brouillon) avec dépendances injectées ; testée.
- `server/actions.ts` — `'use server'` minces : `saveFieldAction`, `createItemAction`, `reorderAction`, `statusAction`, `deleteItemsAction`.
- `server/deps.ts` — SERVEUR : dépendances réelles (session, core/sanity) + `readCollectionDocs(type)`.
- `server/data.ts` — SERVEUR : `loadCollectionRows`, `loadItem` (`ItemView`), `shownOnFor`.
- `components/CollectionScreen.tsx` (+ `.module.css`) — C3 + G5 + sélection ; fournit `CollectionContext` au panneau. Tableau
  100 % kit : `CMSCell type="handle"` avec `gripProps` / `gripLabel` / `gripTooltip` (poignée focalisable), Row open et
  son remplissage posés par `CMSRow`.
- `components/ListTools.tsx` (+ css) — les 4 icônes G5 (réutilisé par features/media) ; recherche = `SearchField size="small"`
  du kit (28 px, à la hauteur des icônes : pas de saut de l'en-tête à l'ouverture).
- `components/useReorder.ts` — glisser-déposer accessible (pointeur + clavier) ; `moveIndex`, `targetFromOffset`, `neighbourOffset`.
- `components/ItemDrawer.tsx` (+ css) — C4 : champs, sauvegarde automatique, ⋯, confirmations ; `useFieldFocusRef` (champ
  `?field=` focalisé à l'ouverture, via `initialFocusRef` du Drawer du kit). `ItemDrawerState.tsx` — introuvable / erreur.
- `components/RichTextField/` — champ texte riche sur `@portabletext/editor` (outils du Figma, barre APG, lien).
- `components/fields/ImageField.tsx`, `MediaPicker.tsx`, `fields.module.css` — image d'une fiche (envoi, Media, retrait ;
  « Choose from Media » dans l'emplacement `actions` d'`ImageUpload`) ;
  types, limite et libellé « N MB max » tirés de `features/media/lib/upload-limits.ts` (jamais en dur).
- `components/useFieldSaver.ts` — `createFieldSaver` / `useFieldSaver` : attente de fin de frappe, dernière valeur, un envoi à la fois, `autosave`.
- `components/CollectionContext.tsx` — du panneau vers la liste : `updateRow`, `removeRow`, `staged` (actions programmées), `stage(id, kind | null)`.
- `components/stage-client.ts` — CLIENT : `stageClient` (`engineClient.publish.stage` / `unstage`) et `loadPublishStatus()` (null si le moteur est injoignable).
- Tests : `lib/lib.test.ts`, `lib/portable-text.test.ts`, `server/actions-core.test.ts`, `components/components.test.tsx`,
  `components/CollectionScreen.test.tsx` (C3 avec faux Next, actions et moteur), `components/drawer-focus.test.tsx`
  (focus initial du panneau ouvert au montage).
- Routes (minces) : `src/app/admin/(shell)/cms/page.tsx` (→ première collection), `cms/not-found.tsx`,
  `cms/[collectionId]/layout.tsx` (LA LISTE), `cms/[collectionId]/page.tsx` (vide), `cms/[collectionId]/[id]/{page,not-found,error}.tsx` (le panneau).

## Contrats

- Entrées : `AdminConfig.collections` (`CollectionDef` : `columns`, `fields` — dont `FieldDef.richText` des champs
  `portableText` —, `filters`, `searchFields`, `orderable`, `defaultSort`, `titleField`, `slugField`, `articlePath`),
  `AdminConfig.pages` (où la collection apparaît), `site`. Sanity : documents du type (publiés + `drafts.<id>`,
  perspective raw, jeton Viewer) ; assets image (nom, taille, altText). Moteur (relais `/admin/api/engine`, droit
  `publish.run` au relais, `content.write` au moteur) : `GET publish/status` (actions programmées =
  `pending.content[].action`), `POST publish/stage { kind, id }`, `POST publish/unstage { id }` → `PublishStatus`.
- Sorties : server actions ci-dessus (résultat `{ ok: true, … } | { ok: false, error, field? }`, jamais d'exception) ;
  composants `ListTools`, `RichTextField`, `useFieldSaver` réutilisables par d'autres features (media les utilise).
- Dépend de : `core/auth` (`requireCapability('content.write')`), `core/sanity` (`getReadClient`, `getDocumentState`,
  `setDraftFields`, `createDraft`, `deleteDraft`, `validateFieldValue`, `isSafeHref` ; aucune écriture de tableau lu puis
  réécrit ici, donc pas besoin de `updateDraftArray` & co : le texte riche envoie sa valeur entière, l'ordre manuel écrit
  `orderRank` par document), `core/engine/client`
  (`engineClient.publish.status/stage/unstage`), `core/autosave`, kit `@/admin/ui`, `features/media` (route d'envoi,
  `listImagesAction`, `lib/upload-limits` pour le champ image). Utilisé par : la coque (liens et comptes de la sidebar,
  relus par `router.refresh()`), Media (liens d'usage).

## Comportement

- **Statut** (C3) : Live = publié sans brouillon ou brouillon identique ; Draft = jamais publié ; Changed = brouillon
  différent. Menu (`statusMenu`) : Draft → « Delete draft » (confirmation, supprime l'élément tout de suite) ; Live →
  « Unpublish », « Delete » ; Changed → « Discard changes » (supprime le brouillon), « Unpublish », « Delete ».
  Unpublish / Delete d'un élément en ligne : confirmation, puis `publish.stage` — rien ne change sur le site avant le
  prochain Publish (E1 le liste avec « Will be unpublished / deleted »). La pastille dit alors « Unpublishing » /
  « Deleting » et le menu n'offre que « Keep online » / « Don’t delete » (`publish.unstage`, sans confirmation).
  L'état programmé est relu dans le moteur au chargement de la liste et après chaque `router.refresh()` ; moteur
  injoignable → pastilles normales, l'erreur ne s'affiche qu'au clic (toast).
- **Comptes de la sidebar** : `router.refresh()` après création, suppression (Delete draft, sélection, panneau) et
  programmation / annulation — la coque relit les comptes et la Top bar son état.
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
  seulement si publié), Discard changes (si Changed), Unpublish (en ligne) ou Keep online / Don’t delete (programmé),
  Delete (brouillon : tout de suite ; en ligne : au prochain Publish) ; Tag « Unpublishing » / « Deleting » si
  programmé (état partagé avec la liste par `CollectionContext`). Pied : « Shown on /blog/<slug>, /blog. Need
  another field? Ask Kuartz — fields are defined in code. ». Fermeture : ✕, Échap, voile → retour à la liste (animation
  de sortie, puis navigation).
- **Sélection** : case « tout » (lignes visibles), barre « N selected » ; « Delete N » (`partitionForDelete`) : les
  brouillons jamais publiés sont supprimés tout de suite, les éléments en ligne sont programmés pour suppression au
  prochain Publish (note « 3 live posts will be deleted at the next Publish », texte de confirmation
  `deleteManyDescription`) ; ceux déjà programmés sont ignorés. Toast récapitulatif, erreurs comprises.
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
- Aucune écriture sur l'id publié, même pour dépublier / supprimer : le moteur l'applique au Publish (étape 1).
- Options du texte riche lues dans le manifeste : l'éditeur et la validation serveur appliquent la même config.
- Vérifié en vrai sur le dataset development (écriture, statut, discard, delete, ordre, texte riche) puis remis en état.

## Faiblesses et limites connues

- L'état « programmé » vient du moteur : si le moteur est arrêté, la liste ne le montre pas (pas d'erreur visible avant
  un clic). La sélection programme les suppressions une à une (une requête par élément en ligne).
- Un élément dépublié garde son contenu en brouillon (Sanity `document.unpublish`) : il repasse « Draft » après Publish.
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
- Dépublier / supprimer passent par le relais signé du moteur (`engineClient`), jamais par une écriture Sanity ici.
- Champ `portableText` sans `richText` dans le manifeste : `DEFAULT_RICH_TEXT` (options du corps d'article) s'applique ;
  déclarer `richText` pour tout nouveau champ (sinon titres, listes et images y seraient permis).

## Pièges

- Next 16 : la liste est dans `[collectionId]/layout.tsx` ; `useSelectedLayoutSegment()` y donne l'id ouvert.
- `@portabletext/editor` regroupe ses événements `mutation` par paquets d'une seconde : `RichTextField` suit les
  `patch` (immédiats) et relit `editor.getSnapshot()` au blur et à la fermeture (`registerFlush`), sinon la dernière
  frappe avant Échap est perdue. Rendus (`NODES`) déclarés au niveau du module (sinon réenregistrés à chaque frappe).
- Drawer ouvert AU MONTAGE : le kit attend son portail frame après frame (plus de filet ici) ; `initialFocusRef` de
  `useFieldFocusRef` est une référence STABLE dont `current` est lu au moment du focus (ne pas la recréer à chaque rendu :
  l'effet du kit se relancerait et rendrait le focus au déclencheur).
- Les server actions sont exécutées une à une par le client : les sauvegardes s'enchaînent, d'où l'enregistreur par champ.
- `CMSRow` pose lui-même le remplissage (`[data-row-filler]`) puis `RowOpen` : ne pas ajouter de cellule vide ici (deux
  remplissages partageraient la place). Collection sans ordre manuel : `grip={false}` + `.noGrip` (place de la poignée
  gardée pour aligner les cases).
- `useReorder` retrouve la poignée par `[data-grip="<id>"]` (focus qui suit la ligne au clavier) : garder `data-grip` dans
  `gripProps`.
- jsdom : pas de jest-dom (comparer `document.activeElement`, `getAttribute`) ; l'éditeur rend la valeur de départ en asynchrone (`findByText`).
- `stagedFrom` filtre par ID (les lignes de la collection), pas par `type` : le moteur simulé peut mettre `type: 'document'`
  pour un élément sans brouillon.
- `CollectionScreen` a une fonction locale `stageRow` et importe `runStage` de lib/staging : ne pas les confondre (même
  portée : une homonymie casserait `stage`).
- `richText` absent ≠ `richText: {}` : absent → défaut ; `{}` → paragraphes seuls, sans marque ni lien.

## Comment modifier

- **Nouvelle colonne / nouveau champ** : `src/admin.config.ts` (site-adapter) ; rien ici tant que le genre existe
  (`buildCell`, `FieldControl` dans `ItemDrawer.tsx`, `normalizeFieldValue` dans `actions-core.ts`).
- **Nouveau genre de champ dans le panneau** : un `case` dans `FieldControl` + normalisation serveur dans
  `normalizeFieldValue` + test dans `actions-core.test.ts`.
- **Outils du texte riche d'un champ** : `FieldDef.richText` dans `src/admin.config.ts` (site-adapter). Un nouveau
  style / décorateur a besoin d'un bouton dans `Toolbar` et d'un rendu dans `NODES` (RichTextField.tsx) ; sinon il est
  accepté mais sans outil.
- **Nouvelle action de statut** : `statusMenu` (lib/staging.ts, commun à C3 et C4) + `onAction` de CollectionScreen et
  ⋯ d'ItemDrawer + `statusActionCore` (écriture de brouillon) ou `runStage` (au prochain Publish) + test.
- **Nouveau critère de tri** : `sortOptions` / `sortRows` / `directionOptions` (list-query.ts) + test.

## Tests

`npx vitest run src/admin/features/cms` — statut, ordre (clé entre voisins, renumérotation), lignes, tri / filtres /
recherche, stockage de session, slug, Portable Text (conversion, liens, clés, FAQ), actions avec faux Sanity (droit
d'abord, FieldDef, champ hors manifeste, autre collection, slug unique, date, image, discard, delete, création, ordre),
enregistreur (attente, dernière valeur, file, erreurs), glisser-déposer au clavier, ListTools (recherche 28 px),
ImageField (« Choose from Media » dans la ligne d'actions vide / la ligne fichier avant Replace), RichTextField,
`FieldDef.richText` (lib et serveur), staging (menu, état, partition, runStage), C3 (refresh après Delete draft,
Unpublish → `publish.stage`, état relu au chargement + Keep online → `unstage`, sélection mixte ; poignée du kit nommée,
décrite, soulevée au clavier, désactivée hors « Manual order », absente sans ordre manuel ; un seul remplissage par ligne),
focus initial du panneau (premier champ, champ demandé, repli, état introuvable).
Non couvert en automatique : glisser au pointeur, panneau complet (vérifiés à la main dans Chrome).
À la main : `/admin/cms/blog`, `/admin/cms/faq` (ordre manuel), `/admin/cms/blog/post-demo-carrier-portals-a-checklist`,
rôles kuartz et client (`POST /admin/api/auth/dev-role`). Remettre en état les brouillons de test (Discard changes)
et annuler les actions programmées (Keep online / Don’t delete) avant tout Publish.

## Décisions et « À trancher »

- Question 3 : pas de publication élément par élément (orchestrateur) — le statut n'offre pas « Publish ».
- Dépublier / supprimer un élément en ligne : programmé pour le prochain Publish (FOLLOWUPS #27/#31), jamais immédiat ;
  Unpublish sans ton destructeur (contenu gardé), Delete destructeur.
- Options du texte riche : le manifeste fait foi (`FieldDef.richText`), plus de surcharge par `<type>.<champ>` ici.
- Tri « Manual order » ajouté au menu G5 (le Figma ne le montre pas) pour les collections ordonnables ; défaut = manifeste.
- « Choose from Media » : passé à `ImageUpload actions` (ligne fichier avant Replace une fois rempli, ligne sous la zone
  sinon) ; pas de menu sur Replace.
- La case de la ligne ouverte est cochée pendant que le panneau est ouvert (C4), sans changer la sélection.

## Demandes de contrat

- Aucune demande ouverte au kit. Livrés et branchés : emplacement `actions` d'`ImageUpload` et `SearchField size="small"`
  (ui-foundations, FOLLOWUPS #38) ; poignée `gripProps`, focus du Drawer ouvert au montage, Row open au bord droit
  (ui-composites, FOLLOWUPS #40).
- **site-adapter** : route d'aperçu du brouillon utilisable depuis l'admin (Preview ↗ de C4).
