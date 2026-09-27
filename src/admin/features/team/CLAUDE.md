# features/team (B4 · Site Settings › Team) — LLM context

> Propriétaire : settings · Figma : B4 (docs/admin/figma/screens/B4.md, B4.ui.png) · Mis à jour : 2026-09-27 (FOLLOWUPS #40)

## Utilité

Membres du projet Sanity du client et leurs rôles, lus avec le jeton Sanity de l'UTILISATEUR ; invitation depuis l'admin
quand l'utilisateur est Administrator dans Sanity (décision 6 de l'architecture), sinon lien « Invite in Sanity ↗ ».
Route : `/admin/settings/team`, réservée au client admin (`settings.team`) : Kuartz et editor reçoivent une 404.
Fournit aussi le résumé de la carte Team de B1 (`loadTeamSummary`). Ne modifie ni ne retire aucun membre.

## Fichiers

- `access-api.ts` — client de l'Access API Sanity (`v2025-07-11`), `fetch` injectable, pages de 100, `TeamApiError`, `sanityManageMembersUrl`.
- `members.ts` — `buildTeam(users, invites, projectId, { allowlist, currentUserId? })` (membres, invitations en attente,
  résumé), rôles, `teamCardText`, `INVITE_ROLES`. Pur (la liste blanche lui est passée).
- `data.ts` — `server-only` : `loadTeam(session)` → `TeamState` (lit KUARTZ_ALLOWLIST pour le tag) ; `loadTeamSummary(session)`.
- `invite.ts` — cœur de l'invitation (droits, zod, appel), sans Next.
- `actions.ts` — `'use server'` : `inviteMemberAction({ email, role })`.
- `TeamScreen.tsx` — Server Component de l'écran (tous les états). `InviteControl.tsx` — client : bouton + Modal.
- `TeamSkeleton.tsx`, `team.module.css`.
- Tests : `access-api.test.ts`, `members.test.ts`, `data.test.ts`, `invite.test.ts`, `actions.test.ts`, `TeamScreen.test.tsx`.

## Contrats

- API Sanity (vérifiée dans https://www.sanity.io/docs/http-reference/access-api, 2026-09-27) :
  `GET https://api.sanity.io/v2025-07-11/access/project/{projectId}/users` → `{ data: [{ sanityUserId, profile{displayName,email,imageUrl}, memberships[{resourceType,resourceId,roleNames,addedAt}] }], nextCursor }` ;
  `GET …/invites` → `{ data: [{ id, status, email, role, inviterId, inviteeId }] }` ; `POST …/invites { email, role }`.
  Droits Sanity : `sanity.project.members.read` / `.invite` (Administrator). Refus → 401/403.
- Gestion sur sanity.io : `https://www.sanity.io/manage/project/{projectId}/members` (répond 200).
- Sorties : `TeamState = no-token | error{code,message} | ok{members, pending, summary, canInvite}` ; `inviteMemberAction` →
  `{ ok: true, message } | { ok: false, error, field? }`.
- Dépend de : `core/auth/session`, `core/sanity/env`, `core/contracts/roles` (`isKuartzMember`, `parseKuartzAllowlist`),
  `next/cache` (`refresh`), kit. Utilisé par : route B4, overview (B1).

## Comportement (LLM context B4)

- Liste : avatar (initiale, photo https seulement), nom, e-mail ; à droite tag KUARTZ puis « rôle · invited by X » /
  « Administrator · owner ». Ordre : Administrators, membres du client, Kuartz ; puis date d'arrivée.
- Tag KUARTZ (affichage seulement, avatar bleu ; les autres en vert) = `isKuartzMember({ id: sanityUserId, email },
  parseKuartzAllowlist(process.env.KUARTZ_ALLOWLIST))`, calculé CÔTÉ SERVEUR dans `data.ts` (FOLLOWUPS #40) : même liste
  blanche que le rôle `kuartz` de l'admin (`resolveAdminRole`, core/contracts/roles.ts). Le rôle Developer seul ou un
  e-mail @kuartz.studio hors liste ne suffisent pas ; liste vide → personne n'est tagué. Invitation en attente : e-mail seul.
  Le tag ne donne aucun droit.
- « invited by » : invitation acceptée dont `inviteeId` = le membre → prénom de `inviterId`. « owner » : Administrator
  sans invitation connue, arrivé le premier (heuristique : l'API ne dit pas qui a créé le projet).
- Invitations en attente : section « Pending invitations » (tag PENDING ou KUARTZ).
- Session de dev (pas de jeton utilisateur) : « Sign in with Sanity to manage the team » + bouton qui passe par la
  déconnexion (POST /admin/api/auth/logout → A1) ; le lien « Invite in Sanity ↗ » reste.
- Erreurs : rôle Sanity insuffisant (lien Open Sanity), Sanity injoignable (Reload). Les invitations en échec seules ne
  bloquent pas la liste. Encadré Kuartz toujours affiché.
- Invitation (Administrator seulement) : Modal « Invite to the Sanity project », Email + Role (Editor par défaut,
  Administrator, Viewer — PAS Developer, constat SEC-05), aide « Your editors are Editors. Kuartz adds its own team
  members. », « Send invitation » ; succès : fenêtre fermée, annonce live, `refresh()` de la route.

## Forces

- Jeton utilisateur seulement : jamais de repli sur un jeton robot (il n'aurait pas l'identité ni le droit).
- Tag KUARTZ et rôle `kuartz` de l'admin décidés par la même fonction (`isKuartzMember`) et la même liste blanche.
- Logique pure testée sur les données du Figma (même ordre, mêmes méta) ; client HTTP testé avec faux fetch (URL exactes,
  en-têtes, pagination, codes d'erreur, id de projet refusé sans appel).

## Faiblesses et limites connues

- Non vérifié contre le vrai Sanity (aucune session Sanity réelle pendant la construction ; dev = pas de jeton).
- Le rôle Developer (Kuartz) sur la carte B1 : si Sanity lui refuse `members.read`, la carte dit « Managed in Sanity ».
- « owner » est une heuristique ; les rôles personnalisés sont affichés tels quels (« Content lead »).
- Pas de retrait de membre ni de changement de rôle (Figma : « se gèrent dans Sanity »).
- Le tag KUARTZ suit la liste blanche de CE serveur : un Kuartz listé par id Sanity n'est reconnu sur une invitation en
  attente (pas encore d'id) que si son e-mail ou son domaine est aussi dans la liste.

## Points sensibles

- `inviteMemberAction` : `requireCapability('settings.team', 'action')` EN PREMIER, puis revérifie `sanityToken` et le rôle
  Sanity `administrator` ; l'e-mail et le rôle passent par zod (liste fermée `INVITE_ROLES`). Le vrai refus final reste celui
  de Sanity.
- JAMAIS remettre `developer` (ni un rôle personnalisé à droits de développeur) dans `INVITE_ROLES` : SEC-05. Le client ne
  fabrique pas de Kuartz depuis l'admin ; Kuartz ajoute ses membres dans Sanity et dans KUARTZ_ALLOWLIST (serveur).
- Le jeton ne quitte jamais le serveur : `TeamScreen` reçoit des membres déjà mis en forme.

## Pièges

- `<Button>` du kit est interdit dans un Server Component (gestionnaire `onClick` interne) → `buttonClassName` + `ButtonContent`.
- Un dossier de route qui commence par `_` est privé dans Next (non routable).

## Comment modifier

- Ajouter un rôle invitable : `INVITE_ROLES` (members.ts) ; le schéma zod et le Select suivent ; mettre à jour le test
  SEC-05 de `members.test.ts` (liste exacte attendue) — jamais `developer`.
- Changer la version de l'API : `ACCESS_API_VERSION` (access-api.ts) + tests d'URL.

## Tests

`npx vitest run src/admin/features/team` — client HTTP, mise en forme, tag KUARTZ d'après la liste blanche (Developer hors
liste non tagué, liste vide, liste par id, invitations ; `loadTeam` avec KUARTZ_ALLOWLIST), chargement (no-token,
erreurs, invitations en échec), invitation (droits, zod, 409, Developer refusé sans appel — SEC-05), liste des rôles invitables, action (garde en premier, refresh), écran jsdom (4 états, Modal, erreurs, focus).
À la main : rôle client → `/admin/settings/team` (session de dev : état « Sign in with Sanity… ») ; rôle kuartz → 404.

## Décisions et « À trancher »

- Question 6 : les deux (API si Administrator, sinon lien), comme l'architecture. Bouton « Invite » + « Manage in Sanity ↗ »
  quand l'invitation est possible ; sinon seul « Invite in Sanity ↗ » (Figma).
- « Sanity project “Conduit”, owned by Conduit » : nom du site du manifeste pour les deux (l'API ne donne pas l'organisation).
- SEC-05 (2026-09-27) : Developer retiré des rôles invitables, contre le Figma B4 « RÈGLES » qui le proposait. Le rôle
  Kuartz de l'admin se donne par la liste blanche, pas par une invitation du client.

## Demandes de contrat

- Aucune.
