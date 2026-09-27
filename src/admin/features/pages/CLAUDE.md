# features/pages — LLM context

> Propriétaire : pages · Figma : C1, C2, C6, G1 (docs/admin/figma/screens/C1.md, C2.md, C6.md, states/G1.md) · Mis à jour : 2026-09-27 (FOLLOWUPS #40)
> Possède aussi : `src/app/admin/(shell)/pages/**` (routes minces).

## Utilité

Édition des pages du site (tous les rôles : kuartz, client, editor — droit `content.write` pour écrire) :
- **C1** `/admin/pages/<page>` : textes de la page, formulaire généré depuis `src/admin.config.ts` (sections en accordéon),
  enregistrement automatique en brouillon, aperçu schématique à droite.
- **C2** `/admin/pages/<page>/seo` : `seo.{metaTitle, metaDescription, ogImage, allowIndexing}`, aperçus Google / réseaux
  sociaux calculés comme le site, JSON-LD en lecture seule et arbre des titres lus dans le HTML public de la page.
- **C6** `/admin/pages/<page>/slug/seo` : modèle SEO des pages article d'une page listing (document `articleSeo-post`), avec
  variables `{{…}}` (VariableInput) et aperçu sur un article réel choisi (« Preview with »).
- `/admin/pages/<page>/slug` redirige vers C6 ; `/admin/pages/<page>/image` (POST) reçoit les images (C1, C2, C6).
- « Open in AI editor » (G1) → `/admin/editor?page=<id>&back=<écran courant>` (C1 : `/admin/pages/<id>`, C2 :
  `/admin/pages/<id>/seo`) quand `PageDef.aiEditor` et le droit `ai.editor` ; « ‹ Admin » de l'éditeur y revient.
Ne fait pas : publier (E1), éditer les collections (C3/C4, cms-media), le rich text, le schéma, le JSON-LD (écrit par Kuartz).

## Fichiers

- `screens.tsx` — SERVEUR : `PageContentScreen` (C1), `PageSeoScreen` (C2), `ArticleSeoScreen` (C6). Session d'abord, page du manifeste (inconnue → `notFound()`), lectures, états vides.
- `metadata.ts` — titre de l'onglet du navigateur (« Home · SEO »).
- `lib/manifest.ts` — PUR : `findPage`, liens (`pageHref`, `pageSeoHref`, `articleSeoHref`, `editorHref(pageId, back?)`), `articleOf`, **`resolveFieldAtPath`** (liste blanche des écritures), `sectionSummary`, `sectionSource` (→ `SectionSource { label, href, linkLabel }`), `SEO_FIELDS`, `ARTICLE_SEO_FIELDS`, `SEO_LIMITS`, `seoPathOf`, `unknownVariables`.
- `lib/form.ts` — PUR : chemins (`joinPath`, `itemPath`), éléments de tableau (`newArrayItem(siblings, random?, itemType?)`, `arrayItems`, `isFixedLength`), opérations par clé (`ArrayOp`, `previousSavedKey`, `moveTarget`, `mergeArrayItems`), `setAtPath`, conversions référence / image, `IMAGE_ASSET_ID`.
- `lib/html.ts` — PUR : `extractJsonLd`, `extractHeadings`, `analyzeHeadings` (alertes C2), `decodeEntities`, `textOf`.
- `lib/seo-preview.ts` — PUR (client aussi) : `pageSeoPreview`, `articleSeoPreview` (appellent `src/lib/seo.ts`), `resolveMetadata` (règles Next), `estimatedLength`, `displayUrl`, `articlePath`.
- `server/data.ts` — SERVEUR : `loadPageDocument`, `loadSiteSettings` (sans scripts), `loadReferenceOptions`, `loadPageHtml` / `loadJsonLd` / `loadHeadings`, `loadArticleOptions`, `loadArticleTemplate`, `loadArticleJsonLd`, `publicUrl`.
- `server/save.ts` — SERVEUR, cœur testable des écritures (zod + manifeste + FieldDef) : `savePageField`, `savePageArray` (tableaux par clé), `savePageSeo`, `saveArticleSeo`, `SaveResult`, `ArraySaveResult`.
- `server/actions.ts` — `'use server'` : `savePageFieldAction`, `savePageArrayAction`, `savePageSeoAction`, `saveArticleSeoAction` (garde `content.write` EN PREMIER).
- `server/upload.ts` — SERVEUR : `uploadPageImage` (cœur, asset par `uploadImageAsset` de core/sanity), `handleImageUpload` (route : garde, CSRF, taille, type par signature), `sniffImageType`.
- `components/PageFrame.tsx` (+ css) — en-tête (titre, chemin, Open in AI editor, Preview ↗) + onglets ; `PageTabs.tsx` (client, `Tabs` + `next/link`).
- `components/ContentView.tsx` (+ css) — C1 : accordéon (une section ouverte), champs, valeur locale mise à jour après chaque enregistrement.
- `components/fields.tsx` (+ css) — un composant par `FieldKind` (dont `VariableArrayField` + `ArrayItemCard`) ; `FormContext.tsx` (contexte : `saveField`, `saveArray`, `uploadImage` ; `postImage`) ; `useFieldSave.ts` (debounce + autosave).
- `components/DraftPreview.tsx` (+ css) — plan schématique de la page, section ouverte surlignée et amenée à l'écran.
- `components/SeoView.tsx` (+ `SeoView.module.css`, partagé avec C6) — C2 ; `Counter`, `imageUrl`.
- `components/ArticleSeoView.tsx` — C6. `components/OgImageRow.tsx` — ligne « OG image » (C2, C6).
- `components/PageHtmlBlocks.tsx` — SERVEUR : `PageJsonLd`, `PageHeadingStructure` (+ vues pures et squelettes pour `<Suspense>`).
- `components/PageSkeleton.tsx` (+ css) — état de chargement des trois routes.
- Tests : `lib/*.test.ts`, `server/{save,actions,upload}.test.ts`, `components/views.test.tsx` (jsdom).
- Routes : `src/app/admin/(shell)/pages/[pageId]/{page.tsx, loading.tsx, seo/page.tsx, slug/page.tsx, slug/seo/page.tsx, image/route.ts}`.

## Contrats

- Entrées : `AdminConfig` (`src/admin.config.ts`, via `lib/manifest.ts` : `PageDef`, `SectionDef` (dont `source?`),
  `FieldDef` (dont `itemType?`), `SeoFieldMap`, `articleSeoTemplates`), `getDocumentState` / `saveDraftField` / `createDraft` / `getReadClient`
  / `insertDraftArrayItem` / `updateDraftArray` / `moveDraftArrayItem` (`core/sanity/drafts`), `uploadImageAsset`
  (`core/sanity/assets`), `requireSession` / `requireCapability` (core/auth), `autosave` (core/autosave.ts), `layoutMetadata` /
  `pageMetadata` / `articleMetadata` (`src/lib/seo.ts`), `resolveTemplate` (`src/lib/template-variables.ts`), `urlFor`.
- Sorties : les trois écrans, quatre server actions (`input: unknown` → `SaveResult = { ok: true } | { ok: false; error }` ;
  `savePageArrayAction` → `ArraySaveResult = { ok: true; items? } | { ok: false; error }`, entrée
  `{ pageId, path, op: 'insert', item, after: key | null }` | `{ …, op: 'update', item }` | `{ …, op: 'remove', key }` |
  `{ …, op: 'move', key, to: { before } | { after } }`),
  la route `POST /admin/pages/<page>/image` (multipart `target: 'seo' | 'article' | 'field'`, `path?`, `file`) →
  `{ ok, assetId, url }` ou `{ error: { code, message } }`.
- Utilisé par : les routes `(shell)/pages/**` ; la sidebar (shell) pointe vers `/admin/pages/<id>` et `/slug/seo`.
- Vers l'éditeur IA (ai-editor/page) : `?page=<id>&back=<chemin encodé>` ; l'éditeur lit `back` et le nettoie
  (`sanitizeNextPath`), absent → retour à `/admin/pages/<id>`.

## Comportement

- **C1** : sections dans l'ordre du manifeste, la première ouverte, une seule à la fois ; fermée = nom + résumé
  (`sectionSummary`, ex. « Eyebrow · 3 modules · 1 button ») ou « ⛁ From CMS › Testimonials » / libellé du manifeste
  (« 4 latest Blog posts ») (`sectionSource`) ; ouverte = « Section n / N » + champs + lien « Open Testimonials » vers C3.
  Source d'une section : `SectionDef.source` s'il est déclaré (collection par id puis par type ; inconnue → aucune) ;
  sinon heuristique (champ `reference` vers une collection, ou section nommée comme une collection). Champ = valeur du brouillon s'il existe, sinon du publié.
  Genres : string/url/slug/number/date → Input ; text (ou `maxLines`) → Textarea ; boolean → Switch ; select → Select (+ « None »
  si facultatif) ; reference → Select des éléments publiés de la collection ; image → aperçu + Upload / Replace / × ; cta →
  « Button 1 · label » + « Button 1 · link » côte à côte ; object → groupe ; array à longueur fixe (min = max) → cartes
  « Card 1… » sans ajout / suppression, chaque champ enregistré seul (`items[_key=="…"].title`) ; array à longueur variable →
  ajout / suppression / réordonnancement (boutons ↑ ↓ « Move rating 2 up ») dans les bornes, ÉLÉMENT PAR ÉLÉMENT par sa
  clé (FOLLOWUPS #40, jamais le tableau entier : `savePageField` refuse un chemin de tableau) : élément neuf local tant
  qu'il est invalide (erreur en `role="alert"`), puis `insert` après l'élément enregistré qui le précède (sinon au début),
  ensuite `update` (sous-champs déclarés remplacés, autres champs Sanity gardés) ; `remove` et `move` (`before` / `after`
  le voisin enregistré) partent tout de suite. Côté serveur : `insertDraftArrayItem`, `updateDraftArray`,
  `moveDraftArrayItem` (ifRevisionID, relecture sur 409) → un ajout fait ailleurs entre-temps n'est jamais effacé ; un
  retrait déjà fait ailleurs = succès sans écriture. Les opérations d'un tableau passent en file (une à la fois) ; file
  vide → le tableau renvoyé est fusionné avec la saisie locale (`mergeArrayItems` : ordre et ajouts du serveur, valeur
  locale des éléments connus, éléments non enregistrés gardés). `_type` d'un nouvel élément = `FieldDef.itemType` sinon
  celui d'un voisin ; le serveur impose `itemType` quand il est déclaré, écarte les clés non déclarées ; portableText → note « rich text can't be edited in this form yet ». Sous chaque champ : aide + « n / max ».
  Champ `visuallyHidden` → Tag « Hidden on screen ». En bas : « Need another field? Ask Kuartz — fields are defined in code. »
- **Enregistrement** : validation immédiate (`validateFieldValue`, même fonction que le serveur) ; si valide, envoi 600 ms
  après la dernière frappe (0 pour Switch / Select), tout de suite à la perte du focus ou au démontage ; `autosave.saving()`
  puis `saved()` / `failed(msg)` (Top bar). Erreur serveur affichée sous le champ. Valeur identique à la dernière
  enregistrée : rien n'est envoyé. Le badge de l'aperçu passe de « Published » à « Draft » au premier enregistrement.
- **C2** : compteurs indicatifs « 34 / 60 », « 96 / 160 » en orange au-delà, sans blocage (plafonds serveur : 200 / 500
  caractères, description sur une ligne). Placeholder du meta title = titre effectif sans meta title. Image OG propre à la
  page (× pour la retirer) sinon image du site affichée avec « Using the site image (General). ». Search engines : si
  l'indexation du site est coupée (B2), la description le dit. Aperçus = valeur effective, recalculée à chaque frappe par
  les fonctions du site (`<title>` avec « — Conduit » hors de `/`, og:title hérité du titre, image de page sinon du site).
  JSON-LD et titres : `fetch` du HTML public (`adminConfig.site.url` + chemin), sous `<Suspense>` ; alertes « No H1 / 2 H1s »,
  « H4 after an H2 », « Empty heading », résumé « ✓ One H1 · ⚠ A level is skipped · ✓ No empty heading ».
- **C6** : VariableInput (puces violettes, `{{` ouvre la liste, variable inconnue = puce rouge + erreur, pas d'envoi) ;
  « ≈ 43 / 60 with “<article>” », « ≈ 89 / 160 with this post » ; OG image « From field [cover] » (× → image fixe / du site),
  « Use the cover » pour revenir au champ, Upload = image fixe (et `ogImageField` vidé) ; « Allow indexing of all N Blog
  posts. » ; « Preview with » = articles publiés (100 plus récents). JSON-LD = blocs `application/ld+json` des scripts du
  site pour `blog/slug` ou `all` (avec leurs `{{…}}`). Onglet Content → `/admin/cms/<collection>`.
- **États** : page inconnue → 404 ; page sans `document` → « This page has no editable content » ; document absent de
  Sanity → « This page has no content in Sanity yet » ; sans `content.write` → champs désactivés + Callout ; chargement →
  `PageSkeleton` (route) et squelettes JSON-LD / titres ; HTML illisible → « Couldn't read the page. <raison> ».
- Animations (skills web-animation-design + motion) : ouverture d'une section = fondu `fade` du kit (200 ms ease-out, via
  `useMotionVariants` : coupé en mouvement réduit) ; surlignage de l'aperçu = couleur du contour 150 ms `ease` ; défilement
  du cadre d'aperçu `smooth` sauf mouvement réduit. Rien d'autre (écran utilisé souvent).

## Forces

- Liste blanche stricte : une écriture ne passe que si `resolveFieldAtPath` retrouve le chemin dans le manifeste ; le
  FieldDef du manifeste valide la valeur ; zod valide la forme (clés inconnues refusées, 32 Ko max).
- Aperçus fidèles par construction : mêmes fonctions que le site + règles de résolution de Next (testées).
- HTML lu comme du texte : aucun script exécuté, aucun HTML réinjecté (React échappe tout).
- 68 tests : tableaux par clé (insert / update / remove / move, ajout concurrent conservé après 409 sur un faux Sanity à
  révisions, tableau entier refusé, file et fusion côté navigateur), envoi par `uploadImageAsset` (nom nettoyé, 403
  traduit, réponse sans id d'image refusée), manifeste (dont `editorHref` avec `back`, `SectionDef.source`), HTML, aperçus, form, cœur des écritures (faux magasin), actions (faux Next + faux client), envoi
  d'image (types, tailles, cibles), composants en jsdom (génération, accordéon, validation, debounce, autosave, aperçus).

## Faiblesses et limites connues

- **Aperçu C1 schématique** : pas le rendu réel du brouillon (le Draft Mode Sanity et l'aperçu 4042 du moteur ne sont pas
  accessibles ici) ; il sert de plan de la page. « Preview ↗ » ouvre la page PUBLIQUE (valeurs publiées).
- **Titres et JSON-LD (C2) lus sur la page publiée**, pas sur le brouillon (tag « Live » au lieu de « Live · draft » du
  Figma) : une modification de titre n'apparaît dans l'arbre qu'après Publish.
- Un objet (cta / object) créé par un `set` de sous-champ n'a pas de `_type`, même avec `itemType` (il faudrait un
  `setIfMissing` du parent dans core/sanity). Le Studio peut le signaler ; le site n'en dépend pas.
- Champs simples sans concurrence optimiste : dernier écrit gagne sur un même champ (comme `saveDraftField`). Les
  tableaux à longueur variable, eux, passent par les aides sans course. Un élément ajouté localement et jamais complété
  est perdu à la fermeture de la section.
- `insert` après un voisin retiré ailleurs entre-temps → « This item no longer exists. Reload and try again. » (pas de
  repli en fin de liste). Une modification d'un élément retiré ailleurs échoue de même (message dans la Top bar).
- Sous-champs d'un élément de tableau variable : seuls string / text / url / select sont éditables (`LocalField`).
- Titre par défaut d'une page sans meta title = `PageDef.label` (le site utilise « Blog » en dur pour /blog, identique ici).
- Écarts au Figma : Subtitle en Textarea (texte de 320 caractères) ; aide + compteur sous chaque champ ; 11 sections sur
  Conduit (10 dans Figma) ; JSON-LD long non replié ; en-tête de C6 sans « Open in AI editor » (`aiEditor: false` pour /blog).

## Points sensibles

- JAMAIS écrire un chemin qui n'est pas passé par `resolveFieldAtPath` / `seoPathOf` / `ARTICLE_SEO_FIELDS` ; JAMAIS appeler
  `saveDraftField` sans le FieldDef.
- Chaque action / route commence par `requireCapability('content.write', 'action' | 'route')` ; la route d'envoi vérifie
  aussi l'origine (`isSameOriginRequest`) et la cible AVANT d'envoyer l'asset (pas d'asset orphelin).
- Les scripts du site (`siteSettings.scripts[].code`) ne quittent jamais le serveur : seuls leurs blocs JSON-LD sont extraits.
- `loadPageHtml` ne prend aucune URL du navigateur (origine du manifeste + chemin du manifeste) : pas de SSRF.
- Images : type annoncé ET signature des octets (PNG/JPEG/WebP), 5 Mo max ; jamais de SVG.

## Pièges

- Images : TOUJOURS par le route handler `image/route.ts` (garde, CSRF, signature, 5 Mo max), jamais par une server
  action — pages ne dépend donc pas de `serverActions.bodySizeLimit` de `next.config.ts` (6 Mo au 2026-09-27, retour au
  défaut prévu côté settings, SEC-02).
- Transformation passée à `updateDraftArray` : PURE (rappelée après un 409) ; lever une erreur dedans pour annuler
  (`AlreadyRemoved`, `not_found`), jamais renvoyer le tableau inchangé (écriture inutile).
- `Tabs` reçoit `Link` en `linkAs` : impossible depuis un Server Component (fonction non sérialisable) → `PageTabs` client.
- `next dev` : la première lecture du HTML public compile la page du site (quelques secondes) → `<Suspense>` + délai 12 s.
- `@/lib/seo` importe `urlFor` → `src/sanity/env.ts` exige les variables publiques Sanity (tests : `vi.stubEnv`).
- Next dispatche les server actions une par une par client : pas de `Promise.all` d'actions.
- Un `<section>` nommé devient une région : ne pas nommer la section ET le panneau (doublon de landmark).
- Le scratchpad de captures peut être partagé avec d'autres agents : garder ses scripts dans un sous-dossier propre.

## Comment modifier

- **Nouveau genre de champ** : `FieldKind` (contrat) → `validate.ts` (core/sanity) → un composant + un `case` dans
  `FieldControl` (`components/fields.tsx`) → `resolveFieldAtPath` si le genre a des sous-champs → test dans `views.test.tsx`.
- **Nouvelle page** : seulement `src/admin.config.ts` (site-adapter) ; rien à changer ici.
- **Changer un libellé** : textes anglais dans `components/*` (recopiés du Figma) ; messages serveur dans `server/save.ts` et `server/upload.ts`.
- **Délai d'enregistrement** : 3e argument de `useFieldSave` (600 ms par défaut).
- **Retour depuis l'éditeur IA** : `frameProps(session, page, active)` dans `screens.tsx` choisit `back` selon l'onglet ;
  C6 n'a pas de lien (`editorHref={null}`).
- **Section « From CMS »** : déclarer `source` dans `src/admin.config.ts` (site-adapter) plutôt que toucher l'heuristique.
- **Nouvelle alerte de titres** : `analyzeHeadings` (`lib/html.ts`) + test.

## Tests

`npx vitest run src/admin/features/pages` — 8 fichiers, 68 tests (voir Forces). Non couvert : le vrai aller-retour Sanity
(vérifié à la main le 2026-09-27 sur `development` : écriture du Hero, du meta title et du modèle d'article, brouillons de
test supprimés ensuite), l'envoi d'image réel, le rendu serveur des écrans.
À la main : `/admin/pages/home`, `/admin/pages/home/seo`, `/admin/pages/blog`, `/admin/pages/blog/slug/seo`, en rôle
kuartz puis client (`POST /admin/api/auth/dev-role { role: 'client' }`) ; `/admin/pages/nope` → 404.

## Décisions et « À trancher »

- Q4 (formulaire ET éditeur IA) : les deux (architecture § 10) ; « Open in AI editor » suit `PageDef.aiEditor`.
- Compteurs SEO indicatifs (C2 « proposé »), plafonds de sécurité côté serveur seulement.
- Tableaux à longueur variable enregistrés élément par élément par clé (FOLLOWUPS #40) ; tableaux fixes champ par champ.
- Section liée à une collection : les champs propres à la section restent éditables (Conduit en a) + lien vers C3, au lieu
  du simple clic vers la collection du Figma.
- Tag de l'arbre des titres « Live » (source réelle : la page publiée).
- `SectionDef.source` déclaré prime sur l'heuristique ; déclaré mais collection inconnue → pas de source (pas de lien cassé).
- `FieldDef.itemType` déclaré : `_type` imposé côté serveur à chaque élément du tableau (jamais celui du navigateur).
- Images : route handler (contrôles d'origine et de signature) ; asset par `uploadImageAsset` (FOLLOWUPS #40).

## Demandes de contrat

- ~~site-adapter (`src/admin.config.ts`, FOLLOWUPS #28) : `SectionDef.source` et `FieldDef.itemType`~~ — **fait**
  (vérifié le 2026-09-27) : sources Testimonials, FAQ, « 4 latest Blog posts » et `itemType` des tableaux remplis.
- **editor-canvas / moteur** : un moyen de lire le HTML du BROUILLON (aperçu 4042 avec son secret, côté serveur) pour l'arbre
  des titres « Live · draft » et un aperçu réel dans C1 (message du pont pour surligner une zone).
- **core/sanity** : `setIfMissing` du parent avec son `_type` (`itemType`) lors d'un `set` de sous-champ d'un objet absent.
- Faites : FOLLOWUPS #40 (`uploadImageAsset`, aides de tableau sans course) ; `SectionDef.source` / `FieldDef.itemType` au contrat ; `serverActions.bodySizeLimit` retiré de `next.config.ts` (SEC-02 : l'envoi d'image passe par une route handler).
