# Zones de l'éditeur IA (zones.json) et tokens du site — LLM context

> Propriétaire : site-adapter (`zones.json`, `zones.test.ts`, `src/styles/tokens.json` + test) · `RULES.md` : engine-claude
> · Figma : D0-D3, G1 · Contrat : src/admin/core/contracts/zones.ts · Mis à jour : 2026-09-27

## Utilité
Dit à l'éditeur IA (moteur `engine/`, pont `src/admin/editor-bridge`, interface D1-D3) ce qui est modifiable sur la
page d'accueil, élément par élément : fichiers et classes CSS qu'une retouche de style peut toucher, textes Sanity
(ou du code) qu'une retouche de texte peut réécrire, réglages proposés, zones intérieures. Lu par le moteur à chaque
demande (dans son clone), par le pont (repérage `data-edit`) et par l'admin (libellés « Hero · Title »).

## Fichiers
- `zones.json` — `{ controls, zones }` (format `ZonesFile`) : 7 réglages, 77 zones (toute la page d'accueil + la
  carte d'article partagée avec /blog).
- `zones.test.ts` — validation par le chargeur du moteur (`buildDesignSystem`, aucun avertissement), marquage du code,
  classes des CSS Modules, chemins et limites Sanity, `data-edit-key` des éléments de tableau.
- `RULES.md` — règles données à Claude (propriété d'engine-claude, pas de site-adapter).
- `../styles/tokens.json` (+ `tokens.test.ts`) — tokens du site (format `TokensFile`), reflet exact de `tokens.css`.
- Marquage : `src/lib/editor/preview.ts` (`editAttrs`) et les composants de `src/components/` (voir src/app/(site)/CLAUDE.md).

## Contrats
- Zone (`ZoneDef`) : `label` (anglais, court), `section` (« Hero »…), `files` (CSS Module + composant),
  `selectors` (classes du CSS Module ; **la première = celle de l'élément qui porte `data-edit`**), `controls`,
  `text` (voir ci-dessous), `children` (zones intérieures : le conteneur ne leur donne que du placement),
  `hideable`, `logotype`, `reach` (phrase anglaise pour le client), `hint`.
- Texte Sanity : `{ source: 'sanity', document, fields, lines?, closed? }`
  - `document` : `{ type: 'dockSchedulingPage', id: 'dockSchedulingPage' }` pour la page, ou
    `{ type: 'testimonial' | 'faq' | 'post', from: 'data-edit-doc' }` pour un élément de collection (id publié lu sur
    l'ancêtre `data-edit-doc`) ;
  - `fields` : chemin → longueur max (= `maxLength` du schéma, testé), `$key` pour les tableaux
    (`features.items[_key=="$key"].title`), jamais d'index ;
  - `lines` : champs à retours à la ligne significatifs (`performance.benefits[…].title`, `faq.supportText` : 2) ;
  - `closed` : valeurs de liste, jamais réécrites (`hero.ratings[…].platform`, `performance.benefits[…].icon`, `category`).
- Texte du code : `{ source: 'code', files }` (`integrations.logos` : logos et textes alternatifs dans Integrations.tsx).
- DOM, en mode aperçu seulement (`KZ_EDITOR_PREVIEW=1`) : `data-edit="<zone>"` sur l'élément ; `data-edit-doc` sur la
  racine de chaque section (`dockSchedulingPage`), sur la citation (`testimonial`), sur chaque question (`faq`), sur
  chaque carte d'article (`post`) ; `data-edit-key` sur l'élément de tableau ET sur ses zones intérieures.
- Réglages (`controls`) : `color` / `background` (groupe `color`), `textStyle` (`font`, groupe `text` : raccourcis
  `--text-*`, le tracking va avec), `align` (options), `gap` / `padding` (groupe `space`), `sectionSpacing`
  (`padding-block` : `var(--section-space)` ou `var(--section-space-lg)`).
- `tokens.json` : groupes `color` (rôles seulement, jamais la palette), `font` (verrouillé), `text` (styles + tracking),
  `space` (échelle ajoutée, voir plus bas), `layout` (verrouillé), `breakpoint` (verrouillé : 50.625, 64, 80, 90rem,
  les seuls `@media (min-width)` du site ; `@container 25rem` de la FAQ n'y est pas). Clé d'un token = nom de la
  custom property sans « -- » (`color-text-muted`).

## Comportement
- Une zone par section et par élément modifiable : titres, sous-titres, sur-titres, boutons, cartes, modules, atouts,
  chiffres, résultats, citation, questions, carte d'aide, cartes d'article, visuels (fond seulement).
- Éléments répétés (cartes, modules, atouts, chiffres, résultats, notes, questions, cartes d'article) : le style vaut
  pour toutes les occurrences, le texte pour l'élément choisi (`hint`).
- Titres masqués (`features.title`, `testimonial.title`) : pas de zone (aucune surface à cliquer) ; ils restent
  modifiables dans l'admin (C1, `visuallyHidden`).
- Réponses de la FAQ (Portable Text) : zone de style seulement (`faq.item.answer`), texte dans CMS › FAQ.
- Échelle d'espacement `--space-8` … `--space-64` : ADDITIVE dans `tokens.css` (valeurs réellement employées par les
  modules, nom = taille en px), aucune valeur existante changée ; aucun module ne s'en sert au moment de l'ajout, rendu
  identique prouvé au pixel. Les noms évitent `--space-1`/`--space-2` : le moteur n'active donc pas de « soulèvement »
  au survol par défaut.
- Classes d'ancrage : les boutons et sur-titres d'une section reçoivent une classe du CSS Module de la section
  (`.primaryCta`, `.eyebrow`, `.cta`, `.supportCta`…), déclarée `order: 0` (valeur initiale : un CSS Module
  n'exporte pas une classe vide). C'est la première classe de leur zone.

## Forces
- `zones.test.ts` charge le fichier avec le validateur du moteur : ce que le test accepte, le moteur l'accepte.
- Code et zones ne peuvent pas diverger sans casser un test (zone non marquée, marquage non déclaré, classe absente,
  limite différente du schéma).

## Faiblesses et limites connues
- Zones de la page d'accueil seulement (+ carte d'article) ; /blog et l'article n'ont pas de zones propres
  (`aiEditor: false` pour 'blog' dans le manifeste). En-tête et pied de page : emplacements gris, sans zone.
- `post.card` partage PostCard.module.css avec /blog : une retouche change aussi /blog (dit dans `reach`).
- Le lint TSX du moteur compte les `data-edit` : ici ils viennent de `editAttrs('<zone>')` (et `edit={editAttrs(…)}`
  pour Button/Eyebrow), pas d'attributs littéraux — à compter ainsi côté engine-guards.
- Photos décoratives (Performance, Testimonial, GetStarted) : dans les sélecteurs de la section, sans zone propre.

## Points sensibles
- `files` ne doit lister que des fichiers du site (le moteur ouvre ces fichiers à Claude) ; jamais `src/admin`, `engine`.
- `closed` protège les valeurs qui choisissent une classe CSS : ne jamais les retirer.
- Ne jamais mettre un index numérique dans un chemin (`items[0]`) : l'ordre peut changer entre sélection et écriture.

## Pièges
- Le point dans un id de zone est un séparateur de lecture, pas un chemin : `getStarted.title.muted` est une zone.
- Un `editAttrs` sans `{ key }` sur une zone à `$key` rend le texte inciblable (« no valid array key ») : testé.

## Comment modifier
- **Déclarer une nouvelle zone** : 1) donner à l'élément une classe de son CSS Module (en créer une avec `order: 0`
  si besoin) ; 2) ajouter `{...editAttrs('<section>.<element>', { key? , doc? })}` sur l'élément (ou `edit={…}` pour
  Button/Eyebrow) ; 3) ajouter la zone dans `zones.json` (première classe = celle de l'élément, `files`, `controls`,
  `text` avec les limites du schéma) et la citer dans les `children` de son conteneur ; 4) `zone:` du champ dans
  src/admin.config.ts ; 5) `npx vitest run src/editor src/admin.config.test.ts` ; 6) captures de référence
  (docs/admin/research/site-baseline/README.md) : le HTML public ne doit pas changer.
- **Nouveau token** : l'ajouter à `tokens.css` puis à `tokens.json` (même valeur) ; `npx vitest run src/styles`.

## Tests
`npx vitest run src/editor src/styles` (zones : 5 tests ; tokens : 3). À la main : l'aperçu 4042 du moteur
(`KZ_EDITOR_PREVIEW=1`) doit montrer les `data-edit` ; le site public 4040 aucun (`scripts/site-baseline/check-html.ts --live`).

## Décisions et « À trancher »
- Réglages volontairement courts (7) : couleur, fond, style de texte, alignement, espacements, rythme de section.
- Pas de réglage de police seule (`font-family`) : les styles de texte de Conduit sont des raccourcis `font`.

## Demandes de contrat
- engine-guards : compter les zones marquées par `editAttrs('<zone>'` (et `edit={editAttrs(`) dans le lint TSX, les
  attributs `data-edit` n'étant pas écrits en littéral.
