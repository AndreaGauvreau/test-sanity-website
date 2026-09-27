# Site public Conduit (métadonnées, scripts, aperçu de l'éditeur, revalidation) — LLM context

> Propriétaire : site-adapter · Figma : B2, B3, C2, C6, G6 · Mis à jour : 2026-09-27

## Utilité
Le site public (`/`, `/blog`, `/blog/[slug]`, `/bench`, `/preview/*` en dev) adapté à l'admin SANS changer son
rendu : métadonnées et scripts lus dans Sanity, route de revalidation, mode aperçu de l'éditeur IA et marquage
`data-edit*`. Le Studio est sur `/studio` (src/app/studio) ; `/admin` appartient à l'admin (src/admin, src/app/admin).

## Fichiers
- `layout.tsx` — CSS du site, `generateMetadata` (réglages du site), scripts « all », Analytics, SanityLive, Draft
  Mode, `<EditorBridge />` en mode aperçu.
- `page.tsx` — accueil (document `dockSchedulingPage`), métadonnées `seo`, scripts « home ».
- `blog/page.tsx` — liste ; textes et SEO de `blogPage` (repli : « Blog », « No articles published yet. »), scripts « blog ».
- `blog/[slug]/page.tsx` — article ; métadonnées du modèle `articleSeo-post` ; scripts « blog/slug » avec variables.
- `bench/`, `preview/`, `not-found.tsx` — inchangés.
- Hors de ce dossier mais du même module : `src/app/api/revalidate/route.ts` (+ test), `src/app/studio/`,
  `src/lib/seo.ts` (+ test), `src/lib/template-variables.ts` (+ test), `src/lib/site-scripts.ts` (+ test),
  `src/lib/editor/preview.ts` (+ test), `src/components/site-scripts/`, `src/components/**` (marquage `editAttrs`),
  `src/admin.config.ts` (+ test), `src/admin/editor-bridge/index.tsx` (stub, voir plus bas).

## Contrats
- **Métadonnées** (`src/lib/seo.ts`) : titre = `seo.metaTitle` + « — Conduit » (sans meta title : titre par défaut de
  la page, sinon `siteSettings.title`) ; description et image OG : page, sinon site ; `robots: noindex` si
  `siteSettings.allowIndexing === false` OU `seo.allowIndexing === false` (rien d'émis sinon) ; favicons clair / sombre
  (`media: (prefers-color-scheme: dark)`) ; `og:title` explicite sur `/` seulement (comme avant). Page article : les
  `{{…}}` du modèle sont remplacés ; une variable vide fait retomber le champ sur la valeur du site ; sans document
  `articleSeo-post`, modèle par défaut `{{title}}` / `{{excerpt}}` / image de l'article.
- **Scripts** (`<SiteScripts scripts page placements values? />`) : layout = `page="all"`, chaque page = son id. Début de
  page : `headEnd` + `bodyStart` ; fin : `bodyEnd`. `<script>` JS « once » → `next/script` (id `kz-script-<_key>-<n>`,
  `afterInteractive`, `lazyOnload` en fin de body) ; « everyPageVisit » → `RouteScript` (client, réexécuté à chaque
  route) ; `<script type=…>` non JS (JSON-LD) → rendu tel quel dans le HTML ; `<style>` → `<style precedence>` remonté
  dans le `<head>` ; tout autre HTML ignoré. Variables `{{…}}` (page article) échappées : chaîne JS/JSON dans
  `<script>`, chaîne CSS dans `<style>`.
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
- `<EditorBridge />` (`src/admin/editor-bridge/index.tsx`) : **stub** créé ici (`'use client'`, ne rend rien).
  **Propriété transférée à editor-canvas** (vague 2), qui le remplace par le vrai pont. Montage : sans props, en fin de
  body, en mode aperçu seulement.

## Comportement
- Section vide = section absente (inchangé) ; sans `dockSchedulingPage`, la page rend `null`.
- Scripts : jamais en Draft Mode ni en aperçu de l'éditeur (B3), jamais dans `/studio` ni `/admin` (layouts séparés).
- Testimonial par défaut : le premier de l'ordre manuel (`orderRank`), puis le plus récent.

## Forces
- Rendu identique prouvé : 12 captures sur 12 au pixel, texte visible identique, HTML sans `data-edit` ni stega
  (docs/admin/research/site-baseline/README.md, avec la liste des différences non visibles du `<head>`).
- Fonctions pures testées : métadonnées, variables et échappement, analyse des scripts, route de revalidation, editAttrs.

## Faiblesses et limites connues
- Le mode aperçu (4042) n'a pas été rendu en vrai (aucun serveur lancé par site-adapter) : `editAttrs` et le client
  d'aperçu sont testés à part ; à vérifier au premier lancement du moteur.
- Placement « Fin du `<head>` » approché : le layout du site n'est pas le layout racine, les scripts JS partent par
  `next/script` (injectés après hydratation), les `<style>` remontent dans le head, les JSON-LD restent dans le body.
- Scripts « page » : pas de page 404 dans la liste (les 404 n'ont pas de scripts de page, seulement « all »).
- Next 16 diffuse les métadonnées hors du `<head>` pour un navigateur sur une page dynamique (streaming metadata).
- `<style>` d'un script de page reste dans le head après une navigation client (ressource React hoistée).

## Points sensibles
- **XSS par conception** : `siteSettings.scripts[].code` est injecté tel quel ; seul Kuartz l'écrit (droit
  `settings.code`, vérifié par l'admin côté serveur). Ne jamais échapper le code, toujours échapper les VALEURS.
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

## Comment modifier
- **Nouvelle page** : page Next + document unique (src/sanity) + entrée `pages` du manifeste + `SCRIPT_PAGES` +
  `<SiteScripts page="<id>" …>` début/fin + `pageMetadata`.
- **Nouvelle variable d'article** : `templateValues()` de `blog/[slug]/page.tsx`, `POST_TEMPLATE_VARIABLES`, variables
  du manifeste, description du champ `page` des scripts.

## Tests
`npx vitest run src/lib src/app/api src/admin.config.test.ts`. À la main : `npx tsx scripts/site-baseline/check-html.ts --live`,
captures (`capture.ts` + `compare.ts`), `curl -X POST -H "x-kz-revalidate: …" http://127.0.0.1:4040/api/revalidate`.

## Décisions et « À trancher »
- `NEXT_PUBLIC_SITE_URL` (sinon http://127.0.0.1:4040) : URL publique du manifeste.
- {{date}} au format AAAA-MM-JJ (valable dans un JSON-LD comme dans un texte).

## Demandes de contrat
- auth-core (`src/proxy.ts`) : en aperçu (`KZ_EDITOR_PREVIEW=1`), fermer `/admin`, `/studio`, `/api/draft-mode/*` et
  `/api/revalidate`, et exiger le cookie du secret d'aperçu sur le reste (ARCHITECTURE § 6).
