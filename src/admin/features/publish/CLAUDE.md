# features/publish — LLM context

> Propriétaire : publish-ui · Figma : E1, E2 (docs/admin/figma/screens/E1.md, E2.md), G3 (docs/admin/figma/states/G3.md),
> fiches TopBar, PublishButton, ListItem, VersionItem, Modal, Tag · Mis à jour : 2026-09-27
> Possède aussi : `src/app/admin/(shell)/publish/**` (routes E1, E2, chargement, route de dev `mock-scenario`) et
> `src/admin/core/engine/mock/publish.ts` (+ test) — le moteur simulé de la publication.

## Utilité

La seule façon de mettre le site en ligne (question 3 : Publish seulement) : la barre du haut de chaque écran de la coque
(G3, `<PublishStatusBar siteUrl />`), l'écran des changements en attente (E1 `/admin/publish`) et l'historique des
versions (E2 `/admin/publish/versions`). Tous les rôles publient (`publish.run`) ; le diff du code (`publish.diff`) et le
retour arrière (`versions.rollback`) sont réservés à Kuartz. Ne publie rien lui-même : tout passe par le moteur
(`/publish/*`, `/versions/*`), qui publie les brouillons Sanity, fusionne `draft → main`, déploie et revalide.

## Fichiers

- `PublishStatusBar.tsx` — client : Top bar (kit `TopBar` + `PublishButton`), 5 états G3, « See error », autosave, View site ↗. Signature du contrat de jonction : `<PublishStatusBar siteUrl />` (posée par shell dans `(shell)/layout.tsx`).
- `bar-state.ts` — PUR : machine d'états de la barre (`deriveBarView`, textes exacts `BAR_TEXT`), `expectedIds`, délais de sondage.
- `status-store.ts` — PUR : fabrique du magasin partagé (sondage unique, pause onglet caché, erreurs gardées, `set`/`seed`).
- `use-publish-status.ts` — client : instance `publishStatusStore` (engineClient) + hook `usePublishStatus(initial?)`.
- `use-publish-actions.ts` — client : Publish / Retry partagés (server actions → magasin ; 409 → relecture + message).
- `actions.ts` — `'use server'` : `publishChangesAction`, `retryPublishAction`, `discardChangeAction`, `loadDiffAction`, `rollbackVersionAction` (minces).
- `actions-core.ts` — logique des actions, dépendances injectées : droit EN PREMIER, zod, `engineFetch`, `ActionResult`, `PUBLISH_MESSAGES`.
- `load.ts` — SERVEUR : lectures des pages (`loadPublishStatus`, `loadVersions`), erreurs converties en message.
- `PublishHeader.tsx` — client : « Publish » + méta + onglets de route `Pending (N) | Versions` (compteur à jour).
- `PendingView.tsx` — client : E1 (groupes Content / Design, View ↗, Discard + Modal, ‹/› Diff Kuartz, carte, Publish N changes, vide, erreurs).
- `AfterPublishCard.tsx` — « After “Publish” » + `ChecklistItem` (composé ici : absent du kit).
- `steps.ts` — PUR : textes des 4 étapes et leur état d'après `run.steps`.
- `items.ts` — PUR : icône d'une ligne d'après le manifeste, URL « View ↗ » sûre, lien de design.
- `DiffModal.tsx` — client : fenêtre du diff (`DiffView` coloré, texte seul), chargement / erreur / vide.
- `ErrorLogModal.tsx` — client : « See error » (message + journal du build en CodeBlock lecture seule) + Retry.
- `VersionsView.tsx` — client : E2 (liste `VersionItem`, flèches ↑ ↓ Home End, fiche `DetailRow`, View ↗, Roll back + confirmation).
- `PublishSkeleton.tsx` — squelette serveur (utilisé par `(shell)/publish/loading.tsx`).
- `format.ts` — PUR : heures, temps relatif, libellés du Figma (« Publish 3 changes », « Pending (3) »…).
- `use-now.ts` — client : horloge (30 s) des textes relatifs.
- `publish.module.css` — styles (tokens `--k-*` uniquement).
- Tests : `format.test.ts`, `bar-state.test.ts`, `status-store.test.ts`, `actions-core.test.ts`, `steps-items.test.ts`,
  `PublishStatusBar.test.tsx`, `views.test.tsx` (jsdom) ; `src/admin/core/engine/mock/publish.test.ts`.
- Routes : `src/app/admin/(shell)/publish/page.tsx` (E1), `versions/page.tsx` (E2), `loading.tsx`, `mock-scenario/route.ts` (dev).

## Contrats

- Entrées : `PublishStatus`, `PublishRun`, `PendingContentItem`, `PendingDesignItem`, `Publication` (`core/contracts/engine.ts`) ;
  routes `GET /publish/status` (engineClient côté client, `engineFetch` côté serveur), `POST /publish {expected}`,
  `POST /publish/retry`, `POST /publish/discard`, `GET /publish/diff/:id`, `GET /versions`, `POST /versions/:n/rollback`
  (server actions → `engineFetch`). Manifeste : `adminConfig.site.{url,domain}`, `collections[].type`, `settings.type`.
- Sorties : `<PublishStatusBar siteUrl />` ; `publishStatusStore` / `usePublishStatus()` (état partagé, réutilisable par
  d'autres features, ex. « Publish ↗ » de l'éditeur) ; les 5 server actions ci-dessus (résultat `ActionResult<T>`, jamais
  d'exception) ; route de dev `GET|POST /admin/publish/mock-scenario`.
- Dépend de : `core/auth/session` (gardes), `core/engine/{client,server,errors}`, `core/autosave` (`useAutosave`), kit `@/admin/ui`.
  Utilisé par : shell (barre du haut) ; tout écran qui appelle `autosave.saved()` fait relire le compteur.

## Comportement

- **Barre (G3)** : un seul sondage par page (`status-store`), ~5 s au repos, ~1 s pendant une publication, 8 s après une
  erreur, en pause onglet caché. États (textes exacts) : `Everything is published.` (Publish grisé) · `Unpublished changes: N`
  (Publish, `Review ›` → E1) · `Publishing… step x / 4` (bouton `Publishing…`, clics ignorés) · `Published at HH:MM`
  (bouton `✓ Published`, 3 s après `run.finishedAt` puis retour à 1, ou à 2 si N > 0) · `Publish failed — previous version
  still live` (`See error` + `Retry`). N = `pending.total`. Au clic, état optimiste `Publishing… step 1 / 4` jusqu'à la
  réponse. Erreur de lecture ou d'action : le message remplace le texte d'état (`role="alert"`, rouge) — l'action refusée
  s'efface après 8 s, l'erreur de lecture au prochain succès. Autosave : `Saving draft…`, `Draft saved automatically`,
  `Draft not saved: <message>` ; chaque `savedAt` nouveau relit l'état.
- **E1** : rangées `path` + méta (`“valeur” · auteur · 12 min ago`, `AI editor · validated by Marie · 5 min ago`),
  icône page / base de données / curseurs (manifeste), design = icône `ai`. `View ↗` : `siteUrl + viewPath` (chemin relatif
  seulement) ; design → `/admin/editor` (voir Faiblesses). `Discard` → Modal destructive (texte différent contenu / design),
  erreur gardée dans la fenêtre ; désactivé pendant une publication. `‹/› Diff` + tag `KUARTZ` seulement si
  `can(role, 'publish.diff')` (et la server action revérifie). `Publish N changes` envoie `expected` = ids affichés
  (contenus puis changeIds) ; 409 `conflict` → message « The list of changes was updated while you were reviewing it… » +
  relecture. Carte « After “Publish” » : au repos 4 étapes « à faire » ; pendant / après échec, état du moteur
  (done ✓, running ◌, skipped + raison, failed + message + `See error`) ; bouton principal `Retry` (danger) en échec.
  Vide : `Everything is published.` + Publish grisé. Moteur injoignable : Callout + `Try again`.
- **E2** : liste la plus récente en haut (`2 h ago · Marie`, `Today 09:10 · Andrea`, `Sep 2 · Andrea · first delivery`),
  tag Live / ✕ Failed, sélection = `aria-current` + un seul arrêt de tabulation (↑ ↓ Home End). Fiche : Version
  (`publication-12 · 7f3c2a1`), Status (Live / Ready / Failed / Rolled back), Published by, Published at
  (`Sep 26, 2026 · 09:10`), Changes (un élément par ligne, 6 max + « + N more »), Callout, `View ↗` (déploiement ;
  grisé avec raison sinon). Kuartz : `Roll back to this version` + `KUARTZ` ; grisé avec la raison du moteur quand
  `rollback.available` est faux ; sinon confirmation destructive, 501 → « Roll back isn’t available in local mode… ».
- **Mouvement** (skills web-animation-design + motion) : rangées de E1 — sortie en fondu (160 ms) et glissement des voisines
  (`layout="position"`, `spring.snappy`) ; icône d'étape — entrée 150 ms ease-out à chaque changement d'état (CSS) ;
  squelette qui pulse. Rien sur la barre ni sur la liste des versions (vues 100 fois par jour, clavier). Mouvement réduit :
  `useReducedMotion` (rangées) + `@media (prefers-reduced-motion)` (icônes, squelette) ; Modal gère le sien.

## Forces

- Logique pure testée à part (machine d'états, formats, magasin, étapes, actions) ; composants testés en jsdom avec faux
  moteur et fausses actions ; parcours complet vérifié dans Chrome sur le moteur simulé (discard → publish → 4 étapes →
  Published → Everything is published. → nouvelle version Live), sans erreur console.
- Une seule source d'état pour la barre et les écrans : pas de divergence du compteur ; une réponse d'action l'emporte sur
  une lecture partie avant (`generation`).
- Droits vérifiés trois fois : rendu (bouton absent), server action (`requireCapability`), relais + moteur.
- Rendu fidèle au Figma à 1 440 × 900 (positions des cartes, rangées 54 px, carte 292 px, bouton 37 px, liste E2).

## Faiblesses et limites connues

- `View ↗` d'une modification de design ouvre `/admin/editor` (page par défaut) : le contrat ne dit pas sur quelle page se
  voit la modification (demande ci-dessous). `View ↗` d'un contenu ouvre le site PUBLIC (`siteUrl + viewPath`), donc la
  version publiée, pas le brouillon : pas d'aperçu de brouillon hors éditeur dans ce build.
- Le résumé d'une ligne de contenu est affiché tel que le moteur l'envoie (les guillemets de « “Dock scheduling, solved.” »
  viennent du moteur).
- `Publication.by` est un texte libre ; la liste en garde le nom avant « (Rôle) » (`shortName`).
- Heures dans le fuseau du navigateur (`suppressHydrationWarning` sur chaque texte d'heure).
- Le sondage continue tant qu'un écran de la coque est ouvert (5 s) : charge négligeable en local, à revoir si le moteur
  devient distant et facturé à la requête.
- Écart visuel mineur : la flèche « → » d'Inter est plus longue que dans le Figma (police, pas de réglage).

## Points sensibles

- JAMAIS de publication sans `expected` = liste affichée : c'est ce qui empêche de publier un brouillon arrivé après la
  relecture (409 conflict côté moteur). Ne pas « réessayer automatiquement » un 409.
- JAMAIS le jeton Sanity ni la session complète dans une prop client : les pages ne passent que `PublishStatus`,
  `Publication`, des booléens de droit et `siteUrl`. Les server actions commencent par `requireCapability(…, 'action')`.
- `View ↗` n'accepte qu'un chemin relatif (`viewUrl`) : une URL absolue venue des données n'est jamais un lien.
- Diff et journal de build rendus en texte (nœuds React, jamais de HTML) : ils contiennent du code du site.
- Route `mock-scenario` : 404 hors `ENGINE_MOCK=1` + `NODE_ENV=development` ; session et même origine exigées.

## Pièges

- `publishStatusStore` est un singleton de module client : en test, poser l'état avec `publishStatusStore.set()` et mocker
  `@/admin/core/engine/client` ; l'état fuit d'un test à l'autre (voulu : c'est le comportement réel).
- La lecture démarre dans une micro-tâche (`Promise.resolve().then`) : attendre un tour avant de compter les appels.
- Le moteur simulé range son état sur `globalThis` (`Symbol.for('kz.admin.mock.publish')`) : il est PARTAGÉ avec les autres
  agents / onglets et survit au rechargement à chaud ; changer de scénario le remet à zéro pour tout le monde.
- `ListItem` du kit n'a pas d'écart entre titre et sous-titre : l'écart de 2 px du Figma vient de `.rowMeta` (bloc).
- Un lien avec texte masqué « (opens in a new tab) » donne « ViewBlog… » dans certains calculs de nom : on pose un
  `aria-label` qui commence par le texte visible (« View … (opens in a new tab) »).
- Next 16 : server actions exécutées une à une par le client ; le sondage passe par `fetch` (engineClient), pas par une
  action, pour ne pas attendre derrière un Publish.

## Comment modifier

- **Changer un texte de la barre** : `BAR_TEXT` (bar-state.ts) + `bar-state.test.ts` + `PublishStatusBar.test.tsx`.
- **Ajouter un état** : contrat `PublishState` (orchestrateur) → `deriveBarView` → kit `PublishButton`/`TopBar` (visuel).
- **Changer le rythme du sondage** : `POLL_*_MS` (bar-state.ts).
- **Nouvelle action** : route au contrat + liste blanche (auth-core) → fonction dans `actions-core.ts` (droit, zod, test)
  → enveloppe dans `actions.ts` → appel depuis le composant, résultat posé dans `publishStatusStore.set()`.
- **Nouveau scénario simulé** : `MOCK_PUBLISH_SCENARIOS` + `buildWorld` (mock/publish.ts) + test.
- **Faire rejoindre E1 à une modification validée de l'éditeur simulé** : `publishMock().addDesignChange(item)` (renvoie N,
  pour « Validated — added to Publish (N changes) »).

## Tests

`npx vitest run src/admin/features/publish src/admin/core/engine/mock` — 99 tests : machine d'états (5 états, textes exacts,
confirmation, retour 4 → 1 / 2, étape bornée), formats, magasin (rythme, erreurs gardées, regroupement, `set` prioritaire,
onglet caché), actions (droit d'abord, zod, 401/403, 409 conflict, 501, erreur inattendue), étapes et liens, barre en jsdom
(5 états, conflit, See error + Retry, erreur de lecture, autosave), E1 / E2 en jsdom (droits du diff, Discard, vide, échec,
panne, versions au clavier, retour arrière Kuartz 501 / succès), moteur simulé (scénarios, déroulé dans le temps, 409, retry,
discard, diff, versions, rollback 501 / hébergé, offline).

À la main (serveur 4040, `ENGINE_MOCK=1`) — choisir un scénario puis ouvrir `/admin/publish` :
```bash
curl -X POST http://127.0.0.1:4040/admin/publish/mock-scenario -H 'origin: http://127.0.0.1:4040' \
  -H 'content-type: application/json' -d '{"scenario":"failed"}'
```
Scénarios : `pending` (défaut, Figma), `content-only`, `idle`, `publishing` (figé step 2 / 4), `published` (figé),
`failed`, `pending-fails`, `hosted` (retour arrière permis), `empty`, `offline` (502). `GET` la même route pour la liste.
Rôle client : `POST /admin/api/auth/dev-role {"role":"client"}`. Au démarrage : `ENGINE_MOCK_PUBLISH=<scénario>`.

## Décisions et « À trancher »

- Question 3 (publier élément par élément) : non, Publish seulement (orchestrateur) ; Discard reste possible par élément.
- Question 5 (retour arrière du client) : Kuartz seulement (`versions.rollback`) ; bouton grisé avec la raison du moteur
  quand `rollback.available` est faux (mode local).
- Durée de « Published » : 3 s (fiche Publish button « confirmation 3 s »).
- Pendant une publication, l'en-tête de E1 garde « N changes waiting » (le contenu déjà en ligne sort de la liste à
  l'étape 1) ; Discard est désactivé.
- Mutations par server actions (zod + droit) ; lecture de l'état par le client navigateur du moteur (sondage).

## Demandes de contrat

- **orchestrateur (`contracts/engine.ts`)** : ajouter `page?: string` (chemin public) à `PendingDesignItem`, pour que
  `View ↗` d'une modification de design ouvre `/admin/editor?page=<page>` au lieu de la page par défaut.
- **orchestrateur (`contracts/engine.ts`)** : préciser que `PendingContentItem.summary` porte ses propres guillemets pour
  une nouvelle valeur (« “Dock scheduling, solved.” ») ; et, si possible, séparer `Publication.by` en nom + rôle.
- **auth-core** : `src/admin/core/engine/transport.test.ts` › « zones non écrites → 501 » appelle `publish/status`, qui est
  maintenant simulé (200) : viser une zone encore non écrite ou tester `mockNotImplemented` directement. Mettre à jour le
  tableau « Propriété des mocks » de `core/engine/CLAUDE.md` (publish : implémenté, scénarios par
  `/admin/publish/mock-scenario`).
- **ui-composites (kit)** : composant `ChecklistItem` (Figma « Checklist item ») — composé ici dans `AfterPublishCard.tsx` ;
  option d'écart 2 px titre / sous-titre sur `ListItem` ; emplacement « See error » dans `TopBar` (posé aujourd'hui dans
  l'emplacement `publish`).
- **editor-sidebar** : pour « Validated — added to Publish (N changes) » en simulé, appeler
  `publishMock().addDesignChange()` (exporté par `core/engine/mock/publish.ts`).
