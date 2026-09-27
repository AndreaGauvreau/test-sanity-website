# Démarrer l'admin et le moteur IA (local)

> État au 2026-09-27 · branche `dashboard`. Architecture : `ARCHITECTURE.md`. Suivi des points ouverts : `FOLLOWUPS.md`.

## Lancer

Trois terminaux, depuis `~/Tools/sanity-test` (rien n'est inscrit dans le PM2 de `~/Tools`) :

```bash
npm run dev            # site + admin + Studio → http://127.0.0.1:4040 (/admin, /studio)
npm run engine         # moteur IA → 127.0.0.1:4043 ; lance et surveille l'aperçu du brouillon (4042)
```

Première fois seulement, ou après de nouveaux commits (moteur arrêté) :

```bash
npm run engine:setup           # clone de travail dans ../sanity-test-engine (npm ci une fois)
npm run engine:setup -- sync   # avance main/draft du clone sur la branche source, si rien n'attend
```

Le clone ne voit que le code COMMITÉ de la source : committer avant `sync`.

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
   minimal de Claude (Haiku).
2. Vérifier que `ENGINE_FAKE_CLAUDE` est commenté dans `engine/.env.local` (sinon Claude est simulé) et `ENGINE_MOCK=0`
   dans `.env.local` (sinon l'admin parle au moteur simulé).
3. Ouvrir `/admin/pages/home` → « ✦ Open in AI editor ». La santé du moteur doit indiquer l'accès (`api-key` ou
   `subscription`) sans avertissement de faux Claude (relancer `npm run engine` seulement après avoir changé `engine/.env.local`).
4. Réglages par défaut : `claude-opus-5-5`, effort `medium`, 24 tours, 1,5 $ par appel et plafond du cumul par demande
   (`EDITOR_MAX_REQUEST_USD`), 2 essais au plus. Chaque demande écrit un document `aiUsage` visible en B5.

## Ce qui a été vérifié en réel (moteur réel + faux Claude, dataset development)

Aperçu à jeton court, sélection (clic, Maj + clic, Échap), demandes Style et Text, ajustement, Validate (un commit sur
`draft`), Cancel (retour arrière des fichiers ET du brouillon Sanity), Stop, reprise après rechargement, droits par rôle,
publication contenu + code (`publication-1` : Sanity publié, `main` ← `draft`, tag, revalidation, site à jour) et contenu
seul (`publication-2`, 2 s). Pas encore en réel : Claude lui-même, la connexion Sanity (A1), un déploiement Vercel.

## Données de développement

Dataset `development` (copie de `production`, démo LyonDrive retirée, blog de démonstration en anglais). `production`
n'est pas touché et n'est pas migré (`npm run migrate:admin` y est bloqué par une garde, FOLLOWUPS #8).
