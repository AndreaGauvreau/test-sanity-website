# Sanity du moteur (`engine/src/content`) — LLM context

> Propriétaire : engine-core · Figma : D2/D3 (textes « Sanity draft »), E1 via engine-publish · Mis à jour : 2026-09-27

## Utilité
Remplace `content.ts` du POC (Payload) : le magasin Sanity des textes de l'éditeur IA (lire, écrire en brouillon,
instantané textsBefore, restauration exacte), les fonctions de publication / abandon pour engine-publish, et le signal
« texte visible dans l'aperçu ». Jeton d'écriture « robot » (SANITY_API_WRITE_TOKEN) seulement ; jamais celui d'un
utilisateur.

## Fichiers
- `sanity.ts` — `SanityPort` (getDocuments, createIfNotExists, patch, delete, action, fetch), `createRobotClient`, `sanityPort(client)`, `publishDocument`, `discardDraft`, `listDrafts`, `draftIdOf`, `publishedIdOf`.
- `texts.ts` — `createTextStore(port | null)` → `TextStore` (`available`, `snapshot`, `write`, `read`, `restore`), `TextStoreError`, `canonical`, `withoutSystemFields`.
- `path.ts` — chemins `a.b[_key=="k"].c` : `parsePath`, `getAtPath`, `setAtPath`.
- `visible.ts` — `createPreviewSignal` (`waitFresh(page, texts)`), `visibleText`, `normalizeVisible`, `PREVIEW_COOKIE`.
- `fake.ts` — `createFakeSanity(docs)` : faux Sanity en mémoire (révisions, verrous, actions) pour les tests (engine-publish compris).
- `texts.test.ts`.

## Contrats
- Écriture : `drafts.<id>` créé depuis le publié s'il manque (sans `_id/_rev/_createdAt/_updatedAt/_system`), puis
  `setIfMissing` des objets parents et `set` du chemin. Jamais le publié.
- `snapshot([{ document, type, paths }])` → `{ snapshot: TextSnapshot, current: { '<doc>:<path>': valeur }, others }` ;
  type de document vérifié ; champ non textuel refusé.
- `restore(snapshot, only?)` : valeurs d'avant remises (null → `unset`) ; si le brouillon n'existait pas et redevient
  identique au publié (JSON canonique, sans champs système ni dates : piège 10 du POC), il est supprimé.
- Publication (engine-publish) : `publishDocument(port, { id, ifDraftRevisionId?, ifPublishedRevisionId? })` (API
  Actions `sanity.action.document.publish`), `discardDraft(port, id)` (`…discard`), `listDrafts(port)`.
- Sans jeton : `createTextStore(null)` → `available: false`, toute opération lève `TextStoreError('unavailable')` ;
  l'éditeur refuse alors la portée Text Sanity (503), le Style fonctionne.

## Comportement
`waitFresh` : attend 300 ms (surveillant de fichiers), puis interroge la page de l'aperçu (cookie `kz_preview`, jamais
dans l'URL) jusqu'à ce qu'elle réponde 2xx avec chaque texte attendu (HTML → texte : scripts/styles retirés, entités
décodées, guillemets typographiques et astérisques normalisés) ; `false` au délai (20 s), jamais d'exception.

## Forces
Port minimal et faux en mémoire fidèle (révisions, `ifRevisionId`, tout-ou-rien des actions) ; restauration exacte testée
(brouillon créé / préexistant / retouché ailleurs).

## Faiblesses et limites connues
- Jamais exécuté contre le vrai Sanity pendant la construction ; `apiVersion` = `NEXT_PUBLIC_SANITY_API_VERSION`
  (défaut 2026-09-01), perspective `raw`.
- Deux écritures (création du brouillon, puis patch) ne sont pas une transaction ; la restauration couvre les deux.
- `others` (autres textes cités à Claude) : 40 chaînes au plus, champs techniques ignorés.

## Points sensibles
- L'API Sanity n'applique pas le schéma : `validateText` (engine-claude) est la seule barrière des textes.
- Ne jamais écrire dans un document publié, ni passer un chemin non validé (`parsePath` refuse index, `__proto__`…).

## Tests
`npx vitest run engine/src/content`.

## Demandes de contrat
Aucune.
