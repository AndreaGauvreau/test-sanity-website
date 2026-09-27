# Ask AI dans le moteur (`engine/src/ask`) — LLM context

> Propriétaire : ask-ai · Figma : G4 (docs/admin/figma/states/G4.md) · Mis à jour : 2026-09-27 (corrections vague 3)
> Panneau de l'admin : `src/admin/features/ask-ai/` (voir son CLAUDE.md).

## Utilité
Route `POST /ask` du moteur (AskRequest → AskResponse, contrat `core/contracts/engine.ts`) : une question courte sur le site
et l'admin → une réponse courte de Claude (ASK_MODEL, Haiku 4.5), des liens vers des écrans de l'admin, la consommation.
LECTURE SEULE : aucun outil, aucune écriture hormis le journal `aiUsage` (feature `ask`). Les demandes de modification
sont refusées avec le texte du Figma et un lien vers l'éditeur IA. Indépendant du verrou de l'éditeur (ni git, ni brouillon).

## Fichiers
- `index.ts` — API publique du module.
- `routes.ts` — `registerAskRoutes(router, deps | service)`, `askModule(options?)` (EngineModule, dans `MODULES` de main.ts), `createAskReader` (client de LECTURE), `loadAdminConfig`.
- `service.ts` — `createAskService(deps)` : validation, une question à la fois par utilisateur, limite de débit, contexte (cache 30 s par rôle), appel `complete`, réponse, journal. `ASK_MESSAGES`.
- `request.ts` — `parseAskRequest` (zod) : question 1-1000 (points de code), historique ≤ 10 (textes ≤ 4000), écran `/admin…`.
- `context.ts` — `buildSiteQuery` (une requête GROQ, types et ids en paramètres), `buildSiteData` (structure, comptes, SEO, réglages, médias et utilisations), `renderSiteData` (texte cité par `quoteData`).
- `prompt.ts` — `ASK_SYSTEM` (FIXE), `ASK_MAX_TOKENS` (400), `normalizeHistory`, `buildAskMessages`.
- `answer.ts` — `splitModelOutput` (ANSWER / LINKS / CHANGE), `cleanAnswer` (nettoyage + filtre commun des adresses), `siteDomains` (liste blanche), `finalizeAnswer` (liens du catalogue, refus fixe).
- `usage.ts` — `AskUsageRecorder` (port), `askUsageDoc` (AiUsageDoc), `sanityAskUsageRecorder` (repli : écriture directe par le port Sanity du robot quand le journal commun n'existe pas).
- `testing.ts` — aides de test (manifeste réel, faux Sanity, faux complete).
- `*.test.ts` — context, answer (dont SEC-08), request, service (dont la route sur un vrai serveur node:http, identité Ed25519, et le journal commun).
- Partagé : `src/admin/features/ask-ai/links.ts` (catalogue des écrans par rôle, importé en relatif).

## Contrats
- Entrées : `AskRequest` (corps), `EngineUser` signé (routeur d'engine-core, droit `ai.ask` revérifié), `AdminConfig`
  (`src/admin.config.ts`), `createComplete({ access, configDir })` → `complete({ model, system, messages, maxTokens, signal })`
  → `{ text, usage, stopReason }` / `CompleteError` (engine-claude), `quoteData` et `sanitizeClientText(text, allowedDomains)`
  (engine-claude, `engine/src/claude`), `askUsageRecorderOf(context)` (engine-publish, `engine/src/usage`), `Router` /
  `EngineContext` / `EngineModule` (engine-core), `EngineError` (server/errors.ts).
- Sorties : `POST /ask` → 200 `AskResponse` ; 400 `bad_request` (question, historique, corps) ; 409 `busy` (question en
  cours pour cet utilisateur, ou > 20 questions en 10 min) ; 503 `unavailable` (pas d'accès Claude, erreur de Claude :
  message de `CompleteError`, jamais de secret) ; 401/403/404/413/415 par le routeur.
- Journal : un document PRIVÉ `aiUsage.ask_<16 hex>` par réponse (feature `ask`, status `answered` | `refused`, page = écran
  ouvert, user sans e-mail, `Usage` complet), écrit par le journal COMMUN d'engine-publish (secours local
  `data/usage-pending.jsonl` + rejeu si Sanity échoue ou sans jeton d'écriture).

## Câblage
Branché : `engine/src/main.ts` → `MODULES = [usageModule, publishModule, versionsModule, askModule(), accessModule]`. `askModule()` DOIT
rester après `usageModule` (il lit le journal commun à l'enregistrement). Il prend dans le contexte : `context.access`
RELU À CHAQUE QUESTION (accesseur sur l'accès rechargeable d'`engine/src/access` : une clé ou l'abonnement choisis dans
B5 servent aussitôt, sans redémarrage ; absent → 503 avec `ASK_MESSAGES.noAccess`), `context.config.models.ask` (ASK_MODEL), `context.config.sanity.readToken`
(jeton de LECTURE) et `context.config.paths.claude` (+ `/ask`, CLAUDE_CONFIG_DIR de la voie abonnement).
Journal, par ordre de préférence : `askModule({ usage })` (tests) → journal commun `askUsageRecorderOf(context)` →
`sanityAskUsageRecorder(context.sanity)` (moteur sans `usageModule`) → aucun (avertissement au démarrage).
Bas niveau : `registerAskRoutes(context.router, { config, complete, model, reader, usage })`.
L'admin a la route dans sa liste blanche (`core/engine/routes.ts`, délai 60 s) et le client `engineClient.ask`.

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
4. Réponse : format `ANSWER / LINKS / CHANGE` ; texte nettoyé (markdown, URL à schéma et `www.`, HTML retirés ; chemins de
   l'admin → nom de l'écran), PUIS filtre commun `sanitizeClientText` (SEC-08 : domaines nus, IDN, punycode, e-mails, IPv4,
   points désamorcés, adresses coupées par un caractère invisible → « [link removed] », sauf les domaines du site :
   `siteDomains(config.site)` = `site.domain` + hôte de `site.url` s'il n'est ni une IP ni `localhost`) ; ≤ 700 caractères
   (filtre repassé après la coupe) ; liens = routes du catalogue du rôle SEULEMENT (3 au plus, libellés du catalogue) ;
   `CHANGE: yes` ou réponse qui prétend avoir modifié → « I can’t change anything. To edit a text on the page, open it in the
   AI editor. » + « Open <page> in AI editor » (page ouverte si elle a l'éditeur, sinon Home), ou « You can make this change
   yourself in the admin. » + le lien proposé (réglage, CMS…).
5. Journal (`recordAsk`, journal commun) : son échec est journalisé mais ne bloque jamais la réponse.

## Forces
- Défense en profondeur contre l'injection : aucun outil ; données citées par `quoteData` et balisées ; prompt qui les
  déclare données ; sortie filtrée (liens en liste blanche du rôle, texte passé au filtre d'adresses COMMUN à tout texte
  montré au client, le même que les questions et le message final de l'éditeur) ; refus au texte fixe (le modèle ne
  peut ni prétendre avoir modifié, ni rédiger la modification).
- Tout est injectable (complete, lecteur Sanity, journal, horloge) : 42 tests sans réseau ni Claude, dont la route sur un
  vrai serveur à identité signée Ed25519.
- Consommation jamais perdue : le journal commun garde le document en local si Sanity est indisponible.

## Faiblesses et limites connues
- Aucun appel réel à Haiku n'a eu lieu (interdit pendant la construction) : la tenue du format ANSWER/LINKS/CHANGE est à
  vérifier au premier passage réel (le parseur tolère un texte sans balises).
- Prompt système court : sous le minimum de cache de Haiku 4.5, le `cache_control` est sans effet (coût ≈ 2 k jetons
  d'entrée par question, surtout le contexte).
- Médias : 40 images listées au plus (les plus récentes) ; utilisations : 6 par image ; section exacte seulement pour les
  pages et les réglages (pas le champ fin, ex. « background »).
- Limite de débit et « une question à la fois » en mémoire du processus (remis à zéro au redémarrage).
- Pas d'estimation du coût d'un appel interrompu (complete ne renvoie pas d'usage en cas d'erreur) : rien au journal.
- Le document d'Ask AI n'a pas de `request` (la question) : la colonne « Request » de B5 reste vide pour Ask.
- Le filtre d'adresses retire aussi une adresse légitime hors du site (ex. « support.google.com ») : voulu (hameçonnage).

## Points sensibles
- JAMAIS d'outil, de fichier ou d'écriture Sanity de contenu ici ; le seul écrit est `aiUsage.*` (privé).
- JAMAIS le code des scripts, un jeton ou un e-mail dans le contexte ou le journal.
- Toute valeur venant de Sanity passe par `quoteData` ; tout lien renvoyé passe par `resolveAskLinks` (catalogue du rôle) ;
  tout texte renvoyé passe par `sanitizeClientText` (ne jamais le contourner, ni élargir `siteDomains` au-delà du site).
- Le jeton de LECTURE suffit pour le contexte : ne pas utiliser le client robot pour lire.
- Ne jamais renvoyer `error.message` d'une exception imprévue (seulement celui d'une `CompleteError`, déjà sans secret).

## Pièges
- `admin.config.ts` n'importe que des TYPES (`@/…` effacé à la compilation) : son import dynamique marche sous tsx et Vitest ;
  y ajouter un import de valeur avec alias casserait le moteur.
- Perspective `raw` : les brouillons sont des documents à part (`drafts.<id>`) ; `usedBy` peut citer publié ET brouillon
  (dédoublonné par libellé).
- `references()` compterait le journal : exclu par `!(_id in path("aiUsage.**"))`.
- `sanitizeClientText` s'applique APRÈS le retrait du markdown et du HTML : dans l'autre ordre, « evil<b>.help » ou
  « evil**.**help » se recolleraient en adresse après le filtre.
- Sans `allowedDomains`, `cleanAnswer` retire même le domaine du site (défaut sûr) : le service passe `siteDomains(config.site)`.
- `askModule` lit le journal commun à l'ENREGISTREMENT : placé avant `usageModule` dans `MODULES`, il retomberait sur
  l'écriture directe (sans secours local).
- Tests de route : l'identité est signée Ed25519 (`signEngineUser(user, clé privée PKCS#8)` + `engineIdentityHeaders`,
  serveur avec `identityPublicKey`), plus avec ENGINE_SECRET.

## Comment modifier
- Nouvelle donnée du contexte : `buildSiteQuery` (paramètre, jamais d'interpolation de valeur) + `AskSiteData` +
  `renderSiteData` (via `quoteData`) + test `context.test.ts`.
- Changer une règle du modèle : `ASK_SYSTEM` (reste FIXE : rien de variable dedans) + test service « prompt identique ».
- Nouveau cas de refus : `CLAIMS_CHANGE` / `finalizeAnswer` + `answer.test.ts`.
- Filtrage des adresses : se change dans `engine/src/claude/sanitize.ts` (engine-claude, commun à tout l'admin), pas ici ;
  la liste blanche d'Ask est `siteDomains` (answer.ts) + test « siteDomains ».
- Nouveau champ du journal : `AskUsageEntry` (usage.ts) + l'entrée passée par `service.ts` ; le document est bâti par
  `askRecorderFor` d'engine/src/usage (engine-publish) — demande de contrat si le champ doit y arriver.

## Tests
`npx vitest run engine/src/ask` (4 fichiers, 42 tests, < 1 s). Couvert : requête GROQ paramétrée, contexte (brouillon
prioritaire, comptes, médias et utilisations, rôles, Sanity en panne, citations neutralisées, scripts sans code, taille
bornée), format et filtrage des liens, nettoyage du texte, refus, validation, historique, erreurs (503, 409, 400),
journal (document du contrat, échec non bloquant, journal commun avec secours local), cache du contexte, route `POST /ask`
signée Ed25519 (200, 400, 404), `askModule` (enregistrement, modèle ASK_MODEL, 503 sans accès), SEC-08 (domaine nu,
IDN, punycode, e-mail, IPv4, point désamorcé, caractère invisible, adresse recollée par le nettoyage, domaine du site gardé).
Non couvert : un vrai appel à Claude et une vraie lecture Sanity.

## Décisions et « À trancher »
- Contexte dans le dernier message utilisateur (données), système fixe (cache) — ask-ai.
- Perspective `raw` (brouillon d'abord) : Ask AI décrit ce que l'admin montre, pas seulement le site en ligne.
- Journal : le journal commun d'engine-publish (FOLLOWUPS #34) ; `sanityAskUsageRecorder` n'est plus qu'un repli.
- SEC-08 : un seul filtre d'adresses pour tout texte montré au client (engine-claude) ; Ask garde en plus son retrait des
  URL à schéma (sans marque) et y ajoute la liste blanche du site.

## Demandes de contrat
Aucune.
