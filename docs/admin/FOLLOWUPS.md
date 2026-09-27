# Suivi des demandes croisées (orchestrateur)

Demandes remontées par les agents, à traiter au tour de corrections ou à documenter. Mis à jour à chaque vague.

| # | Pour | Demande | Source | État |
|---|---|---|---|---|
| 1 | auth-core (`src/proxy.ts`) | En aperçu (`KZ_EDITOR_PREVIEW=1`), fermer aussi `/api/revalidate` (404). Hors aperçu, il reste joignable (protégé par son en-tête). | site-adapter | à faire |
| 2 | engine-guards (lint TSX) | Compter les zones marquées par `editAttrs('<zone>'…)` et `edit={editAttrs(…)}` (Button, Eyebrow) : les `data-edit` ne sont plus écrits en littéral. Sinon « compte des data-edit intact » ne protège rien sur Conduit. | site-adapter | à faire |
| 3 | ui-composites | `ModelUsage.tsx` importe `Usage` depuis `contracts/format` (il vient de `contracts/engine`) ; erreur de type dans `TableCell.tsx:51`. | site-adapter | à vérifier en fin de vague 1c |
| 4 | contrats (hosted) | Ajouter un horodatage `iat` à l'identité signée X-Kz-User pour borner le rejeu quand le moteur sera hébergé. | auth-core | plus tard (mode hosted) |
| 5 | `next.config.ts` | `experimental.authInterrupts` pour renvoyer une vraie 403 (`forbidden()`) sur les pages réservées à Kuartz au lieu d'une 404. | auth-core | à décider |
| 6 | Sanity (projet) | L'origine de l'admin (`http://127.0.0.1:4040` et le domaine de prod) doit figurer dans les CORS du projet pour la connexion A1. À vérifier au premier vrai login. | auth-core | à vérifier avec l'utilisateur |
| 7 | engine-guards → engine-claude | Messages renvoyés à Claude en anglais, ratios avec un point. | engine-claude | fait (vague 1d) |
| 8 | production | Le dataset `production` n'est pas migré (seo.*, orderRank…) : `npm run migrate:admin` y est bloqué par la garde. À faire au moment de la mise en ligne, sur décision de l'utilisateur. | site-adapter | à décider plus tard |
| 10 | ui-foundations (`tokens.css`) | Ajouter `--k-z-overlay: 900;` (Modal, Drawer ; repli codé en attendant). | ui-composites | à faire |
| 11 | orchestrateur (`engine/src/main.ts`) | Brancher `registerAskRoutes` d'ask-ai quand engine-publish aura fini avec main.ts. | plan vague 2 | à faire |
| 12 | engine-core | Mode « faux Claude » activable au démarrage du moteur (ex. `ENGINE_FAKE_CLAUDE=<scénario>`) pour le parcours de bout en bout de la vague 3 sans appel réel. | orchestrateur | à vérifier après engine-core |
| 13 | orchestrateur | Retirer `ENGINE_MOCK=1` et `ADMIN_DEV_AUTOLOGIN` de `.env.local` à la fin de la construction. | orchestrateur | à la fin |
| 14 | engine-core (`main.ts > stop`) | Attendre la fin d'une publication en cours (`publishServiceOf(ctx)?.idle()` ou crochet `stop()` d'EngineModule) avant `store.publications.flush()`. Mettre à jour la carte des modules d'`engine/CLAUDE.md` (publish/versions/usage ne sont plus « à venir »). | engine-publish | à faire |
| 15 | auth-core (`transport.test.ts`) | Le test attend encore 501 du mock de publication, désormais implémenté par publish-ui. | engine-publish | à faire |
| 16 | site-adapter + engine-publish | Champ `request?: string` (120 car.) ajouté au contrat `AiUsageDoc` : l'ajouter au schéma `aiUsage` et l'écrire depuis la note de la demande. | engine-publish | contrat fait, reste schéma + écriture |
| 17 | engine-core | Stop et réponses aux questions ouverts à toute personne ayant `ai.editor`, pas seulement à l'auteur de la demande : à décider (probablement acceptable : une seule demande à la fois, admin partagé). | engine-core | à décider |
| 18 | engine-publish | Typecheck du clone après la publication du contenu (ordre du Figma) : un code qui ne compile pas laisse le contenu en ligne. Piste : typecheck AVANT l'étape 1. | engine-publish | à décider |
| 9 | favicons | Le dépôt n'a aucun fichier favicon : `faviconLight`/`faviconDark` vides dans `siteSettings`. | site-adapter | contenu à fournir |
