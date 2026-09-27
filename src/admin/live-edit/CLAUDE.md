# live-edit — bouton « Edit with AI » du site en ligne — LLM context

> Propriétaire : auth-core · Figma : D0 (docs/admin/figma/screens/D0.md, question 9), G1 (entrée de l'éditeur) ; pas de
> maquette pour le bouton · Mis à jour : 2026-09-27 (question 9 : décision changée à la demande de l'utilisatrice)

## Utilité
Quand une personne connectée à l'admin visite le SITE EN LIGNE (127.0.0.1:4040, Vercel), une pilule flottante
« Edit with AI » apparaît en bas à droite ; un clic ouvre l'éditeur IA plein écran (`/admin/editor?page=<id>`) sur la
page affichée. Monté par `src/app/(site)/layout.tsx` (site-adapter), comme `editor-bridge`, mais hors aperçu.

## Fichiers
- `LiveEditButton.tsx` (client) — rien au rendu serveur ni au premier rendu ; après montage, `GET
  /admin/api/auth/editor-access?path=<usePathname()>` (même origine, `no-store`) ; si `canEdit: true` et un `href`
  `/admin/editor?…`, charge la pilule par `next/dynamic`. `editorHrefFromResponse`, `EDITOR_ACCESS_ENDPOINT`,
  `DESKTOP_QUERY`, `resetLiveEditCache` (tests).
- `LiveEditPill.tsx` + `LiveEditPill.module.css` — la pilule : lien `<a>` (navigation complète vers /admin), `Icon`
  `ai` du kit (`@/admin/ui/icons/Icon`, importé seul, pas `@/admin/ui`), « Edit with AI ».
- `index.ts` — `LiveEditButton`.
- `LiveEditButton.test.tsx` (jsdom).

## Contrats
- Entrée : la réponse de `GET /admin/api/auth/editor-access` (auth-core, `core/auth/editor-access.ts`) :
  `{ canEdit: false } | { canEdit: true, href }`. Aucune prop.
- Montage : `{!editorPreview && !isDraftMode && <LiveEditButton />}` dans le layout du site (jamais dans l'aperçu
  4042, ni en Draft Mode / Presentation).

## Comportement
- Aucune requête : fenêtre < 1 024 px (`matchMedia('(min-width: 1024px)')`, la requête part si la fenêtre
  s'élargit), dans une iframe (Presentation du Studio, aperçu), sans chemin.
- Réponse gardée en mémoire par chemin pour la vie de l'onglet (navigation client : aller-retour sans requête) ; une
  erreur réseau n'est pas gardée. Pendant une navigation, la pilule de l'ancienne page disparaît jusqu'à la réponse.
- Pilule : fixe à 20 px du bas et de la droite, 36 px de haut, fond `bg/elevated` #181818, bordure `border/default`,
  texte blanc 600 13 px, icône `ai` en `icon/primary` ; survol `bg/input-hover` + `border/strong` ; pression
  `scale(0.97)` ; focus visible = `--k-focus-ring` (2 px + 2 px bleu) ; entrée 200 ms `ease-out` (fondu + 6 px) ;
  `prefers-reduced-motion` coupe l'entrée et la pression ; masquée sous 1 024 px (CSS aussi) et à l'impression.
- « ‹ Admin » de l'éditeur ramène à `/admin/pages/<id>` (le site public n'est pas un `back` accepté).

## Forces
- HTML public identique pour un visiteur (aucune balise ; vérifié par `check-html.ts --live` et Playwright) ; le CSS
  de la pilule n'est chargé que pour une personne autorisée (vérifié : absent des feuilles de style en anonyme).
- Aucune donnée sensible côté client : seulement `href`, validé (`/admin/editor?` seulement).

## Faiblesses et limites connues
- Une requête `editor-access` par page vue (≥ 1 024 px, hors iframe), visiteurs anonymes compris : une invocation de
  fonction par page vue sur Vercel. Piste : cookie d'indice non sensible posé à la connexion (voir core/auth/CLAUDE.md).
- Session de dev (ADMIN_DEV_AUTOLOGIN) : tout navigateur local voit le bouton (la route est sous /admin) ; pour voir
  le site en anonyme en local : « Log out » (cookie `kz_dev_role=off`) ou un hôte non local.
- Police : Inter n'est pas chargé sur le site (repli système si Inter n'est pas installé).
- Le bouton peut recouvrir un élément fixe du site en bas à droite (aucun sur Conduit au 2026-09-27).
- Un bloqueur qui masque les éléments fixes, ou un script du site à z-index plus élevé, peut le cacher.

## Points sensibles
- Ne jamais rendre la pilule côté serveur ni la faire dépendre d'un cookie lu dans le layout : le HTML public (cache,
  SEO) doit rester le même pour tous.
- Ne jamais importer `@/admin/ui` (index) ni `tokens.css` / `base.css` ici : le kit entier et ses styles globaux
  fuiraient dans le site. Valeurs recopiées dans le CSS Module, sous `.root`.
- Garder la validation de `href` (`/admin/editor?` seulement).

## Pièges
- `kz_admin` a `path=/admin` : le site ne peut pas le lire ; seule une requête vers /admin le transporte.
- `next/dynamic` : le CSS du module chargé à la demande n'arrive qu'avec lui (c'est voulu) ; ne pas importer
  `LiveEditPill` statiquement depuis `LiveEditButton`.
- Les données RSC de la page citent le module client (en dev, par son chemin) : c'est la seule trace dans le HTML.

## Comment modifier
- Changer l'apparence : `LiveEditPill.module.css` (valeurs des tokens de `src/admin/ui/tokens.css`, nom en commentaire).
- Ouvrir le bouton sur une autre page : `aiEditor: true` dans `src/admin.config.ts` (rien ici).
- Masquer sur un autre contexte : condition de montage dans le layout du site, ou garde dans l'effet de `LiveEditButton`.

## Tests
`npx vitest run src/admin/live-edit src/admin/core/auth/editor-access.test.ts src/app/admin/api/auth/editor-access` :
rien avant la réponse puis la pilule, `canEdit: false` / HTTP 500 / erreur réseau → rien, `href` hors éditeur ignoré,
< 1 024 px sans requête puis requête à l'élargissement, iframe sans requête, changement de page.
À la main (vérifié le 2026-09-27 sur 4040, Chrome via playwright-core) : `/` en session de dev → pilule, clic →
`/admin/editor?page=home&back=%2Fadmin%2Fpages%2Fhome` (« AI editor — Home ») ; `/blog` → rien ; 900 px → aucune
requête ; anonyme (`kz_dev_role=off` ou `X-Forwarded-Host` non local) → `{ canEdit: false }`, rien dans le DOM.

## Décisions et « À trancher »
- Question 9 du Figma : **décision changée le 2026-09-27** (« pas d'ouverture depuis le site public » → bouton sur le
  site en ligne). Libellé « Edit with AI », pilule sombre du Design System, sans maquette.
- Masqué en Draft Mode / Presentation : le Studio a déjà ses propres outils d'édition, et l'éditeur IA montre de toute
  façon le brouillon.
- Module dans `src/admin/` (et non `src/components/`) : il part avec l'admin quand elle deviendra un paquet commun.

## Demandes de contrat
- Aucune.
