# Ask AI dans le moteur (`engine/src/ask`) — LLM context

> Propriétaire : ask-ai · Figma : G4 (docs/admin/figma/states/G4.md) · Mis à jour : 2026-09-27
> Panneau de l'admin : `src/admin/features/ask-ai/` (voir son CLAUDE.md).

## Utilité
Route `POST /ask` du moteur (AskRequest → AskResponse, contrat `core/contracts/engine.ts`) : une question courte sur le site
et l'admin → une réponse courte de Claude (ASK_MODEL, Haiku 4.5), des liens vers des écrans de l'admin, la consommation.
LECTURE SEULE : aucun outil, aucune écriture hormis le journal `aiUsage` (feature `ask`). Les demandes de modification
sont refusées avec le texte du Figma et un lien vers l'éditeur IA. Indépendant du verrou de l'éditeur (ni git, ni brouillon).

## Fichiers
- `index.ts` — API publique du module.
- `routes.ts` — `registerAskRoutes(router, deps | service)`, `askModule(options?)` (EngineModule), `createAskReader` (client de LECTURE), `loadAdminConfig`.
- `service.ts` — `createAskService(deps)` : validation, une question à la fois par utilisateur, limite de débit, contexte (cache 30 s par rôle), appel `complete`, réponse, journal. `ASK_MESSAGES`.
- `request.ts` — `parseAskRequest` (zod) : question 1-1000 (points de code), historique ≤ 10 (textes ≤ 4000), écran `/admin…`.
- `context.ts` — `buildSiteQuery` (une requête GROQ, types et ids en paramètres), `buildSiteData` (structure, comptes, SEO, réglages, médias et utilisations), `renderSiteData` (texte cité par `quoteData`).
- `prompt.ts` — `ASK_SYSTEM` (FIXE), `ASK_MAX_TOKENS` (400), `normalizeHistory`, `buildAskMessages`.
- `answer.ts` — `splitModelOutput` (ANSWER / LINKS / CHANGE), `cleanAnswer`, `finalizeAnswer` (liens du catalogue, refus fixe).
- `usage.ts` — `AskUsageRecorder` (port), `askUsageDoc` (AiUsageDoc), `sanityAskUsageRecorder` (écriture par le port Sanity du robot).
- `testing.ts` — aides de test (manifeste réel, faux Sanity, faux complete).
- `*.test.ts` — context, answer, request, service (dont la route sur un vrai serveur node:http signé).
- Partagé : `src/admin/features/ask-ai/links.ts` (catalogue des écrans par rôle, importé en relatif).

## Contrats
- Entrées : `AskRequest` (corps), `EngineUser` signé (routeur d'engine-core, droit `ai.ask` revérifié), `AdminConfig`
  (`src/admin.config.ts`), `createComplete({ access, configDir })` → `complete({ model, system, messages, maxTokens, signal })`
  → `{ text, usage, stopReason }` / `CompleteError` (engine-claude), `quoteData` (engine-claude), `Router` / `EngineContext` /
  `EngineModule` (engine-core), `EngineError` (server/errors.ts).
- Sorties : `POST /ask` → 200 `AskResponse` ; 400 `bad_request` (question, historique, corps) ; 409 `busy` (question en
  cours pour cet utilisateur, ou > 20 questions en 10 min) ; 503 `unavailable` (pas d'accès Claude, erreur de Claude :
  message de `CompleteError`, jamais de secret) ; 401/403/404/413/415 par le routeur.
- Journal : un document PRIVÉ `aiUsage.ask_<16 hex>` par réponse (feature `ask`, status `answered` | `refused`, page = écran
  ouvert, user sans e-mail, `Usage` complet).

## Câblage (à faire par l'orchestrateur — ce module n'édite pas main.ts)
Dans `engine/src/main.ts` :
```ts
import { askModule } from './ask'
export const MODULES: EngineModule[] = [/* publishModule…, */ askModule()]
```
`askModule()` prend dans le contexte : `context.access` (resolveClaudeAccess ; absent → 503 clair), `context.config.models.ask`
(ASK_MODEL), `context.config.sanity.readToken` (jeton de LECTURE) et `context.config.paths.claude` (+ `/ask`, CLAUDE_CONFIG_DIR
de la voie abonnement). Journal : `askModule({ usage })` si engine-publish fournit un `AskUsageRecorder` ; sinon
`context.sanity` (robot) écrit le document ; sans jeton d'écriture, pas de journal (avertissement au démarrage).
Alternative bas niveau : `registerAskRoutes(context.router, { config, complete, model, reader, usage })`.
L'admin a déjà la route dans sa liste blanche (`core/engine/routes.ts`, délai 60 s) et le client `engineClient.ask`.

## Comportement
1. Corps validé (`parseAskRequest`) ; sans accès Claude → 503 ; une question à la fois par utilisateur ; limite de débit.
2. Contexte (`buildSiteData`, lu en perspective `raw` : brouillon s'il existe, sinon publié) : site, rôle, écran ouvert
   (reconnu dans le catalogue), écrans permis (Code pour Kuartz, Team pour le client), pages (sections et libellés des
   champs visibles, statut SEO : meta title / description / image sociale / indexation, modifications non publiées),
   modèle SEO des pages article, collections (publiés, brouillons), réglages (titre, description, favicons, image sociale,
   indexation ; scripts : noms pour Kuartz, nombre pour les autres, JAMAIS le code), médias (40 dernières images : nom,
   poids, texte alternatif, utilisations « Home › Hero », « Blog › “titre” »), brouillons en attente. Sanity illisible →
   contexte du manifeste seul (« live content data is unavailable »).
3. Messages : historique normalisé (commence par une question, rôles alternés, question sans réponse retirée) puis
   `<site_data>…</site_data>` + « Question from the user: … ». Système `ASK_SYSTEM` identique pour tous (cache).
4. Réponse : format `ANSWER / LINKS / CHANGE` ; texte nettoyé (markdown, URL, HTML retirés ; chemins de l'admin → nom de
   l'écran ; ≤ 700 caractères) ; liens = routes du catalogue du rôle SEULEMENT (3 au plus, libellés du catalogue) ;
   `CHANGE: yes` ou réponse qui prétend avoir modifié → « I can’t change anything. To edit a text on the page, open it in the
   AI editor. » + « Open <page> in AI editor » (page ouverte si elle a l'éditeur, sinon Home), ou « You can make this change
   yourself in the admin. » + le lien proposé (réglage, CMS…).
5. Journal (`recordAsk`) : son échec est journalisé mais ne bloque jamais la réponse.

## Forces
- Défense en profondeur contre l'injection : aucun outil ; données citées par `quoteData` et balisées ; prompt qui les
  déclare données ; sortie filtrée (liens en liste blanche du rôle, texte sans URL) ; refus au texte fixe (le modèle ne
  peut ni prétendre avoir modifié, ni rédiger la modification).
- Tout est injectable (complete, lecteur Sanity, journal, horloge) : 34 tests sans réseau ni Claude, dont la route sur un
  vrai serveur signé.

## Faiblesses et limites connues
- Aucun appel réel à Haiku n'a eu lieu (interdit pendant la construction) : la tenue du format ANSWER/LINKS/CHANGE est à
  vérifier au premier passage réel (le parseur tolère un texte sans balises).
- Prompt système court : sous le minimum de cache de Haiku 4.5, le `cache_control` est sans effet (coût ≈ 2 k jetons
  d'entrée par question, surtout le contexte).
- Médias : 40 images listées au plus (les plus récentes) ; utilisations : 6 par image ; section exacte seulement pour les
  pages et les réglages (pas le champ fin, ex. « background »).
- Limite de débit et « une question à la fois » en mémoire du processus (remis à zéro au redémarrage).
- Pas d'estimation du coût d'un appel interrompu (complete ne renvoie pas d'usage en cas d'erreur) : rien au journal.

## Points sensibles
- JAMAIS d'outil, de fichier ou d'écriture Sanity de contenu ici ; le seul écrit est `aiUsage.*` (privé).
- JAMAIS le code des scripts, un jeton ou un e-mail dans le contexte ou le journal.
- Toute valeur venant de Sanity passe par `quoteData` ; tout lien renvoyé passe par `resolveAskLinks` (catalogue du rôle).
- Le jeton de LECTURE suffit pour le contexte : ne pas utiliser le client robot pour lire.
- Ne jamais renvoyer `error.message` d'une exception imprévue (seulement celui d'une `CompleteError`, déjà sans secret).

## Pièges
- `admin.config.ts` n'importe que des TYPES (`@/…` effacé à la compilation) : son import dynamique marche sous tsx et Vitest ;
  y ajouter un import de valeur avec alias casserait le moteur.
- Perspective `raw` : les brouillons sont des documents à part (`drafts.<id>`) ; `usedBy` peut citer publié ET brouillon
  (dédoublonné par libellé).
- `references()` compterait le journal : exclu par `!(_id in path("aiUsage.**"))`.

## Comment modifier
- Nouvelle donnée du contexte : `buildSiteQuery` (paramètre, jamais d'interpolation de valeur) + `AskSiteData` +
  `renderSiteData` (via `quoteData`) + test `context.test.ts`.
- Changer une règle du modèle : `ASK_SYSTEM` (reste FIXE : rien de variable dedans) + test service « prompt identique ».
- Nouveau cas de refus : `CLAIMS_CHANGE` / `finalizeAnswer` + `answer.test.ts`.

## Tests
`npx vitest run engine/src/ask` (4 fichiers, 34 tests, < 1 s). Couvert : requête GROQ paramétrée, contexte (brouillon
prioritaire, comptes, médias et utilisations, rôles, Sanity en panne, citations neutralisées, scripts sans code, taille
bornée), format et filtrage des liens, nettoyage du texte, refus, validation, historique, erreurs (503, 409, 400),
journal (document du contrat, échec non bloquant), cache du contexte, route `POST /ask` signée (200, 400, 404), `askModule` (enregistrement, modèle ASK_MODEL, 503 sans accès).
Non couvert : un vrai appel à Claude et une vraie lecture Sanity.

## Décisions et « À trancher »
- Contexte dans le dernier message utilisateur (données), système fixe (cache) — ask-ai.
- Perspective `raw` (brouillon d'abord) : Ask AI décrit ce que l'admin montre, pas seulement le site en ligne.
- Journal écrit directement (`sanityAskUsageRecorder`) tant qu'engine-publish ne fournit pas de recorder pour `ask`.

## Demandes de contrat
- **orchestrateur (`engine/src/main.ts`)** : ajouter `askModule()` à `MODULES` (FOLLOWUPS #11).
- **engine-publish** : si `engine/src/usage` fournit un journal commun, exposer un `AskUsageRecorder`
  (`recordAsk(entry: AskUsageEntry)`) et le passer à `askModule({ usage })` ; le format `askUsageDoc` suit le contrat.
