# core/sanity — LLM context

> Propriétaire : auth-core · Figma : — (sert C1-C6, B2, B3, E1) · Mis à jour : 2026-09-27 (corrections vague 3)

## Utilité

Canal serveur de l'admin vers Sanity : clients de lecture et d'écriture, et aides communes aux features pour lire l'état
d'un document (publié / brouillon) et écrire dans les BROUILLONS `drafts.<id>` au nom de l'utilisateur, avec validation
serveur d'après le manifeste (`FieldDef`), modifier un TABLEAU du brouillon sans course (insertion, réordonnancement),
et envoyer une image dans les assets au nom de l'utilisateur. Ne publie jamais (la publication est au moteur, E1) ; ne touche jamais au
schéma ; ne lit ni n'écrit le journal `aiUsage` (core/usage).

## Fichiers

- `env.ts` — `readSanityEnv()` : projectId, dataset, apiVersion (défaut `2026-09-01`), lus à la demande.
- `clients.ts` — SERVEUR : `getReadClient({ perspective })`, `getWriteClient(session)`.
- `store.ts` — interface étroite `DraftStore` (getDocuments, mutate), adaptateur `storeFromClient`, `toWriteError`.
- `paths.ts` — ids, types, chemins de champ acceptés (`isFieldPath`, `parseFieldPath`, `keyedTargetsExist`, `getValueAtPath`), `SanityWriteError` (avec `httpStatus`), `isWriteConflict`. Pur.
- `validate.ts` — `validateFieldValue(field, value)`, `isSafeHref`, `visibleLength`. Pur.
- `draft-core.ts` — logique pure des brouillons (`applyDraftPatch`, `createDraftWith`, `deleteDraftWith`, `getDocumentStateWith`, `validatePatch`, `stripSystemFields`).
- `array-core.ts` — logique pure des tableaux sans course : `updateDraftArrayWith` (ifRevisionID / create, relecture sur 409), `insertItem`, `moveItem`, `newArrayKey`.
- `assets-core.ts` — logique pure de l'envoi d'image : `uploadImageAssetWith`, `IMAGE_CONTENT_TYPES`, `safeAssetFilename`.
- `assets.ts` — SERVEUR : `uploadImageAsset(session, bytes, { filename, contentType })` (jeton de l'utilisateur).
- `drafts.ts` — SERVEUR : API des features (`getDocumentState`, `saveDraftField`, `setDraftFields`, `createDraft`, `deleteDraft`,
  `updateDraftArray`, `insertDraftArrayItem`, `moveDraftArrayItem`).
- `*.test.ts` — tests avec faux client / faux magasin.

## Contrats

- Entrées : `Session` (contracts/session.ts), `FieldDef` (contracts/manifest.ts), ids PUBLIÉS (sans « drafts. »).
- Sorties (toutes côté serveur, `@/admin/core/sanity/...`) :
  - `getReadClient(options?: { perspective?: 'published' | 'drafts' | 'raw' }): SanityClient` — jeton Viewer
    `SANITY_API_READ_TOKEN`, `useCdn: false`, `stega: false`. Mis en cache par perspective.
  - `getWriteClient(session: Session): SanityClient` — jeton de l'utilisateur ; session dev → `SANITY_API_WRITE_TOKEN`
    seulement si `NODE_ENV === 'development'` ; sinon `SanityWriteError`. Perspective `raw`.
  - `getDocumentState<T>(id, { store? }): Promise<{ published; draft; value }>` — `value` = brouillon s'il existe, sinon publié.
  - `saveDraftField(session, id, path, value, { field?, store? }): Promise<{ draftId }>` — `value` null/undefined → unset.
  - `setDraftFields(session, id, { set?, unset? }, { fields?: Record<path, FieldDef>, store? }): Promise<{ draftId }>`.
  - `createDraft(session, type, initial?, { fields?, store?, id? }): Promise<{ id; draftId }>` — id publié (uuid par défaut).
  - `deleteDraft(session, id, { store? }): Promise<{ draftId }>` — supprime seulement `drafts.<id>`.
  - `updateDraftArray(session, id, path, update: (items) => items, { field?, attempts?, store? }): Promise<{ draftId; items }>`
    — `update` PURE (rappelée après un 409) ; `path` peut viser un tableau imbriqué (`sections[_key=="s1"].items`).
  - `insertDraftArrayItem(session, id, path, item, { position?: 'start' | 'end' | { before: key } | { after: key }, field?, store? }): Promise<{ draftId; key; items }>`
    — clé générée (12 hex) si `item._key` manque.
  - `moveDraftArrayItem(session, id, path, key, to: 'up' | 'down' | 'first' | 'last' | { before } | { after } | { index }, { field?, store? }): Promise<{ draftId; items }>`.
  - Retrait d'un élément : `setDraftFields(session, id, { unset: ['path[_key=="k"]'] })` (déjà atomique, pas de course).
  - `uploadImageAsset(session, bytes: Uint8Array | ArrayBuffer, { filename?, contentType }, { upload? }): Promise<{ _id; url }>`
    (`@/admin/core/sanity/assets`) — exige `content.write` ; types PNG, JPEG, WebP, GIF, AVIF, SVG, ICO ; fichier non
    vide ; nom nettoyé ; erreurs traduites. La TAILLE maximale et la signature des octets restent à l'appelant.
  - `SanityWriteError { code: 'bad_request' | 'not_found' | 'forbidden' | 'unavailable' | 'validation'; message; details? }`
    — message anglais prêt à afficher ; `details` = `{ [chemin]: message }` pour une erreur de validation.
  - `validateFieldValue(field, value, parentLabel?): string | null` — réutilisable côté client pour un retour immédiat.
- Dépend de : `@sanity/client`, `core/contracts`, `core/auth` (Session). Utilisé par : pages, cms-media, settings, code-usage.
  Adoption (vérifiée le 2026-09-27, FOLLOWUPS #20 / #40) : `uploadImageAsset` est utilisé par general (`deps.ts`), pages
  (`server/upload.ts`) et media (`server/deps.ts` ; un fichier non image y passe encore par `client.assets.upload('file')`,
  hors du champ de cette aide réservée aux images) ; les aides de tableau par pages (`server/save.ts` :
  `insertDraftArrayItem`, `updateDraftArray`, `moveDraftArrayItem`) et code (`script-writes.ts` : `updateDraftArray`) ;
  cms ne réécrit aucun tableau lu (valeur entière du texte riche, `orderRank` par document).

## Comportement

- Écriture d'un champ (`applyDraftPatch`) : valide le chemin (noms, points, `[_key=="…"]`, jamais d'index numérique ni de
  champ système), la valeur (FieldDef fourni), lit publié + brouillon AVEC LE JETON DE L'UTILISATEUR, vérifie que chaque
  sélecteur `_key` désigne un élément existant (sinon `not_found` « This item no longer exists. Reload and try again. »),
  puis UNE transaction : `createIfNotExists(drafts.<id>)` recopié du publié sans `_id/_rev/_createdAt/_updatedAt/…`
  (si le brouillon n'existe pas) + `patch { set, unset }`. `visibility: 'sync'`.
- Droit : chaque écriture exige `content.write` (tous les rôles l'ont aujourd'hui) ; la vraie limite est celle de
  Sanity (le jeton de l'utilisateur porte ses droits Sanity).
- Validation (l'API Sanity n'applique PAS le schéma) : obligation, longueur visible (points de code, retours à la ligne
  exclus), une seule ligne pour `string` sauf `maxLines`, caractères de contrôle refusés, liens sûrs seulement (`/`, `#`,
  `?`, http(s), mailto, tel), liste fermée pour `select`, slug `a-z0-9-`, référence vers un id publié, image `image-…`,
  portable text avec `_type`/`_key`, tableaux (bornes min/max, `_key` uniques, sous-champs), objets et CTA (sous-champs).
- Tableaux (`updateDraftArrayWith`) : lit publié + brouillon, applique `update` à une copie, contrôle la forme (objets,
  `_key` sûrs et uniques) et le FieldDef, puis écrit sous condition : brouillon existant → `patch { set, ifRevisionID:
  <_rev lu> }` ; pas de brouillon → `create(drafts.<id>)` + patch (et non createIfNotExists). Un 409 (révision changée,
  brouillon né entre-temps) → relecture et réapplication, 3 essais par défaut (1 à 5), puis « This item was changed at
  the same time. Reload and try again. ». Un ajout concurrent n'est donc jamais effacé.
- Erreurs HTTP Sanity → `toWriteError` : 401/403 forbidden, 404 not_found, 409 « changed at the same time »
  (`httpStatus: 409`), 4xx bad_request, reste unavailable.

## Forces

- Logique pure séparée du client réel (`DraftStore`) : testée sans réseau.
- Création du brouillon et patch dans la même transaction : pas de brouillon à moitié créé.
- Chemins en liste blanche : pas d'injection GROQ ni d'écriture de champ système.

## Faiblesses et limites connues

- `saveDraftField` / `setDraftFields` n'ont pas de contrôle de concurrence (dernier écrit gagne sur un même champ) ; les
  écritures de TABLEAU entier doivent passer par `updateDraftArray` & co, qui en ont un.
- `uploadImageAsset` ne vérifie pas les octets (signature PNG/JPEG…) : l'appelant le fait (pages, media le font).
- La validation ne porte que sur les chemins pour lesquels un FieldDef est passé ; un chemin sans FieldDef est écrit tel
  quel (après validation du chemin). Les features DOIVENT passer le FieldDef du manifeste.
- `portableText` : forme minimale vérifiée (blocs avec `_type` et `_key`), pas le contenu des spans ni les marques.
- `getReadClient` garde les clients en mémoire : un changement de variable d'environnement exige un redémarrage.

## Points sensibles

- Le jeton de l'utilisateur et le jeton robot ne quittent JAMAIS le serveur (`import 'server-only'` dans clients.ts et drafts.ts).
- JAMAIS de repli silencieux sur `SANITY_API_WRITE_TOKEN` pour une vraie session : seulement session `dev` ET `NODE_ENV=development`.
- JAMAIS d'écriture dans `production` pendant le développement (le dataset vient de `NEXT_PUBLIC_SANITY_DATASET` = `development`).
- Ne jamais publier ici (pas de mutation sur l'id publié) : la publication passe par le moteur (E1, `ifDraftRevisionId`).
- Ne jamais accepter d'index numérique dans un chemin (l'ordre d'un tableau peut changer entre lecture et écriture).

## Pièges

- `set` sur un sélecteur `[_key=="x"]` qui ne correspond à rien est accepté SANS ERREUR par Sanity : d'où `keyedTargetsExist`.
- `createIfNotExists` ne remplace pas un brouillon créé entre-temps par un autre utilisateur : c'est voulu (son brouillon est gardé, notre patch s'y applique).
- Stega : toujours `stega: false` dans l'admin (les valeurs servent au formulaire, pas à l'affichage du site).
- `getDocuments` renvoie `null` pour un id illisible avec le jeton (droits) comme pour un id absent.
- Perspective `drafts` : c'est le nom actuel (`previewDrafts` est déprécié dans @sanity/client 8).

## Comment modifier

- Nouveau type de champ : `FieldKind` (demande de contrat manifest.ts), puis un `case` dans `validate.ts` + test.
- Nouvelle aide d'écriture : logique pure dans `draft-core.ts` (avec `DraftStore`), enveloppe serveur dans `drafts.ts`
  qui passe par `writeStore(session)` (droit + client de l'utilisateur).
- Écrire un tableau : `insertDraftArrayItem` / `moveDraftArrayItem`, ou `updateDraftArray` avec une transformation PURE
  (jamais d'effet de bord dedans : elle peut être rappelée).
- Nouveau type d'image accepté : `IMAGE_CONTENT_TYPES` (assets-core.ts) + test.

## Tests

`npx vitest run src/admin/core/sanity` — validation (tous les types), chemins et ids, `keyedTargetsExist`, brouillons
avec faux magasin (création depuis le publié sans champs système, patch seul, unset, validation avant écriture, refus
divers, `_key` disparu, création / suppression de brouillon de collection), tableaux sans course (faux Sanity à
révisions : ifRevisionID, create au lieu de createIfNotExists, ajout concurrent conservé après 409, brouillon né
entre-temps, conflit persistant, FieldDef, clés en double ou dangereuses, tableau imbriqué), insertion / déplacement
purs, envoi d'image (nom, type, vide, erreurs 403 / 5xx, réponse inattendue, ArrayBuffer), clients (jeton utilisateur,
robot en dev seulement, erreurs claires, lecture sans CDN ni stega), `toWriteError` (dont `httpStatus` 409).
Non couvert : un vrai aller-retour Sanity (à faire à la main sur le dataset `development`).

## Décisions et « À trancher »

- Lecture d'affichage avec le jeton Viewer (`getDocumentState`) ; lecture avant écriture avec le jeton de l'utilisateur.
- Un nouvel élément de collection naît en brouillon seul (`drafts.<uuid>`), publié par Publish.
- FOLLOWUPS #20 (auth-core) : concurrence optimiste par `ifRevisionID` + relecture automatique, plutôt que `insert`
  Sanity (qui ne couvre pas le réordonnancement ni la validation du tableau entier).

## Demandes de contrat

- Aucune.
