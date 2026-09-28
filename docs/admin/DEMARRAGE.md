# Démarrer l'admin et le moteur IA (local)

> État au 2026-09-28 · branche `main` (seule branche). Architecture : `ARCHITECTURE.md`. Suivi : `FOLLOWUPS.md`.

## Lancer

Une seule commande, depuis `~/Tools/sanity-test` (rien n'est inscrit dans le PM2 de `~/Tools`) :

```bash
npm run dev    # site + admin + Studio → http://127.0.0.1:4040 (/admin, /studio) ET moteur IA → 4043 (aperçu 4042)
```

`npm run dev` (`scripts/dev.ts`) : mise en place du clone du moteur (`engine:setup`, idempotente : clone et `npm ci` la
première fois seulement), synchronisation sur tes commits (`engine:setup -- sync`), puis site et moteur ensemble, sorties
préfixées `[site]` / `[ai]`. `Ctrl+C` arrête tout (le moteur arrête l'aperçu). Le moteur n'est PAS lancé si
`ENGINE_MOCK=1` (moteur simulé), si `engine/.env.local` manque ou si un moteur répond déjà sur `ENGINE_PORT`. Une sync
refusée (demande IA en attente, publication locale à rapatrier…) n'empêche pas de démarrer : la raison s'affiche et le
moteur part sur le clone tel quel. Si le moteur s'arrête seul, le site continue : corriger puis `npm run engine`.

Commandes séparées, si besoin : `npm run dev:site` (site seul), `npm run engine` (moteur seul),
`npm run engine:setup` / `npm run engine:setup -- sync` (moteur arrêté).

Le clone ne voit que le code COMMITÉ de la source : committer avant de relancer. Si la source change de branche
(ex. `dashboard` fusionnée dans `main`), le clone suit la nouvelle branche tout seul quand elle contient tout son `main`.

Si un moteur local a publié du code (Publish depuis l'admin), ces commits sont dans le clone mais pas dans la source :
`sync` refuse alors (« … commit(s) that the source branch doesn't have ») et affiche les commandes pour les ramener
(`git fetch ../sanity-test-engine/repo +main:refs/remotes/engine/main` puis `git merge engine/main`).

## Se connecter

- En local, `ADMIN_DEV_AUTOLOGIN=kuartz` (dans `.env.local`) ouvre une session de développement sans connexion Sanity ;
  le menu utilisateur de la sidebar permet de passer en `client` ou `editor`. Cette variable est refusée hors
  `NODE_ENV=development` et hors `127.0.0.1` / `localhost` ; à retirer avant tout déploiement.
- Connexion réelle (A1) : fournisseurs Sanity du projet. L'origine de l'admin doit être déclarée dans les CORS du projet
  Sanity (FOLLOWUPS #6). Le rôle « kuartz » exige d'être dans `KUARTZ_ALLOWLIST` (`@kuartz.studio`).

## Premier vrai passage de Claude

1. Régler l'accès à Claude dans l'admin (Kuartz ou client) : **Site Settings › Usage › Claude connection**. Rien à
   redémarrer.
   - En local (moteur `ENGINE_MODE=local`, admin ouvert sur 127.0.0.1 / localhost) : « Use my Claude subscription »
     utilise la connexion Claude Code de la machine. Si la carte dit que la machine n'est pas connectée : ouvrir un
     terminal, lancer `claude`, taper `/login` (compte Claude Pro/Max), puis revenir sur la carte et cliquer
     « Test connection » (le moteur la voit aussi seul en moins d'une minute). Se servir de Claude Desktop ne suffit pas :
     c'est la connexion de `claude` en terminal qui compte.
   - En production (ou pour une clé) : coller une clé API Anthropic (`sk-ant-api…`, console Claude › API keys) dans
     « Anthropic API key » → « Save and test ». Elle est chiffrée par le moteur (`<ENGINE_WORKSPACE>/data/claude-access.json`)
     et n'est plus jamais affichée (« Connected · sk-ant-…XXXX », Replace, Disconnect).
   - Anciennes voies toujours valables dans `engine/.env.local` (copiées soi-même, jamais dans une conversation) :
     `ANTHROPIC_API_KEY` (prioritaire sur tout, l'écran le signale ; redémarrage du moteur nécessaire) ou, en repli local,
     `CLAUDE_CODE_OAUTH_TOKEN` (sortie de `claude setup-token`, les DEUX lignes).
   Le test d'une clé (`GET /v1/models`) est gratuit mais ne vérifie pas le crédit ; celui de l'abonnement fait un tour
   minimal de Claude avec `ASK_MODEL` (Haiku 4.5, le moins cher) — c'est désormais le seul usage de cette variable.
2. Vérifier que `ENGINE_FAKE_CLAUDE` est commenté dans `engine/.env.local` (sinon Claude est simulé) et `ENGINE_MOCK=0`
   dans `.env.local` (sinon l'admin parle au moteur simulé).
3. Ouvrir `/admin/pages/home` → « ✦ Open in AI editor ». La santé du moteur doit indiquer l'accès (`api-key` ou
   `subscription`) sans avertissement de faux Claude (relancer `npm run engine` seulement après avoir changé `engine/.env.local`).
4. Réglages par défaut : `claude-opus-5-5`, effort `medium`, 24 tours, 1,5 $ par appel et plafond du cumul par demande
   (`EDITOR_MAX_REQUEST_USD`), 2 essais au plus. Chaque demande écrit un document `aiUsage` visible en B5.
   Le MODÈLE et le NIVEAU DE RÉFLEXION de TOUTE l'IA du site — l'éditeur IA ET Ask AI (depuis le 2026-09-28,
   FOLLOWUPS #47) — se changent dans l'admin (Kuartz ou client) : **Site Settings › Usage › AI settings** — Opus 5.5
   (4 $ / 20 $ par million de jetons), Fable 5.1 (10 $ / 50 $), Sonnet 5 (2 $ / 10 $), Haiku 4.5 (1 $ / 5 $ : le plus
   rapide et le moins cher, pour les changements et questions simples ; pas de niveau de réflexion, le choix d'effort
   est alors désactivé et gardé pour les autres modèles) ; effort Low, Medium, High, Extra high, Max → Save. Rien à
   redémarrer : la demande SUIVANTE de l'éditeur et la question SUIVANTE d'Ask AI les prennent (une demande en cours
   garde les siens) ; l'en-tête d'Ask AI affiche le modèle en cours. Enregistré par le moteur dans
   `<ENGINE_WORKSPACE>/data/ai-settings.json` ; sans ce fichier, `EDITOR_MODEL` / `EDITOR_EFFORT` de `engine/.env.local`
   (sinon Opus 5.5 / medium) restent les valeurs par défaut — pour l'éditeur ET Ask AI : sans choix enregistré, Ask AI
   passe donc d'Haiku 4.5 à Opus 5.5 (plus cher) ; choisir Haiku 4.5 dans la carte pour le coût minimal.
   `ASK_MODEL` ne sert plus qu'au test de connexion de l'abonnement. Après la mise à jour du code : redémarrer
   `npm run engine` (un moteur resté sur l'ancien code refuse Haiku 4.5 et garde Ask AI sur `ASK_MODEL`).
   Plafond de sortie d'une réponse d'Ask AI : 16 000 jetons pour un modèle qui réfléchit (la réflexion compte), 1 024
   pour Haiku 4.5 ; un refus de Claude ou un plafond atteint donne un message clair, et la consommation reste comptée.

## Ce qui a été vérifié en réel (moteur réel + faux Claude, dataset development)

Aperçu à jeton court, sélection (clic, Maj + clic, Échap), demandes Style et Text, ajustement, Validate (un commit sur
`draft`), Cancel (retour arrière des fichiers ET du brouillon Sanity), Stop, reprise après rechargement, droits par rôle,
publication contenu + code (`publication-1` : Sanity publié, `main` ← `draft`, tag, revalidation, site à jour) et contenu
seul (`publication-2`, 2 s). Pas encore en réel : Claude lui-même, la connexion Sanity (A1), un déploiement Vercel.

## Données de développement

Dataset `development` (copie de `production`, démo LyonDrive retirée, blog de démonstration en anglais). `production`
n'est pas touché et n'est pas migré (`npm run migrate:admin` y est bloqué par une garde, FOLLOWUPS #8).
