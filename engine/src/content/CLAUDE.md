# Sanity du moteur (`engine/src/content`) — LLM context

> Propriétaire : engine-core · Figma : D2/D3 (textes « Sanity draft »), E1 via engine-publish · Mis à jour : 2026-09-27

## Utilité
Remplace `content.ts` du POC (Payload) : le magasin Sanity des textes de l'éditeur IA (lire, écrire en brouillon,
instantané textsBefore, restauration exacte), les fonctions de publication / abandon pour engine-publish, le signal
« texte visible dans l'aperçu » et le jeton d'aperçu du moteur lui-même (sonde, signal, Chrome). Jeton d'écriture « robot » (SANITY_API_WRITE_TOKEN) seulement ; jamais celui d'un
utilisateur.

## Fichiers
- `sanity.ts` — `SanityPort` (getDocuments, createIfNotExists, patch, delete, action, fetch), `SanityAction` (publish, discard, unpublish, delete), `createRobotClient`, `sanityPort(client)`, `publishDocument`, `discardDraft`, `listDrafts`, `draftIdOf`, `publishedIdOf`.
- `texts.ts` — `createTextStore(port | null)` → `TextStore` (`available`, `snapshot`, `write`, `read`, `restore`), `TextStoreError`, `canonical`, `withoutSystemFields`.
- `path.ts` — chemins `a.b[_key=="k"].c` : `parsePath`, `getAtPath`, `setAtPath`.
- `visible.ts` — `createPreviewSignal` (`waitFresh(page, texts)`), `createPreviewCredential(rootSecret)` (jeton du moteur), `PreviewCredential`, `credentialValue`, `visibleText`, `normalizeVisible`, `PREVIEW_COOKIE`.
- `fake.ts` — `createFakeSanity(docs)` : faux Sanity en mémoire (révisions, verrous, les quatre actions, tout ou rien) pour les tests (engine-publish compris).
- `texts.test.ts`, `visible.test.ts` (jeton du moteur, cookie du signal), `fake.test.ts` (actions unpublish / delete du faux).

## Contrats
- Écriture : `drafts.<id>` créé depuis le publié s'il manque (sans `_id/_rev/_createdAt/_updatedAt/_system`), puis
  `setIfMissing` des objets parents et `set` du chemin. Jamais le publié.
- `snapshot([{ document, type, paths }])` → `{ snapshot: TextSnapshot, current: { '<doc>:<path>': valeur }, others }` ;
  type de document vérifié ; champ non textuel refusé.
- `restore(snapshot, only?)` : valeurs d'avant remises (null → `unset`) ; si le brouillon n'existait pas et redevient
  identique au publié (JSON canonique, sans champs système ni dates : piège 10 du POC), il est supprimé.
- Publication (engine-publish) : `publishDocument(port, { id, ifDraftRevisionId?, ifPublishedRevisionId? })` (API
  Actions `sanity.action.document.publish`), `discardDraft(port, id)` (`…discard`), `listDrafts(port)`.
- `SanityAction` (mêmes formes que `@sanity/client`, une requête tout ou rien) : `…publish { draftId, publishedId,
  ifDraftRevisionId?, ifPublishedRevisionId? }`, `…discard { draftId, purge? }`, `…unpublish { draftId, publishedId }`
  (le publié disparaît, son contenu reste en brouillon — le brouillon existant, sinon une copie du publié), `…delete
  { publishedId, includeDrafts, purge? }` (publié + brouillons listés ; un brouillon existant non listé = refus). Le faux
  applique les mêmes refus (publié absent, brouillon absent, révision) AVANT toute écriture et journalise
  `<actionType> <draftId>` (publish, discard) ou `<actionType> <publishedId>` (unpublish, delete).
- Sans jeton : `createTextStore(null)` → `available: false`, toute opération lève `TextStoreError('unavailable')` ;
  l'éditeur refuse alors la portée Text Sanity (503), le Style fonctionne.

- Jeton du moteur : `createPreviewCredential(ENGINE_PREVIEW_SECRET)` → `() => Promise<string>` :
  `signPreviewToken(secret, 'kz-engine', 2 h)` (`src/admin/core/engine/preview-token.ts`), réutilisé tant qu'il reste
  plus d'1 h, puis renouvelé. Le proxy de l'aperçu n'accepte plus le secret racine (SEC-09) : la sonde
  (`preview/process.ts`), le signal et Chrome (`main.ts`) passent tous par lui. Jamais envoyé au navigateur de l'admin.

## Comportement
`waitFresh` : attend 300 ms (surveillant de fichiers), puis interroge la page de l'aperçu (cookie `kz_preview` = jeton
du moteur, jamais dans l'URL) jusqu'à ce qu'elle réponde 2xx avec chaque texte attendu (HTML → texte : scripts/styles retirés, entités
décodées, guillemets typographiques et astérisques normalisés) ; `false` au délai (20 s), jamais d'exception.

## Forces
Port minimal et faux en mémoire fidèle (révisions, `ifRevisionId`, tout-ou-rien des actions) ; restauration exacte testée
(brouillon créé / préexistant / retouché ailleurs).

## Faiblesses et limites connues
- Tourne contre le dataset `development` (moteur réel sur 4043) ; `apiVersion` = `NEXT_PUBLIC_SANITY_API_VERSION`
  (défaut 2026-09-01), perspective `raw`. Le dataset `production` n'est jamais utilisé en construction (avertissement
  au démarrage du moteur s'il l'était).
- Deux écritures (création du brouillon, puis patch) ne sont pas une transaction ; la restauration couvre les deux.
- `others` (autres textes cités à Claude) : 40 chaînes au plus, champs techniques ignorés.

## Points sensibles
- L'API Sanity n'applique pas le schéma : `validateText` (engine-claude) est la seule barrière des textes.
- Ne jamais écrire dans un document publié, ni passer un chemin non validé (`parsePath` refuse index, `__proto__`…).

## Pièges
- Perspective `raw` : le client du robot voit `drafts.<id>` ET `<id>` ; lire le brouillon d'abord, sinon le publié
  (c'est ce que montre l'aperçu, perspective drafts). Une perspective `published` ne verrait jamais les brouillons.
- `_updatedAt`, `_rev`, `_createdAt`, `_system` changent à chaque écriture : jamais dans une comparaison « brouillon
  identique au publié » (piège 10 du POC) — `withoutSystemFields` + JSON canonique.
- Chemins de tableaux : toujours par `_key` (`items[_key=="k"].title`), jamais par index (un réordonnancement dans
  l'admin déplacerait l'écriture) ; `parsePath` refuse les index.
- Stega : le HTML de l'aperçu ne doit pas contenir de caractères invisibles d'encodage (coupé en mode aperçu du site),
  sinon `waitFresh` ne « verrait » jamais le texte.
- Le proxy de l'aperçu refuse le secret racine : ne jamais repasser `ENGINE_PREVIEW_SECRET` brut en cookie.

## Comment modifier
- Nouvelle opération Sanity : l'ajouter au `SanityPort` (`sanity.ts`), au client réel (`sanityPort`) ET au faux
  (`fake.ts`, avec révisions), puis tester dans `texts.test.ts`.
- Nouveau type de champ texte : `texts.ts` (lecture/écriture) + règle de `validateText` (engine-claude).
- Durée du jeton du moteur : `ENGINE_PREVIEW_TOKEN_TTL` / `ENGINE_PREVIEW_TOKEN_RENEW` (`visible.ts`) ; garder la
  marge de renouvellement supérieure à la durée d'une demande (Chrome garde son cookie toute la session).

## Tests
`npx vitest run engine/src/content`.

## Décisions et « À trancher »
- Écriture du robot en BROUILLON seulement ; publication par l'API Actions (engine-publish), jamais par `createOrReplace`.
- Jeton du moteur de 2 h renouvelé (plutôt que le secret racine) : suit la règle d'auth-core « le secret racine n'est
  jamais accepté par l'aperçu ».

## Demandes de contrat
Aucune.
