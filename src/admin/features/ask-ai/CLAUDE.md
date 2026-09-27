# Ask AI (panneau, G4) — LLM context

> Propriétaire : ask-ai · Figma : G4 (docs/admin/figma/states/G4.md), composant « Ask AI panel » 340:1586, Model usage · Mis à jour : 2026-09-28 (coût facturé / inclus dans l'abonnement Claude)
> Possède aussi : `src/admin/core/engine/mock/ask.ts` (moteur simulé) et `engine/src/ask/` (service du moteur, voir son CLAUDE.md).

## Utilité
Assistant en LECTURE SEULE de l'admin, pour Kuartz, le client admin et l'éditeur (droit `ai.ask`, tous les rôles) : il
répond à des questions courtes sur le site et l'admin (où est quoi, comment faire, ce qui manque), avec des liens vers les
bons écrans, et refuse toute modification (renvoi vers l'éditeur IA). Ouvert par « ✦ Ask AI » de la Sidebar sur tous les
écrans de la coque (`src/app/admin/(shell)/layout.tsx` monte `<AskAiProvider>`). Pas de route propre. Ne modifie rien,
n'accepte pas de fichiers.

## Fichiers
- `AskAiProvider.tsx` — client : contexte `useAskAi()` (open / close / isOpen, API du stub gardée), conversation, panneau flottant (Portal + motion), Échap (pile de couches du kit), retour du focus.
- `AskAiProvider.module.css` — position du panneau (à droite de la Sidebar `var(--kz-sidebar-width)`, sous la Top bar
  `var(--kz-topbar-height)`, couche `var(--k-z-panel)` sous les modales).
- `AskAiPanel.tsx` / `AskAiPanel.module.css` — présentation du Figma : en-tête, sous-titre, fil, champ + envoyer, pied ; clavier (⌘/Ctrl ↵).
- `useAskConversation.ts` — client : état (réducteur), chargement de l'en-tête (server action), envoi par le relais du moteur, reprise, persistance de session.
- `conversation.ts` — PUR : réducteur, historique (10 messages), validation de la question, sessionStorage (clé `kz-ask-ai`, rattachée à l'utilisateur, relecture défensive).
- `links.ts` — PUR, imports RELATIFS : catalogue des écrans permis par rôle (`askRoutes`), normalisation et filtrage des liens, écran ouvert (`screenOf`), `isSafeAskHref`. Importé tel quel par le moteur et le mock.
- `info.ts` — logique serveur à dépendances injectées : modèle (santé du moteur) + totaux du mois + id public de l'utilisateur.
- `actions.ts` — server action `getAskAiInfo()` (`requireCapability('ai.ask', 'action')` en premier).
- Tests : `links.test.ts`, `conversation.test.ts`, `info.test.ts`, `AskAiProvider.test.tsx` (jsdom), `layout.test.ts`
  (couche et géométrie lues dans les tokens, aucune valeur de la coque recopiée).
- `../../core/engine/mock/ask.ts` (+ `ask.test.ts`) — `handleAsk: MockHandler` (ENGINE_MOCK=1).

## Contrats
- Entrées : `AskRequest` / `AskResponse` / `AskLink` / `Usage` / `EngineHealth` (`core/contracts/engine.ts`) ; manifeste
  `AdminConfig` (`src/admin.config.ts`) pour le catalogue ; `getUsageSummary('month')` (`core/usage`, code-usage) ;
  tokens `--k-z-panel` (ui-foundations, `tokens.css`) et `--kz-sidebar-width` / `--kz-topbar-height` (shell, posées sur
  `[data-kz-admin]` par `AdminRoot.module.css`, lisibles dans le Portal) ;
  `engineClient.ask` / relais `POST /admin/api/engine/ask` (auth-core, droit `ai.ask`, délai 60 s) ; `engineFetch(session, 'GET', 'health')`.
- Sorties : `<AskAiProvider>` (prop facultative `services` = { getInfo, ask } pour les tests), `useAskAi()`,
  server action `getAskAiInfo(): Promise<AskAiInfo>` (`{ ok, userId, model, month } | { ok: false, code, error }`),
  `askRoutes`, `resolveAskLinks`, `screenOf`, `isSafeAskHref`, `editorHref` (links.ts).
- Utilisé par : shell (`ShellSidebar` → `useAskAi().open`, layout `(shell)` → `<AskAiProvider>`), le moteur (`engine/src/ask` importe links.ts), le mock.

## Comportement (G4)
- Panneau 360 px, bg/elevated, border/default, radius/lg, Elevation/Popover ; non modal (`role="dialog"`, `aria-modal="false"`),
  sans voile ; l'écran derrière reste utilisable. Entrée 0.96 → 1 + fondu 200 ms ease-out depuis le coin haut gauche,
  sortie 160 ms ; nouveaux messages : `listItem` du kit (conversation restaurée non animée : `AnimatePresence initial={false}`) ;
  mouvement réduit : `useMotionVariants` (instantané) + défilement `auto`.
- En-tête « Ask AI » + modèle (`ModelUsage` small, logo Claude + « Haiku 4.5 » depuis `health.claude.askModel`, masqué si le
  moteur ne répond pas) + ✕ « Close Ask AI ». Sous-titre « Questions only — it doesn’t change anything. ».
- Fil (`role="log"`, `aria-live="polite"`) : question (Message adjustment), réponse (Body text/secondary), liens (Button
  ghost small + ↗, next/link, SEULEMENT des chemins `/admin…` vérifiés), consommation (`ModelUsage` small sans modèle,
  « 2.1k input · 240 output · $0.003 » ; réponse passée par l'abonnement Claude, `usage.access === 'subscription'` :
  « … · Included », lu « included in your Claude subscription (≈ $0.003 at API prices) » ; `access` gardé en
  sessionStorage, absent d'une ancienne conversation = facturé). Attente : « Thinking… » ; erreur : Callout error + « Try again » (même question, même place).
- Champ « Ask about this site… » (textarea 1 ligne → 120 px, 1 000 caractères) ; **⌘ ↵ / Ctrl ↵ envoie** ; Entrée seule
  = retour à la ligne (le Figma dit ⌘ ↵) ; bouton envoyer bleu (Icon button primary) comme le Figma, sans effet si le
  champ est vide ; une question à la fois (la suivante peut être tapée pendant l'attente).
- Pied « This month: 1.2M input · 147k output · $4.80 » (toute l'IA du site, `getUsageSummary('month').totals`, relu après
  chaque réponse ; coût FACTURÉ seulement, mêmes chiffres que B5 : abonnement Claude seul « … · Included », mélange
  « … · $0.10 + included », détail dans l'infobulle `title`, `formatUsageLine`) + « Usage ↗ » (`/admin/settings/usage`).
  Journal illisible : pied sans texte, bouton gardé. `AskAiTotals.includedUsd` = part de l'abonnement (0 sans elle).
- ✕ ou Échap ferment (Échap : si le panneau est la couche du dessus de la pile du kit et que l'événement n'a pas déjà été
  traité — édition sur place, menu, modale passent avant) ; le focus revient au déclencheur. « Ask AI » alors que le panneau
  est ouvert : focus ramené dans le champ.
- Conversation gardée pendant la session : dans le fournisseur (survit aux navigations dans la coque) et en sessionStorage
  (survit au rechargement de l'onglet ; 30 questions ; question en attente au rechargement → « The answer was interrupted.
  Ask again. »). Rattachée à l'id de l'utilisateur : un autre compte dans le même onglet ne voit jamais la conversation.
- États : chargement (champ désactivé, « Loading… »), vide (en-tête + champ + pied, comme la variante empty), réponse,
  refus, erreur par question, droits (`forbidden` / session expirée → Callout error, champ désactivé), moteur injoignable
  (message du relais : « The AI engine is unavailable… »).

## Forces
- Liens en double contrôle : catalogue par rôle côté moteur (libellés du catalogue, jamais du modèle) + `isSafeAskHref` à
  l'affichage et à la relecture du sessionStorage.
- Texte de la réponse filtré côté moteur par le filtre commun des adresses (`sanitizeClientText`, SEC-08) : aucune adresse
  hors du domaine du site n'arrive au panneau (« [link removed] » à la place), rendu en nœud texte.
- Logique pure testée (catalogue, réducteur, historique, stockage retouché) ; panneau testé en jsdom (clavier, Échap, ✕,
  focus, ⌘/Ctrl ↵, persistance par utilisateur, refus, erreur + reprise, droits, attente).
- Aucune donnée sensible côté client : `getAskAiInfo` ne renvoie que id public, modèle et totaux ; les questions passent par
  le relais signé (jamais le jeton Sanity ni `ENGINE_SECRET` dans le navigateur).

## Faiblesses et limites connues
- Position calculée depuis les variables de la coque : hors `[data-kz-admin]` (Portal monté ailleurs) elles seraient
  indéfinies et le panneau mal placé ; le Portal du kit vise bien `[data-kz-admin]`.
- Pas de bouton « New conversation » (hors Figma) ; la conversation s'efface à la fermeture de l'onglet ou après 30 questions.
- Pas d'annulation d'une question en vol (le Figma n'en prévoit pas) ; une sortie de la coque (éditeur IA) l'abandonne.
- Les liens `next/link` préchargent les écrans : tant qu'un écran n'existe pas (ex. `/admin/media` pendant la vague 2), la
  console montre un 404 de préchargement.
- `getAskAiInfo` appelle santé + journal à chaque réponse (léger en local ; à mettre en cache si le journal grossit).

## Points sensibles
- JAMAIS de lien hors `/admin` dans le panneau ; ne pas relâcher `isSafeAskHref` ni rendre le texte de la réponse en HTML
  (nœuds texte React seulement).
- JAMAIS le jeton Sanity ou un secret dans `AskAiInfo` ; `requireCapability('ai.ask', 'action')` reste la première ligne.
- `links.ts` doit rester pur, en imports relatifs (le moteur l'importe) : pas d'alias `@/`, pas de React/Next/Node.
- Ask AI ne modifie rien : aucune server action d'écriture ici, jamais.

## Pièges
- Le panneau vit dans un `Portal` : il est monté un rendu après le fournisseur → focus posé dans un `requestAnimationFrame`.
- Le champ est désactivé tant que l'en-tête n'est pas chargé : le focus attend sur le panneau (`tabIndex=-1`) puis passe au champ.
- Tests jsdom : `Element.prototype.scrollTo` absent (stub), `MotionGlobalConfig.skipAnimations = true`, mocks de
  `next/navigation`, `next/link` et `./actions` (modules serveur) ; pas de jest-dom (assertions DOM à la main).
- `vi.mocked(s.ask)` pour lire les appels d'un service injecté (sinon erreur de type).

## Comment modifier
- Nouvel écran de l'admin cité par Ask AI : `askRoutes` (links.ts) + test `links.test.ts` ; le moteur et le mock suivent.
- Changer un libellé du panneau : `ASK_AI_TEXT` (AskAiPanel.tsx) + test jsdom.
- Nouveau scénario simulé : `SCENARIOS` de `core/engine/mock/ask.ts` + `ask.test.ts`.
- Déplacer le panneau : `.host` de `AskAiProvider.module.css` (garder `transform-origin` du côté du bouton).

## Tests
`npx vitest run src/admin/features/ask-ai src/admin/core/engine/mock/ask.test.ts` (6 fichiers, 36 tests, dont coût
facturé / inclus : réponse et pied « Included », mélange, `access` relu du sessionStorage, totaux transmis séparés).
À la main (ENGINE_MOCK=1, session de dev) : http://127.0.0.1:4040/admin/pages/home → « Ask AI » ; « Where is the hero image
used? » (⌘ ↵), « Change the hero title to “Docks, solved.” » (refus), « [mock:error] » (erreur + Try again),
« [mock:slow] » (attente 4 s) ; recharger (conversation gardée) ; Échap ; rôle client (`POST /admin/api/auth/dev-role`) :
plus de lien Code. Captures comparées à `docs/admin/figma/states/G4.ui.png` (Chrome, 1440 × 900).

## Décisions et « À trancher »
- ⌘ ↵ / Ctrl ↵ pour envoyer, Entrée = nouvelle ligne (texte du Figma « ⌘ ↵ ») — ask-ai.
- Sous-titre de G4 (« Questions only — it doesn’t change anything. ») plutôt que celui de la fiche composant ; placeholder
  « Ask about this site… » (G4) plutôt que « Ask a question… » (fiche).
- Conversation en sessionStorage par utilisateur (« gardée pendant la session (proposé) » du Figma).
- Panneau sous la Top bar pour ne pas masquer « Review › » ; non modal.

## Demandes de contrat
- Aucune en cours. `--k-z-panel` (ui-foundations, #23) et `--kz-sidebar-width` / `--kz-topbar-height` (shell, #25)
  livrés et branchés (#41).
