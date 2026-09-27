# Contrats partagés — LLM context

> Propriétaire : orchestrateur · Figma : tous les écrans (via `docs/admin/figma/`) · Mis à jour : 2026-09-27

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
- `engine.ts` — API HTTP du moteur : santé, connexion à Claude (`ClaudeAccessState`, `ClaudeAccessInput`, routes `/claude/access*`, validation pure `claudeApiKeyProblem` / `cleanClaudeApiKey` / `claudeKeyHint` partagée par l'écran, le mock et le moteur), éditeur (demandes, modifications en attente, fil), publication, versions, Ask AI, journal `aiUsage`. Les routes sont listées en commentaire à côté des types.
- `format.ts` — formats de la consommation (« 18.2k input · 1.1k output · $0.07 », « Opus 5.5 », durées, cumul).
- `index.ts` — exports publics.

## Contrats
- Implémentés par : auth-core (session, relais), engine-core (routes /health et /editor/*), engine-publish (/publish/*, /versions/*, aiUsage), ask-ai (/ask), site-adapter (instances du manifeste et des zones).
- Consommés par : toutes les features de `src/admin/features/`, `src/admin/shell`, `src/admin/editor-bridge`, le moteur simulé `src/admin/core/engine/mock/`.
- Toutes les routes du contrat sont implémentées côté moteur et côté moteur simulé (dont `/publish/stage` et `/publish/unstage`, vague 3b).

## Comportement
Pas de logique métier ici, sauf `can()`, les formats et `sumUsage()`. Les messages destinés au client (erreurs du moteur,
libellés) sont en anglais ; les commentaires en français.

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
- `CheckId` n'a pas d'id `placement` (information interne des garde-fous) : l'ajouter seulement si l'admin doit l'afficher.
- `POST /publish` : `expected` accepte `<id>` ou `<id>@<updatedAt>` (contenu), `<changeId>` ou `<changeId>@<commit>` (design) ; la forme avec @ refuse aussi un élément modifié depuis.

## Comment modifier
1. Un agent qui a besoin d'un changement l'écrit dans « Demandes de contrat » de son `CLAUDE.md` et dans son compte rendu.
2. L'orchestrateur l'applique ici, de préférence en champ FACULTATIF, et le note dans `docs/admin/FOLLOWUPS.md`.
3. Il met à jour le moteur simulé (`src/admin/core/engine/mock/*`) et le vrai moteur dans le même tour, sinon ils divergent.
4. `npx tsc --noEmit -p .` doit rester à zéro erreur.

## Tests
Pas de tests propres (types) ; `format.ts` et `roles.ts` sont couverts indirectement par les tests des features et
d'auth-core. Vérification : `npx tsc --noEmit -p .`.

## Décisions et « À trancher »
Décisions du build : `docs/admin/ARCHITECTURE.md` § 10. Rôle Editor = admin du client sans Team (question 11).

## Demandes de contrat
Aucune (ce dossier les reçoit).
