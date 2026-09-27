# features/code — LLM context

> Propriétaire : code-usage · Figma : B3 (docs/admin/figma/screens/B3.md), G6 (states/G6.md), fiche Script dialog · Mis à jour : 2026-09-27 (pages /testimonials et /faq, Q15 révisée)
> Possède aussi : `src/app/admin/(shell)/settings/code/` (page + test des droits).

## Utilité
B3 · Site Settings › Code, **Kuartz seulement** (`settings.code`) : scripts ajoutés au site publié (outils de suivi, CSS,
JSON-LD d'articles) — liste, ajout / modification dans le Script dialog (G6), activation, ordre, suppression confirmée.
SIGNE chaque script écrit (SEC-04) et signale ceux modifiés hors de l'admin, avec l'action Kuartz « Re-sign ».
Route `/admin/settings/code` ; client et editor reçoivent une 404. N'injecte rien dans le site (src/components/site-scripts, site-adapter).

## Fichiers
- `scripts.ts` — PUR : `ScriptItem`, libellés (placement, run), `pageOptions(config, counts)` (menu Page depuis le manifeste),
  `pageLabel`, `scriptType` (colonne Type), `detectedFields`, `checkScript` (erreurs / avertissements), `normalizeScripts`,
  `scriptFieldDefs`, `newScriptKey`, `toSanityScript(item, signature)`, `signableFromRaw` / `signableOf` (valeurs signées),
  constantes (`NAME_MAX` 60, `CODE_MAX` 100 000, `SCRIPTS_MAX` 50).
- `signing.ts` — SERVEUR (SEC-04) : `signItem`, `isRawSigned`, `withSignatureStatus`, `isSigningReady`, `SIGNING_MISSING`
  (lit `SCRIPTS_SIGNING_SECRET` à chaque appel ; s'appuie sur `src/lib/script-signature.ts`, propriété de site-adapter).
- `script-writes.ts` — SERVEUR : `createScript`, `updateScript`, `setScriptEnabled`, `resignScript`, `deleteScript`, `moveScript`
  (brouillon de siteSettings ; ajout / déplacement / suppression par `updateDraftArray` sans course ; messages
  `MODIFIED_OUTSIDE`, `CHANGED_SINCE`).
- `actions.ts` — server actions (`saveScriptAction`, `setScriptEnabledAction`, `resignScriptAction`, `deleteScriptAction`, `moveScriptAction`).
- `data.ts` — SERVEUR : `loadCodeScreen()` (scripts du brouillon ou du publié avec `signed` vérifié, `signingReady`,
  nombre d'articles pour « slug: 12 »).
- `CodeScreen.tsx` (+ `Code.module.css`) — client : en-tête `SectionHeader headingLevel={1}` (Figma : Section header), tableau,
  menu ⋯, confirmations (Delete, Re-sign), bandeaux SEC-04, toasts, autosave.
- `ScriptDialog.tsx` (+ `.module.css`) — client : la fenêtre G6 (composée ici, le kit ne la fournit pas).
- `CodeLoadError.tsx` — état d'erreur de lecture (serveur), même en-tête que l'écran.
- Tests : `scripts.test.ts`, `signing.test.ts`, `actions.test.ts`, `ScriptDialog.test.tsx`, `CodeScreen.test.tsx`,
  `src/app/admin/(shell)/settings/code/page.test.tsx`.

## Contrats
- Entrées : `siteSettings.scripts[]` (`siteScript` : `_key, name, placement headEnd|bodyStart|bodyEnd, page, run once|everyPageVisit, code, enabled, signature`),
  lu par `getDocumentState('siteSettings')` (brouillon s'il existe) ; `admin.config.ts` (pages, collections, `articleSeoTemplates` → champs `{{…}}`) ;
  `src/lib/site-scripts.ts` (`parseScriptCode`, `scriptVariables`) : mêmes règles que le rendu du site.
- Sorties : server actions → `ScriptActionResult = { ok: true, key } | { ok: false, error, fieldErrors? }` (anglais).
  Valeurs de `page` : `all`, id d'une page (`home`, `blog`), `<page>/slug` pour sa page article.
  `resignScriptAction({ key, expected: { placement, page, run, code, enabled } })` : valeurs affichées dans B3.
- Signature (SEC-04, `src/lib/script-signature.ts`) : `signature = base64url(HMAC-SHA256(SCRIPTS_SIGNING_SECRET,
  "v1\n_key\nplacement\npage\nrun\n1|0\ncode"))` — le NOM n'est pas signé. Le site n'injecte que les scripts dont
  la signature est valide sur les valeurs BRUTES lues.
- Dépend de : core/auth (requireCapability), core/sanity (getDocumentState, setDraftFields, saveDraftField, updateDraftArray,
  insertItem, validateFieldValue, getWriteClient, storeFromClient), core/autosave, kit UI, `src/lib/script-signature.ts`, env `SCRIPTS_SIGNING_SECRET`
  (≥ 32 car.). Utilisé par : la route B3 seulement.

## Comportement
- Tableau (B3) : Name (bouton = Edit) · Placement (« End of <head> », « Start of <body> », « End of <body> ») · Type (CSS /
  JavaScript / CSS + JavaScript, d'après les balises) · Page (« All pages », « / », « /blog », « /blog/:slug ») · Status (Tag
  Active / Disabled, ou Tag warning « Modified outside » lu « Modified outside the admin — not running on the site ») ·
  ⋯ (Edit, Re-sign (script non signé seulement), Disable/Enable, Move up, Move down, Delete). Clic sur la ligne = Edit.
  Vide : « No scripts yet » + Add script.
- SEC-04 à l'écran : Callout warning « N script(s) … modified outside the admin … Re-sign » au-dessus du tableau ; Callout
  error si le secret manque (rien ne tourne, rien ne s'enregistre). Re-sign → confirmation « Re-sign this script? » →
  `resignScriptAction` avec les valeurs affichées. Enable fermé pour un script non signé. Edit d'un script non signé :
  Callout en tête de la fenêtre (« Saving signs it »).
- Fenêtre (G6) : « New Script » / « Edit Script » ; Name, Placement, Page (All pages, Home, /blog, « slug: » + nombre
  d'articles), Run (Once, On every page visit), Code (CodeBlock sans numéros). Page article : bouton « Insert field » et
  saisie de `{{` ouvrent « Blog fields » (champs du modèle SEO d'article) ; le champ remplace `{{` ou s'insère au curseur ;
  les champs déjà utilisés sont cochés. Pied : astuce `<script>` en fin de body, ou astuce `{{` sur une page article.
- Contrôles (`checkScript`, client ET serveur) : nom requis ≤ 60 et une ligne ; valeurs fermées ; code requis, ≤ 100 000 car.,
  dans des balises `<script>`/`<style>`. Avertissements non bloquants : balise non fermée, texte hors balises ignoré,
  `{{champ}}` inconnu de la collection, `{{…}}` hors page article. Pas de validation du JavaScript (B3).
- Écritures dans `drafts.siteSettings` (en ligne après Publish, sans build) : modification / activation / Re-sign par
  chemins à clé `scripts[_key=="…"]` ; ajout (en dernier), déplacement et suppression par `updateDraftArray` de core/sanity
  (écriture conditionnée : `ifRevisionID` sur le brouillon, `create` s'il n'existe pas ; 409 → relecture et nouvel essai,
  3 au plus) avec une transformation PURE qui recopie les autres scripts tels quels, signature comprise. Un script ajouté
  ou modifié en même temps par un autre onglet n'est donc jamais effacé. Le plafond (50) est vérifié sur le tableau relu ;
  ni publié ni brouillon → « Site settings are missing. Ask Kuartz to create them. ». Chaque écriture : `autosave.saving()` → `saved()` / `failed(msg)`,
  toast, puis `refresh()` côté serveur.
- Signature à l'écriture (SEC-04) : ajout, modification, activation / désactivation d'un script signé et Re-sign écrivent
  dans le MÊME patch les valeurs signées (placement, page, run, code, enabled) ET la signature : ce qui est signé est
  exactement ce qui est écrit. Modification = re-signature (Kuartz a revu le code dans la fenêtre ; `enabled` relu).
  Script non signé : Enable refusé (`MODIFIED_OUTSIDE`), Disable écrit `enabled: false` SANS signer. Re-sign compare les
  valeurs affichées aux valeurs actuelles (normalisées) : différence → `CHANGED_SINCE`, rien n'est signé. Secret absent
  ou < 32 car. → `SIGNING_MISSING` (ajout, modification, Enable, Re-sign), rien n'est écrit ; Disable, Move, Delete restent possibles.
- Échap ou Cancel ferment la fenêtre (le voile ne ferme pas : saisie longue) ; Échap dans la liste des champs rend la main au code.

## Forces
- Droit revérifié à CHAQUE écriture (action + `script-writes`), avant la validation des entrées ; testé pour client, editor, session expirée.
- Règles partagées client / serveur (`checkScript`) et analyse du code identique à celle du site (`parseScriptCode`).
- Écritures ciblées par `_key` : un script supprimé entre-temps donne « This item no longer exists. Reload and try again. »
- SEC-04 : un Editor qui modifie `scripts` dans le Studio ou par l'API n'obtient plus d'exécution sur le site ; aucune action
  de B3 ne signe un code modifié sans revue explicite (Save depuis la fenêtre, ou Re-sign confirmé sur les valeurs vues).
- 77 tests avec la route (menu Page = manifeste ET `SCRIPT_PAGES` du schéma, vérifié par test ; logique, signature, actions avec faux Sanity à révisions — écritures concurrentes comprises —, fenêtre et écran
  en jsdom, droits de la page).

## Faiblesses et limites connues
- Un conflit qui persiste après 3 essais (écritures très rapprochées) → « This item was changed at the same time. Reload
  and try again. » ; rien n'est écrit.
- Pas d'indicateur « modifié, non publié » par ligne (le Figma n'en montre pas) : la Top bar compte les brouillons.
- Le chevron de /blog du menu Page (G6) n'est pas repliable : « slug: » est toujours affiché, en retrait.
- Champs de la fenêtre à 34 px (kit) au lieu de 32 (Figma), fonds et contours obtenus en redéfinissant localement
  `--k-bg-input` / `--k-border-default` dans le corps de la fenêtre.
- Le statut « Modified outside » porte sur la valeur AFFICHÉE (brouillon s'il existe) : un brouillon modifié hors de
  l'admin est signalé alors que le site tourne encore sur le publié (signé) jusqu'au prochain Publish.
- Les scripts écrits avant SEC-04 (dataset development, seed de site-adapter) n'ont pas de signature : ils apparaissent
  « Modified outside » et ne tournent plus tant que Kuartz ne les a pas re-signés (Re-sign, un par un).
- Changer `SCRIPTS_SIGNING_SECRET` invalide toutes les signatures : tout re-signer ensuite.

## Points sensibles
- **XSS par conception** : le code est injecté TEL QUEL sur le site publié. Lecture (page) et écriture (actions) réservées à
  `settings.code` (Kuartz). Ne jamais relâcher ce droit, ne jamais exposer ces actions ailleurs, ne jamais afficher le code à un autre rôle.
- Seules les VALEURS des `{{…}}` (contenu du CMS) sont échappées, par le site (src/lib/template-variables.ts), pas ici.
- Le CodeBlock du kit n'exécute rien et rend le code en nœuds texte : garder cette règle dans l'aperçu.
- Écritures seulement dans le BROUILLON, par les aides core/sanity (jamais de mutation sur `siteSettings` publié).
- SEC-04 : ne JAMAIS signer des valeurs relues sans revue (ex. re-signer en masse, signer dans Move/Delete, re-signer
  un script non signé à l'activation). `SCRIPTS_SIGNING_SECRET` reste côté serveur (`signing.ts` est `server-only`) ;
  la signature n'est pas envoyée au navigateur (seulement `signed: boolean`).

## Pièges
- `useModalDialog` pose le focus initial à la frame suivante : dans les tests, attendre le focus sur Name avant d'interagir.
- Liste des champs ouverte sans clic (saisie de `{{`) : le focus initial vient du `MenuPanel` du kit (il réessaie tant que
  le Popover est masqué avant positionnement) ; ne pas remettre de refocalisation dans ScriptDialog.
- Les clics dans un menu en portail remontent au `onClick` de la ligne (événements React) : la ligne ignore les clics venus
  d'un bouton, d'un lien ou d'un `[role="menu"]`.
- `requireCapability` (page) → `notFound()` ; la coque a un `loading.tsx` : la réponse est déjà en flux, le statut HTTP reste
  200 avec la page « Page not found » (aucune donnée n'est lue ni envoyée).
- La transformation passée à `updateDraftArray` est rappelée après un 409 : la garder PURE (clé et signature du nouveau
  script calculées AVANT, hors de la transformation ; jamais de lecture ni d'écriture dedans).
- `'use server'` : seules des fonctions async sont exportées (les types passent).
- SEC-04 : la signature se vérifie sur les valeurs BRUTES (`signableFromRaw`) — un `enabled` absent est « actif » pour la
  lecture mais NON signé ; ne jamais vérifier sur les valeurs normalisées. Toute nouvelle écriture qui touche placement,
  page, run, code ou enabled doit passer par `signedSet` (sinon le script cesse de tourner).
- `normalizeScripts` met `signed: false` (fonction pure, sans secret) : toujours passer par `withSignatureStatus` côté serveur.
- Tests : `SCRIPTS_SIGNING_SECRET` est posé dans `process.env` par les tests (jamais le vrai secret).

## Comment modifier
- Nouvelle page ciblable : l'ajouter au manifeste (`admin.config.ts`) ET à `SCRIPT_PAGES` du schéma (site-adapter) — le
  menu la reprend tout seul ; une page listing avec `article` ajoute sa ligne « slug: ».
- Nouvel emplacement : schéma (`SCRIPT_PLACEMENTS`), rendu du site, `PLACEMENT_OPTIONS`, enum zod d'`actions.ts`.
- Nouvel avertissement : `checkScript` + test dans `scripts.test.ts`.
- Nouveau champ signé : d'abord `src/lib/script-signature.ts` (site-adapter, chaîne `v2`), puis `signableFromRaw`,
  `signableOf`, `signedSet` (script-writes) et le site ; toutes les signatures existantes deviennent invalides.

## Tests
`npx vitest run src/admin/features/code "src/app/admin/(shell)/settings/code"`.
À la main (rôle kuartz, dataset development, SANITY_API_WRITE_TOKEN et SCRIPTS_SIGNING_SECRET requis) : Add → nom +
`<style>…</style>` → Save ; ⋯ Disable / Move / Delete ; Page = slug: puis taper `{{` dans le code ; modifier un code dans
le Studio → la ligne passe « Modified outside » → ⋯ Re-sign. Rôle client : `/admin/settings/code` → Page not found.
Vérifié le 2026-09-27 dans Chrome (écriture réelle puis remise en état du tableau `scripts`) ; SEC-04 vérifié par les
tests et au rendu de `/admin/settings/code` (les scripts non signés du dataset development s'affichent « Modified outside »).

## Décisions et « À trancher »
- Question 5 : Code réservé à Kuartz (orchestrateur) — 404 pour les autres rôles.
- Question 15 (révisée le 2026-09-27) : menu Page = All pages, Home, /blog, slug: (/blog/:slug), /testimonials, slug:
  (/testimonials/:slug), /faq, slug: (/faq/:slug) ; champs insérables = variables de `articleSeoTemplates` de la collection.
- Titres « New Script » / « Edit Script » (LLM context B3). Code sans balise = erreur (rien ne s'exécuterait).
- FOLLOWUPS #40 : ajout par `updateDraftArray` + `insertItem` plutôt que `insertDraftArrayItem`, pour vérifier le plafond
  (50) avec le message de B3 sur le tableau relu ; la clé du script est fixée avant la signature (elle est signée).
- SEC-04 (orchestrateur) : scripts signés par l'admin, vérifiés par le site. Choix de code-usage : Save re-signe (revue
  dans la fenêtre, avec avertissement), Enable d'un script non signé refusé, Disable accepté sans signer, Re-sign confirmé
  et comparé aux valeurs vues ; ajout / modification refusés sans secret plutôt que d'écrire un script qui ne tournerait pas.

## Demandes de contrat
- Faites (FOLLOWUPS #40) : tableau sans course (core/sanity), focus initial du Menu (ui-composites), `SectionHeader
  headingLevel={1}` (ui-composites).
- **site-adapter** (SEC-04) : champ `signature` (string, lecture seule / masqué) dans `siteScript` du schéma ; le site vérifie
  sur les valeurs brutes (`enabled` absent = non signé, comme ici) ; le seed doit signer ses scripts ou les laisser à re-signer.
