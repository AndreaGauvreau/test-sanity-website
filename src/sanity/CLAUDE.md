# Sanity (modèle de contenu, Studio, migrations, démo) — LLM context

> Propriétaire : site-adapter · Figma : B2, B3, C1-C6, G5, G6 (docs/admin/figma/) · Mis à jour : 2026-09-27

## Utilité
Le modèle de contenu du site Conduit tel que l'admin (`/admin`, src/admin) et l'éditeur IA l'utilisent : réglages
du site, pages (documents uniques), SEO, collections avec ordre manuel, journal IA. Le Studio Sanity embarqué est
sur **`/studio`** (outil de Kuartz, src/app/studio) ; `/admin` n'est plus le Studio. Ce module ne contient aucune
interface de l'admin : seulement schéma, requêtes, client, structure du Studio, seed et scripts (`scripts/`).

## Fichiers
- `env.ts` — projet, dataset, apiVersion, `studioUrl = '/studio'` (stega, basePath du Studio).
- `schemaTypes/index.ts` — liste des types, `SINGLETON_IDS` (ids fixes), `singletonTypes`, `hiddenCreationTypes`.
- `schemaTypes/siteSettings.ts` — réglages (B2, B3/G6) + listes `SCRIPT_PLACEMENTS`, `SCRIPT_RUNS`, `SCRIPT_PAGES`.
- `schemaTypes/dockSchedulingPage.ts` — page d'accueil : 11 sections (un champ objet par section) + `seo`.
- `schemaTypes/blogPage.ts` — page /blog : `content { title, emptyText }` + `seo`.
- `schemaTypes/articleSeoTemplate.ts` — modèle SEO des pages article (C6) + `POST_TEMPLATE_VARIABLES`.
- `schemaTypes/objects/seo.ts` — objet `seo { metaTitle, metaDescription, ogImage, allowIndexing }` (C2).
- `schemaTypes/objects/cta.ts`, `sections/*.ts` — bouton et sections de la page, avec leurs longueurs max.
- `schemaTypes/post.ts`, `testimonial.ts`, `faq.ts` — collections, `orderRank` (ordre manuel), `post.author`.
- `schemaTypes/aiUsage.ts` — journal de consommation IA (contrat `AiUsageDoc`, dont `request` ≤ 120), privé, hors structure.
- `schemaTypes/schema.test.ts` — champs ajoutés à la relecture : `scripts[].signature`, `aiUsage.request`, projection des scripts.
- `schemaTypes/shared.ts` — `altField` (repli sur l'altText de l'asset), `linkAnnotation`, `maxLength()`, `orderRankField()`.
- `lib/client.ts`, `lib/token.ts`, `lib/image.ts` — client, jeton de lecture (server-only), `urlFor`.
- `lib/live.ts` — `sanityFetch` (brouillons sans cache en mode aperçu de l'éditeur) et `SanityLive`.
- `lib/live-action.ts` (+ test) — server actions de `SanityLive` (site, Studio) et purge de `/bench` (développement seulement).
- `lib/live-tags.ts` (+ test) — `knownLiveTags` : seuls les sync tags `sanity:s1:<jeton>`, sans doublon, 64 au plus (SEC-02).
- `lib/queries.ts` — requêtes GROQ (`defineQuery`), dont `SITE_SETTINGS_QUERY`, `BLOG_PAGE_QUERY`, `ARTICLE_SEO_QUERY`.
- `lib/dataset-guard.ts` (+ test) — `assertNotProduction` : garde de TOUS les scripts qui écrivent.
- `lib/schema-inspect.ts` — lecture du schéma pour les tests (règles de validation enregistrées). Jamais importé par le site.
- `structure.ts` — colonne du Studio : Réglages · Pages (Home, Blog, SEO des articles) · Collections.
- `presentation.ts` — routes ↔ documents de l'aperçu live du Studio.
- `seed/` — textes du Figma (`page.ts`, `collections.ts`, `sections/`) ; **données de démo** : `demo-blog.ts`, `demo-collections.ts` ;
  `demo-script-signatures.ts` (+ test) : signatures à écrire pour les scripts d'exemple identiques au dépôt (SEC-04).
- `types.ts` — GÉNÉRÉ (`npm run typegen`), ne pas éditer.
- Scripts (racine `scripts/`) : `migrate-admin.ts`, `lib/demo.ts`, `lib/legacy.ts`, `lib/images.ts`, `seed.ts`,
  `cleanup-legacy.ts`, `touch.ts`, `site-baseline/` (captures, voir docs/admin/research/site-baseline/README.md).

## Contrats
- Entrées : aucune (définitions). Sorties : types Sanity, requêtes et leurs types générés, `SINGLETON_IDS`.
- Documents (ids fixes, **sans point** : un id avec un point est privé et illisible par le site) :
  | Id | Type | Contenu |
  |---|---|---|
  | `siteSettings` | siteSettings | `title` (60), `description` (160), `faviconLight`, `faviconDark`, `socialImage`, `allowIndexing`, `scripts[]` |
  | `dockSchedulingPage` | dockSchedulingPage | `hero`…`getStarted` (11 objets), `seo` |
  | `blogPage` | blogPage | `content { title (40), emptyText (80) }`, `seo` |
  | `articleSeo-post` | articleSeoTemplate | `collection: 'post'`, `metaTitle` (60), `metaDescription` (160), `ogImageField` ('cover' = image de l'article ; vide = `ogImage` fixe), `ogImage`, `allowIndexing` |
  | `aiUsage.<id>` | aiUsage | écrit par le moteur, privé (le point), champs = `AiUsageDoc` |
- `siteSettings.scripts[]` (`siteScript`) : `_key`, `name` (60), `placement` (`headEnd`·`bodyStart`·`bodyEnd`),
  `page` (`all`·`home`·`blog`·`blog/slug`), `run` (`once`·`everyPageVisit`), `code` (HTML : balises `<script>`/`<style>`),
  `enabled`, `signature` (HMAC base64url écrit par l'admin B3 avec `SCRIPTS_SIGNING_SECRET`, src/lib/script-signature.ts ;
  caché et en lecture seule dans le Studio). L'ordre du tableau = ordre d'injection. Le site n'injecte QUE les scripts
  dont la signature est valide (SEC-04) : un script créé ou modifié dans le Studio ou par l'API n'est plus chargé tant
  que l'admin ne l'a pas réenregistré. Les « champs CMS utilisés » d'un script de page article ne sont pas stockés : ce
  sont les `{{…}}` du code (`scriptVariables()`, src/lib/site-scripts.ts).
- `SITE_SETTINGS_QUERY` : scripts actifs (`enabled != false`) avec `enabled` et `signature` (vérification au rendu).
- `aiUsage.request` : chaîne ≤ 120 (colonne « Request » de B5), écrite par le moteur (engine-publish).
- Variables des pages article (C6, G6) : `title`, `slug`, `date` (AAAA-MM-JJ), `excerpt`, `cover` (URL 1200 × 630),
  `author`, `category`. Mêmes noms dans `POST_TEMPLATE_VARIABLES`, src/admin.config.ts et src/lib/template-variables.ts.
- Ordre manuel : `orderRank` (chaîne, fractional-indexing, masqué dans le Studio) sur post, testimonial, faq. Le site
  trie la FAQ et choisit le témoignage par défaut par `orderRank` ; le blog reste trié par date (l'ordre manuel du Blog
  ne sert qu'à l'admin). Un document créé dans le Studio reçoit une clé après la dernière.
- Texte alternatif : sur l'asset (`altText`, médiathèque C5) ; le champ `alt` de l'image passe avant (requêtes :
  `"alt": coalesce(alt, asset->altText)`).
- Dépend de : rien du site. Utilisé par : src/app/(site), src/components, src/admin.config.ts (types), admin (lecture
  des mêmes documents), moteur (textes, aiUsage).

## Comportement
- Limites de longueur : en **avertissement** dans le Studio (`maxLength()`), mêmes valeurs dans src/admin.config.ts et
  src/editor/zones.json (tests de concordance). L'API Sanity ne les applique pas : l'admin et le moteur valident.
- Studio : documents uniques sans création/suppression/duplication ; actions natives gardées pour Kuartz.
- Données de démonstration (dataset `development` SEULEMENT) : 12 articles `post-demo-*` en anglais (images
  `conduit-demo-NN-*.jpg` tirées des photos du site, texte alternatif sur l'asset, auteurs inventés), témoignages
  `testimonial-demo-*`, réponses des questions `faq-2` à `faq-9` (publiées), script d'exemple `demo-blogposting-jsonld`
  (JSON-LD BlogPosting sur `blog/slug`). La démo LyonDrive (`home`, 6 articles français, 14 images) est supprimée de
  `development`. `production` n'a pas été touché.

## Migrations
`npx sanity exec scripts/migrate-admin.ts --with-user-token [-- --demo] [-- --dry-run]` (idempotent) :
1. `dockSchedulingPage` (publié + brouillon) : `seoTitle`/`seoDescription` → `seo`, anciens champs retirés ;
2. `orderRank` dans l'ordre affiché (faq : `order` ; post : date desc ; testimonial : création desc), brouillon et
   publié avec la même clé ; clés existantes gardées, nouveaux documents ajoutés après ;
3. documents uniques créés s'ils manquent (`siteSettings` : titre « Conduit », description, image de partage recadrée
   dans `distribution-center-night.jpg`, aucun favicon faute de fichier ; `blogPage` ; `articleSeo-post` avec
   `{{title}}`/`{{excerpt}}`/cover, qui reproduit les métadonnées d'avant) ; `blogPage` à l'ancien format
   (textes à la racine) converti en `content` ;
4. `--demo` : suppression LyonDrive + données de démonstration ;
5. (toujours) signature des scripts d'exemple de `siteSettings` (publié + brouillon) dont les champs signés sont
   IDENTIQUES à `demoScripts` (`seed/demo-script-signatures.ts`), avec `SCRIPTS_SIGNING_SECRET` ; secret absent : sautée.
Exécutée sur `development` le 2026-09-27 (structure, puis `--demo`). **Pas sur production.** L'étape 5 (ajoutée à la
relecture) n'a été lancée qu'à blanc (« 2 script(s) d'exemple à signer ») : tant que `npm run migrate:admin` n'est pas
relancé, le JSON-LD d'exemple n'est plus injecté sur les pages article de development.

## Forces
- Rendu public identique prouvé au pixel après code + migration de structure (docs/admin/research/site-baseline).
- Concordance schéma ↔ manifeste ↔ zones testée en exécutant les vraies règles de validation (schema-inspect).
- Garde anti-production testée, appliquée à tous les scripts d'écriture (seed, touch, cleanup, migrate).

## Faiblesses et limites connues
- `production` n'est pas migré : la page d'accueil y lirait `seo.*` vide (titre « Conduit », pas de description) tant
  que la migration n'y est pas faite. Repli prévu seulement pour l'ordre (FAQ `order`, témoignage par date).
- `faq.order` n'est plus au schéma mais reste dans les données (non supprimé) ; la requête s'en sert en repli.
- Pas de favicon : `siteSettings.faviconLight/Dark` vides (aucun fichier dans le dépôt).
- Images de démo dérivées des photos du site : licence à confirmer avant tout usage hors démo.
- Les articles et témoignages de démo sont réécrits (createOrReplace) à chaque `--demo` : une retouche manuelle de ces
  documents en development est écrasée.

## Points sensibles
- JAMAIS d'écriture dans `production` : `assertNotProduction` (refus si le dataset ou `NEXT_PUBLIC_SANITY_DATASET` /
  `SANITY_STUDIO_DATASET` contient « prod »), aucun contournement. Une migration de production se décide à part.
- Ids des documents lus par le site : jamais de point (sinon privés). `aiUsage.<id>` : point VOULU (privé).
- Studio : « Publish » natif publie un texte sans le code de l'éditeur IA (branche draft) — réservé à Kuartz.
- `scripts[].code` est du code exécuté sur le site (XSS par conception). Tout Editor Sanity peut écrire le champ (Studio,
  API) : la vraie barrière est la signature (SEC-04), posée par l'admin après `settings.code`. Ne JAMAIS signer en masse
  les scripts existants (ce serait blanchir un script injecté) : la migration ne signe que le contenu exact du dépôt.
- Server actions de Live (`live-action.ts`) : appelables par tout visiteur. Ne jamais y passer des tags non filtrés
  (`knownLiveTags`) ; `purgeSiteCache` ne fait rien hors `NODE_ENV=development`.
- `SANITY_API_READ_TOKEN` : `lib/token.ts` est server-only ; le client d'aperçu (`lib/live.ts`) ne sert que côté serveur.

## Pièges
- Projection GROQ d'un champ absent = `null` (pas `undefined`) : tester `defined()` dans la requête (migration).
- Un champ supprimé du schéma reste dans les documents : le retirer par migration, sinon le Studio l'affiche « unknown ».
- Le cache de données de `next dev` garde les lectures après une écriture par script : `POST /api/revalidate`.
- Un fichier `'use server'` n'exporte que des fonctions asynchrones : helpers purs (constantes, filtres) dans un
  module à part (`live-tags.ts`).
- Une server action reste joignable par son identifiant même si la page qui l'utilise renvoie 404 : garder la garde
  dans l'action elle-même (`purgeSiteCache`).

## Comment modifier
- **Ajouter un champ à une section** : `schemaTypes/sections/<x>.ts` (+ `maxLength`), `npm run typegen`, composant,
  src/admin.config.ts (même limite), zone dans src/editor/zones.json si le champ s'affiche ; `npx vitest run src`.
- **Nouveau document unique** : type + id dans `SINGLETON_IDS` (sans point), `structure.ts`, création dans
  `migrate-admin.ts` (idempotente), requête dans `lib/queries.ts`.
- **Nouvelle collection ordonnable** : `orderRankField('<type>')`, `CURRENT_ORDER` de la migration, `collection()` de la structure.
- **Champ d'un script** : s'il change ce qui est injecté, l'ajouter à la chaîne signée (src/lib/script-signature.ts,
  version `v2`) ET à `SITE_SETTINGS_QUERY` ; prévenir code-usage (qui signe).

## Tests
`npx vitest run src/sanity src/admin.config.test.ts src/editor` — garde anti-production, manifeste ↔ schéma,
zones ↔ schéma, champs `signature` / `request`, tags de Live bornés, plan de signature des scripts d'exemple. À la main : `/studio` (connexion Google), `npx sanity exec scripts/migrate-admin.ts --with-user-token -- --dry-run`.

## Décisions et « À trancher »
- Q13 : texte alternatif sur l'asset, `alt` de l'image en priorité (compatibilité) — site-adapter.
- `seo.metaTitle` sans suffixe : le site ajoute « — Conduit » (comportement d'avant l'admin) ; `siteSettings.title` est
  le titre par défaut, pas le suffixe (le suffixe est `siteName` dans src/lib/site.ts).
- Q15 : pas de pages /testimonials ni /faq ; le menu Page des scripts contient all, home, blog, blog/slug.

## Demandes de contrat
- ~~`.env.example` : documenter `KZ_EDITOR_PREVIEW` et `NEXT_PUBLIC_SITE_LAUNCHED_AT`~~ — **fait** (vérifié le 2026-09-27).
- ~~engine-publish : écrire `aiUsage.request`~~ — **fait** pour l'éditeur IA (`usage/journal.ts > usageDocFromJob`,
  `requestText` ≤ 120 caractères) ; l'Ask AI (`ask/service.ts > recordAsk`) ne le passe pas encore (facultatif).
