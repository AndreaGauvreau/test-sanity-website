# Contrats partagés — LLM context

> Propriétaire : orchestrateur · Figma : tous les écrans (via `docs/admin/figma/`) · Mis à jour : 2026-09-28 (réglages de l'IA, tarifs, formats de l'aperçu de l'éditeur IA, coût facturé / inclus)

## Utilité
Les types et petites fonctions pures que partagent l'admin (Next), le moteur IA (`engine/`) et le site. C'est la
seule source de vérité des formes échangées : rôles, session, manifeste du site, zones de l'éditeur IA, API HTTP du
moteur, formats d'affichage de la consommation. Ce dossier n'importe ni React, ni Next, ni Sanity, ni Node : il doit
rester utilisable partout (composants serveur et client, route handlers, moteur, tests).

## Fichiers
- `roles.ts` — rôles de l'admin (kuartz, client, editor), correspondance avec les rôles Sanity, liste blanche de Kuartz (`resolveAdminRole`, `KUARTZ_ALLOWLIST`, SEC-05), droits (`can`, `CAPABILITIES` ; `ai.access` = Kuartz et client, carte Claude connection de B5), libellés.
- `session.ts` — `Session` (serveur, avec le jeton Sanity de l'utilisateur), `PublicSession` (client, sans jeton), `EngineUser` (identité signée envoyée au moteur).
- `manifest.ts` — `AdminConfig` : pages, sections, champs (`FieldDef`), collections, modèles SEO d'article. Instance : `src/admin.config.ts`.
- `zones.ts` — zones de l'éditeur IA (`ZonesFile`, `ZoneDef`, liaisons de texte Sanity ou code), `TokensFile`. Instances : `src/editor/zones.json`, `src/styles/tokens.json`.
- `engine.ts` — API HTTP du moteur : santé, connexion à Claude (`ClaudeAccessState`, `ClaudeAccessInput`, routes `/claude/access*`, validation pure `claudeApiKeyProblem` / `cleanClaudeApiKey` / `claudeKeyHint` partagée par l'écran, le mock et le moteur), réglages de l'IA de B5 (`AiModelId`, `AiEffort` = `EffortLevel` de l'Agent SDK 0.3.283, `AI_MODELS` ordonnés avec libellés, `AI_EFFORTS`, `AiSettings`, `AiSettingsState`, `DEFAULT_AI_SETTINGS`, validation stricte pure `aiSettingsProblem` / `isAiModelId` / `isAiEffort` partagée par le moteur et le mock, routes `/claude/settings`), éditeur (demandes, modifications en attente, fil ; formats de l'aperçu, voir la ligne suivante), publication, versions, Ask AI, journal `aiUsage`. Les routes sont listées en commentaire à côté des types.
  - Formats de l'aperçu de l'éditeur IA : `EDITOR_VIEWPORTS` = SOURCE UNIQUE (`{ desktop: 1280, tablet: 810, mobile: 375 }`, Tablet = point de rupture tablette du site), `ViewportName`, `Viewport` (dérivé), listes dérivées `VIEWPORT_NAMES` / `VIEWPORT_WIDTHS` (ordre de la barre d'outils, valeurs acceptées dans une nouvelle demande), `MEASURED_VIEWPORTS` (croissantes : largeurs mesurées et capturées par les garde-fous), `MEASURED_VIEWPORTS_TEXT` (« 375, 810 and 1280 », textes pour Claude et le journal), `isViewport`, `viewportOf` (largeur RELUE → format actuel : 768, l'ancien Tablet, → Tablet ; illisible → Desktop).
- `viewports.test.ts` — formats de l'aperçu confrontés aux points de rupture du site (`src/styles/tokens.json` : Tablet = `breakpoint-tablet` × 16, Mobile < Tablet < `breakpoint-desktop` ≤ Desktop), listes dérivées, `viewportOf`.
- `pricing.ts` — `PRICES_PER_MTOK` (table gelée, $ par million de jetons), `priceOf` : SOURCE UNIQUE des tarifs, lue par le moteur (coût estimé, `complete()`, via la réexportation `engine/src/claude/pricing.ts`) et par l'admin (prix de la carte AI settings). Déplacée ici depuis le moteur le 2026-09-28.
- `format.ts` — formats de la consommation (« 18.2k input · 1.1k output · $0.07 », « Opus 5.5 », durées, cumul) et coût
  FACTURÉ / INCLUS (abonnement Claude, `Usage.access`) : `CostValue` (une demande `costUsd` + `access`, ou un cumul
  `costUsd` facturé + `includedUsd`), `isIncluded`, `costSplit`, `sumCosts`, `formatCostShort` (« $0.07 », « ~$0.07 »,
  « Included », « $0.10 + included »), `describeCost` (phrase lue / infobulle), `formatIncluded` (« ≈ $0.30 at API
  prices — included in your Claude subscription »), `INCLUDED_LABEL`.
- `format.test.ts` — coût facturé / inclus (une demande, un cumul, ancien document sans `access`), formats courts et longs.
- `index.ts` — exports publics.

## Contrats
- Implémentés par : auth-core (session, relais), engine-core (routes /health et /editor/*), engine-publish (/publish/*, /versions/*, aiUsage), ask-ai (/ask), site-adapter (instances du manifeste et des zones).
- Consommés par : toutes les features de `src/admin/features/`, `src/admin/shell`, `src/admin/editor-bridge`, le moteur simulé `src/admin/core/engine/mock/`.
- Toutes les routes du contrat sont implémentées côté moteur et côté moteur simulé (dont `/publish/stage` et `/publish/unstage`, vague 3b).

## Comportement
Pas de logique métier ici, sauf `can()`, les formats, `sumUsage()`, `costSplit()`, `priceOf()`, `viewportOf()` et les validations pures (`claudeApiKeyProblem`, `aiSettingsProblem`, `isViewport`). Les messages destinés au client (erreurs du moteur,
libellés) sont en anglais ; les commentaires en français.
Coût : `Usage.costUsd` est TOUJOURS au prix de l'API ; une demande `access: 'subscription'` (moteur local) n'est pas
facturée. Tout affichage d'un coût passe par `costSplit` / `formatCostShort` / `describeCost` : le coût facturé n'ajoute
jamais la part incluse (montrée « Included »). Ancien document sans `access`, ou `none` : facturé. `sumUsage` garde
l'accès de sa PREMIÈRE consommation : ne jamais lire `access` d'un cumul mélangé (utiliser `sumCosts`).

## Forces
Une seule définition pour trois processus (admin, moteur, site) ; le moteur simulé et le vrai moteur sont comparables
champ à champ ; les ajouts se font en champs facultatifs, sans casser les consommateurs.

## Faiblesses et limites connues
- L'identité signée `X-Kz-User` (Ed25519, iat/exp ≤ 120 s) n'a pas de nonce : rejouable pendant sa courte validité. Clé d'identité distincte du Bearer (SEC-10).
- `ThreadEntry`, `EditorState` et `PublishStatus` sont larges : un consommateur qui en lit une partie peut ignorer un champ nouveau sans que le typage le signale.

## Points sensibles
- `Session.sanityToken` ne doit JAMAIS atteindre un composant client : utiliser `PublicSession` / `toPublicSession`.
- Ne jamais ajouter d'import runtime (Node, React, Sanity) : le moteur et le client importent ce dossier.
- `AiUsageDoc._id` commence par `aiUsage.` : le point rend le document privé dans un dataset public. Ne pas changer ce préfixe.

## Pièges
- `AiSettingsInEffect.model` est une CHAÎNE (EDITOR_MODEL peut désigner un modèle hors liste) ; seul `AiSettings.model` (corps du POST) est restreint à `AiModelId`.
- Ajouter un modèle à `AI_MODELS` : lui donner aussi un tarif (`pricing.ts`) et un libellé (`format.ts`) — le test « les trois modèles de B5 » de `engine/src/claude/cost.test.ts` le vérifie.
- `CheckId` n'a pas d'id `placement` (information interne des garde-fous) : l'ajouter seulement si l'admin doit l'afficher.
- Formats de l'aperçu : Tablet = `breakpoint-tablet` du site (810 pour Conduit), PAS le 768 du Figma D1 (à 768, Conduit
  est en mise en page mobile). Changer `EDITOR_VIEWPORTS` : `viewports.test.ts` (tokens.json) et la phrase des formats de
  `src/editor/RULES.md` (`engine/src/claude/rules.test.ts`) doivent suivre ; barre d'outils, validation (moteur et
  moteur simulé), largeurs mesurées et textes pour Claude en dérivent seuls. Les demandes ENREGISTRÉES gardent leur
  largeur d'alors (768 dans le magasin du moteur) : l'afficher avec `viewportOf`, jamais la renvoyer dans une nouvelle
  demande (refusée : « Invalid screen size. »). Le type `Viewport` ne le dit pas (voir le commentaire d'`EditRequest`).
- `POST /publish` : `expected` accepte `<id>` ou `<id>@<updatedAt>` (contenu), `<changeId>` ou `<changeId>@<commit>` (design) ; la forme avec @ refuse aussi un élément modifié depuis.

## Comment modifier
1. Un agent qui a besoin d'un changement l'écrit dans « Demandes de contrat » de son `CLAUDE.md` et dans son compte rendu.
2. L'orchestrateur l'applique ici, de préférence en champ FACULTATIF, et le note dans `docs/admin/FOLLOWUPS.md`.
3. Il met à jour le moteur simulé (`src/admin/core/engine/mock/*`) et le vrai moteur dans le même tour, sinon ils divergent.
4. `npx tsc --noEmit -p .` doit rester à zéro erreur.

## Tests
`viewports.test.ts` (formats de l'aperçu ↔ points de rupture de tokens.json, listes dérivées, `viewportOf`) et
`format.test.ts` (coût facturé / inclus, formats du coût) : `npx vitest run src/admin/core/contracts`. Le reste est
couvert indirectement (`format.ts` et `roles.ts` par les tests des features et d'auth-core). Vérification :
`npx tsc --noEmit -p .`.

## Décisions et « À trancher »
Décisions du build : `docs/admin/ARCHITECTURE.md` § 10. Rôle Editor = admin du client sans Team (question 11).
Formats de l'aperçu (2026-09-28) : Tablet au point de rupture tablette du site plutôt qu'au 768 du Figma (détail dans
`src/admin/features/ai-editor/canvas/CLAUDE.md`, « Décisions ») ; à trancher quand l'admin sera partagé entre sites :
lire cette largeur dans le tokens.json du site plutôt qu'une constante.

## Demandes de contrat
Aucune (ce dossier les reçoit).
