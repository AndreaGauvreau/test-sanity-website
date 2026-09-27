# Site public Conduit (métadonnées, scripts, aperçu de l'éditeur, revalidation) — LLM context

> Propriétaire : site-adapter · Figma : B2, B3, C2, C6, G6 · Mis à jour : 2026-09-27

## Utilité
Le site public (`/`, `/blog`, `/blog/[slug]`, `/testimonials`, `/testimonials/[slug]`, `/faq`, `/faq/[slug]` ; `/bench` et `/preview/*` en dev seulement) adapté à l'admin SANS changer son
rendu : métadonnées et scripts lus dans Sanity, route de revalidation, mode aperçu de l'éditeur IA et marquage
`data-edit*`. Le Studio est sur `/studio` (src/app/studio) ; `/admin` appartient à l'admin (src/admin, src/app/admin).

## Fichiers
- `layout.tsx` — CSS du site, `generateMetadata` (réglages du site), scripts « all », Analytics, SanityLive, Draft
  Mode, `<EditorBridge />` en mode aperçu, `<LiveEditButton />` hors aperçu et hors Draft Mode (question 9).
- `page.tsx` — accueil (document `dockSchedulingPage`), métadonnées `seo`, scripts « home ».
- `blog/page.tsx` — liste ; textes et SEO de `blogPage` (repli : « Blog », « No articles published yet. »), scripts « blog ».
- `blog/[slug]/page.tsx` — article ; métadonnées du modèle `articleSeo-post` ; scripts « blog/slug » avec variables.
- `testimonials/page.tsx` (+ `testimonials.module.css`) — liste des témoignages (ordre manuel), en-tête `PageHeading` et
  textes de `testimonialsPage` (repli : src/lib/page-defaults.ts), cartes dont le nom (lien étiré sur la carte) mène à
  la page du témoignage ; scripts « testimonials ».
- `testimonials/[slug]/page.tsx` (+ `testimonial.module.css`) — en-tête (sur-titre de la page, entreprise en h1), puis la
  section `Testimonial` de l'accueil avec ce témoignage (`pageDoc={null}` ; bouton « Read the case study » seulement si
  `caseStudyUrl`), retour « All testimonials » ; modèle `articleSeo-testimonial` ; scripts « testimonials/slug ».
- `faq/page.tsx` (+ `faq.module.css`) — la mise en page de la section FAQ de l'accueil (classes de
  `components/sections/Faq/Faq.module.css`, sans la carte d'aide), en-tête `PageHeading`, lien « Link to this answer »
  sous chaque réponse, JSON-LD FAQPage (`faqPageJsonLd` exporté de Faq.tsx) ; scripts « faq ».
- `faq/[slug]/page.tsx` (+ `question.module.css`) — colonne de lecture du blog, question en h1, réponse, retour « All
  questions » ; modèle `articleSeo-faq` ; scripts « faq/slug ». Question sans réponse : 404 (comme sa liste).
- `bench/` (+ `page.test.tsx`) — outil de mesure, **introuvable hors `NODE_ENV=development`** (SEC-02) ; `preview/`,
  `not-found.tsx` — inchangés.
- Hors de ce dossier mais du même module : `src/app/api/revalidate/route.ts` (+ test), `src/app/studio/`,
  `src/lib/seo.ts` (+ test), `src/lib/template-variables.ts` (+ test), `src/lib/site-scripts.ts` (+ test),
  `src/lib/script-signature.ts` (signature HMAC des scripts, SEC-04), `src/lib/editor/preview.ts` (+ test),
  `src/components/site-scripts/` (+ `SiteScripts.test.tsx`), `src/components/**` (marquage `editAttrs`),
  `src/components/ui/PageHeading/` (en-tête hgroup des pages hors maquette), `src/lib/article-values.ts` (+ test),
  `src/lib/page-defaults.ts`,
  `src/admin.config.ts` (+ test).
- Pas à ce module : `src/admin/editor-bridge/` (pont de l'aperçu, propriétaire editor-canvas, voir son CLAUDE.md) ;
  le layout le monte seulement. De même `src/admin/live-edit/` (bouton « Edit with AI », propriétaire auth-core).

## Contrats
- **Métadonnées** (`src/lib/seo.ts`) : titre = `seo.metaTitle` + « — Conduit » (sans meta title : titre par défaut de
  la page, sinon `siteSettings.title`) ; description et image OG : page, sinon site ; `robots: noindex` si
  `siteSettings.allowIndexing === false` OU `seo.allowIndexing === false` (rien d'émis sinon) ; favicons clair / sombre
  (`media: (prefers-color-scheme: dark)`) ; `og:title` explicite sur `/` seulement (comme avant). Page article : les
  `{{…}}` du modèle sont remplacés ; une variable vide fait retomber le champ sur la valeur du site ; sans document
  `articleSeo-post`, modèle par défaut `{{title}}` / `{{excerpt}}` / image de l'article. Témoignage / question : même
  règle avec `articleSeo-testimonial` / `articleSeo-faq`, défauts `DEFAULT_TESTIMONIAL_TEMPLATE` /
  `DEFAULT_FAQ_TEMPLATE` (src/lib/seo.ts), pas d'image « cover » (image fixe du modèle, sinon celle du site).
- **Scripts** (`<SiteScripts scripts page placements values? />`) : layout = `page="all"`, chaque page = son id. Début de
  page : `headEnd` + `bodyStart` ; fin : `bodyEnd`. **Seuls les scripts signés sont rendus** : `verifiedScripts(scripts,
  process.env.SCRIPTS_SIGNING_SECRET)` (src/lib/site-scripts.ts) vérifie le HMAC `signature` sur la chaîne canonique
  `v1\n_key\nplacement\npage\nrun\nenabled\ncode` (`signableScript()` normalise : `enabled` absent = actif) ; secret
  absent ou < 32 caractères = aucun script. `<script>` JS « once » → `next/script` (id `kz-script-<_key>-<n>`,
  `afterInteractive`, `lazyOnload` en fin de body) ; « everyPageVisit » → `RouteScript` (client, réexécuté à chaque
  route) ; `<script type=…>` non JS (JSON-LD) → rendu tel quel dans le HTML ; `<style>` → `<style precedence>` remonté
  dans le `<head>` ; tout autre HTML ignoré. Variables `{{…}}` (page article, SEC-01) : dans un `<script>` (JS ou
  JSON-LD), remplacées SEULEMENT dans une chaîne `"…"`, `'…'` ou `` `…` `` (hors `${…}`), valeur échappée
  (`escapeValue(…, 'js')` : apostrophe, accent grave, `$`, `/`, `<`, `>`, U+2028, U+2029 en `\uXXXX`) ; dans le code ou un commentaire, laissées telles
  quelles (`scriptVariablesOutsideStrings(code)` les liste pour que B3 les refuse). Dans un `<style>` : partout,
  échappement CSS hexadécimal.
- **Revalidation** : `POST /api/revalidate`, en-tête `x-kz-revalidate` = `REVALIDATE_SECRET` (temps constant, 401 sinon,
  401 aussi si le secret n'est pas configuré), corps `{ tags?: string[], paths?: string[] }` (zod strict ; 400 sinon) :
  tags → `revalidateTag(tag, { expire: 0 })` ; chemins → `revalidatePath` (motif `[x]` → type `page`) ; corps vide →
  `revalidatePath('/', 'layout')` (tout le site). Réponse `{ revalidated, tags, paths, now }`. Le moteur l'appelle à
  l'étape 4 de Publish (`SITE_REVALIDATE_URL`), sans connaître les sync tags : corps vide ou chemins.
- **Mode aperçu de l'éditeur** (`KZ_EDITOR_PREVIEW === '1'`, lu côté serveur à l'exécution) : `sanityFetch` lit les
  brouillons (perspective `drafts`, jeton de lecture, sans CDN, `cache: 'no-store'`, stega coupé) ; ni VisualEditing, ni
  DraftModeBanner, ni Analytics, ni SanityLive, ni scripts ; `editAttrs()` rend `data-edit`, `data-edit-doc` (id
  publié, nettoyé du stega, sans `drafts.`/`versions.`) et `data-edit-key` ; `<EditorBridge />` monté en fin de body.
  Hors de ce mode : `editAttrs()` renvoie `{}`, le HTML public est inchangé (vérifié).
- `<EditorBridge />` (`src/admin/editor-bridge/index.tsx`, propriétaire **editor-canvas**, voir
  src/admin/editor-bridge/CLAUDE.md) : composant serveur qui lit `ADMIN_ORIGIN` et rend le pont client. Ce module ne
  fait que le monter : sans props, en fin de body, en mode aperçu seulement.
- `<LiveEditButton />` (`src/admin/live-edit`, question 9) : composant client sans props, monté en fin de body quand
  `!editorPreview && !isDraftMode`. Ne rend rien côté serveur (aucune balise dans le HTML public : seule la référence
  du module client dans les données RSC et son petit chunk JS) ; après `GET /admin/api/auth/editor-access?path=`, la
  pilule « Edit with AI » (et son CSS) n'est chargée que si la personne peut modifier la page.
- **Server actions de Live** (src/sanity/lib/live-action.ts) : `onContentChange` (site) et `onPublishFromAdmin`
  (Studio) n'invalident que des sync tags `sanity:s1:<jeton>`, 64 au plus (`knownLiveTags`) ; `purgeSiteCache`
  (bouton de `/bench`) ne fait rien hors développement (SEC-02).
- **Manifeste** (`src/admin.config.ts`) : `site.launchedAt` = `NEXT_PUBLIC_SITE_LAUNCHED_AT` validé (AAAA-MM-JJ, absent
  sinon) ; `SectionDef.source` sur testimonial, faq, insights (`collection` = id de collection du manifeste :
  `testimonials`, `faq`, `blog` ; libellés du Figma C1) ; `FieldDef.itemType` sur chaque tableau (`rating`, `feature`,
  `module`, `benefit`, `stat`, `result`) ; `FieldDef.richText` sur `post.content` et `faq.answer` (reflet des options
  `block` du schéma). Tous vérifiés contre le schéma par src/admin.config.test.ts.

## Comportement
- Section vide = section absente (inchangé) ; sans `dockSchedulingPage`, la page rend `null`.
- Scripts : jamais en Draft Mode ni en aperçu de l'éditeur (B3), jamais dans `/studio` ni `/admin` (layouts séparés).
- Testimonial par défaut : le premier de l'ordre manuel (`orderRank`), puis le plus récent (même ordre sur /testimonials).

## Forces
- Rendu identique prouvé : 12 captures sur 12 au pixel, texte visible identique, HTML sans `data-edit` ni stega
  (docs/admin/research/site-baseline/README.md, avec la liste des différences non visibles du `<head>`).
- Fonctions pures testées : métadonnées, variables et échappement (exécution réelle avec les trois délimiteurs),
  analyse des scripts, signature, route de revalidation, editAttrs ; `<SiteScripts />` rendu (signé injecté, modifié ignoré).

## Faiblesses et limites connues
- /testimonials et /faq : pas de maquette (compositions sobres des briques existantes, à revoir si un design arrive).
  Aucun lien depuis l'accueil, le header ou le footer (préférence : accueil inchangé) : pages atteignables par URL,
  entre elles et depuis l'admin. JSON-LD FAQPage sur `/` ET `/faq` pour les mêmes questions (Google demande une seule
  instance balisée) : trancher laquelle garde le balisage. Pas de sitemap sur le site (ni avant).
- `Faq.module.css` et la section `Testimonial` servent aussi à /faq et /testimonials/:slug : une retouche de style de
  l'accueil (éditeur IA compris) les change aussi.
- Le mode aperçu (4042) n'a pas été rendu en vrai (aucun serveur lancé par site-adapter) : `editAttrs` et le client
  d'aperçu sont testés à part ; à vérifier au premier lancement du moteur.
- Placement « Fin du `<head>` » approché : le layout du site n'est pas le layout racine, les scripts JS partent par
  `next/script` (injectés après hydratation), les `<style>` remontent dans le head, les JSON-LD restent dans le body.
- Scripts « page » : pas de page 404 dans la liste (les 404 n'ont pas de scripts de page, seulement « all »).
- Next 16 diffuse les métadonnées hors du `<head>` pour un navigateur sur une page dynamique (streaming metadata).
- `<style>` d'un script de page reste dans le head après une navigation client (ressource React hoistée).
- Lexeur des scripts minimal : « / » (division ou expression régulière) est tranché par une heuristique sur le jeton
  précédent. Un script écrit de façon exotique (`if (x) /re/…`) peut être mal découpé ; le code étant signé par Kuartz,
  le risque se limite à une variable remplacée ou non au mauvais endroit.
- Les scripts existants non signés (script d'exemple de development compris) ne sont plus injectés tant qu'ils n'ont
  pas été réenregistrés dans B3 ou signés par `npm run migrate:admin` (contenu identique au dépôt seulement).
- `/bench` n'existe plus en `npm run prod` (mesures de production impossibles depuis cette page).
- Bouton « Edit with AI » : une requête `editor-access` (no-store) par page vue sur un écran ≥ 1 024 px, visiteurs
  anonymes compris (voir src/admin/live-edit/CLAUDE.md).

## Points sensibles
- **XSS par conception** : `siteSettings.scripts[].code` est injecté tel quel. Tout Editor Sanity peut écrire le champ :
  la barrière est la signature (SEC-04). Ne jamais rendre un script sans `verifiedScripts`, ne jamais exposer
  `SCRIPTS_SIGNING_SECRET` (jamais `NEXT_PUBLIC_*`, jamais journalisé). Ne jamais échapper le code ; les VALEURS ne sont
  insérées que dans une chaîne, échappées (SEC-01) — ne jamais les insérer dans le code d'un script.
- Ne jamais rendre de scripts, d'overlays Sanity ni d'Analytics en aperçu de l'éditeur ; ne jamais rendre `data-edit*`
  hors aperçu (tester avec `check-html.ts`).
- `REVALIDATE_SECRET` : jamais en `NEXT_PUBLIC_*`, jamais journalisé.
- `stegaClean` avant tout usage d'une valeur Sanity comme attribut, id, classe, URL (y compris `data-edit-*`).

## Pièges
- Le modèle de titre du layout ne s'applique pas à `/` (même segment) : suffixe ajouté par `pageMetadata({ segmentRoot })`.
- Un `openGraph` de page remplace tout celui du layout : repartir de `openGraphDefaults`.
- `updateTag` n'existe que dans les server actions : la route utilise `revalidateTag(tag, { expire: 0 })`.
- Une route (`route.ts`) n'exporte que ses méthodes : pas de constante exportée.
- Un CSS Module n'exporte pas une classe sans déclaration (`undefined`) : classes d'ancrage avec `order: 0`.
- `JSON.stringify` n'échappe ni `'`, ni `` ` ``, ni `$` : insuffisant seul pour une chaîne JS (SEC-01).
- Une server action reste appelable par son identifiant même si sa page renvoie 404 : garde dans l'action.

## Comment modifier
- **Nouvelle page** : page Next + document unique (src/sanity) + entrée `pages` du manifeste + `SCRIPT_PAGES` +
  `<SiteScripts page="<id>" …>` début/fin + `pageMetadata`.
- **Nouvelle variable d'article** : `templateValues()` de `blog/[slug]/page.tsx`, `POST_TEMPLATE_VARIABLES`, variables
  du manifeste, description du champ `page` des scripts.
- **Nouveau champ injecté d'un script** : chaîne canonique de src/lib/script-signature.ts (nouvelle version `v2`),
  `SITE_SETTINGS_QUERY`, `signableScript()` ; prévenir code-usage (qui signe dans B3).
- **Nouvelle section alimentée par une collection** : `source` dans src/admin.config.ts (id de collection existant).

## Tests
`npx vitest run src/lib src/components src/sanity "src/app/(site)" src/app/api src/admin.config.test.ts`. À la main :
`npx tsx scripts/site-baseline/check-html.ts --live`,
captures (`capture.ts` + `compare.ts`), `curl -X POST -H "x-kz-revalidate: …" http://127.0.0.1:4040/api/revalidate`.

## Décisions et « À trancher »
- `NEXT_PUBLIC_SITE_URL` (sinon http://127.0.0.1:4040) : URL publique du manifeste.
- {{date}} au format AAAA-MM-JJ (valable dans un JSON-LD comme dans un texte).
- SEC-04 : signature HMAC au rendu plutôt que sortir les scripts de Sanity (garde l'édition B3 telle quelle).
- SEC-01 : remplacement dans les chaînes seulement + échappement des trois délimiteurs, plutôt qu'un îlot JSON (les
  scripts existants `"{{title}}"` continuent de marcher).
- `SectionDef.source.collection` = id de collection du manifeste (route `/admin/cms/<id>`), pas le type Sanity.

## Demandes de contrat
- ~~auth-core (`src/proxy.ts`) : fermer l'admin en aperçu~~ — **fait** (vérifié le 2026-09-27) : avec
  `KZ_EDITOR_PREVIEW=1`, `/admin`, `/studio`, `/api/draft-mode/*` et `/api/revalidate` sont fermés et un jeton d'aperçu
  court est exigé partout (`proxy-rules.ts`, `isAdminClosed`).
- code-usage (B3) : signature **faite** (`features/code/signing.ts` : `signScript` à l'enregistrement, script à la
  signature invalide signalé « Modified outside the admin ») ; **reste** : refuser `scriptVariablesOutsideStrings(code)`
  non vide (la feature ne l'appelle pas au 2026-09-27).
- ~~orchestrateur (`next.config.ts`) : `serverActions.bodySizeLimit` à 6 Mo~~ — **fait** : retiré (SEC-02), les envois
  de fichiers passent par des route handlers.
