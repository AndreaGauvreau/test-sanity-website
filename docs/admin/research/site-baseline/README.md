# Site Conduit — captures de référence et preuve de rendu identique

> site-adapter, 2026-09-27. Scripts : `scripts/site-baseline/` (capture, comparaison, contrôle du HTML).

## Les trois séries

| Dossier | Quand | Contenu Sanity (`development`) | Fichiers |
|---|---|---|---|
| `avant/` | 2026-09-27 06:55 UTC, **avant tout changement** de code ou de contenu | copie exacte de `production` (démo LyonDrive encore présente) | PNG + HTML + texte |
| `code/` | après **tout le code** (Studio sur `/studio`, schéma, métadonnées, scripts, revalidation, mode aperçu, `data-edit*`, classes d'ancrage des zones, échelle `--space-*`) **et la migration de structure** (`migrate-admin.ts` sans `--demo`), avant les données de démo | même contenu, restructuré (seo, orderRank, documents uniques) | HTML + texte (PNG retirés : identiques à `avant/`, régénérables) |
| `apres/` | après `migrate-admin.ts -- --demo` : **nouvelle référence** | blog de démonstration Conduit | PNG + HTML + texte |

Pages : `/`, `/blog`, un article (`avant/` et `code/` : `/blog/road-trips-depuis-lyon` ; `apres/` :
`/blog/carrier-portals-a-checklist`). Largeurs : 375, 768, 1280, 1440 px, pleine page.

## Résultats

**`avant/` → `code/` : aucune différence.** 12 captures sur 12 identiques au pixel (pixelmatch, seuil 0,
anticrénelage compté) et texte visible identique sur les 3 pages. Le HTML public ne contient ni `data-edit*`
ni encodage stega (`check-html.ts`, avant comme après). Contrôle préalable : deux captures successives de
`avant/` sans changement donnent aussi 0 pixel d'écart (rendu déterministe).

Différences du HTML **non visibles**, attendues (métadonnées, lues dans `siteSettings` créé par la migration) :
- toutes les pages : `og:image` / `twitter:image` = l'image de partage du site (`siteSettings.socialImage`) ;
- `/blog` : `description`, `og:description`, `twitter:description` = description du site (la page n'avait
  aucune description) ; titre et `og:title` inchangés (« Blog — Conduit ») ;
- article LyonDrive sans résumé : `description` = description du site ({{excerpt}} vide → valeur du site, C6) ;
- `/` : titre, description, `og:title` identiques (migrés de `seoTitle` / `seoDescription` vers `seo.*`) ;
- attribut `class` des boutons et sur-titres : une classe d'ancrage de zone en plus (ex.
  `Hero-module__…__primaryCta`), déclarée `order: 0` (valeur initiale, sans effet) ;
- Next 16 peut diffuser les balises de métadonnées après le `<head>` pour un navigateur (streaming
  metadata) : `check-html.ts` lit tout le document.

**`code/` → `apres/` : différences attendues (contenu de démo seulement).**
- `/` · FAQ : les 8 questions restées en brouillon sont publiées avec une réponse (9 questions au lieu d'une) ;
- `/` · Insights (« Learn and grow ») : les 4 derniers articles de démo, en anglais, avec leur catégorie
  (les articles LyonDrive n'en avaient pas) ; images tirées des photos du site ;
- `/blog` : 12 articles en anglais au lieu de 6 en français ;
- article : autre article (`carrier-portals-a-checklist`), JSON-LD `BlogPosting` (script d'exemple de
  `siteSettings`, variables {{…}} résolues), texte alternatif lu sur l'asset (`coalesce(alt, asset->altText)`) ;
- `/` · témoignage : inchangé (Teresa Nelson reste la première de l'ordre manuel).

## Rejouer la comparaison

Le serveur de dev doit tourner (http://127.0.0.1:4040, dataset `development`). Chrome installé.

```bash
# 1. capturer (pleine page, 4 largeurs, animations coupées, heure de rendu masquée)
npx tsx scripts/site-baseline/capture.ts /tmp/candidat --post carrier-portals-a-checklist

# 2. comparer au pixel à la référence (code 1 si une différence ; images de différence dans <candidat>/diff)
npx tsx scripts/site-baseline/compare.ts docs/admin/research/site-baseline/apres /tmp/candidat

# 3. HTML public : ni data-edit ni stega, et balises SEO (pour comparer deux séries)
npx tsx scripts/site-baseline/check-html.ts /tmp/candidat
npx tsx scripts/site-baseline/check-html.ts --live
```

Le serveur de dev garde les lectures Sanity en cache : après une écriture faite par script (sans onglet
ouvert), vider le cache avant de capturer — `POST /api/revalidate` avec l'en-tête `x-kz-revalidate`
(= `REVALIDATE_SECRET` de `.env.local`, sans l'afficher) ou le bouton de `/bench`.

Pour une nouvelle référence après un changement VOULU du contenu : recapturer dans un nouveau dossier, écrire
ici la liste des différences attendues, et garder l'ancienne série tant que la nouvelle n'est pas relue.
