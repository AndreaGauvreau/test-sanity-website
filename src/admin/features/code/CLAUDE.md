# features/code — LLM context

> Propriétaire : code-usage · Figma : B3 (docs/admin/figma/screens/B3.md), G6 (states/G6.md), fiche Script dialog · Mis à jour : 2026-09-27
> Possède aussi : `src/app/admin/(shell)/settings/code/` (page + test des droits).

## Utilité
B3 · Site Settings › Code, **Kuartz seulement** (`settings.code`) : scripts ajoutés au site publié (outils de suivi, CSS,
JSON-LD d'articles) — liste, ajout / modification dans le Script dialog (G6), activation, ordre, suppression confirmée.
Route `/admin/settings/code` ; client et editor reçoivent une 404. N'injecte rien dans le site (src/components/site-scripts, site-adapter).

## Fichiers
- `scripts.ts` — PUR : `ScriptItem`, libellés (placement, run), `pageOptions(config, counts)` (menu Page depuis le manifeste),
  `pageLabel`, `scriptType` (colonne Type), `detectedFields`, `checkScript` (erreurs / avertissements), `normalizeScripts`,
  `scriptFieldDefs`, `newScriptKey`, `toSanityScript`, constantes (`NAME_MAX` 60, `CODE_MAX` 100 000, `SCRIPTS_MAX` 50).
- `script-writes.ts` — SERVEUR : `createScript`, `updateScript`, `setScriptEnabled`, `deleteScript`, `moveScript` (brouillon de siteSettings).
- `actions.ts` — server actions (`saveScriptAction`, `setScriptEnabledAction`, `deleteScriptAction`, `moveScriptAction`).
- `data.ts` — SERVEUR : `loadCodeScreen()` (scripts du brouillon ou du publié, nombre d'articles pour « slug: 12 »).
- `CodeScreen.tsx` (+ `Code.module.css`) — client : tableau, menu ⋯, confirmation, toasts, autosave.
- `ScriptDialog.tsx` (+ `.module.css`) — client : la fenêtre G6 (composée ici, le kit ne la fournit pas).
- `CodeLoadError.tsx` — état d'erreur de lecture (serveur).
- Tests : `scripts.test.ts`, `actions.test.ts`, `ScriptDialog.test.tsx`, `CodeScreen.test.tsx`, `src/app/admin/(shell)/settings/code/page.test.tsx`.

## Contrats
- Entrées : `siteSettings.scripts[]` (`siteScript` : `_key, name, placement headEnd|bodyStart|bodyEnd, page, run once|everyPageVisit, code, enabled`),
  lu par `getDocumentState('siteSettings')` (brouillon s'il existe) ; `admin.config.ts` (pages, collections, `articleSeoTemplates` → champs `{{…}}`) ;
  `src/lib/site-scripts.ts` (`parseScriptCode`, `scriptVariables`) : mêmes règles que le rendu du site.
- Sorties : server actions → `ScriptActionResult = { ok: true, key } | { ok: false, error, fieldErrors? }` (anglais).
  Valeurs de `page` : `all`, id d'une page (`home`, `blog`), `<page>/slug` pour sa page article.
- Dépend de : core/auth (requireCapability), core/sanity (getDocumentState, setDraftFields, saveDraftField, validateFieldValue,
  getWriteClient, storeFromClient), core/autosave, kit UI. Utilisé par : la route B3 seulement.

## Comportement
- Tableau (B3) : Name (bouton = Edit) · Placement (« End of <head> », « Start of <body> », « End of <body> ») · Type (CSS /
  JavaScript / CSS + JavaScript, d'après les balises) · Page (« All pages », « / », « /blog », « /blog/:slug ») · Status (Tag
  Active / Disabled) · ⋯ (Edit, Disable/Enable, Move up, Move down, Delete). Clic sur la ligne = Edit. Vide : « No scripts yet » + Add script.
- Fenêtre (G6) : « New Script » / « Edit Script » ; Name, Placement, Page (All pages, Home, /blog, « slug: » + nombre
  d'articles), Run (Once, On every page visit), Code (CodeBlock sans numéros). Page article : bouton « Insert field » et
  saisie de `{{` ouvrent « Blog fields » (champs du modèle SEO d'article) ; le champ remplace `{{` ou s'insère au curseur ;
  les champs déjà utilisés sont cochés. Pied : astuce `<script>` en fin de body, ou astuce `{{` sur une page article.
- Contrôles (`checkScript`, client ET serveur) : nom requis ≤ 60 et une ligne ; valeurs fermées ; code requis, ≤ 100 000 car.,
  dans des balises `<script>`/`<style>`. Avertissements non bloquants : balise non fermée, texte hors balises ignoré,
  `{{champ}}` inconnu de la collection, `{{…}}` hors page article. Pas de validation du JavaScript (B3).
- Écritures dans `drafts.siteSettings` (en ligne après Publish, sans build) : modification / activation / suppression par
  chemins à clé `scripts[_key=="…"]` ; ajout (en dernier) et déplacement réécrivent le tableau. Chaque écriture :
  `autosave.saving()` → `saved()` / `failed(msg)`, toast, puis `refresh()` côté serveur.
- Échap ou Cancel ferment la fenêtre (le voile ne ferme pas : saisie longue) ; Échap dans la liste des champs rend la main au code.

## Forces
- Droit revérifié à CHAQUE écriture (action + `script-writes`), avant la validation des entrées ; testé pour client, editor, session expirée.
- Règles partagées client / serveur (`checkScript`) et analyse du code identique à celle du site (`parseScriptCode`).
- Écritures ciblées par `_key` : un script supprimé entre-temps donne « This item no longer exists. Reload and try again. »
- 45 tests (logique, actions avec faux Sanity, fenêtre et écran en jsdom, droits de la page).

## Faiblesses et limites connues
- Ajout et déplacement réécrivent `scripts` entier (lu juste avant avec le jeton de l'utilisateur) : deux Kuartz qui
  ajoutent en même temps → le dernier gagne (pas d'`ifRevisionID` dans les aides core/sanity).
- Pas d'indicateur « modifié, non publié » par ligne (le Figma n'en montre pas) : la Top bar compte les brouillons.
- Le chevron de /blog du menu Page (G6) n'est pas repliable : « slug: » est toujours affiché, en retrait.
- L'en-tête reprend le Page header du kit (vrai h1) avec le titre en Heading 4 (Figma : Section header) : l'action « Add »
  est centrée sur le bloc titre + description (≈ 5 px plus bas que le Figma).
- Champs de la fenêtre à 34 px (kit) au lieu de 32 (Figma), fonds et contours obtenus en redéfinissant localement
  `--k-bg-input` / `--k-border-default` dans le corps de la fenêtre.

## Points sensibles
- **XSS par conception** : le code est injecté TEL QUEL sur le site publié. Lecture (page) et écriture (actions) réservées à
  `settings.code` (Kuartz). Ne jamais relâcher ce droit, ne jamais exposer ces actions ailleurs, ne jamais afficher le code à un autre rôle.
- Seules les VALEURS des `{{…}}` (contenu du CMS) sont échappées, par le site (src/lib/template-variables.ts), pas ici.
- Le CodeBlock du kit n'exécute rien et rend le code en nœuds texte : garder cette règle dans l'aperçu.
- Écritures seulement dans le BROUILLON, par les aides core/sanity (jamais de mutation sur `siteSettings` publié).

## Pièges
- `useModalDialog` pose le focus initial à la frame suivante : dans les tests, attendre le focus sur Name avant d'interagir.
- Le Popover du kit est `visibility: hidden` avant positionnement : le focus initial du Menu échoue quand il est ouvert
  sans clic (saisie de `{{`) ; la fenêtre refocalise le premier champ dès qu'il est visible (effet dans ScriptDialog).
- Les clics dans un menu en portail remontent au `onClick` de la ligne (événements React) : la ligne ignore les clics venus
  d'un bouton, d'un lien ou d'un `[role="menu"]`.
- `requireCapability` (page) → `notFound()` ; la coque a un `loading.tsx` : la réponse est déjà en flux, le statut HTTP reste
  200 avec la page « Page not found » (aucune donnée n'est lue ni envoyée).
- `'use server'` : seules des fonctions async sont exportées (les types passent).

## Comment modifier
- Nouvelle page ciblable : l'ajouter au manifeste (`admin.config.ts`) ET à `SCRIPT_PAGES` du schéma (site-adapter) — le
  menu la reprend tout seul ; une page listing avec `article` ajoute sa ligne « slug: ».
- Nouvel emplacement : schéma (`SCRIPT_PLACEMENTS`), rendu du site, `PLACEMENT_OPTIONS`, enum zod d'`actions.ts`.
- Nouvel avertissement : `checkScript` + test dans `scripts.test.ts`.

## Tests
`npx vitest run src/admin/features/code "src/app/admin/(shell)/settings/code"`.
À la main (rôle kuartz, dataset development, SANITY_API_WRITE_TOKEN requis) : Add → nom + `<style>…</style>` → Save ;
⋯ Disable / Move / Delete ; Page = slug: puis taper `{{` dans le code. Rôle client : `/admin/settings/code` → Page not found.
Vérifié le 2026-09-27 dans Chrome (écriture réelle puis remise en état du tableau `scripts`).

## Décisions et « À trancher »
- Question 5 : Code réservé à Kuartz (orchestrateur) — 404 pour les autres rôles.
- Question 15 : pas de /testimonials ni /faq (le menu Page suit le manifeste).
- Titres « New Script » / « Edit Script » (LLM context B3). Code sans balise = erreur (rien ne s'exécuterait).

## Demandes de contrat
- **core/sanity** : une aide d'ajout / réordonnancement dans un tableau avec `ifRevisionID` (ou `insert` Sanity) pour
  supprimer la course des écritures « tableau entier ».
- **ui-composites (Popover / Menu)** : focus initial du Menu quand le panneau est encore masqué (ouverture contrôlée sans clic).
- **ui-composites** : `SectionHeader` avec `headingLevel={1}` (ou Page header « compact ») pour les écrans dont l'en-tête Figma est un Section header.
