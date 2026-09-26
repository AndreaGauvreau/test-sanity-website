# Prompt à coller dans une nouvelle conversation Claude Code

> **Mode d’emploi :**
> 1. Ouvrez Claude Code **dans le dossier de votre projet Sanity**.
> 2. Le chemin du projet est déjà rempli : `/Users/andreagauvreau/Tools/sanity-test` (rien à modifier).
> 3. Collez tout le bloc, de « DÉBUT DU PROMPT » à « FIN DU PROMPT ».
> 4. Avant la première demande réelle à Claude, copiez vous-même l’identifiant Claude (voir « Accès à Claude »). Le prompt interdit à l’agent de le faire.

---

<!-- DÉBUT DU PROMPT -->

## Rôle et objectif

Tu vas intégrer un **éditeur visuel piloté par IA** dans mon projet Sanity existant :

**Projet Sanity : `/Users/andreagauvreau/Tools/sanity-test`**

Cet éditeur existe déjà sous forme de preuve de concept (POC) sur un autre CMS, Payload : le site LyonDrive, au chemin `/Users/andreagauvreau/Tools/payloadjs-test/payload-ai-editor-test`. Son fonctionnement :

1. Le client sélectionne un élément du site.
2. Il coche ce que Claude a le droit de modifier : 🖌 Style et/ou T Texte.
3. Il écrit une précision.
4. Le serveur lance Claude Code par l’Agent SDK. Claude modifie le CSS de la zone dans un **brouillon de code** (worktree git) et/ou le texte dans un **brouillon du CMS**.
5. Des contrôles automatiques déterministes vérifient le résultat.
6. Le client valide ou annule, puis publie.

**Objectif, à ne jamais perdre de vue : 1 demande = 1 modification fiable et sûre.** Rien n’est mis en ligne sans validation humaine. Rien ne sort du périmètre coché, ni du design system, ni de la zone. En cas de doute, Claude pose une question au client (`ask_client`) plutôt que de deviner.

**Le POC évolue encore.** Des corrections sont en cours sur sa branche `batterie-tests`, par un autre workflow. Tu travailles donc avec une photographie datée : voir « Suivre les évolutions du POC ».

## Travail à faire d’abord, dans cet ordre

1. **Lire en entier** le dossier `/Users/andreagauvreau/Tools/sanity-test/docs/editeur-ia/` : `README.md`, puis `01` à `06` dans l’ordre. Dans ce dossier :
   - ✅ = validé en passage réel ;
   - 🟡 = approuvé mais pas encore repassé ;
   - 🔧 = en cours ;
   - 📋 = prévu ;
   - 📚 = documentation Sanity ou Anthropic (ou registre npm), non testée dans le POC ;
   - 💡 = proposition du dossier, sans équivalent dans le POC.

   Respecte ces statuts : ne présente jamais un 🟡, 🔧, 📋, 📚 ou 💡 comme validé.
2. **Lire le projet Sanity existant** : `package.json` et versions, Node, structure (Studio embarqué dans Next ou séparé), schémas, requêtes GROQ et client, Draft Mode / Presentation / Visual Editing / stega déjà présents ou non, noms des variables d’environnement **dans les fichiers d’exemple ou le code seulement**, CSS (CSS Modules ou non), tokens de design s’il y en a, git (branches, état propre).
3. Faire une **note d’écarts** : ce qui diffère entre mon projet et les hypothèses du dossier (par exemple : pas de CSS Modules, Studio séparé, Tailwind, Portable Text partout).
4. **Poser les questions bloquantes**, toutes en une fois, avant d’écrire du code. Au minimum :
   - Où tourne le runner : route handlers Next (`runtime = 'nodejs'`) du projet, ou petit service Node séparé ? Il faut une machine persistante, jamais du serverless ni une Sanity Function.
   - Où vit l’interface : outil personnalisé du Studio (recommandé), overlay sur le site, ou les deux plus tard ?
   - Stockage des modifications et publications : SQLite locale au runner, ou documents Sanity `aiEdit` / `aiPublication` ?
   - Identité et rôles hors local : jeton Sanity vérifié côté serveur, ou authentification propre à l’éditeur ? Pour le socle, le local seul suffit.
   - Quelle zone texte et quel document pour le socle, et existe-t-il un **dataset de test** où écrire sans risque ?
   - Noms des variables Sanity déjà utilisés dans le projet (jeton de lecture, jeton d’écriture).
   - Quel clone sert de `site/` (`main`) et de `site-draft/` (`draft`), **distinct du dépôt où l’on développe l’intégration** ? Le runner y fait `git reset --hard` et `git clean -fd` à chaque demande : jamais la copie de travail du développeur, jamais le dossier du runner.

## Méthode (skills superpowers, obligatoire)

- `superpowers:brainstorming` : valider la conception avec moi à partir du dossier et de la note d’écarts.
- `superpowers:writing-plans` : plan écrit en tâches courtes, chacune avec ses tests. Enregistre-le dans le projet Sanity, par exemple `docs/editeur-ia/plan.md`.
- `superpowers:subagent-driven-development`, avec `superpowers:test-driven-development` pour chaque tâche : test d’abord, puis code, puis relecture.
- `superpowers:verification-before-completion` avant d’annoncer qu’une étape est finie : montrer la sortie des tests, pas une affirmation.
- Travailler sur une **branche git dédiée** du projet Sanity. Commits petits et lisibles.

## Ordre de construction

### Jalon 1 — Socle minimal testable (texte seul)

- Une seule zone texte, par exemple le titre d’un document singleton. Marquage : `data-edit="<zone>"`, plus `data-edit-doc` / `data-edit-key` si besoin.
- **Dépendances** : installer d’emblée toutes celles de `02-installation-claude.md` § 2.1 (Agent SDK, `zod`, `playwright-core`, `pixelmatch`, `pngjs`, `postcss`, `typescript`, `tsx`…). Les modules copiés les importent, même avec les contrôles visuels coupés.
- **Runner côté serveur :**
  - copie de **tout** `cms/src/editor` **sauf** `http.ts`, `service.ts` et `content.ts`, avec les tests et `fixtures/` (`guards.ts` importe `css-lint`, `tsx-lint`, `git` ; `questions.ts` importe `css-policy` ; `job.ts` importe `visual`, `measure`, `checks`, `git`) ;
  - adaptations obligatoires, notées dans `ORIGINE.md` : dans `review.ts` et `review.test.ts`, remplacer l’import de `../payload-types` par un type local `{ status, validatedAt, zone, zoneLabel }` ; sortir `fieldLabel` de `content.ts` vers un module neutre (il est importé par `prompt.ts` et `job.ts`) ; dans `config.ts`, `||` au lieu de `??` pour `SITE_LIVE_DIR`, `SITE_DRAFT_DIR`, `SITE_DRAFT_URL` ;
  - `job.ts` et `service.ts` adaptés derrière une interface `EditRepo` ;
  - `createSanityContentStore` qui écrit dans `drafts.<id>` avec un **jeton d’écriture côté serveur seulement**.
- **Dépôt du front dès le jalon 1** (le runner en a besoin à chaque demande : `loadDesignSystem(config.draftDir)`, `changedFiles(config.draftDir)` ; et `publishDraft` fait `merge --ff-only draft` dans `liveDir` et `tsc` dans `draftDir/node_modules/.bin`) :
  - un **clone dédié** du dépôt du front, distinct de la copie de travail où tu développes, sur `main` ;
  - le worktree `site-draft` sur `draft` : `git worktree add <dir> -b draft`, puis `npm install` dans le worktree (comme `scripts/setup.mjs:57-62` du POC), et un `.env.local` propre au worktree ;
  - dans ce brouillon : un `src/editor/zones.json` d’**une** zone, un `src/styles/tokens.json` et un `src/editor/RULES.md` minimal ;
  - `SITE_LIVE_DIR` et `SITE_DRAFT_DIR` en chemins absolus vers ce clone, **jamais vides**.
- Outil MCP `set_text` → `validateText` → brouillon Sanity. Contrôles visuels coupés (`EDITOR_VISUAL_CHECKS=off`). Pas encore d’édition de fichiers par Claude.
- Validation manuelle : routes `validate`, `undo`, `publish` (textes seulement). Vérification par moi dans le Studio / Presentation.
- Interface minimale : un simple formulaire dans un outil du Studio, ou une route testée à la main. La vraie interface vient au jalon 4.

### Jalon 2 — Aperçu et contrôles visuels

- `site-draft` en Draft Mode, perspective `drafts`.
- Accès de Playwright à la preview par un secret serveur.
- `visual.ts`, `measure.ts`, `checks.ts`.
- `measure` réactivé.

### Jalon 3 — Styles

- Le clone dédié et le worktree `site-draft` existent depuis le jalon 1 : `zones.json` complet et `tokens.json` du projet.
- Liste blanche CSS : `css-policy.ts`, `css-lint.ts` ; plus `tsx-lint.ts`.
- Commit par modification, annulation `reset --hard HEAD~1`, publication `merge --ff-only`.

### Jalon 4 — Dialogue et interface

- `ask_client` 🟢⚪🔴 et valeurs en dur accordées.
- Interface de l’éditeur (sidebar, calques, inspecteur) dans un outil du Studio.
- Onglet Publication.

### Jalon 5 — Durcissement

- Identité réelle et rôles.
- `RULES.md` porté depuis le texte cible du plan du POC.
- Définitions d’outils fixes (tâche 23 du POC) et comptage de coût (tâche 24).
- Reprise des corrections suivantes du POC.

Chaque jalon s’arrête par un point de contrôle avec moi.

## Reprendre le code du POC, en le citant

**Lecture seule.** Ne modifie, ne crée et ne supprime **aucun** fichier dans `/Users/andreagauvreau/Tools/payloadjs-test/payload-ai-editor-test`. Aucune commande git qui écrit : pas de `checkout`, `stash`, `reset`, `commit` ni `worktree add`. Lis avec `git show`, `git log` et `git diff` seulement.

**Runner**, depuis la branche des corrections :

```bash
git -C /Users/andreagauvreau/Tools/payloadjs-test/payload-ai-editor-test show batterie-tests:cms/src/editor/<fichier>
```

**Site**, depuis la version commitée :

```bash
git -C /Users/andreagauvreau/Tools/payloadjs-test/payload-ai-editor-test/site show main:<chemin>
```

**N’utilise jamais la copie de travail de `site/src/editor`.** Une autre session y fait une refonte de l’interface non commitée.

**Citation.** En tête de chaque fichier repris, ajoute un commentaire d’origine sur ce modèle :

```ts
// Repris du POC LyonDrive : cms/src/editor/guards.ts @ batterie-tests <sha court>, adapté pour Sanity (<ce qui change>).
```

Tiens aussi un registre `docs/editeur-ia/ORIGINE.md` dans le projet Sanity. Il contient, pour chaque fichier copié, le chemin dans le POC, la branche, le SHA copié, la date et le résumé des adaptations.

**Ne pas copier `RULES.md` tel quel depuis `site@main`** : c’est l’ancienne version. Pars du texte cible du plan (`docs/superpowers/plans/2026-09-25-corrections-batterie.md`, section « ### 2. RULES.md — texte exact »), corrigé selon `04-consignes-outils-dialogue.md` § 3 : décision 14 (aucune `className` ne change dans un `.tsx`), décalages `0`/`auto` seulement, `outline`/`outline-offset`/`box-shadow` jamais en dur, `padding-inline` pour le fond d’un mot mis en avant, états = peinture seulement.

## Règles non négociables

1. **Tout en français** : échanges, commentaires de code, messages d’interface et de commit.
2. **Secrets.**
   - Ne jamais afficher, recopier, journaliser ni commiter une valeur de jeton, de clé ou de secret, même partielle.
   - Ne jamais ouvrir `/Users/andreagauvreau/Tools/payloadjs-test/payload-ai-editor-test/cms/.env`, ni aucun `.env` / `.env.local` du POC.
   - Dans le projet Sanity, tu peux créer un **`.env.example`** avec les **noms** de variables seulement. Vérifie que `.env.local` est dans `.gitignore` **avant** que j’y colle quoi que ce soit.
3. **Accès à Claude.**
   - **C’est moi qui copie** la ligne `CLAUDE_CODE_OAUTH_TOKEN=` depuis `/Users/andreagauvreau/Tools/payloadjs-test/payload-ai-editor-test/cms/.env` vers le `.env.local` du runner dans le projet Sanity. Tu me dis quand et dans quel fichier, puis tu attends ma confirmation.
   - Ce jeton d’abonnement n’est accepté que sous `NODE_ENV=development` (`next dev`), comme dans `config.ts` du POC.
   - Pour un usage par des clients, `ANTHROPIC_API_KEY` sera obligatoire, et je la fournirai moi-même.
   - Le sous-processus Claude ne reçoit que `PATH`, `HOME`, un seul identifiant Claude, `CLAUDE_CONFIG_DIR`, `CLAUDE_AGENT_SDK_CLIENT_APP` et `MCP_TOOL_TIMEOUT`. **Jamais** le jeton Sanity, **jamais** `...process.env`.
4. **Prévenir avant tout appel réel à Claude.** Les tests utilisent un faux Claude. Avant chaque lancement réel, annonce :
   - la demande exacte ;
   - le document ou le dataset visé ;
   - le coût probable : environ 0,07 $ en médiane dans le POC, 1,5 $ au plus par appel ;

   puis attends mon « oui ».
5. **Rien n’est publié sans validation humaine.** Tu ne publies jamais un document Sanity et tu ne fusionnes jamais `draft` dans `main` sans mon accord explicite, donné pour cette publication précise. Écris dans un **dataset de test** tant que je n’ai pas dit le contraire.
6. **Pas de PM2.** N’inscris pas le projet (runner, site, preview) dans le PM2 de `~/Tools`. Je lance les serveurs à la main. Donne-moi les commandes.
7. **Le runner reste côté serveur :** jamais dans le navigateur ni dans le code du Studio, et aucun jeton dans une variable `NEXT_PUBLIC_*`.
8. **Garder les garde-fous du POC**, même si c’est tentant de simplifier :
   - `permissionMode: 'dontAsk'`, `settingSources: []`, `strictMcpConfig: true` ;
   - hook `PreToolUse` → `checkToolUse` ;
   - `validateText` ;
   - une seule modification à la fois, validée ou annulée avant la suivante ;
   - 2 essais au plus ;
   - retour arrière complet en cas d’échec ;
   - **au démarrage, le runner refuse de tourner** si `draftDir` ou `liveDir` est vide, égal au dépôt du runner ou au dépôt de travail du développeur, si `draftDir` n’est pas sur la branche `draft` ou si `liveDir` n’est pas sur `main`. La publication revérifie que `liveDir` est sur `main` avant le merge.
9. **Questions plutôt que suppositions.** Si mon projet contredit le dossier, arrête-toi et demande.
10. **Honnêteté sur l’état.** Distingue ce que tu as testé de ce que tu supposes à partir de la doc Sanity. Cite l’URL officielle consultée pour chaque appel d’API Sanity.

## Critères d’acceptation mesurables

**Jalon 1 (socle), tous exigés :**

- `npm test` vert, avec des tests nouveaux pour :
  - (a) `createSanityContentStore` sur un client simulé : `write` cible `drafts.<id>` et ne touche jamais `<id>` publié ;
  - (b) `resolveTextTarget` Sanity : type hors liste blanche refusé, `_id` avec `drafts.` refusé, `_key` inconnue refusée ;
  - (c) `validateText` : texte trop long, `<`, astérisques hors champ `accent` ;
  - (d) une demande complète avec le faux Claude : statut `ready`, puis `validate`, puis `publish` ;
  - (e) le retour arrière après un refus.
- Test : l’objet `env` passé à `query()` contient **exactement** les clés `PATH`, `HOME`, un identifiant Claude, `CLAUDE_CONFIG_DIR`, `CLAUDE_AGENT_SDK_CLIENT_APP` et `MCP_TOOL_TIMEOUT`, et aucune variable `SANITY_*`.
- Test : `checkToolUse` refuse `Read` sur `.env.local`, `node_modules/…` et `../…`.
- Test : sans identifiant Claude, la demande passe en `failed` avec le message d’accès, **avant** tout appel. Une valeur `sk-ant-oat…` placée dans `ANTHROPIC_API_KEY` est refusée.
- Test : une 2e demande est refusée (409) tant qu’une modification `ready` n’est pas validée.
- Test : le runner refuse de démarrer si `SITE_LIVE_DIR` ou `SITE_DRAFT_DIR` est vide, désigne le dépôt du runner ou le dépôt de travail, ou si les branches ne sont pas `main` / `draft`.
- Les tests copiés du POC passent après les adaptations listées dans `ORIGINE.md` (type local de `review.ts`, `fieldLabel` déplacé, `||` dans `config.ts`).
- Avec mon accord, **1 demande réelle** sur le dataset de test :
  - le brouillon `drafts.<id>` contient le nouveau texte ;
  - une requête en perspective `published` renvoie encore l’ancien ;
  - la modification enregistre `costUsd`, les jetons et la durée.
- Annulation : si aucun brouillon n’existait avant, `drafts.<id>` n’existe plus après l’annulation ; le publié est inchangé.
- Publication, avec mon accord : le publié contient le nouveau texte et `drafts.<id>` n’existe plus.
- `git grep -nE "sk-ant-(api|oat)[0-9]{2}-[A-Za-z0-9_-]{20,}|(CLAUDE_CODE_OAUTH_TOKEN|ANTHROPIC_API_KEY|SANITY_API_(READ|WRITE)_TOKEN|PREVIEW_SECRET)=[^[:space:]]+" -- ':!*.test.ts' ':!.env.example'` ne renvoie rien, et `git check-ignore .env.local` répond `.env.local`.

**Jalon 2 et suivants :** les tests copiés du POC passent. Côté fichiers, cela comprend :

- `css-policy.test.ts`, `css-lint.test.ts`, `tsx-lint.test.ts` ;
- la fixture `fixtures/reference-1.json`, où L05 (`@import` Google Fonts) et R09 (marge négative) doivent être **refusés** ;
- `visual-page.test.ts` avec un vrai Chrome.

Côté comportement :

- la preview du brouillon affiche un texte écrit par `set_text` sans rechargement complet ;
- un fichier modifié hors de la zone est refusé par le contrôle `scope` ;
- une publication fait `merge --ff-only` et pose `publication-N`.

## Suivre les évolutions du POC

Tu pars d’une photographie : branche `batterie-tests`, tête `888d165` du 2026-09-25 à 21:05. État :

- corrections 1 à 11 🟡 ;
- tâche 12 🔧 : **non approuvée à `888d165`** ; essai 3 en cours (`wf_35953d2a-7a5`) avec les décisions 17 (texte recouvert = avertissement non bloquant ; cadre et états bloquants) et 18 (toutes les occurrences d’une zone répétée, 12 au plus) ;
- tâches 13 à 25 📋 (lignes gagnées à 375 px, contraste, `ask_client` élargi, `RULES.md`, outils fixes, coût, banc) ;
- puis un scan de sécurité et un nouveau passage réel (phase 6).

Pour récupérer plus tard les dernières versions :

```bash
POC=/Users/andreagauvreau/Tools/payloadjs-test/payload-ai-editor-test
# 1. Où en est le travail (journal tenu par le workflow des corrections)
tail -40 $POC/.superpowers/sdd/progress.md
# 2. La branche existe-t-elle encore ? (elle peut avoir été fusionnée dans main)
git -C $POC branch --list
# 3. Ce qui a changé dans le runner depuis la copie
git -C $POC log --oneline 888d165..batterie-tests -- cms/src/editor
git -C $POC diff 888d165..batterie-tests -- cms/src/editor/<fichier>
# 4. Rapports de chaque correction, plan et décisions du contrôleur
ls $POC/.superpowers/sdd/corr-*-report.md
less $POC/docs/superpowers/plans/2026-09-25-corrections-batterie.md
# 5. Côté site (zones.json, RULES.md, interface une fois la refonte commitée)
git -C $POC/site log --oneline 3a0af03..main
```

Utilise `ORIGINE.md` pour savoir quel SHA tu as copié, et reporte les différences fichier par fichier, tests compris. Ne reporte **qu’une correction approuvée** : le journal dit « complete » ou « approuvée ». Jamais un essai en cours.

## Fin de chaque session

Termine par un bilan court en français, qui indique :

- ce qui est fait, avec la sortie des tests ;
- ce qui reste à faire ;
- les doutes ;
- les commandes pour que je lance moi-même les serveurs ;
- les éventuelles actions à faire de mon côté : copie d’un jeton, validation, publication.

<!-- FIN DU PROMPT -->
