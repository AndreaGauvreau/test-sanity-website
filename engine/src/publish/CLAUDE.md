# Publication (`engine/src/publish`) — LLM context

> Propriétaire : engine-publish · Figma : E1 (docs/admin/figma/screens/E1.md), G3 (states/G3.md) · Mis à jour : 2026-09-27 (corrections vague 3)

## Utilité
Mise en ligne de tout ce qui attend (E1 « Publish », Top bar G3), pour tous les rôles qui ont `publish.run` (Kuartz,
client, editor) ; le diff de code est réservé à Kuartz (`publish.diff`). État PARTAGÉ côté moteur : tous les
utilisateurs voient la même liste et la même progression (« Publishing… step 2 / 4 »). C'est la SEULE façon de publier
(question 3) : le bouton Publish natif du Studio publierait un texte sans le code qui va avec, il ne doit PAS être
proposé au client (le Studio est réservé à Kuartz, sur `/studio`).
Ne fait pas : l'écran E1/G3 (publish-ui), les versions (`../versions`), le journal aiUsage (`../usage`).

## Fichiers
- `index.ts` — `publishModule` / `createPublishModule(options)` (EngineModule : routes, port `pendingTotal`, reprise), `publishServiceOf(context)`, `catalogFor(sourceRepo)`.
- `service.ts` — `createPublishService(deps)` : status, publish, retry, discard, stage, unstage, diff, pendingTotal, recover, idle ; `localModeNote`, `NO_SANITY_NOTE`, `INTERRUPTED_PUBLISH`, `PUBLISHED_WINDOW_MS` (5 min), `DIFF_MAX_CHARS`.
- `pending.ts` — liste en attente : `pendingContent` (brouillons Sanity gérés + actions programmées, moins les brouillons retenus), `pendingDesign` (validées hors de main, `page` rempli), `computePending`, `aiAuthors`, `expectedMismatch`, `isPublishableId`, `snapshotContent`.
- `catalog.ts` — types gérés et textes lisibles : `catalogFromConfig(AdminConfig)`, `catalogFromTypes`, `FALLBACK_TYPES`, `describeDraft`, `describeRemoval`, `REMOVAL_SUMMARY`, `loadAdminConfig`, `humanize`, `joinLabels`.
- `steps.ts` — opérations des étapes : `publishContent` (publier / dépublier / supprimer en une requête ; type `ContentResult` ; actions typées par `SanityAction` d'engine-core), `branches`, `draftCommits`, `checkDraftAhead`, `prepareClone`, `fastForwardMain`, `tagPublication`, `nextPublicationNumber`, `listPublicationTags`, `pushPublication`, `triggerDeployHook`, `revalidateSite`, `StepFailure`, `cleanLog`.
- `state.ts` — état interne (`publications.json`) : publication en cours `extra.publish` (`RunInternal`, `readExtra`, `writeExtra`), marques du contenu `extra.content` (`ContentMarks`, `StagedAction`, `readMarks`, `writeMarks`), `STEP_LABELS`, `freshSteps`.
- `routes.ts` — `registerPublishRoutes(router, service)`.
- `testing.ts` — banc d'essai (tests seulement) : `makePublishBench`, `answerDraftQueries`, `writeDraft`, `fakeFetch`, `conduitCatalog`.
- Tests : `catalog.test.ts`, `service.test.ts`, `module.test.ts`.

## Contrats
- Routes (contrat `core/contracts/engine.ts`) :
  `GET /publish/status` → `PublishStatus` · `POST /publish { expected }` → `PublishStatus` · `POST /publish/retry` →
  `PublishStatus` · `POST /publish/discard { kind: 'content', id } | { kind: 'design', changeId }` → `PublishStatus` ·
  `GET /publish/diff/:changeId` → `{ diff }` (Kuartz) · `POST /publish/stage { kind: 'unpublish' | 'delete', id }` →
  `PublishStatus` · `POST /publish/unstage { id }` → `PublishStatus`. Droit revérifié par le routeur (`publish.run`,
  `publish.diff`, `content.write` pour stage/unstage : action du CMS) et, pour le diff, encore dans le service.
- **Format de `expected`** (repris dans le commentaire des routes du contrat) : une entrée par élément vu, `PendingContentItem.id`
  (ou `<id>@<updatedAt>`) et `PendingDesignItem.changeId` (ou `<changeId>@<commit ou préfixe ≥ 7>`). La forme `@`
  refuse aussi un élément modifié depuis. Ensemble différent de la liste actuelle → 409 `conflict`. Pour une ligne
  programmée, `updatedAt` = heure de la programmation.
- Entrées : `EngineContext` (repo, store, lock, editor.validatedDesign, sanity, config), manifeste
  `<ENGINE_SOURCE_REPO>/src/admin.config.ts` (chargé dynamiquement ; absent → `FALLBACK_TYPES` + avertissement).
- Sorties : routes ci-dessus ; `ports.pendingTotal` (N du fil « Validated — added to Publish (N changes) ») ; statuts
  `published` / `discarded` des `PendingChange` ; `publications.json` (`run`, `publications`, `lastPublishedAt`,
  `extra.publish`, `extra.content`).
- Dépend de : `content/sanity.ts` (`listDrafts`, `discardDraft`, `draftIdOf`, port `action`), `git/git.ts` (WorkRepo),
  `jobs/lock.ts` (verrou), `jobs/site.ts` (`typecheck`), `workspace/workspace.ts` (`readMeta` : branche à pousser),
  `store/store.ts`. Utilisé par : `main.ts` (MODULES), `../versions` (`listPublicationTags`).

## Comportement
**Liste (E1)** — contenu : brouillons `drafts.*` dont le type est géré (réglages, documents des pages, collections,
modèles SEO d'article du manifeste), ET qui diffèrent vraiment du publié (JSON canonique sans champs système ni dates :
piège 10). Chemin : page `Home › Hero · Title` (une section, un champ), `Home › Hero` (plusieurs champs), `Home`
(plusieurs sections) ; collection `Blog › <titre du brouillon>` ; réglages `Settings › General|Code`, modèle
`Blog › Article SEO`. Résumé : nouvelle valeur entre “ ” si UN seul texte a changé (jamais pour un Portable Text),
sinon `Excerpt and body edited` (ordre des clés du document publié), `New post`, `<Field> removed|cleared`. `viewPath` : page, article
(`/blog/<slug>`), `/` pour les réglages. `author` : seulement si le texte a été écrit par une demande IA ouverte ou
validée (Sanity ne dit pas qui a écrit un brouillon de l'admin). Design : `editor.validatedDesign()` moins les commits
déjà dans main, `page` = page de la modification (View ↗). `total` = contenu + design ; `lastValidatedAt` = dernière
validation.
**Actions programmées (CMS C3/C4, FOLLOWUPS #27)** : `POST /publish/stage` note `extra.content.staged[id] = { action,
type, by, at }` ; refus : corps invalide 400, publication en cours 409 `publishing`, sans jeton 503, document inconnu
404, document hors collection (page, réglages, modèle SEO, type du repli) 400, dépublier un document jamais publié 409.
Rien ne change dans Sanity avant Publish. La ligne d'E1 (`action`, `summary` « Will be unpublished » / « Will be
deleted », chemin `Blog › <titre>`, `author` = qui a programmé, `updatedAt` = quand) REMPLACE le brouillon du même
document. `POST /publish/unstage { id }` (ou Discard de la ligne) annule ; unstage libère aussi un brouillon retenu ;
rien à annuler → 404. **Brouillon retenu** : après une dépublication, Sanity garde le contenu en brouillon ; il est
noté `extra.content.held[id] = <révision>` et n'apparaît PAS dans la liste (sinon le Publish suivant le remettrait en
ligne) tant qu'il n'est pas modifié (révision différente → ligne « New post » normale) ou libéré par unstage.
**État** : `publishing` (run sans fin ni erreur) > `failed` (run.error) > `pending` (total > 0) > `published`
(< 5 min après la fin) > `idle`. `deploy` : `vercel-hook` si `VERCEL_DEPLOY_HOOK_URL`, sinon `local` + `note`
explicite (« Local mode: code changes stay in the engine's clone… ») ; sans jeton Sanity, la note le dit aussi.

**POST /publish** : corps zod (400) → verrou pris de façon SYNCHRONE (`lock.acquirePublish` : 409 `busy` si une
demande IA est active, `awaiting_validation` si une modification attend ✓ Validate, `publishing` si une publication
tourne) → liste fraîche (Sanity injoignable : 503) → `expected` comparé (409 `conflict`) → rien à publier : 400 →
précontrôle git si main ≠ draft (main ancêtre de draft, chaque commit de draft = une modification validée listée ;
sinon 409 AVANT que le contenu parte) → numéro réservé (max du magasin et des tags `publication-N` + 1) → run + état
interne écrits → exécution EN ARRIÈRE-PLAN (le relais coupe à 30 s ; typecheck ≤ 3 min) → réponse `publishing`.
**Étapes** (chacune persistée `running` puis `done|skipped|failed` + détail) :
1. Si du code attend (main ≠ draft à Publish) : D'ABORD précontrôle, copie du clone nettoyée et `typecheck` du clone
   (détail « Checking that the new code compiles… ») ; échec → étape 1 `failed` « The draft code doesn't compile, so
   nothing was published », RIEN n'est parti (ni contenu, ni code) ; succès → sha noté (`RunInternal.compiled`).
   Puis contenu : UNE requête API Actions (tout ou rien) : `document.publish` avec `ifDraftRevisionId` = la révision vue
   à Publish (brouillon disparu → sauté ; révision différente → échec « changed after you pressed Publish », rien
   publié), `document.unpublish` (publié disparu → sauté), `document.delete` du publié avec `includeDrafts` = son
   brouillon s'il existe (jamais publié : `document.discard` du brouillon). Ensuite : actions programmées retirées,
   dépubliés retenus (révision du brouillon relue), modifications IA « texte seul » → `published` si plus de brouillon.
   Détail : « N documents published, N unpublished, N deleted (N no longer needed) ».
2. Code (si main ≠ draft à Publish) : précontrôle refait, copie nettoyée, `typecheck` SEULEMENT si draft a changé
   depuis l'étape 1 (sinon sauté : un seul typecheck par publication), `git update-ref refs/heads/main <draft> <ancien
   main>` (avance rapide SANS checkout, échoue si main a bougé ; jamais de divergence acceptée), `tag --force
   publication-N`, push si `ENGINE_GIT_PUSH=1` (`origin main:refs/heads/<sourceBranch de data/workspace.json>` + le tag,
   jamais de force). Modifications → `published`.
3. Hook Vercel (POST, 20 s) si configuré et du code est parti ; sinon `skipped` « Local mode: no deployment ». On ne
   suit pas le build (pas d'API Vercel) : « Deployment started ».
4. Revalidation : `POST SITE_REVALIDATE_URL`, `x-kz-revalidate: REVALIDATE_SECRET`, corps `{}` (tout le site) ; non
   configuré → `skipped` avec la raison.
Succès : publication N `live` (l'ancienne live → `previous`), `lastPublishedAt`, état interne effacé. Échec : étape
`failed`, `run.error { message, log }` (anglais ; « The content changes are already live. » ajouté si l'étape 1 était
faite), publication N `failed`, état interne GARDÉ pour la reprise, verrou rendu.

**Reprise (non atomique — à lire)** : l'ensemble n'est PAS atomique entre Sanity et git : le contenu part d'abord.
`POST /publish/retry` (409 s'il n'y a pas d'échec) reprend à l'étape en échec avec le même numéro ; les étapes faites ne
sont pas refaites (`merged`, `pushed`, `deployTriggered` notés dans l'état interne ; l'étape 1 saute les brouillons
déjà publiés et refuse une révision changée). Une nouvelle modification validée entre l'échec et le retry n'est PAS
publiée par le retry (commit hors de la liste → échec « publish again ») : faire un nouveau POST /publish, permis même
en état `failed` (nouveau numéro ; l'ancien reste `failed`). Moteur arrêté pendant une publication : au démarrage
(`recover`), l'étape en cours passe `failed` « Interrupted… Retry to finish it. ». Crash entre `update-ref` et
l'écriture du statut : `recover` et la liste considèrent tout commit déjà dans main comme publié.
**Discard** (verrou pris : mêmes 409) : ligne programmée → l'action est annulée (document intact) ; contenu →
`discardDraft` (le publié reste ; inconnu 404 ; sans jeton 503) et
modifications IA texte seul concernées → `discarded` ; design → commit retiré de draft : dernier commit = `reset
--hard <parent>`, sinon `rebase --onto <parent> <commit>` (hooks coupés) ; conflit ou commit suivant devenu vide →
rebase annulé, draft remise, 409 « Discard the later changes first (newest first) ». Les commits réécrits des
modifications suivantes sont reportés dans le magasin (et dans une publication en échec). Les textes Sanity d'une
modification mixte restent dans « Content » (à abandonner à part).
**Diff** : `git show` du commit de la modification (400 000 caractères au plus), Kuartz seulement.

## Forces
- Testé sur de VRAIS dépôts git temporaires avec le vrai cycle de l'éditeur (faux Claude) et le vrai manifeste de
  Conduit : contenu seul, contenu + code, échec au build puis retry, échec de revalidation, révision changée,
  interruption, 409 (liste, @version, busy, awaiting_validation, publishing), précontrôle git, push vers un dépôt nu,
  discard (reset, rebase, conflit), diff, câblage HTTP complet avec droits par rôle, code qui ne compile pas (rien
  publié, un seul typecheck au retry), dépublier / supprimer programmés (brouillon retenu, refus, unstage, Discard).
- main n'est jamais extraite ; aucune écriture git hors du clone (`WorkRepo`) ; jamais de push forcé.
- Contenu publié en une transaction Sanity : jamais la moitié des brouillons ; un code qui ne compile pas ne publie
  rien.

## Faiblesses et limites connues
- Non atomique Sanity ↔ git (voir Reprise) : le typecheck passe avant le contenu, mais un échec de l'avance rapide ou
  du push (étape 2) laisse le contenu en ligne sans le code (message explicite).
- Actions programmées : `unpublish` / `delete` passent par `SanityAction` et le faux Sanity d'engine-core ; jamais
  essayées contre le vrai Sanity. Pas de verrou de révision pour elles (l'API n'en a pas pour unpublish). Seuls les éléments de collection
  peuvent être programmés (le catalogue du repli sans manifeste n'a pas de collection : refus 400).
- Un brouillon retenu reste masqué si personne ne le modifie : pour le remettre en ligne tel quel, unstage (le CMS doit
  le proposer).
- Étape 3 : le build Vercel n'est pas suivi (il faudrait l'API Vercel) ; « See error » ne montre donc que nos échecs.
- En mode local, le « site en ligne » (4040) tourne sur le dépôt du développeur, pas sur `main` du clone : le code
  publié n'y apparaît pas tant que Kuartz ne récupère pas `main`/le tag (note `deploy.note`). Après une publication de
  code sans push, `npm run engine:setup -- sync` verra main en avance sur la source (à réconcilier à la main).
- Auteur d'un brouillon : connu seulement pour les textes de l'éditeur IA.
- Libellés des champs des réglages et des modèles SEO : table locale (`SETTINGS_LABELS`, `SEO_LABELS`), pas le manifeste.
- `main.ts > stop()` n'attend pas la publication en arrière-plan : un arrêt en pleine publication la laisse
  « Interrupted » (reprise par retry). Demande à engine-core ci-dessous (FOLLOWUPS #14).
- Une modification « texte seul » dont le brouillon a été publié ou abandonné hors du moteur est marquée `published`
  au démarrage suivant (on ne distingue pas les deux cas).

## Points sensibles
- JAMAIS publier sans `ifDraftRevisionId`, ni publier / dépublier / supprimer un type hors du catalogue (aiUsage,
  assets…) ; stage n'accepte que des éléments de collection.
- JAMAIS publier le contenu avant le typecheck quand du code attend (`compileFirst`).
- JAMAIS extraire main ni forcer une référence ou un push ; jamais `merge` dans le clone (il est sur draft).
- JAMAIS journaliser l'URL du hook Vercel ni `REVALIDATE_SECRET` (`cleanLog` retire chemins d'URL et clés).
- Ne pas ajouter d'`await` entre l'entrée de `publish()` et `lock.acquirePublish()`.
- Le bouton Publish natif du Studio ne doit jamais être proposé au client.

## Pièges
- `ctx.repo.run(['merge', '--ff-only', …])` agirait sur la branche EXTRAITE (draft) : on utilise `update-ref`.
- `validatedDesign()` d'engine-core ignore les modifications sans commit (texte seul) : elles sont suivies à part
  (`textChanges`), sinon elles resteraient `validated` et bloqueraient `engine:setup -- sync`.
- `listDrafts` interroge `path("drafts.**")` : le faux Sanity n'interprète pas GROQ (`answerDraftQueries` en test).
- Après un `rebase`, les commits suivants changent de sha : toujours reporter la correspondance dans le magasin.
- Sanity `_updatedAt` change quand un brouillon est remis à l'identique (piège 10) : comparer le contenu.
- `document.unpublish` crée (ou garde) un brouillon : sans la marque `held`, ce brouillon réapparaîtrait comme « New
  post » et le Publish suivant remettrait en ligne ce qu'on vient de retirer.
- `document.delete` échoue si un brouillon existe et n'est pas dans `includeDrafts` : le brouillon est relu à
  l'exécution (pas à la programmation).
- Faux Claude : `editCss` refuse un old_string présent plusieurs fois (comme l'outil Edit réel) ; dans les tests,
  utiliser `LEDE_MUTED` / `ledeColor(...)` de `jobs/testing.ts` plutôt que `color: var(--color-text-muted);` (2 fois
  dans hero.module.css).

## Comment modifier
- Nouveau type de document publiable : le manifeste (`src/admin.config.ts`, site-adapter) ; repli : `FALLBACK_TYPES`.
- Nouveau libellé lisible : `catalog.ts` (`SEO_LABELS`, `SETTINGS_LABELS`, `COMMON_LABELS`) + `catalog.test.ts`.
- Nouvelle étape : contrat `PublishStep` d'abord (orchestrateur), puis `STEP_LABELS`, `execute()` et la reprise.
- Nouvelle action programmée : contrat (`PendingContentItem.action`, corps de `/publish/stage`), `STAGE` et `stage()`
  du service, `REMOVAL_SUMMARY` + `describeRemoval`, `publishContent` (action Sanity ; type `SanityAction` et faux Sanity côté engine-core).
- Autoriser la programmation hors collections : condition `entry?.kind !== 'collection'` de `stage()`.
- Suivre le build Vercel : étape 3 (`triggerDeployHook` renvoie l'id du job) + un sondage de l'API Vercel.

## Tests
`npx vitest run engine/src/publish` (~8 s). Non couvert : vrai Sanity (dont unpublish/delete de l'API Actions), vrai
hook Vercel, vrai `tsc`/`next typegen` du clone (faux typecheck), vraie route `/api/revalidate` (faux fetch). À la main : moteur lancé, `GET /publish/status`
par le relais de l'admin (`/admin/api/engine/publish/status`).

## Décisions et « À trancher »
- Question 3 : publication de tout, pas élément par élément (Discard retire un élément).
- POST /publish asynchrone (état partagé sondé) ; contenu en une transaction.
- Typecheck AVANT l'étape 1 quand du code attend (décision orchestrateur, FOLLOWUPS #27, remplace #18) : il tourne
  sous l'étape 1 (« Checking that the new code compiles… ») ; les 4 étapes du Figma restent inchangées.
- Dépublier / supprimer (FOLLOWUPS #27) : programmés depuis le CMS, exécutés à l'étape 1 dans la même requête que les
  publications ; droit `content.write` ; Discard d'une ligne programmée = unstage.
- Pas de tag pour une publication de contenu seul (le numéro existe dans le magasin ; `commit` = main du moment).

## Demandes de contrat
1. ~~engine-core (`main.ts > stop`) : attendre `publishServiceOf(context)?.idle()`~~ — **fait** (vérifié le 2026-09-27) :
   `stop` attend la publication en cours puis les crochets `stop` des modules (FOLLOWUPS #14).
2. ~~engine-core (`engine/CLAUDE.md`) : carte « à venir »~~ — **fait** : la carte liste `publish/`, `versions/`, `usage/`.
3. ~~**engine-core (`content/sanity.ts`, `content/fake.ts`)** : `document.unpublish` / `document.delete` dans
   `SanityAction` et le faux Sanity~~ — faite : cast de `publishContent` et `withRemovalActions` retirés.
4. ~~auth-core (`core/engine/routes.ts`, `client.ts`) : relayer `publish/stage` et `publish/unstage`~~ — **fait**
   (vérifié le 2026-09-27) : relayés (droit `publish.run` au relais, `content.write` au moteur), exposés dans
   `engineClient.publish.stage/unstage`, simulés par `mock/publish.ts`.
