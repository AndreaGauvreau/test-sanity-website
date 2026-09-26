# Dossier : porter l’éditeur IA LyonDrive dans un projet Sanity

> État au **2026-09-25, 21:05**, statut de la tâche 12 mis à jour à 21:35 (journal du POC à 21:21). POC de référence : `/Users/andreagauvreau/Tools/payloadjs-test/payload-ai-editor-test`, branche `batterie-tests`, tête `888d165`. Site (dépôt séparé) : `site/` sur `main@3a0af03`.
> Ce dossier est une photographie. Le POC continue d’évoluer en parallèle (corrections 12 à 25, puis nouveau passage réel). Avant de copier un fichier du POC, relisez son état avec `git log`.

## À quoi sert ce dossier

Il sert à construire, dans un **projet Sanity existant**, l’éditeur visuel piloté par Claude que le POC LyonDrive a mis au point sur Payload. On y trouve :

- l’architecture du POC, de bout en bout, puis sa transposition à Sanity ;
- l’installation et la configuration de Claude : Agent SDK, modèle, réglages, jeton, coût ;
- les garde-fous, les consignes données à Claude, l’interface, le cycle brouillon → validation → publication et le banc d’essai (dans les autres fichiers du dossier) ;
- un prompt prêt à coller dans une nouvelle conversation Claude Code : **[PROMPT.md](./PROMPT.md)**.

## Pour qui

- **Le développeur** (vous), qui prépare le projet Sanity en local, recopie lui-même le jeton Claude et teste.
- **Une autre instance de Claude Code**, qui construit l’intégration à partir de ce dossier. Elle travaille dans le projet Sanity, lit le POC **en lecture seule** et n’ouvre jamais un fichier `.env`.

## Légende des états

| Pastille | Sens |
|---|---|
| ✅ | **Validé en passage réel** : a tourné avec le vrai Claude (parcours du 2026-09-24, passage de référence de 50 cas du 2026-09-25). |
| 🟡 | **Approuvé, pas encore repassé** : relu et approuvé, tests unitaires verts, mais pas encore rejoué avec le vrai Claude. |
| 🔧 | **En cours** : en relecture ou en correction au moment de la photographie. |
| 📋 | **Prévu** : écrit dans le plan, pas codé. |
| 📚 | **Documentation externe** : documentation Sanity ou Anthropic, ou registre npm, **non testée** dans le POC. À vérifier en construisant. |
| 💡 | **Proposition du dossier** : choix proposé pour Sanity, sans équivalent dans le POC. À valider avec vous. |

Cette légende vaut pour tous les fichiers du dossier (01 à 06 et PROMPT.md).

## État au 2026-09-25

### ✅ Validé en passage réel

- Le runner Claude (Agent SDK `@anthropic-ai/claude-agent-sdk` 0.3.281, modèle `claude-opus-5-5`, effort `medium`) lancé depuis une route Next côté serveur, avec un environnement isolé et un seul identifiant transmis. Sources : `cms/src/editor/agent.ts`, `cms/src/editor/config.ts`.
- L’accès à Claude : `ANTHROPIC_API_KEY` prioritaire ; `CLAUDE_CODE_OAUTH_TOKEN` (jeton de `claude setup-token`) accepté seulement sous `NODE_ENV=development`. Source : `cms/src/editor/config.ts:37-72`.
- Le cycle complet : demande → file d’attente → Claude → contrôles → commit sur la branche `draft` → « à valider » → valider ou annuler → publier (`merge --ff-only`, tag `publication-N`). Sources : `cms/src/editor/job.ts`, `cms/src/editor/service.ts`. Des publications réelles existent (tags `publication-1` et `publication-2` dans `site/`).
- Les outils MCP maison `set_text`, `measure` et `ask_client` (questions 🟢 ⚪ 🔴), le hook `PreToolUse` et le 2e essai dans la même session.
- Le passage de référence `scripts/bench/runs/1-reference` (2026-09-25, 00:35 → 01:16) : 50 cas, 41 `ready` et 9 `rejected`, **3,83 $** au total, médiane **0,070 $** par demande, durée médiane 24 s. Ce passage a aussi révélé **2 violations de sûreté** (L05 : `@import` d’une police Google ; R09 : marge négative) et 2 échecs silencieux (T08, C02), faits avec l’**ancien** lint ligne à ligne.

### 🟡 Approuvé, pas encore repassé

- Les corrections 1 à 11 du plan `docs/superpowers/plans/2026-09-25-corrections-batterie.md` (commits `a14b3ed` → `645fac7`) :
  - liste blanche CSS (`css-policy.ts`) et analyse du fichier CSS entier avec postcss (`css-lint.ts`) ;
  - arbre TSX entier (`tsx-lint.ts`) : aucune `className` ne change ;
  - options 🔴 sans police ni ressource externe (`questions.ts`) ;
  - 🖌 Style seul fermé aux `.tsx` ;
  - `zones.json` enrichi (`selectors`, `children`, `hideable`, `logotype`, `reach`) ;
  - isolation des zones intérieures et des ancêtres ;
  - contraste WCAG calculé (`contrast.ts`), mais seulement **affiché** à Claude ;
  - mesure unique par élément (`measure.ts`).
- 262 tests verts et typecheck vert à `888d165` (5e tour de la tâche 12, `.superpowers/sdd/corr-12-report.md`, « Effectif : 262 tests »). Ces chiffres incluent la tâche 12, non approuvée.

### 🔧 En cours

- Correction 12 : contrôle du cadre du parent (`frameCheck`), texte recouvert, peinture dans les états `:hover`/`:focus`. Commits `aa5739c` → `888d165`. **Tâche 12 non approuvée à `888d165` ; essai 3 en cours (`wf_35953d2a-7a5`)** avec deux nouvelles décisions du contrôleur (journal `.superpowers/sdd/progress.md`, 21:21 ; plan modifié, non commité) :
  - **décision 17** : le relevé « texte recouvert » devient un **avertissement non bloquant** (étape visible dans l’activité et phrase obligatoire dans le message final, sans échec ni 2e essai) ; le **cadre** (sortie du parent, marges négatives, décalages) et la **peinture dans les états** restent **bloquants** ;
  - **décision 18** : le relevé porte sur **toutes les occurrences** d’une zone répétée (12 au plus).

  `checks.ts`, `checks.test.ts` et `job.test.ts` ont des modifications non commitées de cet essai. **Ne figez pas `visual.ts` ni `checks.ts` avant l’approbation.**
- Une refonte de l’interface de l’éditeur dans `site/src/editor` n’est **pas commitée** : c’est une autre session. Partez de `git -C site show main:<chemin>`, jamais de la copie de travail.
- Le brouillon `site-draft` a un commit d’avance sur `main` (`f6c8a34`) : une modification attend d’être validée ou annulée.

### 📋 Prévu

- Tâches 13 à 25 : lignes gagnées à 375 px, contrôle de contraste (états forcés compris), rendu d’avant donné à Claude, `ask_client` élargi, structure jamais modifiée, RULES.md réécrit (tâche 22), **outils à définition fixe pour garder le cache** (tâche 23), **coût d’un essai en échec conservé** (tâche 24), banc (tâche 25).
- Scan de sécurité, puis phase 6 : 50 cas + 15 inédits rejoués en réel.

## Ordre de lecture

1. **[01-architecture.md](./01-architecture.md)** : comment le POC fonctionne de bout en bout, puis ce que devient chaque pièce dans Sanity.
2. **[02-installation-claude.md](./02-installation-claude.md)** : paquets, modèle, réglages, variables d’environnement, recopie du jeton, Chrome et Playwright, coût et cache.
3. Les fichiers suivants du dossier (numérotés à partir de 03) couvrent : garde-fous et contrôles automatiques, consignes et outils donnés à Claude (prompt, `ask_client`, `zones.json`, 14 règles), interface de l’éditeur (pont iframe, sidebar), brouillon / validation / annulation / publication, banc d’essai, et le plan détaillé de transposition Sanity.
4. **[PROMPT.md](./PROMPT.md)** : à coller dans une nouvelle conversation Claude Code ouverte dans le projet Sanity.

## Règles à respecter dans le nouveau projet

- **Aucun secret dans une conversation.** Le jeton Claude, la clé API, les jetons Sanity et `PREVIEW_SECRET` se recopient à la main, de fichier à fichier, sans jamais être affichés ni collés dans un chat (voir `02-installation-claude.md` § 5).
- **Un clone dédié du front pour `site/` et `site-draft/`**, distinct du dépôt où vous développez l’intégration. `SITE_LIVE_DIR` et `SITE_DRAFT_DIR` ne sont **jamais vides** : une valeur vide désigne le dossier du runner, où le runner ferait `git reset --hard` puis `git clean -fd` (voir `02-installation-claude.md` § 4.3).
- **Manipulez les jetons dans un terminal extérieur à Claude Code** (Terminal.app, iTerm), jamais dans le panneau Terminal de l’application, que Claude peut lire.
- **Le POC est en lecture seule** pour l’autre conversation : `git show`, `git log` et `git diff` seulement ; aucun commit, reset, stash ni checkout.
- **Le runner tourne côté serveur Node persistant**, jamais dans Sanity Studio (navigateur), dans une Sanity Function ou dans une fonction serverless.
- **La sûreté vient des contrôles déterministes, pas des consignes.** Le passage de référence l’a montré (L05, R09). Portez les contrôles de la branche `batterie-tests`, pas ceux de `main`.
